import { useState } from "react";
import Button from "./ui/Button";
import Select from "./ui/Select";
import { api, ABSENCE_TYPE_LABELS, type AbsenceType } from "../api";

interface Props {
  employeeId: number;
  employeeName: string;
  onSaved: () => void;
  onCancel: () => void;
}

/** Arbeitgeber-Formular: trägt eine Abwesenheit für einen Mitarbeiter ein –
 *  auch rückwirkend. Wird serverseitig sofort als genehmigt verbucht. */
export default function AbsenceCreateForm({ employeeId, employeeName, onSaved, onCancel }: Props) {
  const [type, setType] = useState<AbsenceType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!startDate || !endDate) { setError("Von- und Bis-Datum angeben."); return; }
    if (endDate < startDate) { setError("Ende vor Start."); return; }
    setBusy(true);
    try {
      await api.createAbsence({
        type,
        start_date: startDate,
        end_date: endDate,
        note: note || undefined,
        user_id: employeeId,
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-black">Abwesenheit eintragen</h3>
      <p className="mt-1 text-sm text-ink/60">
        Für {employeeName}. Wird sofort als genehmigt verbucht – auch rückwirkend
        für vergangene Zeiträume.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <span className="field-label">Art</span>
          <Select
            value={type}
            onChange={(v) => setType(v as AbsenceType)}
            options={(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((k) => ({
              value: k,
              label: ABSENCE_TYPE_LABELS[k],
            }))}
            aria-label="Art"
          />
        </div>
        <label className="block">
          <span className="field-label">Von</span>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Bis</span>
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="field-label">Notiz</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Eintragen"}</Button>
      </div>
    </div>
  );
}
