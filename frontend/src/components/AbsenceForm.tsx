import { useState } from "react";
import Button from "./ui/Button";
import Select from "./ui/Select";
import { api, ABSENCE_TYPE_LABELS, type Absence, type AbsenceType } from "../api";

interface Props {
  initial: Absence;
  onSaved: () => void;
  onCancel: () => void;
}

export default function AbsenceForm({ initial, onSaved, onCancel }: Props) {
  const [type, setType] = useState<AbsenceType>(initial.type);
  const [startDate, setStartDate] = useState(initial.start_date);
  const [endDate, setEndDate] = useState(initial.end_date);
  const [note, setNote] = useState(initial.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (endDate < startDate) {
      setError("Ende vor Start.");
      return;
    }
    setBusy(true);
    try {
      await api.updateAbsence(initial.id, {
        type,
        start_date: startDate,
        end_date: endDate,
        note: note || undefined,
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
      <h3 className="text-lg font-black">Abwesenheit bearbeiten</h3>
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
        <Button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</Button>
      </div>
    </div>
  );
}
