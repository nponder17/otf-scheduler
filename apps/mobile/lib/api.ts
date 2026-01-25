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

async function getAuthToken(): Promise<string | null> {
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    return await AsyncStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

function ngrokHeaders(extra?: Record<string, string>) {
  return {
    // helps API calls go through without ngrok's browser warning behavior interfering
    "ngrok-skip-browser-warning": "1",
    ...(extra || {}),
  };
}

async function authHeaders(extra?: Record<string, string>) {
  const token = await getAuthToken();
  const headers = ngrokHeaders(extra || {});
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: await authHeaders(),
  });
  return handle(res);
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function apiPut<T>(path: string, body: any): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "PUT",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return handle(res);
}

