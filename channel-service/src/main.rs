use chrono::Utc;
use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use dashmap::DashMap;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;

#[derive(Deserialize, Clone)]
struct Message {
    communication_id: String,
    channel: String,
    #[allow(dead_code)]
    destination: String,
    #[allow(dead_code)]
    content: String,
    idempotency_key: String,
    callback_url: String,
}

#[derive(Serialize)]
struct SendResponse {
    status: String,
    accepted: usize,
    duplicates: usize,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
}

#[derive(Serialize, Clone)]
struct CallbackPayload {
    #[serde(rename = "communicationId")]
    communication_id: String,
    status: String,
    timestamp: String,
}

#[derive(Serialize, Clone)]
struct ChannelConfig {
    channel: String,
    deliver_rate: f64,
    deliver_delay_ms: (u64, u64),
    stages: Vec<StageConfig>,
}

#[derive(Serialize, Clone)]
struct StageConfig {
    name: String,
    rate: f64,
    delay_ms: (u64, u64),
}

struct AppState {
    semaphore: Semaphore,
    seen_keys: DashMap<String, ()>,
    http_client: reqwest::Client,
    // Host that callback URLs must match (derived from CALLBACK_BASE_URL).
    allowed_callback_host: String,
}

// Max messages accepted in a single /send batch — bounds task/memory fan-out.
const MAX_BATCH: usize = 5000;
// Soft cap on the idempotency key set — crude eviction to bound memory.
const MAX_SEEN_KEYS: usize = 1_000_000;

/// SSRF guard: a callback URL is allowed only if it is http(s), is NOT an IP literal in a
/// private/loopback/link-local range, and its host matches the configured backend host.
fn is_callback_allowed(url_str: &str, allowed_host: &str) -> bool {
    let parsed = match reqwest::Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return false,
    };
    if !matches!(parsed.scheme(), "http" | "https") {
        return false;
    }
    let host = match parsed.host_str() {
        Some(h) => h,
        None => return false,
    };
    // Reject IP-literal hosts that point at internal ranges (e.g. 169.254.169.254 metadata,
    // 127/8, 10/8, 172.16/12, 192.168/16, ::1). Real callbacks use a hostname ("backend"
    // / "localhost"), which is matched by the allowlist check below instead.
    let host_no_brackets = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host_no_brackets.parse::<std::net::IpAddr>() {
        match ip {
            std::net::IpAddr::V4(v4) => {
                if v4.is_loopback() || v4.is_private() || v4.is_link_local() {
                    return false;
                }
            }
            std::net::IpAddr::V6(v6) => {
                if v6.is_loopback() {
                    return false;
                }
                // Reject IPv6 link-local (fe80::/10) and unique-local (fc00::/7).
                let segs = v6.segments();
                let first = segs[0];
                if (first & 0xffc0) == 0xfe80 {
                    return false; // link-local fe80::/10
                }
                if (first & 0xfe00) == 0xfc00 {
                    return false; // unique-local fc00::/7
                }
            }
        }
    }
    host.eq_ignore_ascii_case(allowed_host)
}

fn get_channel_config(channel: &str) -> Option<ChannelConfig> {
    match channel.to_lowercase().as_str() {
        "whatsapp" => Some(ChannelConfig {
            channel: "whatsapp".to_string(),
            deliver_rate: 0.80,
            deliver_delay_ms: (1000, 3000),
            stages: vec![
                StageConfig { name: "read".to_string(), rate: 0.65, delay_ms: (5000, 30000) },
                StageConfig { name: "clicked".to_string(), rate: 0.30, delay_ms: (2000, 10000) },
            ],
        }),
        "email" => Some(ChannelConfig {
            channel: "email".to_string(),
            deliver_rate: 0.95,
            deliver_delay_ms: (5000, 30000),
            stages: vec![
                StageConfig { name: "opened".to_string(), rate: 0.25, delay_ms: (60000, 300000) },
                StageConfig { name: "clicked".to_string(), rate: 0.15, delay_ms: (5000, 30000) },
            ],
        }),
        "sms" => Some(ChannelConfig {
            channel: "sms".to_string(),
            deliver_rate: 0.90,
            deliver_delay_ms: (1000, 5000),
            stages: vec![],
        }),
        "rcs" => Some(ChannelConfig {
            channel: "rcs".to_string(),
            deliver_rate: 0.85,
            deliver_delay_ms: (2000, 5000),
            stages: vec![
                StageConfig { name: "opened".to_string(), rate: 0.60, delay_ms: (10000, 45000) },
                StageConfig { name: "clicked".to_string(), rate: 0.25, delay_ms: (5000, 20000) },
            ],
        }),
        _ => None,
    }
}

async fn send_callback(client: &reqwest::Client, url: &str, payload: &CallbackPayload) {
    let delays = [1000u64, 4000, 16000];
    for (attempt, delay) in delays.iter().enumerate() {
        match client.post(url).json(payload).send().await {
            Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 200 => return,
            Ok(_) | Err(_) => {
                if attempt < 2 {
                    tokio::time::sleep(Duration::from_millis(*delay)).await;
                }
            }
        }
    }
    eprintln!(
        "Failed to deliver callback after 3 attempts: comm_id={} status={}",
        payload.communication_id, payload.status
    );
}

async fn simulate_message(state: Arc<AppState>, msg: Message) {
    let _permit = state.semaphore.acquire().await.unwrap();

    let config = match get_channel_config(&msg.channel) {
        Some(c) => c,
        None => {
            let payload = CallbackPayload {
                communication_id: msg.communication_id,
                status: "failed".to_string(),
                timestamp: chrono_now(),
            };
            send_callback(&state.http_client, &msg.callback_url, &payload).await;
            return;
        }
    };

    // Pre-generate all random values (thread_rng is not Send across await)
    let (sent_delay, deliver_delay, deliver_roll, stage_rolls) = {
        let mut rng = rand::thread_rng();
        let sent_delay = rng.gen_range(100u64..500);
        let deliver_delay = rng.gen_range(config.deliver_delay_ms.0..=config.deliver_delay_ms.1);
        let deliver_roll: f64 = rng.gen();
        let stage_rolls: Vec<(u64, f64)> = config
            .stages
            .iter()
            .map(|s| (rng.gen_range(s.delay_ms.0..=s.delay_ms.1), rng.gen::<f64>()))
            .collect();
        (sent_delay, deliver_delay, deliver_roll, stage_rolls)
    };

    // Step 1: sent
    tokio::time::sleep(Duration::from_millis(sent_delay)).await;
    let payload = CallbackPayload {
        communication_id: msg.communication_id.clone(),
        status: "sent".to_string(),
        timestamp: chrono_now(),
    };
    send_callback(&state.http_client, &msg.callback_url, &payload).await;

    // Step 2: delivered or failed
    tokio::time::sleep(Duration::from_millis(deliver_delay)).await;

    if deliver_roll > config.deliver_rate {
        let payload = CallbackPayload {
            communication_id: msg.communication_id,
            status: "failed".to_string(),
            timestamp: chrono_now(),
        };
        send_callback(&state.http_client, &msg.callback_url, &payload).await;
        return;
    }

    let payload = CallbackPayload {
        communication_id: msg.communication_id.clone(),
        status: "delivered".to_string(),
        timestamp: chrono_now(),
    };
    send_callback(&state.http_client, &msg.callback_url, &payload).await;

    // Step 3+: channel-specific stages
    for (i, stage) in config.stages.iter().enumerate() {
        let (stage_delay, stage_roll) = stage_rolls[i];
        tokio::time::sleep(Duration::from_millis(stage_delay)).await;

        if stage_roll > stage.rate {
            // Didn't pass probability — stop (no failure, just no further progression)
            return;
        }

        let payload = CallbackPayload {
            communication_id: msg.communication_id.clone(),
            status: stage.name.clone(),
            timestamp: chrono_now(),
        };
        send_callback(&state.http_client, &msg.callback_url, &payload).await;
    }
}

fn chrono_now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

async fn health() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok".to_string(),
        service: "channel-service".to_string(),
    })
}

async fn send(
    state: axum::extract::State<Arc<AppState>>,
    Json(payload): Json<Vec<Message>>,
) -> impl IntoResponse {
    let mut accepted = 0usize;
    let mut duplicates = 0usize;

    if payload.len() > MAX_BATCH {
        eprintln!(
            "Rejected /send batch of {} (max {})",
            payload.len(),
            MAX_BATCH
        );
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(SendResponse {
                status: "batch_too_large".to_string(),
                accepted: 0,
                duplicates: 0,
            }),
        );
    }

    for msg in payload {
        // SSRF guard: only dispatch callbacks to the configured backend host.
        if !is_callback_allowed(&msg.callback_url, &state.allowed_callback_host) {
            eprintln!(
                "Skipped message with disallowed callback_url: {}",
                msg.callback_url
            );
            continue;
        }

        // Crude memory bound on the idempotency key set.
        if state.seen_keys.len() >= MAX_SEEN_KEYS {
            state.seen_keys.clear();
        }

        // Atomic check-and-insert: insert returns Some(old) if the key already existed,
        // closing the TOCTOU window between a separate contains_key() and insert().
        if state.seen_keys.insert(msg.idempotency_key.clone(), ()).is_some() {
            duplicates += 1;
            continue;
        }
        accepted += 1;
        let state_clone = state.0.clone();
        tokio::spawn(simulate_message(state_clone, msg));
    }

    (
        StatusCode::ACCEPTED,
        Json(SendResponse {
            status: "accepted".to_string(),
            accepted,
            duplicates,
        }),
    )
}

#[derive(Serialize)]
struct ConfigResponse {
    channels: Vec<ChannelConfigPublic>,
}

#[derive(Serialize)]
struct ChannelConfigPublic {
    channel: String,
    deliver_rate: f64,
    stages: Vec<StageConfigPublic>,
}

#[derive(Serialize)]
struct StageConfigPublic {
    name: String,
    rate: f64,
}

async fn get_config() -> impl IntoResponse {
    let channels = vec!["whatsapp", "email", "sms", "rcs"];
    let configs: Vec<ChannelConfigPublic> = channels
        .iter()
        .filter_map(|ch| {
            get_channel_config(ch).map(|c| ChannelConfigPublic {
                channel: c.channel,
                deliver_rate: c.deliver_rate,
                stages: c
                    .stages
                    .iter()
                    .map(|s| StageConfigPublic {
                        name: s.name.clone(),
                        rate: s.rate,
                    })
                    .collect(),
            })
        })
        .collect();

    Json(ConfigResponse { channels: configs })
}

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "4000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    // Callbacks may only be sent to this host (defends against SSRF via callback_url).
    let callback_base =
        std::env::var("CALLBACK_BASE_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    let allowed_callback_host = reqwest::Url::parse(&callback_base)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| "localhost".to_string());
    println!("Allowed callback host: {}", allowed_callback_host);

    let state = Arc::new(AppState {
        semaphore: Semaphore::new(500),
        seen_keys: DashMap::new(),
        http_client: reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap(),
        allowed_callback_host,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/send", post(send))
        .route("/config", get(get_config))
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind to {}: {}", addr, e);
            std::process::exit(1);
        }
    };
    println!("Channel service running on {}", addr);
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Server error: {}", e);
        std::process::exit(1);
    }
}
