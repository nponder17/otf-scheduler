const LOCAL_API = "http://127.0.0.1:8000";

export function getApiBase() {
  const env = (process.env.EXPO_PUBLIC_API_BASE ?? "").trim();
  return env || LOCAL_API;
}

async function handle(res: Response) {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return null;
}

function ngrokHeaders(extra?: Record<string, string>) {
  return {
    // helps API calls go through without ngrok’s browser warning behavior interfering
    "ngrok-skip-browser-warning": "1",
    ...(extra || {}),
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: ngrokHeaders(),
  });
  return handle(res);
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: ngrokHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return handle(res);
}

