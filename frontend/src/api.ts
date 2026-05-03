const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: async (username: string, password: string) => {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("Login fehlgeschlagen");
    return res.json() as Promise<{ access_token: string }>;
  },
  me: () => request<User>("/auth/me"),
  updateMe: (payload: Partial<User>) =>
    request<User>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  listEntries: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return request<TimeEntry[]>(`/entries?${q}`);
  },
  createEntry: (payload: TimeEntryInput) =>
    request<{ entry: TimeEntry; issues: Issue[] }>("/entries", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEntry: (id: number, payload: TimeEntryInput) =>
    request<{ entry: TimeEntry; issues: Issue[] }>(`/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteEntry: (id: number) =>
    request<void>(`/entries/${id}`, { method: "DELETE" }),
  start: (project?: string) =>
    request<TimeEntry>(`/entries/start${project ? `?project=${encodeURIComponent(project)}` : ""}`, { method: "POST" }),
  stop: (breakMinutes: number) =>
    request<{ entry: TimeEntry; issues: Issue[] }>(
      `/entries/stop?break_minutes=${breakMinutes}`,
      { method: "POST" },
    ),
  summary: () => request<PeriodSummary[]>("/stats/summary"),
  exportUrl: (year: number, month: number) =>
    `${BASE}/exports/monthly.csv?year=${year}&month=${month}`,
};

// ---- Types ----
export type BillingMode = "hourly" | "salary";

export interface User {
  id: number;
  username: string;
  full_name?: string | null;
  is_admin: boolean;
  billing_mode: BillingMode;
  hourly_rate_eur: number;
  monthly_target_hours: number;
}

export interface TimeEntry {
  id: number;
  user_id: number;
  start_at: string;
  end_at: string | null;
  break_minutes: number;
  project?: string | null;
  note?: string | null;
  net_hours: number;
  gross_hours: number;
}

export interface TimeEntryInput {
  start_at: string;
  end_at?: string | null;
  break_minutes: number;
  project?: string | null;
  note?: string | null;
}

export interface Issue {
  severity: "warning" | "error";
  code: string;
  message: string;
}

export interface PeriodSummary {
  period: "day" | "week" | "month";
  start: string;
  end: string;
  net_hours: number;
  target_hours?: number | null;
  remaining_hours?: number | null;
  billable_eur?: number | null;
}
