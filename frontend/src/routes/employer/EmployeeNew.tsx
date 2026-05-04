import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import { api, type EmployeeCreatePayload, type FederalState } from "../../api";

const FEDERAL_STATES: FederalState[] = [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
];

export default function EmployeeNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState<EmployeeCreatePayload>({
    username: "",
    email: "",
    password: "",
    full_name: "",
    billing_mode: "salary",
    monthly_target_hours: 160,
    weekly_hours: 40,
    annual_vacation_days: 30,
  });
  const [timesFile, setTimesFile] = useState<File | null>(null);
  const [absencesFile, setAbsencesFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timesReport, setTimesReport] = useState<{ imported: number; errors: { line: number; message: string }[] } | null>(null);
  const [absencesReport, setAbsencesReport] = useState<{ imported: number; errors: { line: number; message: string }[] } | null>(null);

  const set = <K extends keyof EmployeeCreatePayload>(k: K, v: EmployeeCreatePayload[K]) =>
    setForm({ ...form, [k]: v });

  const submit = async () => {
    setError(null); setTimesReport(null); setAbsencesReport(null); setBusy(true);
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
      if (totalErrors === 0) {
        navigate(`/employer/employees/${created.id}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const renderReport = (
    label: string,
    report: { imported: number; errors: { line: number; message: string }[] } | null,
  ) => {
    if (!report) return null;
    return (
      <div className={report.errors.length ? "issue warning" : "issue"} style={{ marginTop: "0.75rem" }}>
        <strong>{label}: {report.imported} importiert.</strong>
        {report.errors.length > 0 && (
          <>
            <p>{report.errors.length} Zeile(n) abgewiesen:</p>
            <ul>
              {report.errors.slice(0, 10).map((e, i) => (
                <li key={i}>Zeile {e.line}: {e.message}</li>
              ))}
              {report.errors.length > 10 && <li>… ({report.errors.length - 10} weitere)</li>}
            </ul>
          </>
        )}
      </div>
    );
  };

  return (
    <Shell>
      <div className="employee-new">
        <h2>Mitarbeiter anlegen</h2>

        <section className="card-section">
          <h3>Login</h3>
          <div className="manual-grid">
            <label>Username<input value={form.username} onChange={(e) => set("username", e.target.value)} /></label>
            <label>E-Mail<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label>Passwort<input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} /></label>
            <label>Voller Name<input value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></label>
          </div>
        </section>

        <section className="card-section">
          <h3>Stammdaten</h3>
          <div className="manual-grid">
            <label>Geburtsdatum<input type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} /></label>
            <label>Telefon<input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></label>
            <label>SV-Nummer<input value={form.social_security_number ?? ""} onChange={(e) => set("social_security_number", e.target.value)} /></label>
            <label>IBAN<input value={form.iban ?? ""} onChange={(e) => set("iban", e.target.value)} /></label>
            <label>Adresse<input value={form.address_line1 ?? ""} onChange={(e) => set("address_line1", e.target.value)} /></label>
            <label>Adresszusatz<input value={form.address_line2 ?? ""} onChange={(e) => set("address_line2", e.target.value)} /></label>
            <label>PLZ<input value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} /></label>
            <label>Ort<input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></label>
            <label>Notfallkontakt Name<input value={form.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} /></label>
            <label>Notfallkontakt Telefon<input value={form.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></label>
          </div>
        </section>

        <section className="card-section">
          <h3>Beschäftigung</h3>
          <div className="manual-grid">
            <label>Eintrittsdatum<input type="date" value={form.hire_date ?? ""} onChange={(e) => set("hire_date", e.target.value)} /></label>
            <label>Bundesland
              <select value={form.federal_state ?? ""} onChange={(e) => set("federal_state", (e.target.value || undefined) as FederalState)}>
                <option value="">– bitte wählen –</option>
                {FEDERAL_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>Wochenstunden<input type="number" value={form.weekly_hours ?? 0} onChange={(e) => set("weekly_hours", parseFloat(e.target.value || "0"))} /></label>
            <label>Urlaub/Jahr (Tage)<input type="number" value={form.annual_vacation_days ?? 0} onChange={(e) => set("annual_vacation_days", parseFloat(e.target.value || "0"))} /></label>
            <label>Anfangs-Resturlaub<input type="number" step="0.5" value={form.initial_remaining_vacation ?? 0} onChange={(e) => set("initial_remaining_vacation", parseFloat(e.target.value || "0"))} /></label>
            <label>Anfangs-Überstunden<input type="number" step="0.5" value={form.initial_overtime_hours ?? 0} onChange={(e) => set("initial_overtime_hours", parseFloat(e.target.value || "0"))} /></label>
            <label>Abrechnung
              <select value={form.billing_mode} onChange={(e) => set("billing_mode", e.target.value as any)}>
                <option value="salary">Festgehalt</option>
                <option value="hourly">Stundenbasis</option>
              </select>
            </label>
            {form.billing_mode === "hourly"
              ? <label>Stundensatz (EUR)<input type="number" step="0.01" value={form.hourly_rate_eur ?? 0} onChange={(e) => set("hourly_rate_eur", parseFloat(e.target.value || "0"))} /></label>
              : <label>Soll-Stunden/Monat<input type="number" step="0.5" value={form.monthly_target_hours ?? 160} onChange={(e) => set("monthly_target_hours", parseFloat(e.target.value || "0"))} /></label>}
          </div>
        </section>

        <section className="card-section">
          <h3>Optional: bestehende Daten importieren</h3>

          <div style={{ marginBottom: "1rem" }}>
            <strong>Zeiteinträge</strong>
            <p className="muted small">
              Header: <code>datum;start;ende;pause_min;projekt;notiz</code> ·{" "}
              <a href={api.importTemplateTimesUrl()} download>Vorlage herunterladen</a>
            </p>
            <input type="file" accept=".csv,text/csv"
              onChange={(e) => setTimesFile(e.target.files?.[0] ?? null)} />
            {renderReport("Zeiteinträge", timesReport)}
          </div>

          <div>
            <strong>Abwesenheiten (Urlaub, Krankheit, unbezahlt)</strong>
            <p className="muted small">
              Header: <code>art;von;bis;notiz</code> · art ∈ {"{vacation, sick, unpaid}"} ·{" "}
              <a href={api.importTemplateAbsencesUrl()} download>Vorlage herunterladen</a>
            </p>
            <p className="muted small">Importierte Einträge gelten direkt als <em>genehmigt</em>.</p>
            <input type="file" accept=".csv,text/csv"
              onChange={(e) => setAbsencesFile(e.target.files?.[0] ?? null)} />
            {renderReport("Abwesenheiten", absencesReport)}
          </div>
        </section>

        {error && <div className="error">{error}</div>}
        <div className="row-actions">
          <button onClick={submit} disabled={busy}>
            {busy ? "Speichere…" : "Mitarbeiter anlegen"}
          </button>
          <button onClick={() => navigate(-1)}>Abbrechen</button>
        </div>
      </div>
    </Shell>
  );
}
