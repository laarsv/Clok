import { useEffect, useMemo, useState } from "react";
import EntryForm from "./EntryForm";
import AbsenceForm from "./AbsenceForm";
import {
  api, ABSENCE_TYPE_LABELS, type Absence, type TimeEntry,
} from "../api";
import {
  endOfMonth, fmtHours, isInEditableWindow, isoDate, startOfMonth,
} from "../lib/datetime";

interface Props {
  /** Wessen Daten anzeigen. Wenn === current user: eigene Sicht. */
  employeeId: number;
  /** Admin/Arbeitgeber: alles. Mitarbeiter: nur eigenes 2-Monats-Fenster. */
  canEditAll: boolean;
}

type Item =
  | { kind: "entry"; date: string; entry: TimeEntry }
  | { kind: "absence"; date: string; absence: Absence };

const TYPE_LABEL = ABSENCE_TYPE_LABELS;

export default function EntriesLog({ employeeId, canEditAll }: Props) {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editAbsence, setEditAbsence] = useState<Absence | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monthStart = useMemo(() => startOfMonth(anchor), [anchor]);
  const monthEnd = useMemo(() => endOfMonth(anchor), [anchor]);

  const load = async () => {
    setError(null);
    const fromIso = monthStart.toISOString();
    const toIso = new Date(monthEnd.getTime() + 86400000).toISOString();
    try {
      const [es, abs] = await Promise.all([
        api.listEntries(fromIso, toIso, employeeId),
        api.listAbsences(employeeId),
      ]);
      setEntries(es);
      // Absences im Monat (Überlappung)
      const monthIsoStart = isoDate(monthStart);
      const monthIsoEnd = isoDate(monthEnd);
      setAbsences(abs.filter(
        (a) => a.start_date <= monthIsoEnd && a.end_date >= monthIsoStart,
      ));
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, [employeeId, anchor.getTime()]);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const e of entries) {
      out.push({ kind: "entry", date: e.start_at.slice(0, 10), entry: e });
    }
    for (const a of absences) {
      out.push({ kind: "absence", date: a.start_date, absence: a });
    }
    out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    return out;
  }, [entries, absences]);

  const canEdit = (date: string): boolean =>
    canEditAll || isInEditableWindow(date);

  const totalHours = entries.reduce((s, e) => s + (e.net_hours || 0), 0);

  const remove = async (it: Item) => {
    if (!confirm("Wirklich löschen?")) return;
    try {
      if (it.kind === "entry") await api.deleteEntry(it.entry.id);
      else await api.deleteAbsence(it.absence.id);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="entries-log">
      <div className="month-toolbar">
        <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>← Monat</button>
        <strong>{anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</strong>
        <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>Monat →</button>
        <button onClick={() => setAnchor(new Date())}>Heute</button>
        <span className="spacer" />
        <span>Summe: <strong>{fmtHours(totalHours)}</strong></span>
      </div>

      {!canEditAll && (
        <p className="muted small">
          Du kannst nur Daten aus dem aktuellen und vorherigen Monat ändern
          oder löschen. Ältere Einträge gelten als abgeschlossen – wende dich
          bei Korrekturen an deinen Arbeitgeber.
        </p>
      )}
      {error && <div className="error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Art</th>
            <th>Details</th>
            <th>Stunden</th>
            <th>Notiz</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const editable = canEdit(it.date);
            if (it.kind === "entry") {
              const e = it.entry;
              return (
                <tr key={`e-${e.id}`}>
                  <td>{e.start_at.slice(8, 10)}.{e.start_at.slice(5, 7)}.{e.start_at.slice(0, 4)}</td>
                  <td>Arbeitszeit</td>
                  <td>
                    {e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}
                    {e.break_minutes > 0 && <span className="muted small"> · Pause {e.break_minutes} min</span>}
                    {e.project && <span className="muted small"> · {e.project}</span>}
                  </td>
                  <td>{fmtHours(e.net_hours)}</td>
                  <td className="muted small">{e.note ?? ""}</td>
                  <td>
                    <button onClick={() => setEditEntry(e)} disabled={!editable}>Bearbeiten</button>
                    <button className="danger" onClick={() => remove(it)} disabled={!editable}>Löschen</button>
                  </td>
                </tr>
              );
            }
            const a = it.absence;
            return (
              <tr key={`a-${a.id}`} className={`abs-${a.type}-row`}>
                <td>{a.start_date}{a.end_date !== a.start_date ? ` – ${a.end_date}` : ""}</td>
                <td>{TYPE_LABEL[a.type]}</td>
                <td><span className={`status status-${a.status}`}>{a.status === "pending" ? "offen" : a.status === "approved" ? "genehmigt" : "abgelehnt"}</span></td>
                <td>—</td>
                <td className="muted small">{a.note ?? ""}</td>
                <td>
                  <button onClick={() => setEditAbsence(a)} disabled={!editable}>Bearbeiten</button>
                  <button className="danger" onClick={() => remove(it)} disabled={!editable}>Löschen</button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr><td colSpan={6} className="muted">Keine Einträge in diesem Monat.</td></tr>
          )}
        </tbody>
      </table>

      {(editEntry || editAbsence) && (
        <div className="modal-backdrop" onClick={() => { setEditEntry(null); setEditAbsence(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {editEntry && (
              <EntryForm
                initial={editEntry}
                onSaved={() => { setEditEntry(null); load(); }}
                onCancel={() => setEditEntry(null)}
              />
            )}
            {editAbsence && (
              <AbsenceForm
                initial={editAbsence}
                onSaved={() => { setEditAbsence(null); load(); }}
                onCancel={() => setEditAbsence(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
