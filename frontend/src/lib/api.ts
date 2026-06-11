const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function apiStream(path: string, body: unknown) {
  const headers = { "Content-Type": "application/json", ...aiHeaders() };

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  // Surface specific error messages before returning the stream
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody.error || "";
    if (res.status === 400 && msg.toLowerCase().includes("credentials")) {
      throw new Error("AI credentials not configured. Open AI Settings (⚙️) to set your provider and API key.");
    }
    if (res.status === 429) {
      throw new Error("Rate limit exceeded or insufficient API credits. Please try again later or check your API key quota.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid API key. Please check your API key in AI Settings (⚙️).");
    }
    throw new Error(msg || `Request failed (${res.status}). Please try again.`);
  }

  return res;
}

export function sseUrl(path: string) {
  return `${API_BASE}${path}`;
}

/** Read BYOK settings from localStorage and return headers for AI endpoints. */
export function aiHeaders(): Record<string, string> {
  try {
    const s = JSON.parse(localStorage.getItem("xeno.ai") || "{}");
    const h: Record<string, string> = {};
    if (s.provider) h["x-llm-provider"] = s.provider;
    if (s.apiKey) h["x-llm-api-key"] = s.apiKey;
    if (s.model) h["x-llm-model"] = s.model;
    return h;
  } catch {
    return {};
  }
}

/** Check if the user has configured AI credentials in localStorage. */
export function hasAICredentials(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem("xeno.ai") || "{}");
    return !!(s.provider && s.apiKey);
  } catch {
    return false;
  }
}

/** apiFetch variant that attaches AI credential headers (for insights endpoints). */
export async function aiApiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...opts,
    headers: { ...aiHeaders(), ...opts?.headers },
  });
}

