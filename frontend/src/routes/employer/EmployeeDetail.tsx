import { ReactNode, useEffect, useMemo, useState } from "react";
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
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { IconChevronRight, IconX } from "../../components/ui/Icons";
import { useCurrentUser } from "../../auth/CurrentUser";
import {
  api, WEEKDAY_LABELS,
  type Absence, type AbsenceStatus, type BalanceAdjustment, type BalanceOut,
  type EmploymentTerms, type MonthClosure, type TermsPayload, type TimeEntry, type User, type YearOverview,
} from "../../api";
import {
  addDays, deWeekday, fmtDe, fmtHours, isoDate, startOfWeek,
} from "../../lib/datetime";

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
  const [closures, setClosures] = useState<MonthClosure[]>([]);
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditMode>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drill, setDrill] = useState<DrillKey>(null);
  const [absenceOpen, setAbsenceOpen] = useState(false);

  // Standard-Ansicht: Liste (Woche per Umschalter wählbar).
  const [entryView, setEntryView] = useState<EntryView>("liste");

  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const load = async () => {
    if (!employeeId) return;
    const yr = new Date().getFullYear();
    const [emp, t, bal, yov, adj, clo] = await Promise.all([
      api.getEmployee(employeeId),
      api.listTerms(employeeId),
      api.balance(employeeId),
      api.yearOverview(yr, employeeId),
      api.listBalanceAdjustments(employeeId),
      api.listClosures(employeeId),
    ]);
    setEmployee(emp);
    setTerms(t);
    setBalance(bal);
    setYear(yov);
    setAdjustments(adj);
    setClosures(clo);
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

  if (!employee) return <Shell><div className="p-12 text-center text-ink/50">Lade…</div></Shell>;

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
  // Lohnfortzahlung: genehmigter Urlaub/Krankheit zählt wie gearbeitet →
  // Ist inkl. Gutschrift, Soll als voller Monat (Urlaubstage nicht rausgerechnet).
  const monthCredit = curMonth?.absence_credit_hours ?? 0;
  const monthIstFull = monthActual + monthCredit;
  const monthSollFull = monthTarget + monthCredit;

  const saldoHours = balance?.balance_hours ?? 0;
  const istToDate = balance?.actual_hours_to_date ?? 0;
  const sollToDate = balance?.target_hours_to_date ?? 0;
  const balanceCredit = balance?.absence_credit_hours ?? 0;
  const sollFull = sollToDate + balanceCredit;

  // Tages-Lohnfortzahlung (für Wochengrid): Tagessatz an genehmigten bezahlten
  // Abwesenheitstagen, sofern Arbeitstag & kein Feiertag.
  const dailyRate = isSalary && currentTerms?.weekly_hours && currentTerms?.work_days?.length
    ? currentTerms.weekly_hours / currentTerms.work_days.length : 0;
  const workDaySet = new Set<string>(currentTerms?.work_days ?? []);
  const PAID_ABSENCE = new Set(["vacation", "sick", "special", "training"]);
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayCredit = (d: Date, a?: Absence): number => {
    if (!dailyRate || !a || a.status !== "approved" || !PAID_ABSENCE.has(a.type)) return 0;
    if (!workDaySet.has(DOW[d.getDay()])) return 0;
    if (holidays[isoDate(d)]) return 0;
    return dailyRate;
  };
  const weekCredit = days.reduce((s, d) => s + dayCredit(d, absenceFor(d)), 0);

  // Monatsabschluss: Status + Aktionen für die letzten 3 Monate.
  const closureStatusOf = (y: number, m: number) =>
    closures.find((c) => c.year === y && c.month === m)?.status ?? "open";
  const lastMonths = Array.from({ length: 3 }, (_, i) => {
    const dt = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return {
      year: dt.getFullYear(), month: dt.getMonth() + 1,
      label: dt.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
    };
  });
  const doApprove = async (y: number, m: number) => { await api.approveClosure(y, m, employee.id); await load(); };
  const doReject = async (y: number, m: number) => { await api.rejectClosure(y, m, employee.id); await load(); };
  const doReopen = async (y: number, m: number) => { await api.reopenClosure(y, m, employee.id); await load(); };
  const initialOt = employee.initial_overtime_hours ?? 0;
  const adjToDate = adjustments.filter((a) => a.effective_date <= today);
  const adjTotal = adjToDate.reduce((s, a) => s + a.hours, 0);
  const balCls = saldoHours > 0.05 ? "text-royal" : saldoHours < -0.05 ? "text-red-600" : "";

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
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 border-b border-ink/5 py-1 last:border-b-0">
            <span>{a.start_date} – {a.end_date}{a.note ? ` · ${a.note}` : ""}</span>
            <span className="text-ink/50">{STATUS_LABEL[a.status]}</span>
          </li>
        ))}
      </ul>
    ) : <p className="text-xs text-ink/60">{emptyText}</p>;

  const drillTitle: Record<Exclude<DrillKey, null>, string> = {
    hours: `Stunden – ${monthName}`,
    saldo: "Saldo / Überstunden",
    vacation: `Urlaub ${yr}`,
    sick: `Krankheit ${yr}`,
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-royal text-lg font-bold text-paper">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{employee.full_name || employee.username}</h1>
            <div className="text-sm text-ink/60">@{employee.username} · {employee.email}</div>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${employee.offboarded_at ? "bg-ink/10 text-ink/60" : "bg-royal/10 text-royal"}`}>
            {employee.offboarded_at ? "offboarded" : "aktiv"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>⚙ Einstellungen</Button>
        </div>

        {employee.onboarding_pending && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="flex-1">
              Onboarding ausstehend – {employee.full_name || employee.username} hat
              die Einladung noch nicht angenommen.
            </span>
            <Button variant="outline" size="sm" onClick={resendInvite} disabled={busy}>Einladung erneut senden</Button>
          </div>
        )}

        {/* KPI-Übersicht */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Stunden im Monat" value={fmtHours(monthIstFull)}
            meta={isSalary ? `von ${fmtHours(monthSollFull)} Soll` : "Stundenbasis"}
            onClick={() => setDrill("hours")}>
            {isSalary && <div className="mt-2"><HoursBar actual={monthIstFull} target={monthSollFull} /></div>}
          </KpiTile>

          <KpiTile label="Saldo / Überstunden"
            value={isSalary ? signedH(saldoHours, 1) : "—"}
            valueClass={isSalary ? balCls : ""}
            meta={isSalary ? `Stand ${balance?.as_of ?? today}` : "Stundenbasis – kein Saldo"}
            onClick={() => setDrill("saldo")} />

          <KpiTile label="Resturlaub" value={`${dayNum(vacRemaining)} Tage`}
            valueClass={vacRemaining <= 0 ? "text-red-600" : ""}
            meta={`von ${dayNum(anspruch)} · ${dayNum(vacApproved)} genommen`}
            onClick={() => setDrill("vacation")} />

          <KpiTile label="Krankheit (Jahr)" value={`${dayNum(sickTotal)} Tage`}
            meta={sickMonth > 0 ? `${dayNum(sickMonth)} im laufenden Monat` : "keine im laufenden Monat"}
            onClick={() => setDrill("sick")} />
        </div>

        {/* Monatsabschluss */}
        <div className="card p-4 sm:p-5">
          <h2 className="text-base font-black sm:text-lg">Monatsabschluss</h2>
          <div className="mt-2 divide-y divide-ink/10">
            {lastMonths.map(({ year, month, label }) => {
              const st = closureStatusOf(year, month);
              return (
                <div key={`${year}-${month}`} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-[9rem] text-sm font-bold capitalize">{label}</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    st === "approved" ? "bg-royal/10 text-royal"
                      : st === "submitted" ? "bg-amber-100 text-amber-800" : "bg-ink/10 text-ink/60"
                  }`}>
                    {st === "approved" ? "freigegeben" : st === "submitted" ? "eingereicht" : "offen"}
                  </span>
                  <span className="flex-1" />
                  {st === "open" && (
                    <button className="btn-outline btn-sm" onClick={() => doApprove(year, month)}>Sperren</button>
                  )}
                  {st === "submitted" && (
                    <>
                      <button className="btn-primary btn-sm" onClick={() => doApprove(year, month)}>Freigeben</button>
                      <button className="btn-ghost btn-sm" onClick={() => doReject(year, month)}>Ablehnen</button>
                    </>
                  )}
                  {st === "approved" && (
                    <button className="btn-outline btn-sm" onClick={() => doReopen(year, month)}>Wieder öffnen</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Einträge & Abwesenheiten */}
        <section className="card space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-black sm:text-lg">Einträge &amp; Abwesenheiten</h2>
            <div className="ml-auto flex items-center gap-3">
              <Button size="sm" onClick={() => setAbsenceOpen(true)}>+ Abwesenheit</Button>
              <div className="inline-flex rounded-lg border border-ink/15 bg-paper p-1" role="tablist" aria-label="Ansicht">
                <button role="tab" aria-selected={entryView === "woche"}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold transition ${entryView === "woche" ? "bg-royal text-paper" : "text-ink/60 hover:text-ink"}`}
                  onClick={() => setEntryView("woche")}>Woche</button>
                <button role="tab" aria-selected={entryView === "liste"}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold transition ${entryView === "liste" ? "bg-royal text-paper" : "text-ink/60 hover:text-ink"}`}
                  onClick={() => setEntryView("liste")}>Liste</button>
              </div>
            </div>
          </div>

          {entryView === "liste" && (
            <EntriesLog employeeId={employee.id} canEditAll={true} />
          )}

          {entryView === "woche" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, -7))}>← Woche</Button>
                <strong className="text-sm">{fmtDe(days[0])} – {fmtDe(days[6])}</strong>
                <Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, 7))}>Woche →</Button>
                <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>Heute</Button>
                <span className="ml-auto text-sm">Summe: <strong className="tabular-nums">{fmtHours(total + weekCredit)}</strong></span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
                {days.map((d) => {
                  const k = isoDate(d);
                  const dayEntries = entriesByDay[k] ?? [];
                  const sum = dayEntries.reduce((s, e) => s + (e.net_hours || 0), 0);
                  const holiday = holidays[k];
                  const absence = absenceFor(d);
                  const credit = dayCredit(d, absence);
                  const dayTotal = sum + credit;
                  const dayBorder = holiday
                    ? "border-amber-300"
                    : absence
                      ? (absence.type === "vacation" ? "border-royal/50" : absence.type === "sick" ? "border-red-300" : "border-ink/20")
                      : "border-ink/10";
                  return (
                    <div key={k} className={`flex min-h-[160px] flex-col rounded-lg border bg-paper p-2 ${dayBorder}`}>
                      <div className="mb-2 flex flex-col gap-1">
                        <strong className="text-sm">{deWeekday(d)} {d.getDate()}.</strong>
                        {holiday && <span className="w-fit rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-ink/70">{holiday}</span>}
                        {absence && (
                          <span className="w-fit rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-ink/70">
                            {absence.type === "vacation" ? "Urlaub" : absence.type === "sick" ? "Krank" : "Unbezahlt"}
                            {credit > 0 ? ` · ${fmtHours(credit)}` : ""}
                          </span>
                        )}
                      </div>
                      {dayEntries.map((e) => (
                        <div key={e.id} className="flex flex-wrap items-center gap-x-2 py-0.5 text-xs">
                          <span className="tabular-nums">{e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}</span>
                          <span className="tabular-nums font-bold">{fmtHours(e.net_hours)}</span>
                          {e.project && <span className="text-ink/50">{e.project}</span>}
                        </div>
                      ))}
                      <div className="mt-auto border-t border-ink/10 pt-2 text-right text-xs font-bold tabular-nums">{fmtHours(dayTotal)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Abwesenheit für den MA eintragen (auch rückwirkend) */}
        <Modal open={absenceOpen} onClose={() => setAbsenceOpen(false)} className="sm:max-w-xl">
          <AbsenceCreateForm
            employeeId={employee.id}
            employeeName={employee.full_name || employee.username}
            onSaved={() => { setAbsenceOpen(false); load(); }}
            onCancel={() => setAbsenceOpen(false)}
          />
        </Modal>

        {/* Nachvollziehen-Modal */}
        <Modal open={!!drill} onClose={() => setDrill(null)} className="sm:max-w-xl">
          {drill && (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-lg font-black">{drillTitle[drill]}</h2>
                <button className="btn-ghost -mr-2 -mt-1 p-1" aria-label="Schließen" onClick={() => setDrill(null)}>
                  <IconX size={20} />
                </button>
              </div>

              {drill === "hours" && (
                <>
                  <p className="text-sm text-ink/60">
                    Soll pro Arbeitstag = Wochenstunden ÷ Arbeitstage (ohne
                    Bundesland-Feiertage). Genehmigter Urlaub/Krankheit zählt als
                    geleistete Zeit (Lohnfortzahlung) – als Ist-Gutschrift und im
                    vollen Monats-Soll enthalten. Ist erfasst = Netto-Stunden.
                  </p>
                  <div className="mt-2">
                    <CalcRow label="Ist-Stunden (erfasst)" value={fmtHours(monthActual)} />
                    {monthCredit > 0 && (
                      <CalcRow op="+" label="Urlaub/Krankheit (Lohnfortzahlung)" value={fmtHours(monthCredit)} />
                    )}
                    <CalcRow op="−" label="Soll-Stunden (voller Monat)" value={isSalary ? fmtHours(monthSollFull) : "—"} />
                    <CalcRow total label="Differenz" value={isSalary ? signedH(monthIstFull - monthSollFull) : "Stundenbasis"} />
                  </div>

                  <h4 className="mt-4 mb-1 text-xs font-bold uppercase tracking-wider text-ink/50">Aktueller Vertrag</h4>
                  <div className="mt-2">
                    <CalcRow label="Abrechnung" value={isSalary ? "Festgehalt" : "Stundenbasis"} />
                    <CalcRow label="Wochenstunden" value={currentTerms?.weekly_hours ?? "—"} />
                    <CalcRow label="Arbeitstage" value={workDaysLabel} />
                  </div>

                  {year && year.months.length > 0 && (
                    <>
                      <h4 className="mt-4 mb-1 text-xs font-bold uppercase tracking-wider text-ink/50">Monate {yr}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                            <tr>
                              <th className="px-3 py-2">Monat</th>
                              <th className="px-3 py-2 text-right">Ist</th>
                              <th className="px-3 py-2 text-right">Soll</th>
                              <th className="px-3 py-2 text-right">Saldo Ende</th>
                            </tr>
                          </thead>
                          <tbody>
                            {year.months.map((m) => (
                              <tr key={m.month} className="border-b border-ink/5 last:border-b-0">
                                <td className="px-3 py-2">{monthShort(m.month)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(m.actual_hours + m.absence_credit_hours).toFixed(1)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{isSalary ? (m.target_hours + m.absence_credit_hours).toFixed(1) : "—"}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {m.balance_at_end == null ? "—" : signedH(m.balance_at_end, 1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              {drill === "saldo" && (
                isSalary ? (
                  <>
                    <p className="text-sm text-ink/60">
                      Saldo = Startwert + erfasste Ist-Stunden + Lohnfortzahlung
                      (Urlaub/Krankheit) + manuelle Korrekturen − das aufgelaufene
                      Soll (voller Monat, ab Eintritt bis {balance?.as_of ?? today}).
                    </p>
                    <div className="mt-2">
                      <CalcRow label="Startwert (Anfangs-Überstunden)" value={signedH(initialOt)} />
                      <CalcRow op="+" label="Ist-Stunden (erfasst)" value={fmtHours(istToDate)} />
                      {balanceCredit > 0 && (
                        <CalcRow op="+" label="Urlaub/Krankheit (Lohnfortzahlung)" value={fmtHours(balanceCredit)} />
                      )}
                      <CalcRow op="+" label="Saldo-Korrekturen" value={signedH(adjTotal)} />
                      <CalcRow op="−" label="Soll-Stunden (voller Monat)" value={fmtHours(sollFull)} />
                      <CalcRow total label="= Saldo" value={signedH(saldoHours)} valueClass={balCls} />
                    </div>

                    {adjToDate.length > 0 && (
                      <>
                        <h4 className="mt-4 mb-1 text-xs font-bold uppercase tracking-wider text-ink/50">Korrektur-Buchungen</h4>
                        <ul className="mt-2 space-y-1 text-sm">
                          {[...adjToDate]
                            .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1))
                            .map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2 border-b border-ink/5 py-1 last:border-b-0">
                                <span>{a.effective_date} · {a.reason}</span>
                                <span className="tabular-nums">{signedH(a.hours)}</span>
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-ink/60">
                      {employee.full_name || employee.username} wird auf Stundenbasis
                      abgerechnet. Ein Überstunden-Saldo wird nur bei Festgehalt geführt
                      (Ist gegen Soll). Hier zählt die reine erfasste Zeit.
                    </p>
                    <div className="mt-2">
                      <CalcRow total label="Ist-Stunden gesamt" value={fmtHours(istToDate)} />
                    </div>
                  </>
                )
              )}

              {drill === "vacation" && (
                <>
                  <p className="text-sm text-ink/60">
                    Anspruch = Jahresurlaub aus dem Vertrag{inHireYear ? " + Resturlaub aus dem Eintrittsjahr" : ""}.
                    Abgezogen werden die Werktage aller genehmigten und beantragten
                    Urlaubsanträge des Jahres (Feiertage zählen nicht).
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Donut value={vacPlanned} max={anspruch}
                      centerLabel={dayNum(vacRemaining)} centerSub="Tage übrig"
                      color={vacRemaining <= 0 ? "var(--error)" : "var(--accent)"} />
                    <div className="min-w-[200px] flex-1">
                      <CalcRow label="Jahresanspruch" value={`${dayNum(annualVac)} Tage`} />
                      {inHireYear && (
                        <CalcRow op="+" label="Resturlaub Eintrittsjahr" value={`${dayNum(initialVac)} Tage`} />
                      )}
                      <CalcRow op="−"
                        label={`Verplant (genehmigt ${dayNum(vacApproved)} + offen ${dayNum(vacOpen)})`}
                        value={`${dayNum(vacPlanned)} Tage`} />
                      <CalcRow total label="= Resturlaub" value={`${dayNum(vacRemaining)} Tage`}
                        valueClass={vacRemaining <= 0 ? "text-red-600" : ""} />
                    </div>
                  </div>

                  <h4 className="mt-4 mb-1 text-xs font-bold uppercase tracking-wider text-ink/50">Urlaubsanträge {yr}</h4>
                  {absenceList(vacAbs, `Keine Urlaubsanträge in ${yr}.`)}
                </>
              )}

              {drill === "sick" && (
                <>
                  <p className="text-sm text-ink/60">
                    Gezählt werden die Werktage in genehmigten Krankmeldungen.
                    Feiertage und arbeitsfreie Tage zählen nicht.
                  </p>
                  <div className="mt-2">
                    <CalcRow label={`Krank-Tage im ${monthShort(curMonthNum)}`} value={dayNum(sickMonth)} />
                    <CalcRow total label={`Krank-Tage ${yr}`} value={dayNum(sickTotal)} />
                  </div>

                  <h4 className="mt-4 mb-1 text-xs font-bold uppercase tracking-wider text-ink/50">Krankmeldungen {yr}</h4>
                  {absenceList(sickAbs, `Keine Krankmeldungen in ${yr}.`)}
                </>
              )}
            </>
          )}
        </Modal>

        {/* Einstellungs-Fenster (Slide-over rechts) */}
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-ink/50" onClick={() => setSettingsOpen(false)}>
            <aside className="h-full w-full max-w-xl overflow-y-auto bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Einstellungen & Verwaltung">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-lg font-black">Einstellungen &amp; Verwaltung</h2>
                <button className="btn-ghost ml-auto -mr-2 p-1" aria-label="Schließen" onClick={() => setSettingsOpen(false)}>
                  <IconX size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <Disclosure title="Stammdaten & Historie" hint="selten benötigt – ausklappen zum Ansehen">
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); setEdit("master"); }}>
                      Bearbeiten
                    </Button>
                  </div>
                  <StammdatenView user={employee} />

                  <h4 className="mt-3 text-xs font-bold uppercase tracking-wider text-ink/50">Änderungs-Historie</h4>
                  <AuditLogViewer employeeId={employee.id} />
                </Disclosure>

                <Disclosure title="Daten importieren" hint="einmaliger Vorgang beim Onboarding">
                  <p className="text-xs text-ink/60">
                    CSVs für Zeiteinträge und Abwesenheiten können jederzeit
                    nachträglich hochgeladen werden – z. B. Daten aus dem Vorjahr,
                    Korrekturen oder ein Wechsel von einem anderen System.
                  </p>
                  <ImportPanel employeeId={employee.id} />
                </Disclosure>

                <Disclosure title="Vertragsverlauf"
                  hint={currentTerms
                    ? `aktuell ab ${currentTerms.valid_from} · ${terms.length} Einträge`
                    : "noch keine Verträge"}>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); setEdit("new-terms"); }}>
                      + Neuer Vertrag
                    </Button>
                  </div>
                  <p className="text-xs text-ink/60">
                    Jeder Eintrag gilt ab seinem Stichtag bis zum Stichtag des nächsten.
                    Vergangenheits-Berechnungen (Saldo, Resturlaub) bleiben stabil, wenn
                    du einen neuen Vertrag mit zukünftigem Stichtag anlegst.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                        <tr>
                          <th className="px-3 py-2">Gültig ab</th>
                          <th className="px-3 py-2">Abrechnung</th>
                          <th className="px-3 py-2">Soll/h-Satz</th>
                          <th className="px-3 py-2">Wochen-h</th>
                          <th className="px-3 py-2">Arbeitstage</th>
                          <th className="px-3 py-2">Urlaub</th>
                          <th className="px-3 py-2">Notiz</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...terms].reverse().map((t) => (
                          <tr key={t.id} className={`border-b border-ink/5 last:border-b-0 ${t.id === currentTerms?.id ? "bg-royal/5" : ""}`}>
                            <td className="px-3 py-2">{t.valid_from}{t.id === currentTerms?.id && <span className="ml-1.5 inline-flex items-center rounded-full bg-royal/10 px-2 py-0.5 text-[10px] font-bold text-royal">aktuell</span>}</td>
                            <td className="px-3 py-2">{t.billing_mode === "hourly" ? "Stundenbasis" : "Festgehalt"}</td>
                            <td className="px-3 py-2">{t.billing_mode === "hourly" ? `${t.hourly_rate_eur.toFixed(2)} €/h` : "Festgehalt"}</td>
                            <td className="px-3 py-2 tabular-nums">{t.weekly_hours ?? "–"}</td>
                            <td className="px-3 py-2">{(t.work_days ?? []).join(", ") || "–"}</td>
                            <td className="px-3 py-2 tabular-nums">{t.annual_vacation_days ?? "–"}</td>
                            <td className="px-3 py-2 text-ink/60">{t.note ?? ""}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => setEdit({ kind: "edit-terms", id: t.id })}>Bearbeiten</Button>
                                {terms.length > 1 && (
                                  <Button size="sm" variant="danger" onClick={() => removeTerms(t.id)}>Löschen</Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {terms.length === 0 && (
                          <tr><td colSpan={8} className="px-3 py-6 text-center text-ink/50">Noch keine Vertragsdaten.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Disclosure>

                <Disclosure title="Saldo-Korrekturen" hint="manuelle Buchungen, z.B. Auszahlungen">
                  <BalanceAdjustments employeeId={employee.id} />
                </Disclosure>

                <Disclosure title="Stundenzettel-Export" hint="CSV / PDF pro Monat">
                  <MonthDownloads employeeId={employee.id} />
                </Disclosure>

                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <h3 className="text-base font-black">Beschäftigung</h3>
                  <p className="mt-1 text-xs text-ink/60">
                    Offboarden behält alle Daten und blendet den Mitarbeiter nur aus.
                    {isAdmin ? " Endgültig löschen entfernt alle Daten unwiderruflich." : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {employee.offboarded_at
                      ? <Button size="sm" variant="outline" onClick={reactivate} disabled={busy}>Reaktivieren</Button>
                      : <Button size="sm" variant="danger" onClick={offboard} disabled={busy}>Offboarden</Button>}
                    {isAdmin && (
                      <Button size="sm" variant="danger" disabled={busy} onClick={hardDelete}>Endgültig löschen</Button>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Bearbeiten-Dialoge – liegen ÜBER dem Drawer (später im DOM) */}
        <Modal open={!!edit} onClose={() => setEdit(null)} className="sm:max-w-2xl">
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
        </Modal>
      </div>
    </Shell>
  );
}

function CalcRow({
  label, value, op, total = false, valueClass = "",
}: {
  label: ReactNode; value: ReactNode; op?: string; total?: boolean; valueClass?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 text-sm ${
      total ? "mt-1 border-t border-ink/10 pt-2 font-bold" : "border-b border-ink/5 py-2 last:border-b-0"
    }`}>
      <span className={total ? "text-ink" : "text-ink/60"}>
        {op && <span className="mr-1 text-ink/40">{op}</span>}
        {label}
      </span>
      <span className={`whitespace-nowrap tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function Disclosure({
  title, hint, children,
}: {
  title: string; hint: ReactNode; children: ReactNode;
}) {
  return (
    <details className="group card p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <IconChevronRight size={16} className="shrink-0 text-ink/50 transition-transform group-open:rotate-90 group-open:text-royal" />
        <h3 className="text-base font-black">{title}</h3>
        <span className="ml-auto text-xs text-ink/60">{hint}</span>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function KpiTile({
  label, value, meta, valueClass = "", children, onClick,
}: {
  label: string; value: string; meta?: string; valueClass?: string;
  children?: ReactNode; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="card group p-4 text-left text-ink transition hover:border-royal/40 hover:shadow-md sm:p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-ink/50">{label}</div>
      <div className={`mt-1 text-2xl font-black tabular-nums leading-tight ${valueClass}`}>{value}</div>
      {meta && <div className="mt-1 text-xs text-ink/60">{meta}</div>}
      {children}
      <span className="mt-2 block text-xs font-bold text-ink/40 group-hover:text-royal">Details ansehen →</span>
    </button>
  );
}
