import { useState } from "react";
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
      <h3>Abwesenheit bearbeiten</h3>
      <div className="manual-grid">
        <label>Art
          <select value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
            {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((k) => (
              <option key={k} value={k}>{ABSENCE_TYPE_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label>Von<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>Bis<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label className="full">Notiz<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
