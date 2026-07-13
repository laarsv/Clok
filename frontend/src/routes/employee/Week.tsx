import { useEffect, useMemo, useState } from "react";
import EntryForm from "../../components/EntryForm";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { api, type Absence, type TimeEntry } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import { addDays, deWeekday, fmtDe, fmtHours, isoDate, startOfWeek } from "../../lib/datetime";
import { absenceDayCredit } from "../../lib/absenceCredit";
import { isMissingDay } from "../../lib/missingDays";
import { useClosures } from "../../lib/useClosures";

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

  const { isLocked } = useClosures(user?.id, [days[0].getFullYear(), days[6].getFullYear()]);

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
  const weekCredit = days.reduce((s, d) => s + absenceDayCredit(d, absenceFor(d), user, holidays), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-outline btn-sm" aria-label="Vorherige Woche"
          onClick={() => setAnchor(addDays(anchor, -7))}>←</button>
        <strong className="text-sm font-bold tabular-nums">
          {fmtDe(days[0])} – {fmtDe(days[6])}
        </strong>
        <button className="btn-outline btn-sm" aria-label="Nächste Woche"
          onClick={() => setAnchor(addDays(anchor, 7))}>→</button>
        <button className="btn-ghost btn-sm" onClick={() => setAnchor(new Date())}>Heute</button>
        <span className="flex-1" />
        <span className="text-sm text-ink/60">Summe: <strong className="text-ink tabular-nums">{fmtHours(totalNet + weekCredit)}</strong></span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const k = isoDate(d);
          const dayEntries = entriesByDay[k] ?? [];
          const sum = dayEntries.reduce((s, e) => s + (e.net_hours || 0), 0);
          const holiday = holidays[k];
          const absence = absenceFor(d);
          const credit = absenceDayCredit(d, absence, user, holidays);
          const dayTotal = sum + credit;
          const missing = !!user && isMissingDay({
            date: d, user, hasEntry: dayEntries.length > 0,
            absences, holidays,
          });
          const locked = isLocked(k);
          const tint = missing ? "border-amber-300 bg-amber-50"
            : absence ? (absence.type === "sick" ? "bg-red-50" : "bg-royal/5")
            : holiday ? "bg-ink/5" : "";
          return (
            <div key={k} className={`card flex flex-col gap-2 p-3 ${tint}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <strong className="text-sm font-bold">{deWeekday(d)} {d.getDate()}.</strong>
                {holiday && (
                  <span className="inline-flex items-center rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-bold text-ink/60">{holiday}</span>
                )}
                {absence && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${absence.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-royal/10 text-royal"}`}>
                    {absence.type === "vacation" ? "Urlaub" : absence.type === "sick" ? "Krank" : "Unbezahlt"}
                    {absence.status === "pending" ? " (offen)" : credit > 0 ? ` · ${fmtHours(credit)}` : ""}
                  </span>
                )}
                {missing && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">fehlt</span>
                )}
                {locked && (
                  <span className="inline-flex items-center rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-bold text-ink/50">gesperrt</span>
                )}
              </div>
              {dayEntries.map((e) => (
                <div key={e.id}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm text-ink ${locked ? "opacity-70" : "cursor-pointer hover:bg-ink/5"}`}
                  onClick={() => { if (!locked) setEditing(e); }}>
                  <span className="tabular-nums">{e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}</span>
                  {e.project && <span className="truncate text-ink/60">{e.project}</span>}
                  <span className="ml-auto font-medium tabular-nums">{fmtHours(e.net_hours)}</span>
                </div>
              ))}
              <div className="mt-auto flex items-center justify-between border-t border-ink/10 pt-2">
                <span className="text-sm font-bold tabular-nums">{fmtHours(dayTotal)}</span>
                <button className="btn-ghost btn-sm" aria-label="Zeit erfassen" disabled={locked} onClick={() => setAdding(k)}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!(adding || editing)} onClose={() => { setAdding(null); setEditing(null); }}>
        <EntryForm
          initial={editing}
          defaultDate={adding ?? undefined}
          onSaved={() => { setAdding(null); setEditing(null); load(); }}
          onCancel={() => { setAdding(null); setEditing(null); }}
        />
        {editing && (
          <Button variant="danger" className="mt-3 w-full" onClick={async () => {
            if (confirm("Eintrag löschen?")) {
              await api.deleteEntry(editing.id);
              setEditing(null);
              load();
            }
          }}>Löschen</Button>
        )}
      </Modal>
    </div>
  );
}
