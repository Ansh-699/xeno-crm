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

export function apiStream(path: string, body: unknown) {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...aiHeaders() },
    body: JSON.stringify(body),
  });
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

/** apiFetch variant that attaches AI credential headers (for insights endpoints). */
export async function aiApiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...opts,
    headers: { ...aiHeaders(), ...opts?.headers },
  });
}
