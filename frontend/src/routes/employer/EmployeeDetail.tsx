import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../../components/Shell";
import AuditLogViewer from "../../components/AuditLogViewer";
import BalanceAdjustments from "../../components/BalanceAdjustments";
import EmployeeMasterDataForm from "../../components/EmployeeMasterDataForm";
import MonthDownloads from "../../components/MonthDownloads";
import EntriesLog from "../../components/EntriesLog";
import ImportPanel from "../../components/ImportPanel";
import TermsForm from "../../components/TermsForm";
import { useCurrentUser } from "../../auth/CurrentUser";
import {
  api,
  type Absence, type EmploymentTerms, type TermsPayload, type TimeEntry, type User,
} from "../../api";
import {
  addDays, deWeekday, fmtDe, fmtHours, isoDate, startOfWeek,
} from "../../lib/datetime";

type EditMode = null | "master" | "new-terms" | { kind: "edit-terms"; id: number };

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const employeeId = Number(id);
  const [employee, setEmployee] = useState<User | null>(null);
  const [terms, setTerms] = useState<EmploymentTerms[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditMode>(null);

  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const load = async () => {
    if (!employeeId) return;
    const [emp, t] = await Promise.all([
      api.getEmployee(employeeId),
      api.listTerms(employeeId),
    ]);
    setEmployee(emp);
    setTerms(t);
    const start = days[0];
    const end = addDays(days[6], 1);
    const [es, abs] = await Promise.all([
      api.listEntries(start.toISOString(), end.toISOString(), employeeId),
      api.listAbsences(employeeId),
    ]);
    setEntries(es);
    setAbsences(abs);
    if (emp.federal_state) {
      const list = await api.holidays(emp.federal_state, anchor.getFullYear());
      setHolidays(Object.fromEntries(list.map((h) => [h.date, h.name])));
    }
  };

  useEffect(() => { load(); }, [employeeId, anchor.getTime()]);

  if (!employee) return <Shell><div className="placeholder">Lade…</div></Shell>;

  const offboard = async () => {
    if (!confirm(`${employee.full_name} offboarden? Daten bleiben erhalten.`)) return;
    setBusy(true);
    try {
      const u = await api.offboardEmployee(employee.id);
      setEmployee(u);
    } finally { setBusy(false); }
  };
  const reactivate = async () => {
    setBusy(true);
    try {
      const u = await api.reactivateEmployee(employee.id);
      setEmployee(u);
    } finally { setBusy(false); }
  };

  const submitNewTerms = async (payload: TermsPayload) => {
    await api.createTerms(employeeId, payload);
    setEdit(null);
    await load();
  };
  const submitEditTerms = async (termsId: number, payload: TermsPayload) => {
    await api.updateTerms(employeeId, termsId, payload);
    setEdit(null);
    await load();
  };
  const removeTerms = async (termsId: number) => {
    if (!confirm("Vertragseintrag löschen?")) return;
    try {
      await api.deleteTerms(employeeId, termsId);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const entriesByDay: Record<string, TimeEntry[]> = {};
  for (const e of entries) {
    const k = e.start_at.slice(0, 10);
    (entriesByDay[k] ??= []).push(e);
  }
  const absenceFor = (d: Date) => {
    const k = isoDate(d);
    return absences.find((a) => a.start_date <= k && a.end_date >= k);
  };
  const total = entries.reduce((s, e) => s + (e.net_hours || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const currentTerms = [...terms].reverse().find((t) => t.valid_from <= today) ?? terms[terms.length - 1];

  const editingTerms =
    edit && typeof edit === "object" && edit.kind === "edit-terms"
      ? terms.find((t) => t.id === edit.id) : undefined;

  return (
    <Shell>
      <div className="employee-detail">
        <div className="dashboard-toolbar">
          <h2>{employee.full_name || employee.username}</h2>
          <span className="muted">@{employee.username} · {employee.email}</span>
          <span className="spacer" />
          {employee.onboarding_pending && (
            <button onClick={async () => {
              setBusy(true);
              try {
                const u = await api.resendInvite(employee.id);
                setEmployee(u);
                alert("Einladung erneut gesendet.");
              } catch (e: any) { alert(e.message); }
              finally { setBusy(false); }
            }} disabled={busy}>Einladung erneut senden</button>
          )}
          {employee.offboarded_at
            ? <button onClick={reactivate} disabled={busy}>Reaktivieren</button>
            : <button onClick={offboard} disabled={busy} className="danger">Offboarden</button>}
          {isAdmin && (
            <button className="danger" disabled={busy} onClick={async () => {
              const confirmed = confirm(
                `Mitarbeiter "${employee.full_name || employee.username}" endgültig löschen?\n\n` +
                `Es werden ALLE Daten unwiderruflich entfernt:\n` +
                `– Zeiteinträge\n– Abwesenheiten\n– Vertragsverlauf\n– Notification-Einstellungen\n\n` +
                `Audit-Log behält den Snapshot. Trotzdem: prüf die gesetzliche Aufbewahrungs-\n` +
                `pflicht (i. d. R. 10 Jahre nach Ausscheiden) – sie wird vom System nicht\n` +
                `erzwungen, sondern liegt in deiner Verantwortung.`
              );
              if (!confirmed) return;
              setBusy(true);
              try {
                await api.hardDeleteEmployee(employee.id);
                alert("Mitarbeiter gelöscht.");
                navigate(currentUser?.role === "admin" ? "/admin" : "/employer");
              } catch (e: any) {
                alert(e.message);
              } finally {
                setBusy(false);
              }
            }}>Endgültig löschen</button>
          )}
        </div>

        <section className="card-section">
          <div className="dashboard-toolbar">
            <h3 style={{ margin: 0 }}>Stammdaten</h3>
            <span className="spacer" />
            <button onClick={() => setEdit("master")}>Bearbeiten</button>
          </div>
          <StammdatenView user={employee} />
        </section>

        <section className="card-section">
          <div className="dashboard-toolbar">
            <h3 style={{ margin: 0 }}>Vertragsverlauf</h3>
            <span className="spacer" />
            <button onClick={() => setEdit("new-terms")}>+ Neuer Vertrag</button>
          </div>
          <p className="muted small">
            Jeder Eintrag gilt ab seinem Stichtag bis zum Stichtag des nächsten.
            Vergangenheits-Berechnungen (Saldo, Resturlaub) bleiben stabil, wenn
            du einen neuen Vertrag mit zukünftigem Stichtag anlegst.
          </p>
          <table>
            <thead>
              <tr>
                <th>Gültig ab</th>
                <th>Abrechnung</th>
                <th>Soll/h-Satz</th>
                <th>Wochen-h</th>
                <th>Arbeitstage</th>
                <th>Urlaub</th>
                <th>Notiz</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...terms].reverse().map((t) => (
                <tr key={t.id} className={t.id === currentTerms?.id ? "current-terms" : ""}>
                  <td>{t.valid_from}{t.id === currentTerms?.id && <span className="badge small" style={{ marginLeft: 6 }}>aktuell</span>}</td>
                  <td>{t.billing_mode === "hourly" ? "Stundenbasis" : "Festgehalt"}</td>
                  <td>{t.billing_mode === "hourly" ? `${t.hourly_rate_eur.toFixed(2)} €/h` : "Festgehalt"}</td>
                  <td>{t.weekly_hours ?? "–"}</td>
                  <td>{(t.work_days ?? []).join(", ") || "–"}</td>
                  <td>{t.annual_vacation_days ?? "–"}</td>
                  <td className="muted small">{t.note ?? ""}</td>
                  <td>
                    <button onClick={() => setEdit({ kind: "edit-terms", id: t.id })}>Bearbeiten</button>
                    {terms.length > 1 && (
                      <button className="danger" onClick={() => removeTerms(t.id)}>Löschen</button>
                    )}
                  </td>
                </tr>
              ))}
              {terms.length === 0 && (
                <tr><td colSpan={8} className="muted">Noch keine Vertragsdaten.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card-section">
          <h3>Saldo-Korrekturen</h3>
          <BalanceAdjustments employeeId={employee.id} />
        </section>

        <section className="card-section">
          <h3>Alle Einträge &amp; Abwesenheiten</h3>
          <EntriesLog employeeId={employee.id} canEditAll={true} />
        </section>

        <section className="card-section">
          <h3>Stundenzettel-Export</h3>
          <MonthDownloads employeeId={employee.id} />
        </section>

        <section className="card-section">
          <h3>Änderungs-Historie</h3>
          <AuditLogViewer employeeId={employee.id} />
        </section>

        <section className="card-section">
          <h3>Daten importieren</h3>
          <p className="muted small">
            CSVs für Zeiteinträge und Abwesenheiten können jederzeit
            nachträglich hochgeladen werden – z. B. Daten aus dem Vorjahr,
            Korrekturen oder ein Wechsel von einem anderen System.
          </p>
          <ImportPanel employeeId={employee.id} />
        </section>

        <section className="card-section">
          <div className="week-toolbar">
            <button onClick={() => setAnchor(addDays(anchor, -7))}>← Woche</button>
            <strong>{fmtDe(days[0])} – {fmtDe(days[6])}</strong>
            <button onClick={() => setAnchor(addDays(anchor, 7))}>Woche →</button>
            <button onClick={() => setAnchor(new Date())}>Heute</button>
            <span className="spacer" />
            <span>Summe: <strong>{fmtHours(total)}</strong></span>
          </div>

          <div className="week-grid">
            {days.map((d) => {
              const k = isoDate(d);
              const dayEntries = entriesByDay[k] ?? [];
              const sum = dayEntries.reduce((s, e) => s + (e.net_hours || 0), 0);
              const holiday = holidays[k];
              const absence = absenceFor(d);
              return (
                <div key={k} className={`day ${holiday ? "holiday" : ""} ${absence ? `abs-${absence.type}` : ""}`}>
                  <div className="day-head">
                    <strong>{deWeekday(d)} {d.getDate()}.</strong>
                    {holiday && <span className="badge">{holiday}</span>}
                    {absence && (
                      <span className="badge">
                        {absence.type === "vacation" ? "Urlaub" : absence.type === "sick" ? "Krank" : "Unbezahlt"}
                      </span>
                    )}
                  </div>
                  {dayEntries.map((e) => (
                    <div key={e.id} className="entry-row">
                      <span>{e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}</span>
                      <span>{fmtHours(e.net_hours)}</span>
                      {e.project && <span className="muted">{e.project}</span>}
                    </div>
                  ))}
                  <div className="day-foot"><span>{fmtHours(sum)}</span></div>
                </div>
              );
            })}
          </div>
        </section>

        {edit && (
          <div className="modal-backdrop" onClick={() => setEdit(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
              {edit === "master" && (
                <EmployeeMasterDataForm
                  user={employee}
                  onSaved={(u) => { setEmployee(u); setEdit(null); }}
                  onCancel={() => setEdit(null)}
                />
              )}
              {edit === "new-terms" && (
                <TermsForm
                  onSubmit={submitNewTerms}
                  onCancel={() => setEdit(null)}
                />
              )}
              {editingTerms && (
                <TermsForm
                  initial={editingTerms}
                  onSubmit={(p) => submitEditTerms(editingTerms.id, p)}
                  onCancel={() => setEdit(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
