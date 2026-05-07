import { useEffect, useMemo, useState } from "react";
import { api, type Absence, type TimeEntry } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import { endOfMonth, fmtHours, isoDate, startOfMonth } from "../../lib/datetime";
import { isMissingDay } from "../../lib/missingDays";

export default function Month() {
  const { user } = useCurrentUser();
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});

  const monthStart = useMemo(() => startOfMonth(anchor), [anchor]);
  const monthEnd = useMemo(() => endOfMonth(anchor), [anchor]);

  const load = async () => {
    if (!user) return;
    const [es, abs] = await Promise.all([
      api.listEntries(monthStart.toISOString(), new Date(monthEnd.getTime() + 86400000).toISOString()),
      api.listAbsences(),
    ]);
    setEntries(es);
    setAbsences(abs);
    if (user.federal_state) {
      const list = await api.holidays(user.federal_state, anchor.getFullYear());
      setHolidays(Object.fromEntries(list.map((h) => [h.date, h.name])));
    }
  };

  useEffect(() => { load(); }, [user?.id, anchor.getTime()]);

  const sumByDay = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of entries) {
      const k = e.start_at.slice(0, 10);
      out[k] = (out[k] || 0) + (e.net_hours || 0);
    }
    return out;
  }, [entries]);

  const absenceForDay = (k: string) =>
    absences.find((a) => a.start_date <= k && a.end_date >= k);

  // Kalender-Grid: Mo–So, beginnt mit der Woche, in der der 1. liegt
  const firstDow = (monthStart.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const total = Object.values(sumByDay).reduce((s, v) => s + v, 0);

  return (
    <div className="month">
        <div className="month-toolbar">
          <button className="nav-arrow" aria-label="Vorheriger Monat"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>←</button>
          <strong className="period-range">
            {anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </strong>
          <button className="nav-arrow" aria-label="Nächster Monat"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>→</button>
          <button onClick={() => setAnchor(new Date())}>Heute</button>
          <span className="spacer" />
          <span className="period-sum">Summe: <strong>{fmtHours(total)}</strong></span>
        </div>

        <div className="month-grid">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
            <div key={w} className="month-head">{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="month-cell empty" />;
            const k = isoDate(d);
            const sum = sumByDay[k] ?? 0;
            const holiday = holidays[k];
            const absence = absenceForDay(k);
            const missing = !!user && isMissingDay({
              date: d, user, hasEntry: sum > 0,
              absences, holidays,
            });
            return (
              <div key={i} className={`month-cell ${holiday ? "holiday" : ""} ${absence ? `abs-${absence.type}` : ""} ${missing ? "missing" : ""}`}>
                <div className="month-cell-day">{d.getDate()}</div>
                {holiday && <div className="badge small">{holiday}</div>}
                {absence && (
                  <div className="badge small">
                    {absence.type === "vacation" ? "Urlaub" : absence.type === "sick" ? "Krank" : "Unbezahlt"}
                  </div>
                )}
                {missing && <div className="badge small badge-missing">fehlt</div>}
                {sum > 0 && <div className="month-sum">{fmtHours(sum)}</div>}
              </div>
            );
          })}
        </div>
    </div>
  );
}
