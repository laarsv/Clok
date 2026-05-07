import { useEffect, useMemo, useState } from "react";
import EntryForm from "../../components/EntryForm";
import { api, type Absence, type TimeEntry } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import {
  deWeekday, endOfMonth, fmtDe, fmtHours, isoDate, startOfMonth,
} from "../../lib/datetime";
import { isMissingDay } from "../../lib/missingDays";
import { useMediaQuery } from "../../lib/useMediaQuery";

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

  const isMobile = useMediaQuery("(max-width: 768px)");
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

  const backdropClass = `modal-backdrop ${isMobile ? "as-bottom-sheet" : ""}`;
  const modalClass = `modal ${isMobile ? "as-bottom-sheet-modal" : ""}`;

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
            const cls = [
              "month-cell",
              holiday ? "holiday" : "",
              absence ? `abs-${absence.type}` : "",
              missing ? "missing" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={i}
                type="button"
                className={cls}
                onClick={() => setSelectedDay(d)}
                aria-label={`${deWeekday(d)} ${fmtDe(d)}`}
              >
                <div className="month-cell-day">{d.getDate()}</div>
                {holiday && <div className="badge small">{holiday}</div>}
                {absence && (
                  <div className="badge small">
                    {ABSENCE_LABELS[absence.type] ?? absence.type}
                  </div>
                )}
                {missing && <div className="badge small badge-missing">fehlt</div>}
                {sum > 0 && <div className="month-sum">{fmtHours(sum)}</div>}
              </button>
            );
          })}
        </div>

        <div className="month-legend" aria-label="Legende der Tagesfärbungen">
          <span className="legend-item"><span className="legend-swatch sw-vacation" /> Urlaub</span>
          <span className="legend-item"><span className="legend-swatch sw-sick" /> Krank</span>
          <span className="legend-item"><span className="legend-swatch sw-holiday" /> Feiertag</span>
          <span className="legend-item"><span className="legend-swatch sw-missing" /> fehlt</span>
        </div>

        {selectedDay && selectedDayInfo && (
          <div className={backdropClass} onClick={closeDialog}>
            <div className={modalClass} onClick={(e) => e.stopPropagation()}>
              <div className="day-detail-head">
                <div>
                  <h3 style={{ margin: 0 }}>{deWeekday(selectedDay)}, {fmtDe(selectedDay)}</h3>
                  <div className="muted small">
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
                <button className="modal-close-btn" onClick={closeDialog} aria-label="Schließen">×</button>
              </div>

              {!showAddForm && !editingEntry && (
                <>
                  {selectedDayInfo.entries.length > 0 ? (
                    <ul className="day-entry-list">
                      {selectedDayInfo.entries.map((e) => (
                        <li key={e.id}>
                          <button className="day-entry-row" onClick={() => setEditingEntry(e)}>
                            <span className="time">
                              {e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}
                            </span>
                            <span className="hours">{fmtHours(e.net_hours)}</span>
                            {e.project && <span className="muted">{e.project}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small" style={{ margin: "0.6rem 0" }}>
                      Noch keine Einträge an diesem Tag.
                    </p>
                  )}

                  <button className="primary" onClick={() => setShowAddForm(true)}
                    style={{ width: "100%", marginTop: "0.4rem" }}>
                    + Zeit erfassen
                  </button>
                </>
              )}

              {(showAddForm || editingEntry) && (
                <div className="day-detail-form">
                  <EntryForm
                    initial={editingEntry}
                    defaultDate={selectedDayInfo.iso}
                    onSaved={onDaySaved}
                    onCancel={() => { setEditingEntry(null); setShowAddForm(false); }}
                  />
                  {editingEntry && (
                    <button className="danger" style={{ marginTop: "0.6rem" }} onClick={async () => {
                      if (!confirm("Eintrag löschen?")) return;
                      await api.deleteEntry(editingEntry.id);
                      await load();
                      setEditingEntry(null);
                    }}>Löschen</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
