import { useEffect, useMemo, useState } from "react";
import EntryForm from "./EntryForm";
import AbsenceForm from "./AbsenceForm";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
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

const ABS_ACCENT: Record<string, string> = {
  vacation: "border-l-2 border-royal",
  sick: "border-l-2 border-red-500",
  unpaid: "border-l-2 border-ink/30",
};

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
        // from/to: Backend liefert nur überlappende Abwesenheiten und beschneidet
        // paid_hours auf den Monat (korrekt bei monatsübergreifendem Urlaub).
        api.listAbsences(employeeId, isoDate(monthStart), isoDate(monthEnd)),
      ]);
      setEntries(es);
      setAbsences(abs);
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
  const creditHours = absences.reduce((s, a) => s + (a.paid_hours || 0), 0);
  const monthTotal = totalHours + creditHours;

  const remove = async (it: Item) => {
    if (!confirm("Wirklich löschen?")) return;
    try {
      if (it.kind === "entry") await api.deleteEntry(it.entry.id);
      else await api.deleteAbsence(it.absence.id);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>← Monat</Button>
        <strong className="min-w-[10rem] text-center font-bold text-ink">{anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</strong>
        <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>Monat →</Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Heute</Button>
        <span className="flex-1" />
        <span className="text-sm text-ink/70">
          Summe: <strong className="font-bold text-ink tabular-nums">{fmtHours(monthTotal)}</strong>
          {creditHours > 0 && <span className="text-ink/50"> (inkl. {fmtHours(creditHours)} Lohnfortz.)</span>}
        </span>
      </div>

      {!canEditAll && (
        <p className="text-sm text-ink/60">
          Du kannst nur Daten aus dem aktuellen und vorherigen Monat ändern
          oder löschen. Ältere Einträge gelten als abgeschlossen – wende dich
          bei Korrekturen an deinen Arbeitgeber.
        </p>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Art</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3 text-right">Stunden</th>
              <th className="px-4 py-3">Notiz</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const editable = canEdit(it.date);
              if (it.kind === "entry") {
                const e = it.entry;
                return (
                  <tr key={`e-${e.id}`} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{e.start_at.slice(8, 10)}.{e.start_at.slice(5, 7)}.{e.start_at.slice(0, 4)}</td>
                    <td className="px-4 py-3">Arbeitszeit</td>
                    <td className="px-4 py-3">
                      {e.start_at.slice(11, 16)}–{e.end_at?.slice(11, 16) ?? "—"}
                      {e.break_minutes > 0 && <span className="text-ink/60"> · Pause {e.break_minutes} min</span>}
                      {e.project && <span className="text-ink/60"> · {e.project}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtHours(e.net_hours)}</td>
                    <td className="px-4 py-3 text-ink/60">{e.note ?? ""}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditEntry(e)} disabled={!editable}>Bearbeiten</Button>
                        <button className="btn btn-sm text-red-600 hover:bg-red-50" onClick={() => remove(it)} disabled={!editable}>Löschen</button>
                      </div>
                    </td>
                  </tr>
                );
              }
              const a = it.absence;
              return (
                <tr key={`a-${a.id}`} className={`border-b border-ink/5 last:border-b-0 ${ABS_ACCENT[a.type] ?? ""}`}>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{a.start_date}{a.end_date !== a.start_date ? ` – ${a.end_date}` : ""}</td>
                  <td className="px-4 py-3">{TYPE_LABEL[a.type]}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      a.status === "approved" ? "bg-royal/10 text-royal"
                        : a.status === "pending" ? "bg-ink/10 text-ink/70"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {a.status === "pending" ? "offen" : a.status === "approved" ? "genehmigt" : "abgelehnt"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {a.paid_hours > 0
                      ? <span title="Lohnfortzahlung – zählt wie gearbeitet">{fmtHours(a.paid_hours)}</span>
                      : <span className="text-ink/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{a.note ?? ""}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditAbsence(a)} disabled={!editable}>Bearbeiten</Button>
                      <button className="btn btn-sm text-red-600 hover:bg-red-50" onClick={() => remove(it)} disabled={!editable}>Löschen</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/60">Keine Einträge in diesem Monat.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!(editEntry || editAbsence)}
        onClose={() => { setEditEntry(null); setEditAbsence(null); }}
        className="sm:max-w-xl"
      >
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
      </Modal>
    </div>
  );
}
