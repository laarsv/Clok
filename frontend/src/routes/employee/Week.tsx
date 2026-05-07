import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import EntryForm from "../../components/EntryForm";
import { api, type Absence, type TimeEntry } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import { addDays, deWeekday, fmtDe, fmtHours, isoDate, startOfWeek } from "../../lib/datetime";
import { isMissingDay } from "../../lib/missingDays";

export default function Week() {
  const { user } = useCurrentUser();
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const load = async () => {
    if (!user) return;
    const start = days[0];
    const end = addDays(days[6], 1);
    const [es, abs] = await Promise.all([
      api.listEntries(start.toISOString(), end.toISOString()),
      api.listAbsences(),
    ]);
    setEntries(es);
    setAbsences(abs);
    if (user.federal_state) {
      const list = await api.holidays(user.federal_state, start.getFullYear());
      setHolidays(Object.fromEntries(list.map((h) => [h.date, h.name])));
    }
  };

  useEffect(() => { load(); }, [user?.id, anchor.getTime()]);

  const entriesByDay = useMemo(() => {
    const out: Record<string, TimeEntry[]> = {};
    for (const e of entries) {
      const k = e.start_at.slice(0, 10);
      (out[k] ??= []).push(e);
    }
    return out;
  }, [entries]);

  const absenceFor = (d: Date): Absence | undefined => {
    const k = isoDate(d);
    return absences.find((a) => a.start_date <= k && a.end_date >= k);
  };

  const totalNet = entries.reduce((s, e) => s + (e.net_hours || 0), 0);

  return (
    <Shell>
      <div className="week">
        <div className="week-toolbar">
          <button onClick={() => setAnchor(addDays(anchor, -7))}>← Woche</button>
          <strong>
            {fmtDe(days[0])} – {fmtDe(days[6])}
          </strong>
          <button onClick={() => setAnchor(addDays(anchor, 7))}>Woche →</button>
          <button onClick={() => setAnchor(new Date())}>Heute</button>
          <span className="spacer" />
          <span>Summe: <strong>{fmtHours(totalNet)}</strong></span>
        </div>

        <div className="week-grid">
          {days.map((d) => {
            const k = isoDate(d);
            const dayEntries = entriesByDay[k] ?? [];
            const sum = dayEntries.reduce((s, e) => s + (e.net_hours || 0), 0);
            const holiday = holidays[k];
            const absence = absenceFor(d);
            const missing = !!user && isMissingDay({
              date: d, user, hasEntry: dayEntries.length > 0,
              absences, holidays,
            });
            return (
              <div key={k} className={`day ${holiday ? "holiday" : ""} ${absence ? `abs-${absence.type}` : ""} ${missing ? "missing" : ""}`}>
                <div className="day-head">
                  <strong>{deWeekday(d)} {d.getDate()}.</strong>
                  {holiday && <span className="badge">{holiday}</span>}
                  {absence && (
                    <span className="badge">
                      {absence.type === "vacation" ? "Urlaub" : absence.type === "sick" ? "Krank" : "Unbezahlt"}
                      {absence.status === "pending" ? " (offen)" : ""}
                    </span>
                  )}
                  {missing && <span className="badge badge-missing">fehlt</span>}
                </div>
                {dayEntries.map((e) => (
                  <div key={e.id} className="entry-row" onClick={() => setEditing(e)}>
                    <span>{e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}</span>
                    <span>{fmtHours(e.net_hours)}</span>
                    {e.project && <span className="muted">{e.project}</span>}
                  </div>
                ))}
                <div className="day-foot">
                  <span>{fmtHours(sum)}</span>
                  <button onClick={() => setAdding(k)}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        {(adding || editing) && (
          <div className="modal-backdrop" onClick={() => { setAdding(null); setEditing(null); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <EntryForm
                initial={editing}
                defaultDate={adding ?? undefined}
                onSaved={() => { setAdding(null); setEditing(null); load(); }}
                onCancel={() => { setAdding(null); setEditing(null); }}
              />
              {editing && (
                <button className="danger" onClick={async () => {
                  if (confirm("Eintrag löschen?")) {
                    await api.deleteEntry(editing.id);
                    setEditing(null);
                    load();
                  }
                }}>Löschen</button>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
