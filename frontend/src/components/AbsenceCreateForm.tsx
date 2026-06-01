import { useState } from "react";
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
      <h3 style={{ marginTop: 0 }}>Abwesenheit eintragen</h3>
      <p className="muted small">
        Für {employeeName}. Wird sofort als genehmigt verbucht – auch rückwirkend
        für vergangene Zeiträume.
      </p>
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
        <button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Eintragen"}</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
