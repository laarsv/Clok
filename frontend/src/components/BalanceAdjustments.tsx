import { useEffect, useState } from "react";
import { api, type BalanceAdjustment } from "../api";

interface Props {
  employeeId: number;
}

export default function BalanceAdjustments({ employeeId }: Props) {
  const [list, setList] = useState<BalanceAdjustment[]>([]);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.listBalanceAdjustments(employeeId).then(setList);
  useEffect(() => { load(); }, [employeeId]);

  const submit = async () => {
    setError(null);
    const h = parseFloat(hours.replace(",", "."));
    if (Number.isNaN(h) || h === 0) { setError("Stunden ungültig (≠ 0)."); return; }
    if (reason.trim().length < 3) { setError("Begründung muss mindestens 3 Zeichen haben."); return; }
    setBusy(true);
    try {
      await api.createBalanceAdjustment(employeeId, {
        effective_date: date,
        hours: h,
        reason: reason.trim(),
      });
      setAdding(false);
      setHours(""); setReason("");
      setDate(new Date().toISOString().slice(0, 10));
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Saldo-Korrektur löschen? Saldo wird neu berechnet.")) return;
    try {
      await api.deleteBalanceAdjustment(employeeId, id);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const total = list.reduce((s, a) => s + a.hours, 0);

  return (
    <div>
      <div className="dashboard-toolbar">
        <p className="muted small" style={{ flex: 1, margin: 0 }}>
          Manuelle Buchungen wirken auf den Saldo ab dem gewählten Datum.
          Beispiele: Auszahlung Überstunden, Korrektur Altsystem,
          Endabrechnung. Jede Buchung landet im Audit-Log.
        </p>
        <button onClick={() => setAdding(true)}>+ Korrektur</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Wirksam ab</th>
            <th>Stunden</th>
            <th>Begründung</th>
            <th>Erstellt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id}>
              <td>{a.effective_date}</td>
              <td className={a.hours > 0 ? "positive" : "negative"}>
                {a.hours > 0 ? "+" : ""}{a.hours.toFixed(2)} h
              </td>
              <td>{a.reason}</td>
              <td className="muted small">{a.created_at.slice(0, 10)}</td>
              <td>
                <button className="danger" onClick={() => remove(a.id)}>×</button>
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr><td colSpan={5} className="muted">Keine Korrekturen.</td></tr>
          )}
          {list.length > 0 && (
            <tr>
              <td><strong>Summe</strong></td>
              <td className={total > 0 ? "positive" : total < 0 ? "negative" : ""}>
                <strong>{total > 0 ? "+" : ""}{total.toFixed(2)} h</strong>
              </td>
              <td colSpan={3} />
            </tr>
          )}
        </tbody>
      </table>

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Saldo-Korrektur</h3>
            <p className="muted small">
              Positive Stunden = Saldo wird höher. Negative = Saldo wird
              niedriger (z. B. bei Auszahlung von Überstunden „−30 h").
            </p>
            <div className="manual-grid">
              <label>Wirksam ab<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label>Stunden (±)
                <input type="text" value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder='z. B. "-30" oder "12,5"' />
              </label>
              <label className="full">Begründung
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder='z. B. "Auszahlung Überstunden Q4 2025"' />
              </label>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button onClick={() => setAdding(false)}>Abbrechen</button>
              <button onClick={submit} disabled={busy}>
                {busy ? "Speichere…" : "Buchen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
