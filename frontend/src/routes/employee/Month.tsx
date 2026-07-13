import { useEffect, useMemo, useState } from "react";
import EntryForm from "../../components/EntryForm";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { IconPlus, IconX } from "../../components/ui/Icons";
import { api, type Absence, type TimeEntry } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import {
  deWeekday, endOfMonth, fmtDe, fmtHours, isoDate, startOfMonth,
} from "../../lib/datetime";
import { isMissingDay } from "../../lib/missingDays";

const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Urlaub", sick: "Krank", unpaid: "Unbezahlt",
  special: "Sonderurlaub", parental: "Elternzeit", training: "Fortbildung",
};

export default function Month() {
  const { user } = useCurrentUser();
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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

  const entriesByDay = useMemo(() => {
    const out: Record<string, TimeEntry[]> = {};
    for (const e of entries) {
      const k = e.start_at.slice(0, 10);
      (out[k] ??= []).push(e);
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

  const closeDialog = () => {
    setSelectedDay(null);
    setEditingEntry(null);
    setShowAddForm(false);
  };

  const onDaySaved = async () => {
    await load();
    setEditingEntry(null);
    setShowAddForm(false);
    // Modal bewusst offen lassen – User sieht den frischen Eintrag in
    // der Liste und kann ggf. direkt einen weiteren erfassen.
  };

  // Detail-Daten für den ausgewählten Tag
  const selectedDayInfo = useMemo(() => {
    if (!selectedDay) return null;
    const k = isoDate(selectedDay);
    const dayEntries = entriesByDay[k] ?? [];
    return {
      date: selectedDay,
      iso: k,
      entries: dayEntries,
      sum: dayEntries.reduce((s, e) => s + (e.net_hours || 0), 0),
      holiday: holidays[k],
      absence: absenceForDay(k),
      missing: !!user && isMissingDay({
        date: selectedDay, user,
        hasEntry: dayEntries.length > 0, absences, holidays,
      }),
    };
  }, [selectedDay, entriesByDay, holidays, absences, user]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-outline btn-sm" aria-label="Vorheriger Monat"
          onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>←</button>
        <strong className="text-sm font-bold">
          {anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
        </strong>
        <button className="btn-outline btn-sm" aria-label="Nächster Monat"
          onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>→</button>
        <button className="btn-ghost btn-sm" onClick={() => setAnchor(new Date())}>Heute</button>
        <span className="flex-1" />
        <span className="text-sm text-ink/60">Summe: <strong className="text-ink tabular-nums">{fmtHours(total)}</strong></span>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
          <div key={w} className="pb-1 text-center text-xs font-bold uppercase tracking-wide text-ink/50">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const k = isoDate(d);
          const sum = sumByDay[k] ?? 0;
          const holiday = holidays[k];
          const absence = absenceForDay(k);
          const missing = !!user && isMissingDay({
            date: d, user, hasEntry: sum > 0,
            absences, holidays,
          });
          const tint = missing ? "border-amber-300 bg-amber-50"
            : absence ? (absence.type === "sick" ? "bg-red-50" : "bg-royal/5")
            : holiday ? "bg-ink/5" : "bg-paper";
          return (
            <button
              key={i}
              type="button"
              className={`flex min-h-[68px] flex-col gap-0.5 rounded-lg border border-ink/10 p-1.5 text-left text-ink transition hover:border-royal/40 sm:min-h-[92px] ${tint}`}
              onClick={() => setSelectedDay(d)}
              aria-label={`${deWeekday(d)} ${fmtDe(d)}`}
            >
              <div className="text-sm font-bold">{d.getDate()}</div>
              {holiday && <div className="truncate rounded bg-ink/10 px-1 py-0.5 text-[10px] font-bold text-ink/60">{holiday}</div>}
              {absence && (
                <div className="truncate rounded bg-royal/10 px-1 py-0.5 text-[10px] font-bold text-royal">
                  {ABSENCE_LABELS[absence.type] ?? absence.type}
                </div>
              )}
              {missing && <div className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800">fehlt</div>}
              {sum > 0 && <div className="mt-auto text-right text-xs font-bold tabular-nums">{fmtHours(sum)}</div>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-ink/60" aria-label="Legende der Tagesfärbungen">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-royal/20" /> Urlaub</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-200" /> Krank</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-ink/15" /> Feiertag</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-200" /> fehlt</span>
      </div>

      <Modal open={!!(selectedDay && selectedDayInfo)} onClose={closeDialog}>
        {selectedDayInfo && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black sm:text-lg">{deWeekday(selectedDayInfo.date)}, {fmtDe(selectedDayInfo.date)}</h3>
                <div className="mt-0.5 text-xs text-ink/60">
                  {selectedDayInfo.holiday && `Feiertag: ${selectedDayInfo.holiday}`}
                  {selectedDayInfo.absence && (
                    <>{ABSENCE_LABELS[selectedDayInfo.absence.type] ?? selectedDayInfo.absence.type}
                      {selectedDayInfo.absence.status === "pending" ? " (offen)" : ""}</>
                  )}
                  {!selectedDayInfo.holiday && !selectedDayInfo.absence && selectedDayInfo.missing && "Tag ohne Eintrag"}
                  {!selectedDayInfo.holiday && !selectedDayInfo.absence && !selectedDayInfo.missing && (
                    selectedDayInfo.sum > 0 ? `${fmtHours(selectedDayInfo.sum)} erfasst` : "regulärer Tag"
                  )}
                </div>
              </div>
              <button className="btn-ghost btn-sm -mr-2 px-2" onClick={closeDialog} aria-label="Schließen">
                <IconX size={20} />
              </button>
            </div>

            {!showAddForm && !editingEntry && (
              <>
                {selectedDayInfo.entries.length > 0 ? (
                  <ul className="mt-4 space-y-1">
                    {selectedDayInfo.entries.map((e) => (
                      <li key={e.id}>
                        <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-ink/5" onClick={() => setEditingEntry(e)}>
                          <span className="tabular-nums">
                            {e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}
                          </span>
                          {e.project && <span className="truncate text-ink/60">{e.project}</span>}
                          <span className="ml-auto font-medium tabular-nums">{fmtHours(e.net_hours)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="my-3 text-sm text-ink/60">
                    Noch keine Einträge an diesem Tag.
                  </p>
                )}

                <Button className="mt-3 w-full" onClick={() => setShowAddForm(true)}>
                  <IconPlus size={18} /> Zeit erfassen
                </Button>
              </>
            )}

            {(showAddForm || editingEntry) && (
              <div className="mt-4">
                <EntryForm
                  initial={editingEntry}
                  defaultDate={selectedDayInfo.iso}
                  onSaved={onDaySaved}
                  onCancel={() => { setEditingEntry(null); setShowAddForm(false); }}
                />
                {editingEntry && (
                  <Button variant="danger" className="mt-3" onClick={async () => {
                    if (!confirm("Eintrag löschen?")) return;
                    await api.deleteEntry(editingEntry.id);
                    await load();
                    setEditingEntry(null);
                  }}>Löschen</Button>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
