import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../../components/Shell";
import AbsenceCreateForm from "../../components/AbsenceCreateForm";
import AuditLogViewer from "../../components/AuditLogViewer";
import BalanceAdjustments from "../../components/BalanceAdjustments";
import Donut from "../../components/Donut";
import EmployeeMasterDataForm from "../../components/EmployeeMasterDataForm";
import HoursBar from "../../components/HoursBar";
import MonthDownloads from "../../components/MonthDownloads";
import EntriesLog from "../../components/EntriesLog";
import ImportPanel from "../../components/ImportPanel";
import StammdatenView from "../../components/StammdatenView";
import TermsForm from "../../components/TermsForm";
import { useCurrentUser } from "../../auth/CurrentUser";
import {
  api, WEEKDAY_LABELS,
  type Absence, type AbsenceStatus, type BalanceAdjustment, type BalanceOut,
  type EmploymentTerms, type TermsPayload, type TimeEntry, type User, type YearOverview,
} from "../../api";
import {
  addDays, deWeekday, fmtDe, fmtHours, isoDate, startOfWeek,
} from "../../lib/datetime";
import { useMediaQuery } from "../../lib/useMediaQuery";

type EditMode = null | "master" | "new-terms" | { kind: "edit-terms"; id: number };
type EntryView = "woche" | "liste";
type DrillKey = null | "hours" | "saldo" | "vacation" | "sick";

const STATUS_LABEL: Record<AbsenceStatus, string> = {
  pending: "beantragt", approved: "genehmigt", rejected: "abgelehnt",
};

/** Stunden mit Vorzeichen, z. B. "+12,50 h" / "−4,00 h" / "±0,00 h". */
function signedH(h: number, digits = 2): string {
  const sign = h >= 0.005 ? "+" : h <= -0.005 ? "−" : "±";
  return `${sign}${Math.abs(h).toFixed(digits).replace(".", ",")} h`;
}
/** Tageszahl ohne überflüssige Nachkommastellen ("18", "17,5"). */
function dayNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

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
  const [balance, setBalance] = useState<BalanceOut | null>(null);
  const [year, setYear] = useState<YearOverview | null>(null);
  const [adjustments, setAdjustments] = useState<BalanceAdjustment[]>([]);
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditMode>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drill, setDrill] = useState<DrillKey>(null);
  const [absenceOpen, setAbsenceOpen] = useState(false);

  // Default-View nach Viewport: ≤ 768px = Liste, sonst Woche. Der
  // initialView-Ref hält fest, dass wir den Default nur EINMAL beim
  // ersten Match übernehmen – sonst würde ein Resize während der Sitzung
  // den manuell gewählten View überschreiben.
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [entryView, setEntryView] = useState<EntryView>("woche");
  const initialViewSet = useRef(false);
  useEffect(() => {
    if (initialViewSet.current) return;
    initialViewSet.current = true;
    setEntryView(isMobile ? "liste" : "woche");
  }, [isMobile]);

  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const load = async () => {
    if (!employeeId) return;
    const yr = new Date().getFullYear();
    const [emp, t, bal, yov, adj] = await Promise.all([
      api.getEmployee(employeeId),
      api.listTerms(employeeId),
      api.balance(employeeId),
      api.yearOverview(yr, employeeId),
      api.listBalanceAdjustments(employeeId),
    ]);
    setEmployee(emp);
    setTerms(t);
    setBalance(bal);
    setYear(yov);
    setAdjustments(adj);
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

  // ESC schließt die oberste Ebene zuerst: Bearbeiten-Dialog → Abwesenheit
  // → Drill-Modal → Drawer.
  useEffect(() => {
    if (!edit && !absenceOpen && !drill && !settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (edit) setEdit(null);
      else if (absenceOpen) setAbsenceOpen(false);
      else if (drill) setDrill(null);
      else if (settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, absenceOpen, drill, settingsOpen]);

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
  const resendInvite = async () => {
    setBusy(true);
    try {
      const u = await api.resendInvite(employee.id);
      setEmployee(u);
      alert("Einladung erneut gesendet.");
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };
  const hardDelete = async () => {
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

  // ---- KPI-Werte ableiten ----
  const yr = new Date().getFullYear();
  const curMonthNum = new Date().getMonth() + 1;
  const curMonth = year?.months.find((m) => m.month === curMonthNum) ?? null;
  const isSalary = employee.billing_mode === "salary";
  const monthActual = curMonth?.actual_hours ?? 0;
  const monthTarget = curMonth?.target_hours ?? 0;

  const saldoHours = balance?.balance_hours ?? 0;
  const istToDate = balance?.actual_hours_to_date ?? 0;
  const sollToDate = balance?.target_hours_to_date ?? 0;
  const initialOt = employee.initial_overtime_hours ?? 0;
  const adjToDate = adjustments.filter((a) => a.effective_date <= today);
  const adjTotal = adjToDate.reduce((s, a) => s + a.hours, 0);
  const balCls = saldoHours > 0.05 ? "positive" : saldoHours < -0.05 ? "negative" : "";

  const annualVac = currentTerms?.annual_vacation_days ?? employee.annual_vacation_days ?? 0;
  const inHireYear = employee.hire_date
    ? new Date(employee.hire_date).getFullYear() === yr : false;
  const initialVac = inHireYear ? (employee.initial_remaining_vacation ?? 0) : 0;
  const anspruch = annualVac + initialVac;
  const vacRemaining = year?.vacation_remaining ?? 0;
  const vacApproved = year?.vacation_used ?? 0;
  const vacPlanned = Math.max(0, +(anspruch - vacRemaining).toFixed(2));
  const vacOpen = Math.max(0, +(vacPlanned - vacApproved).toFixed(2));

  const sickTotal = year?.sick_total ?? 0;
  const sickMonth = curMonth?.sick_days ?? 0;

  const yearStart = `${yr}-01-01`;
  const yearEnd = `${yr}-12-31`;
  const inYear = (a: Absence) => a.start_date <= yearEnd && a.end_date >= yearStart;
  const vacAbs = absences
    .filter((a) => a.type === "vacation" && inYear(a))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const sickAbs = absences
    .filter((a) => a.type === "sick" && inYear(a))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  const workDaysLabel = (currentTerms?.work_days ?? [])
    .map((d) => WEEKDAY_LABELS[d]).join(", ") || "—";
  const monthName = new Date(yr, curMonthNum - 1, 1)
    .toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const monthShort = (m: number) =>
    new Date(yr, m - 1, 1).toLocaleDateString("de-DE", { month: "short" });

  const initials = (employee.full_name || employee.username)
    .split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";

  const absenceList = (rows: Absence[], emptyText: string) =>
    rows.length ? (
      <ul className="calc-list-items">
        {rows.map((a) => (
          <li key={a.id}>
            <span>{a.start_date} – {a.end_date}{a.note ? ` · ${a.note}` : ""}</span>
            <span className="meta">{STATUS_LABEL[a.status]}</span>
          </li>
        ))}
      </ul>
    ) : <p className="muted small">{emptyText}</p>;

  const drillTitle: Record<Exclude<DrillKey, null>, string> = {
    hours: `Stunden – ${monthName}`,
    saldo: "Saldo / Überstunden",
    vacation: `Urlaub ${yr}`,
    sick: `Krankheit ${yr}`,
  };

  return (
    <Shell>
      <div className="employee-detail">
        {/* Header */}
        <div className="profile-head">
          <div className="emp-avatar">{initials}</div>
          <div className="profile-head-id">
            <h2>{employee.full_name || employee.username}</h2>
            <span className="muted small">@{employee.username} · {employee.email}</span>
          </div>
          <span className="spacer" />
          <span className={`status ${employee.offboarded_at ? "status-rejected" : "status-approved"}`}>
            {employee.offboarded_at ? "offboarded" : "aktiv"}
          </span>
          <button onClick={() => setSettingsOpen(true)}>⚙ Einstellungen</button>
        </div>

        {employee.onboarding_pending && (
          <div className="issue warning profile-banner">
            <span>
              Onboarding ausstehend – {employee.full_name || employee.username} hat
              die Einladung noch nicht angenommen.
            </span>
            <button onClick={resendInvite} disabled={busy}>Einladung erneut senden</button>
          </div>
        )}

        {/* KPI-Übersicht */}
        <div className="team-summary">
          <KpiTile label="Stunden im Monat" value={fmtHours(monthActual)}
            meta={isSalary ? `von ${fmtHours(monthTarget)} Soll` : "Stundenbasis"}
            onClick={() => setDrill("hours")}>
            {isSalary && <div className="kpi-bar"><HoursBar actual={monthActual} target={monthTarget} /></div>}
          </KpiTile>

          <KpiTile label="Saldo / Überstunden"
            value={isSalary ? signedH(saldoHours, 1) : "—"}
            valueClass={isSalary ? balCls : ""}
            meta={isSalary ? `Stand ${balance?.as_of ?? today}` : "Stundenbasis – kein Saldo"}
            onClick={() => setDrill("saldo")} />

          <KpiTile label="Resturlaub" value={`${dayNum(vacRemaining)} Tage`}
            valueClass={vacRemaining <= 0 ? "negative" : ""}
            meta={`von ${dayNum(anspruch)} · ${dayNum(vacApproved)} genommen`}
            onClick={() => setDrill("vacation")} />

          <KpiTile label="Krankheit (Jahr)" value={`${dayNum(sickTotal)} Tage`}
            meta={sickMonth > 0 ? `${dayNum(sickMonth)} im laufenden Monat` : "keine im laufenden Monat"}
            onClick={() => setDrill("sick")} />
        </div>

        {/* Einträge & Abwesenheiten */}
        <section className="card-section">
          <div className="dashboard-toolbar" style={{ marginBottom: "0.8rem" }}>
            <h3 style={{ margin: 0 }}>Einträge &amp; Abwesenheiten</h3>
            <span className="spacer" />
            <button onClick={() => setAbsenceOpen(true)}>+ Abwesenheit</button>
            <div className="segment-control" role="tablist" aria-label="Ansicht">
              <button role="tab" aria-selected={entryView === "woche"}
                className={`segment ${entryView === "woche" ? "active" : ""}`}
                onClick={() => setEntryView("woche")}>Woche</button>
              <button role="tab" aria-selected={entryView === "liste"}
                className={`segment ${entryView === "liste" ? "active" : ""}`}
                onClick={() => setEntryView("liste")}>Liste</button>
            </div>
          </div>

          {entryView === "liste" && (
            <EntriesLog employeeId={employee.id} canEditAll={true} />
          )}

          {entryView === "woche" && (
            <>
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
            </>
          )}
        </section>

        {/* Abwesenheit für den MA eintragen (auch rückwirkend) */}
        {absenceOpen && (
          <div className="modal-backdrop" onClick={() => setAbsenceOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
              <AbsenceCreateForm
                employeeId={employee.id}
                employeeName={employee.full_name || employee.username}
                onSaved={() => { setAbsenceOpen(false); load(); }}
                onCancel={() => setAbsenceOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Nachvollziehen-Modal */}
        {drill && (
          <div className="modal-backdrop" onClick={() => setDrill(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
              <div className="day-detail-head">
                <div><h3 style={{ margin: 0 }}>{drillTitle[drill]}</h3></div>
                <button className="modal-close-btn" aria-label="Schließen" onClick={() => setDrill(null)}>×</button>
              </div>

              {drill === "hours" && (
                <>
                  <p className="calc-formula">
                    Soll pro Arbeitstag = Wochenstunden ÷ Arbeitstage. Feiertage
                    (Bundesland) und genehmigte Abwesenheiten zählen nicht zum Soll.
                    Ist = Summe der Netto-Stunden (brutto minus Pausen).
                  </p>
                  <div className="calc-list">
                    <div className="calc-row">
                      <span className="calc-label">Ist-Stunden</span>
                      <span className="calc-value">{fmtHours(monthActual)}</span>
                    </div>
                    <div className="calc-row">
                      <span className="calc-label">Soll-Stunden</span>
                      <span className="calc-value">{isSalary ? fmtHours(monthTarget) : "—"}</span>
                    </div>
                    <div className="calc-row calc-total">
                      <span className="calc-label">Differenz</span>
                      <span className="calc-value">
                        {isSalary ? signedH(monthActual - monthTarget) : "Stundenbasis"}
                      </span>
                    </div>
                  </div>

                  <h4 className="drill-section-h">Aktueller Vertrag</h4>
                  <div className="calc-list">
                    <div className="calc-row">
                      <span className="calc-label">Abrechnung</span>
                      <span className="calc-value">{isSalary ? "Festgehalt" : "Stundenbasis"}</span>
                    </div>
                    <div className="calc-row">
                      <span className="calc-label">Wochenstunden</span>
                      <span className="calc-value">{currentTerms?.weekly_hours ?? "—"}</span>
                    </div>
                    <div className="calc-row">
                      <span className="calc-label">Arbeitstage</span>
                      <span className="calc-value">{workDaysLabel}</span>
                    </div>
                  </div>

                  {year && year.months.length > 0 && (
                    <>
                      <h4 className="drill-section-h">Monate {yr}</h4>
                      <table>
                        <thead>
                          <tr>
                            <th>Monat</th>
                            <th style={{ textAlign: "right" }}>Ist</th>
                            <th style={{ textAlign: "right" }}>Soll</th>
                            <th style={{ textAlign: "right" }}>Saldo Ende</th>
                          </tr>
                        </thead>
                        <tbody>
                          {year.months.map((m) => (
                            <tr key={m.month}>
                              <td>{monthShort(m.month)}</td>
                              <td style={{ textAlign: "right" }}>{m.actual_hours.toFixed(1)}</td>
                              <td style={{ textAlign: "right" }}>{isSalary ? m.target_hours.toFixed(1) : "—"}</td>
                              <td style={{ textAlign: "right" }}>
                                {m.balance_at_end == null ? "—" : signedH(m.balance_at_end, 1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}

              {drill === "saldo" && (
                isSalary ? (
                  <>
                    <p className="calc-formula">
                      Saldo = Startwert + alle erfassten Ist-Stunden + manuelle
                      Korrekturen − das aufgelaufene Soll (ab Eintritt bis {balance?.as_of ?? today}).
                    </p>
                    <div className="calc-list">
                      <div className="calc-row">
                        <span className="calc-label">Startwert (Anfangs-Überstunden)</span>
                        <span className="calc-value">{signedH(initialOt)}</span>
                      </div>
                      <div className="calc-row">
                        <span className="calc-label"><span className="calc-op">+</span>Ist-Stunden gesamt</span>
                        <span className="calc-value">{fmtHours(istToDate)}</span>
                      </div>
                      <div className="calc-row">
                        <span className="calc-label"><span className="calc-op">+</span>Saldo-Korrekturen</span>
                        <span className="calc-value">{signedH(adjTotal)}</span>
                      </div>
                      <div className="calc-row">
                        <span className="calc-label"><span className="calc-op">−</span>Soll-Stunden gesamt</span>
                        <span className="calc-value">{fmtHours(sollToDate)}</span>
                      </div>
                      <div className="calc-row calc-total">
                        <span className="calc-label">= Saldo</span>
                        <span className={`calc-value ${balCls}`}>{signedH(saldoHours)}</span>
                      </div>
                    </div>

                    {adjToDate.length > 0 && (
                      <>
                        <h4 className="drill-section-h">Korrektur-Buchungen</h4>
                        <ul className="calc-list-items">
                          {[...adjToDate]
                            .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1))
                            .map((a) => (
                              <li key={a.id}>
                                <span>{a.effective_date} · {a.reason}</span>
                                <span className="calc-value">{signedH(a.hours)}</span>
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="calc-formula">
                      {employee.full_name || employee.username} wird auf Stundenbasis
                      abgerechnet. Ein Überstunden-Saldo wird nur bei Festgehalt geführt
                      (Ist gegen Soll). Hier zählt die reine erfasste Zeit.
                    </p>
                    <div className="calc-list">
                      <div className="calc-row calc-total">
                        <span className="calc-label">Ist-Stunden gesamt</span>
                        <span className="calc-value">{fmtHours(istToDate)}</span>
                      </div>
                    </div>
                  </>
                )
              )}

              {drill === "vacation" && (
                <>
                  <p className="calc-formula">
                    Anspruch = Jahresurlaub aus dem Vertrag{inHireYear ? " + Resturlaub aus dem Eintrittsjahr" : ""}.
                    Abgezogen werden die Werktage aller genehmigten und beantragten
                    Urlaubsanträge des Jahres (Feiertage zählen nicht).
                  </p>
                  <div className="drill-donut-row">
                    <Donut value={vacPlanned} max={anspruch}
                      centerLabel={dayNum(vacRemaining)} centerSub="Tage übrig"
                      color={vacRemaining <= 0 ? "var(--error)" : "var(--accent)"} />
                    <div className="calc-list" style={{ flex: 1, minWidth: 200 }}>
                      <div className="calc-row">
                        <span className="calc-label">Jahresanspruch</span>
                        <span className="calc-value">{dayNum(annualVac)} Tage</span>
                      </div>
                      {inHireYear && (
                        <div className="calc-row">
                          <span className="calc-label"><span className="calc-op">+</span>Resturlaub Eintrittsjahr</span>
                          <span className="calc-value">{dayNum(initialVac)} Tage</span>
                        </div>
                      )}
                      <div className="calc-row">
                        <span className="calc-label">
                          <span className="calc-op">−</span>Verplant (genehmigt {dayNum(vacApproved)} + offen {dayNum(vacOpen)})
                        </span>
                        <span className="calc-value">{dayNum(vacPlanned)} Tage</span>
                      </div>
                      <div className="calc-row calc-total">
                        <span className="calc-label">= Resturlaub</span>
                        <span className={`calc-value ${vacRemaining <= 0 ? "negative" : ""}`}>{dayNum(vacRemaining)} Tage</span>
                      </div>
                    </div>
                  </div>

                  <h4 className="drill-section-h">Urlaubsanträge {yr}</h4>
                  {absenceList(vacAbs, `Keine Urlaubsanträge in ${yr}.`)}
                </>
              )}

              {drill === "sick" && (
                <>
                  <p className="calc-formula">
                    Gezählt werden die Werktage in genehmigten Krankmeldungen.
                    Feiertage und arbeitsfreie Tage zählen nicht.
                  </p>
                  <div className="calc-list">
                    <div className="calc-row">
                      <span className="calc-label">Krank-Tage im {monthShort(curMonthNum)}</span>
                      <span className="calc-value">{dayNum(sickMonth)}</span>
                    </div>
                    <div className="calc-row calc-total">
                      <span className="calc-label">Krank-Tage {yr}</span>
                      <span className="calc-value">{dayNum(sickTotal)}</span>
                    </div>
                  </div>

                  <h4 className="drill-section-h">Krankmeldungen {yr}</h4>
                  {absenceList(sickAbs, `Keine Krankmeldungen in ${yr}.`)}
                </>
              )}
            </div>
          </div>
        )}

        {/* Einstellungs-Fenster (Slide-over rechts) */}
        {settingsOpen && (
          <div className="settings-drawer-backdrop" onClick={() => setSettingsOpen(false)}>
            <aside className="settings-drawer" onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Einstellungen & Verwaltung">
              <div className="settings-drawer-head">
                <h3>Einstellungen &amp; Verwaltung</h3>
                <span className="spacer" />
                <button className="modal-close-btn" aria-label="Schließen" onClick={() => setSettingsOpen(false)}>×</button>
              </div>

              <details className="card-section disclosure">
                <summary className="disclosure-head">
                  <span className="disclosure-chevron" aria-hidden="true">▸</span>
                  <h3 style={{ margin: 0 }}>Stammdaten &amp; Historie</h3>
                  <span className="spacer" />
                  <span className="muted small">selten benötigt – ausklappen zum Ansehen</span>
                </summary>
                <div className="disclosure-body">
                  <div className="dashboard-toolbar" style={{ marginTop: "0.6rem" }}>
                    <span className="spacer" />
                    <button onClick={(e) => { e.preventDefault(); setEdit("master"); }}>
                      Bearbeiten
                    </button>
                  </div>
                  <StammdatenView user={employee} />

                  <h4 className="disclosure-sub-h">Änderungs-Historie</h4>
                  <AuditLogViewer employeeId={employee.id} />
                </div>
              </details>

              <details className="card-section disclosure">
                <summary className="disclosure-head">
                  <span className="disclosure-chevron" aria-hidden="true">▸</span>
                  <h3 style={{ margin: 0 }}>Daten importieren</h3>
                  <span className="spacer" />
                  <span className="muted small">einmaliger Vorgang beim Onboarding</span>
                </summary>
                <div className="disclosure-body">
                  <p className="muted small">
                    CSVs für Zeiteinträge und Abwesenheiten können jederzeit
                    nachträglich hochgeladen werden – z. B. Daten aus dem Vorjahr,
                    Korrekturen oder ein Wechsel von einem anderen System.
                  </p>
                  <ImportPanel employeeId={employee.id} />
                </div>
              </details>

              <details className="card-section disclosure">
                <summary className="disclosure-head">
                  <span className="disclosure-chevron" aria-hidden="true">▸</span>
                  <h3 style={{ margin: 0 }}>Vertragsverlauf</h3>
                  <span className="spacer" />
                  <span className="muted small">
                    {currentTerms
                      ? `aktuell ab ${currentTerms.valid_from} · ${terms.length} Einträge`
                      : "noch keine Verträge"}
                  </span>
                </summary>
                <div className="disclosure-body">
                  <div className="dashboard-toolbar" style={{ marginTop: "0.6rem" }}>
                    <span className="spacer" />
                    <button onClick={(e) => { e.preventDefault(); setEdit("new-terms"); }}>
                      + Neuer Vertrag
                    </button>
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
                </div>
              </details>

              <details className="card-section disclosure">
                <summary className="disclosure-head">
                  <span className="disclosure-chevron" aria-hidden="true">▸</span>
                  <h3 style={{ margin: 0 }}>Saldo-Korrekturen</h3>
                  <span className="spacer" />
                  <span className="muted small">manuelle Buchungen, z.B. Auszahlungen</span>
                </summary>
                <div className="disclosure-body">
                  <BalanceAdjustments employeeId={employee.id} />
                </div>
              </details>

              <details className="card-section disclosure">
                <summary className="disclosure-head">
                  <span className="disclosure-chevron" aria-hidden="true">▸</span>
                  <h3 style={{ margin: 0 }}>Stundenzettel-Export</h3>
                  <span className="spacer" />
                  <span className="muted small">CSV / PDF pro Monat</span>
                </summary>
                <div className="disclosure-body">
                  <MonthDownloads employeeId={employee.id} />
                </div>
              </details>

              <div className="danger-zone">
                <h3>Beschäftigung</h3>
                <p className="muted small">
                  Offboarden behält alle Daten und blendet den Mitarbeiter nur aus.
                  {isAdmin ? " Endgültig löschen entfernt alle Daten unwiderruflich." : ""}
                </p>
                <div className="row-actions">
                  {employee.offboarded_at
                    ? <button onClick={reactivate} disabled={busy}>Reaktivieren</button>
                    : <button className="danger" onClick={offboard} disabled={busy}>Offboarden</button>}
                  {isAdmin && (
                    <button className="danger" disabled={busy} onClick={hardDelete}>Endgültig löschen</button>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Bearbeiten-Dialoge – liegen ÜBER dem Drawer (z-index 100 > 90) */}
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

function KpiTile({
  label, value, meta, valueClass = "", children, onClick,
}: {
  label: string; value: string; meta?: string; valueClass?: string;
  children?: ReactNode; onClick: () => void;
}) {
  return (
    <button type="button" className="summary-tile kpi-tile" onClick={onClick}>
      <div className="summary-label">{label}</div>
      <div className={`summary-value ${valueClass}`}>{value}</div>
      {meta && <div className="summary-meta">{meta}</div>}
      {children}
      <span className="kpi-hint">Details ansehen →</span>
    </button>
  );
}
