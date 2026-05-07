const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

async function _uploadCsv(
  path: string,
  file: File,
): Promise<{ imported: number; errors: { line: number; message: string }[] }> {
  const fd = new FormData();
  fd.append("file", file);
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
  forgotPassword: async (email: string) => {
    const res = await fetch(`${BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(await res.text());
  },
  resetPasswordPreview: async (token: string) => {
    const res = await fetch(`${BASE}/auth/reset-password/${token}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ username: string; email: string }>;
  },
  resetPasswordComplete: async (token: string, password: string) => {
    const res = await fetch(`${BASE}/auth/reset-password/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(await res.text());
  },
  changePassword: (oldPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    }),
  sendTestEmail: () =>
    request<{ dev_mode: boolean; success: boolean; sent_to: string; from_address: string }>(
      "/auth/test-email", { method: "POST" },
    ),

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
  yearOverview: (year?: number, userId?: number) => {
    const q = new URLSearchParams();
    if (year) q.set("year", String(year));
    if (userId) q.set("user_id", String(userId));
    return request<YearOverview>(`/stats/year-overview?${q}`);
  },
  exportUrl: (year: number, month: number, userId?: number) => {
    const q = `year=${year}&month=${month}` + (userId ? `&user_id=${userId}` : "");
    return `${BASE}/exports/monthly.csv?${q}`;
  },
  pdfUrl: (year: number, month: number, userId?: number) => {
    const q = `year=${year}&month=${month}` + (userId ? `&user_id=${userId}` : "");
    return `${BASE}/exports/monthly.pdf?${q}`;
  },

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
  updateAbsence: (id: number, payload: AbsenceUpdatePayload) =>
    request<Absence>(`/absences/${id}`, {
      method: "PATCH",
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

  importTemplateTimesUrl: () => `${BASE}/employees/import-template-times.csv`,
  importTemplateAbsencesUrl: () => `${BASE}/employees/import-template-absences.csv`,

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
  resendInvite: (id: number) =>
    request<User>(`/employees/${id}/resend-invite`, { method: "POST" }),

  // Employer-Onboarding-Wizard
  inviteOnboardingPreview: async (token: string) => {
    const res = await fetch(`${BASE}/onboarding/invite/${token}`);
    if (!res.ok) {
      const err = new Error(await res.text()) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<InvitePreview>;
  },
  inviteOnboardingAccept: async (token: string, payload: InviteAcceptPayload) => {
    const res = await fetch(`${BASE}/onboarding/invite/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = new Error(await res.text()) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<InviteAcceptResult>;
  },
  onboardingStatus: () =>
    request<OnboardingStatusOut>("/onboarding/status"),
  onboardingPostCompany: (payload: OnboardingCompanyPayload) =>
    request<OnboardingStatusOut>("/onboarding/company", {
      method: "POST", body: JSON.stringify(payload),
    }),
  onboardingPostDefaults: (payload: OnboardingDefaultsPayload) =>
    request<OnboardingStatusOut>("/onboarding/defaults", {
      method: "POST", body: JSON.stringify(payload),
    }),
  onboardingComplete: () =>
    request<OnboardingStatusOut>("/onboarding/complete", { method: "POST" }),

  // Feedback
  listFeedback: (params: { kind?: FeedbackKind; status?: FeedbackStatus } = {}) => {
    const q = new URLSearchParams();
    if (params.kind) q.set("kind", params.kind);
    if (params.status) q.set("status", params.status);
    return request<FeedbackEntry[]>(`/feedback?${q}`);
  },
  createFeedback: (payload: FeedbackInput) =>
    request<FeedbackEntry>("/feedback", {
      method: "POST", body: JSON.stringify(payload),
    }),
  updateFeedback: (id: number, payload: FeedbackUpdate) =>
    request<FeedbackEntry>(`/feedback/${id}`, {
      method: "PATCH", body: JSON.stringify(payload),
    }),
  deleteFeedback: (id: number) =>
    request<void>(`/feedback/${id}`, { method: "DELETE" }),

  // Audit-Log
  listAuditLog: (params: { user_id?: number; entity_type?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.user_id != null) q.set("user_id", String(params.user_id));
    if (params.entity_type) q.set("entity_type", params.entity_type);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    return request<AuditLogEntry[]>(`/audit-log?${q}`);
  },

  // Saldo-Korrekturen
  listBalanceAdjustments: (employeeId: number) =>
    request<BalanceAdjustment[]>(`/employees/${employeeId}/balance-adjustments`),
  createBalanceAdjustment: (employeeId: number, payload: BalanceAdjustmentInput) =>
    request<BalanceAdjustment>(`/employees/${employeeId}/balance-adjustments`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  deleteBalanceAdjustment: (employeeId: number, adjId: number) =>
    request<void>(`/employees/${employeeId}/balance-adjustments/${adjId}`, {
      method: "DELETE",
    }),

  // Vertragsverlauf
  listTerms: (employeeId: number) =>
    request<EmploymentTerms[]>(`/employees/${employeeId}/terms`),
  createTerms: (employeeId: number, payload: TermsPayload) =>
    request<EmploymentTerms>(`/employees/${employeeId}/terms`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  updateTerms: (employeeId: number, termsId: number, payload: Partial<TermsPayload>) =>
    request<EmploymentTerms>(`/employees/${employeeId}/terms/${termsId}`, {
      method: "PATCH", body: JSON.stringify(payload),
    }),
  deleteTerms: (employeeId: number, termsId: number) =>
    request<void>(`/employees/${employeeId}/terms/${termsId}`, { method: "DELETE" }),

  // Onboarding (öffentlich, kein Token nötig)
  onboardingPreview: async (token: string) => {
    const res = await fetch(`${BASE}/onboarding/${token}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<OnboardingPreview>;
  },
  onboardingComplete: async (token: string, payload: OnboardingCompletePayload) => {
    const res = await fetch(`${BASE}/onboarding/${token}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<User>;
  },
  importTimeEntriesCsv: (employeeId: number, file: File) =>
    _uploadCsv(`/employees/${employeeId}/imports/times`, file),
  importAbsencesCsv: (employeeId: number, file: File) =>
    _uploadCsv(`/employees/${employeeId}/imports/absences`, file),

  // Employer dashboard
  employerDashboard: (reference?: string) => {
    const q = reference ? `?reference=${reference}` : "";
    return request<EmployerDashboardData>(`/employer/dashboard${q}`);
  },
};

// ---- Types ----
export type Role = "admin" | "employer" | "employee";
export type BillingMode = "hourly" | "salary";
export type AbsenceType =
  | "vacation" | "sick" | "unpaid"
  | "special" | "parental" | "training";
export type AbsenceStatus = "pending" | "approved" | "rejected";

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  vacation: "Urlaub",
  sick: "Krankheit",
  unpaid: "Unbezahlt",
  special: "Sonderurlaub",
  parental: "Elternzeit",
  training: "Fortbildung",
};
export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type FederalState =
  | "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV"
  | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH";

export const WEEKDAY_LABELS: Record<WeekDay, string> = {
  mon: "Mo", tue: "Di", wed: "Mi", thu: "Do", fri: "Fr", sat: "Sa", sun: "So",
};
export const WEEKDAY_ORDER: WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function legalMinVacationDays(workDays: WeekDay[] | null | undefined): number {
  const days = (workDays && workDays.length > 0) ? workDays.length : 5;
  return Math.floor((24 * days) / 6);
}

export type OnboardingStatus =
  | "onboarding_step_1" | "onboarding_step_2" | "onboarding_step_3"
  | "onboarding_step_4" | "onboarding_step_5" | "active";

export type CompanySizeBucket = "1" | "2_5" | "6_10" | "11_plus";

export const COMPANY_SIZE_BUCKET_LABELS: Record<CompanySizeBucket, string> = {
  "1": "1 Mitarbeiter",
  "2_5": "2–5 Mitarbeiter",
  "6_10": "6–10 Mitarbeiter",
  "11_plus": "11+ Mitarbeiter",
};

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string | null;
  role: Role;
  supervisor_id?: number | null;
  billing_mode: BillingMode;
  hourly_rate_eur: number;
  onboarding_status: OnboardingStatus;
  company_id?: number | null;
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
  work_days?: WeekDay[] | null;
  offboarded_at?: string | null;
  onboarding_pending: boolean;
  // Firma & HR (Arbeitgeber-Profile)
  company_name?: string | null;
  company_address_line1?: string | null;
  company_address_line2?: string | null;
  company_postal_code?: string | null;
  company_city?: string | null;
  company_country?: string | null;
  hr_contact_name?: string | null;
  hr_contact_email?: string | null;
  hr_contact_phone?: string | null;
}

export interface EmployeeCreatePayload {
  username: string;
  email: string;
  full_name?: string;
  role?: Role;
  supervisor_id?: number;
  billing_mode?: BillingMode;
  hourly_rate_eur?: number;
  weekly_hours?: number;
  work_days?: WeekDay[];
  annual_vacation_days?: number;
  initial_overtime_hours?: number;
  initial_remaining_vacation?: number;
  federal_state?: FederalState;
  hire_date?: string;
}

export interface EmploymentTerms {
  id: number;
  user_id: number;
  valid_from: string; // YYYY-MM-DD
  billing_mode: BillingMode;
  hourly_rate_eur: number;
  weekly_hours?: number | null;
  work_days?: WeekDay[] | null;
  annual_vacation_days?: number | null;
  note?: string | null;
  created_at: string;
  created_by?: number | null;
}

export interface TermsPayload {
  valid_from: string;
  billing_mode?: BillingMode;
  hourly_rate_eur?: number;
  weekly_hours?: number;
  work_days?: WeekDay[];
  annual_vacation_days?: number;
  note?: string;
}

export type FeedbackKind = "bug" | "idea" | "improvement";
export type FeedbackStatus = "open" | "in_progress" | "done" | "rejected" | "duplicate";

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "Fehler",
  idea: "Neue Idee",
  improvement: "Verbesserung",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "offen",
  in_progress: "in Arbeit",
  done: "umgesetzt",
  rejected: "abgelehnt",
  duplicate: "Duplikat",
};

export interface FeedbackEntry {
  id: number;
  reporter_user_id?: number | null;
  reporter_username?: string | null;
  reporter_full_name?: string | null;
  reporter_role?: Role | null;
  kind: FeedbackKind;
  status: FeedbackStatus;
  title: string;
  description: string;
  admin_response?: string | null;
  created_at: string;
  updated_at: string;
  decided_at?: string | null;
  decided_by?: number | null;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  description: string;
}

export interface FeedbackUpdate {
  status?: FeedbackStatus;
  admin_response?: string;
}

export interface AuditLogEntry {
  id: number;
  actor_user_id?: number | null;
  actor_username?: string | null;
  actor_full_name?: string | null;
  action: "create" | "update" | "delete";
  entity_type: string;
  entity_id: number;
  subject_user_id?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  created_at: string;
}

export interface BalanceAdjustment {
  id: number;
  user_id: number;
  effective_date: string;
  hours: number;
  reason: string;
  created_at: string;
  created_by?: number | null;
}

export interface BalanceAdjustmentInput {
  effective_date: string;
  hours: number;
  reason: string;
}

export interface InvitePreview {
  email: string;
  full_name?: string | null;
  company_name?: string | null;
}

export interface InviteAcceptPayload {
  username: string;
  password: string;
  full_name: string;
  accept_terms: boolean;
}

export interface InviteAcceptResult {
  user: User;
  token: { access_token: string; token_type?: string };
}

export interface OnboardingStatusOut {
  onboarding_status: OnboardingStatus;
  next_step: string | null;
}

export interface OnboardingCompanyPayload {
  name: string;
  address_street?: string;
  address_zip?: string;
  address_city?: string;
  address_country: string;
  vat_id?: string;
  bundesland: FederalState;
  industry?: string;
  employee_count_bucket: CompanySizeBucket;
}

export interface OnboardingDefaultsPayload {
  default_weekly_hours: number;
  default_vacation_days: number;
  default_bundesland: FederalState;
  default_billing_mode: BillingMode;
}

export interface OnboardingPreview {
  username: string;
  email: string;
  full_name?: string | null;
  employer_name?: string | null;
}

export interface OnboardingCompletePayload {
  password: string;
  full_name?: string;
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

export interface MonthSummary {
  month: number; // 1..12
  actual_hours: number;
  target_hours: number;
  balance_at_end: number;
  vacation_days: number;
  sick_days: number;
  other_absence_days: number;
}

export interface YearOverview {
  year: number;
  months: MonthSummary[];
  total_actual: number;
  total_target: number;
  balance_at_year_start: number;
  balance_at_year_end: number;
  vacation_used: number;
  vacation_remaining: number;
  sick_total: number;
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

export interface AbsenceUpdatePayload {
  type?: AbsenceType;
  start_date?: string;
  end_date?: string;
  note?: string;
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
