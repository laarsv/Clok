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

  // Time entries
  listEntries: (from?: string, to?: string, userId?: number) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (userId) q.set("user_id", String(userId));
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

  // Stats / Exports
  summary: () => request<PeriodSummary[]>("/stats/summary"),
  exportUrl: (year: number, month: number) =>
    `${BASE}/exports/monthly.csv?year=${year}&month=${month}`,

  // Absences
  listAbsences: (userId?: number) => {
    const q = new URLSearchParams();
    if (userId) q.set("user_id", String(userId));
    return request<Absence[]>(`/absences?${q}`);
  },
  createAbsence: (payload: AbsenceInput) =>
    request<Absence>("/absences", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  approveAbsence: (id: number, note?: string) =>
    request<Absence>(`/absences/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }),
  rejectAbsence: (id: number, note?: string) =>
    request<Absence>(`/absences/${id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }),
  deleteAbsence: (id: number) =>
    request<void>(`/absences/${id}`, { method: "DELETE" }),

  // Holidays
  holidays: (state: string, year: number) =>
    request<{ date: string; name: string }[]>(
      `/holidays?state=${state}&year=${year}`,
    ),

  // Notification settings
  getNotificationSettings: () =>
    request<NotificationSettings>("/notification-settings"),
  updateNotificationSettings: (payload: Partial<NotificationSettings>) =>
    request<NotificationSettings>("/notification-settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  importTemplateUrl: () => `${BASE}/employees/import-template.csv`,

  // Employees / Onboarding
  listEmployees: (includeOffboarded = false) =>
    request<User[]>(
      `/employees?include_offboarded=${includeOffboarded}`,
    ),
  createEmployee: (payload: EmployeeCreatePayload) =>
    request<User>("/employees", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getEmployee: (id: number) => request<User>(`/employees/${id}`),
  updateEmployee: (id: number, payload: Partial<User>) =>
    request<User>(`/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  offboardEmployee: (id: number) =>
    request<User>(`/employees/${id}/offboard`, { method: "POST" }),
  reactivateEmployee: (id: number) =>
    request<User>(`/employees/${id}/reactivate`, { method: "POST" }),
  hardDeleteEmployee: (id: number) =>
    request<void>(`/employees/${id}`, { method: "DELETE" }),
  importTimeEntriesCsv: async (
    employeeId: number,
    file: File,
  ): Promise<{ imported: number; errors: { line: number; message: string }[] }> => {
    const fd = new FormData();
    fd.append("file", file);
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${BASE}/employees/${employeeId}/imports`, {
      method: "POST",
      headers,
      body: fd,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Employer dashboard
  employerDashboard: (reference?: string) => {
    const q = reference ? `?reference=${reference}` : "";
    return request<EmployerDashboardData>(`/employer/dashboard${q}`);
  },
};

// ---- Types ----
export type Role = "admin" | "employer" | "employee";
export type BillingMode = "hourly" | "salary";
export type AbsenceType = "vacation" | "sick" | "unpaid";
export type AbsenceStatus = "pending" | "approved" | "rejected";
export type FederalState =
  | "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV"
  | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH";

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string | null;
  role: Role;
  supervisor_id?: number | null;
  billing_mode: BillingMode;
  hourly_rate_eur: number;
  monthly_target_hours: number;
  date_of_birth?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country: string;
  social_security_number?: string | null;
  iban?: string | null;
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  hire_date?: string | null;
  federal_state?: FederalState | null;
  weekly_hours?: number | null;
  annual_vacation_days?: number | null;
  initial_overtime_hours: number;
  initial_remaining_vacation: number;
  offboarded_at?: string | null;
}

export interface EmployeeCreatePayload {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role?: Role;
  supervisor_id?: number;
  billing_mode?: BillingMode;
  hourly_rate_eur?: number;
  monthly_target_hours?: number;
  weekly_hours?: number;
  annual_vacation_days?: number;
  initial_overtime_hours?: number;
  initial_remaining_vacation?: number;
  federal_state?: FederalState;
  hire_date?: string;
  date_of_birth?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  social_security_number?: string;
  iban?: string;
  phone?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
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

export interface Absence {
  id: number;
  user_id: number;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  status: AbsenceStatus;
  requested_at: string;
  decided_at?: string | null;
  decided_by?: number | null;
  note?: string | null;
}

export interface AbsenceInput {
  type: AbsenceType;
  start_date: string;
  end_date: string;
  note?: string;
  user_id?: number;
}

export interface NotificationSettings {
  reminder_no_entry: boolean;
  reminder_remaining_vacation: boolean;
  vacation_decided: boolean;
  incoming_vacation_request: boolean;
  incoming_sick_note: boolean;
  month_complete: boolean;
}

export interface EmployerDashboardRow {
  id: number;
  full_name: string;
  username: string;
  target_hours_month: number;
  actual_hours_month: number;
  balance_hours: number;
  vacation_used: number;
  vacation_remaining: number;
  sick_days_month: number;
  sick_days_year: number;
  last_activity?: string | null;
  offboarded_at?: string | null;
}

export interface EmployerDashboardData {
  reference_month: string;
  employees: EmployerDashboardRow[];
}
