import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import Select from "../../components/ui/Select";
import WorkDaysPicker from "../../components/WorkDaysPicker";
import ImportPanel from "../../components/ImportPanel";
import { useCurrentUser } from "../../auth/CurrentUser";
import {
  api, legalMinVacationDays,
  type EmployeeCreatePayload, type FederalState, type User, type WeekDay,
} from "../../api";

const FEDERAL_STATES: FederalState[] = [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
];

const DEFAULT_WORK_DAYS: WeekDay[] = ["mon", "tue", "wed", "thu", "fri"];

export default function EmployeeNew() {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const [employers, setEmployers] = useState<User[]>([]);
  useEffect(() => {
    if (isAdmin) {
      api.listEmployees(false).then((all) =>
        setEmployers(all.filter((u) => u.role === "employer")),
      );
    }
  }, [isAdmin]);

  const [form, setForm] = useState<EmployeeCreatePayload>({
    username: "",
    email: "",
    full_name: "",
    billing_mode: "salary",
    weekly_hours: 40,
    work_days: DEFAULT_WORK_DAYS,
    annual_vacation_days: 30,
  });
  const [timesFile, setTimesFile] = useState<File | null>(null);
  const [absencesFile, setAbsencesFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timesReport, setTimesReport] = useState<{ imported: number; errors: { line: number; message: string }[] } | null>(null);
  const [absencesReport, setAbsencesReport] = useState<{ imported: number; errors: { line: number; message: string }[] } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const workDays = form.work_days ?? DEFAULT_WORK_DAYS;
  const legalMin = useMemo(() => legalMinVacationDays(workDays), [workDays]);
  const vacInvalid = (form.annual_vacation_days ?? 0) < legalMin;

  const set = <K extends keyof EmployeeCreatePayload>(k: K, v: EmployeeCreatePayload[K]) =>
    setForm({ ...form, [k]: v });

  const submit = async () => {
    setError(null); setSuccess(null);
    setTimesReport(null); setAbsencesReport(null); setBusy(true);
    try {
      const created = await api.createEmployee(form);
      let totalErrors = 0;
      if (timesFile) {
        const r = await api.importTimeEntriesCsv(created.id, timesFile);
        setTimesReport(r);
        totalErrors += r.errors.length;
      }
      if (absencesFile) {
        const r = await api.importAbsencesCsv(created.id, absencesFile);
        setAbsencesReport(r);
        totalErrors += r.errors.length;
      }
      setSuccess(
        `Mitarbeiter ${created.full_name || created.username} angelegt. Eine Einladung wurde an ${created.email} gesendet.`,
      );
      if (totalErrors === 0) {
        // bewusst kein direkter Redirect: User soll Bestätigung sehen
        setTimeout(() => navigate(`/employer/employees/${created.id}`), 2000);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <div className="eyebrow">Team</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Mitarbeiter anlegen</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Du legst nur die vertraglichen Grunddaten an. Persönliche Daten
            (Adresse, Geburtsdatum, IBAN, …) füllt der Mitarbeiter selbst aus,
            nachdem er die Einladungsmail bekommen hat.
          </p>
        </div>

        <section className="card space-y-4 p-4 sm:p-5">
          <h2 className="text-base font-black sm:text-lg">Login &amp; Kontakt</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Username</span>
              <input className="input" value={form.username} onChange={(e) => set("username", e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">E-Mail</span>
              <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Voller Name</span>
              <input className="input" value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
            </label>
            {isAdmin && (
              <div>
                <span className="field-label">Arbeitgeber</span>
                <Select
                  value={form.supervisor_id != null ? String(form.supervisor_id) : ""}
                  onChange={(v) => set("supervisor_id", v ? parseInt(v, 10) : undefined)}
                  options={employers.map((em) => ({ value: String(em.id), label: em.full_name || em.username }))}
                  placeholder="– bitte wählen –"
                  aria-label="Arbeitgeber"
                />
                {employers.length === 0 && (
                  <span className="mt-1 block text-xs text-red-600">
                    Es existiert noch kein Arbeitgeber. Lege zuerst einen
                    unter „Arbeitgeber" an.
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-ink/60">An die E-Mail-Adresse geht die Einladung mit Link zum Onboarding.</p>
        </section>

        <section className="card space-y-4 p-4 sm:p-5">
          <h2 className="text-base font-black sm:text-lg">Beschäftigung</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Eintrittsdatum</span>
              <input className="input" type="date" value={form.hire_date ?? ""} onChange={(e) => set("hire_date", e.target.value)} />
            </label>
            <div>
              <span className="field-label">Bundesland</span>
              <Select
                value={form.federal_state ?? ""}
                onChange={(v) => set("federal_state", (v || undefined) as FederalState)}
                options={FEDERAL_STATES.map((s) => ({ value: s, label: s }))}
                placeholder="– bitte wählen –"
                aria-label="Bundesland"
              />
            </div>
            <label className="block">
              <span className="field-label">Wochenstunden</span>
              <input className="input" type="number" value={form.weekly_hours ?? 0} onChange={(e) => set("weekly_hours", parseFloat(e.target.value || "0"))} />
            </label>
            <div className="sm:col-span-2">
              <span className="field-label">Arbeitstage pro Woche</span>
              <WorkDaysPicker value={workDays} onChange={(v) => set("work_days", v)} />
            </div>
            <label className="block">
              <span className="field-label">Urlaub/Jahr (Tage)</span>
              <input className="input" type="number" value={form.annual_vacation_days ?? 0}
                onChange={(e) => set("annual_vacation_days", parseFloat(e.target.value || "0"))} />
              <span className={`mt-1 block text-xs ${vacInvalid ? "text-red-600" : "text-ink/60"}`}>
                Mindestens {legalMin} Tage gesetzlich vorgeschrieben (BUrlG § 3) bei
                {" "}{workDays.length}-Tage-Woche. Mehr ist erlaubt.
              </span>
            </label>
            <label className="block">
              <span className="field-label">Anfangs-Resturlaub</span>
              <input className="input" type="number" step="0.5" value={form.initial_remaining_vacation ?? 0} onChange={(e) => set("initial_remaining_vacation", parseFloat(e.target.value || "0"))} />
            </label>
            <label className="block">
              <span className="field-label">Anfangs-Überstunden</span>
              <input className="input" type="number" step="0.5" value={form.initial_overtime_hours ?? 0} onChange={(e) => set("initial_overtime_hours", parseFloat(e.target.value || "0"))} />
            </label>
            <div>
              <span className="field-label">Abrechnung</span>
              <Select
                value={form.billing_mode ?? "salary"}
                onChange={(v) => set("billing_mode", v as any)}
                options={[
                  { value: "salary", label: "Festgehalt" },
                  { value: "hourly", label: "Stundenbasis" },
                ]}
                aria-label="Abrechnung"
              />
            </div>
            {form.billing_mode === "hourly" && (
              <label className="block">
                <span className="field-label">Stundensatz (EUR)</span>
                <input className="input" type="number" step="0.01" value={form.hourly_rate_eur ?? 0} onChange={(e) => set("hourly_rate_eur", parseFloat(e.target.value || "0"))} />
              </label>
            )}
          </div>
          {form.billing_mode === "salary" && (
            <p className="text-xs text-ink/60">
              Soll-Stunden pro Monat ergeben sich automatisch aus Wochen-
              stunden, Arbeitstagen und den Feiertagen des Bundeslandes.
            </p>
          )}
        </section>

        <section className="card space-y-4 p-4 sm:p-5">
          <h2 className="text-base font-black sm:text-lg">Optional: bestehende Daten importieren</h2>
          <p className="text-xs text-ink/60">
            Werden nach dem Anlegen des Mitarbeiters direkt mit hochgeladen.
            Du kannst später auch jederzeit nachträglich importieren –
            Drill-Down → Import.
          </p>
          <ImportPanel
            employeeId={0}
            autoUpload={false}
            onFilesChange={(t, a) => { setTimesFile(t); setAbsencesFile(a); }}
            timesReport={timesReport}
            absencesReport={absencesReport}
          />
        </section>

        {error && (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}
        {success && (
          <div className="rounded-lg border-l-4 border-royal bg-royal/10 p-3 text-sm text-ink">{success}</div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={submit}
            disabled={busy || vacInvalid || (isAdmin && !form.supervisor_id)}>
            {busy ? "Speichere…" : "Anlegen & Einladung senden"}
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Abbrechen</Button>
        </div>
      </div>
    </Shell>
  );
}
