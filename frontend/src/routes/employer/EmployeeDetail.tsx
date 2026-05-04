import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Shell from "../../components/Shell";
import { api, type Absence, type TimeEntry, type User } from "../../api";
import { addDays, deWeekday, fmtDe, fmtHours, isoDate, startOfWeek } from "../../lib/datetime";

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const [employee, setEmployee] = useState<User | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const load = async () => {
    if (!employeeId) return;
    const emp = await api.getEmployee(employeeId);
    setEmployee(emp);
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
    } finally {
      setBusy(false);
    }
  };
  const reactivate = async () => {
    setBusy(true);
    try {
      const u = await api.reactivateEmployee(employee.id);
      setEmployee(u);
    } finally {
      setBusy(false);
    }
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
        </div>

        <section className="card-section">
          <h3>Stammdaten</h3>
          <div className="profile-grid">
            <div className="profile-field"><div className="muted small">Bundesland</div><div>{employee.federal_state ?? "–"}</div></div>
            <div className="profile-field"><div className="muted small">Wochenstunden</div><div>{employee.weekly_hours ?? "–"}</div></div>
            <div className="profile-field"><div className="muted small">Urlaub/Jahr</div><div>{employee.annual_vacation_days ?? "–"}</div></div>
            <div className="profile-field"><div className="muted small">Eintritt</div><div>{employee.hire_date ?? "–"}</div></div>
            <div className="profile-field"><div className="muted small">Abrechnung</div><div>{employee.billing_mode === "hourly" ? `${employee.hourly_rate_eur} €/h` : `${employee.monthly_target_hours} h/Monat`}</div></div>
          </div>
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
      </div>
    </Shell>
  );
}
