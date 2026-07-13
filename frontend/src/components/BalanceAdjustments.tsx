import { useEffect, useState } from "react";
import { api, type BalanceAdjustment } from "../api";
import Button from "./ui/Button";
import Modal from "./ui/Modal";

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink/60">
          Manuelle Buchungen wirken auf den Saldo ab dem gewählten Datum.
          Beispiele: Auszahlung Überstunden, Korrektur Altsystem,
          Endabrechnung. Jede Buchung landet im Audit-Log.
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>+ Korrektur</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
              <th className="px-4 py-3">Wirksam ab</th>
              <th className="px-4 py-3 text-right">Stunden</th>
              <th className="px-4 py-3">Begründung</th>
              <th className="px-4 py-3">Erstellt</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-b border-ink/5 last:border-b-0">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{a.effective_date}</td>
                <td className={`px-4 py-3 text-right font-medium tabular-nums ${a.hours > 0 ? "text-royal" : "text-red-600"}`}>
                  {a.hours > 0 ? "+" : ""}{a.hours.toFixed(2)} h
                </td>
                <td className="px-4 py-3">{a.reason}</td>
                <td className="px-4 py-3 tabular-nums text-ink/60">{a.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="btn btn-sm text-red-600 hover:bg-red-50" onClick={() => remove(a.id)}>×</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/60">Keine Korrekturen.</td></tr>
            )}
            {list.length > 0 && (
              <tr className="border-t border-ink/10">
                <td className="px-4 py-3 font-bold">Summe</td>
                <td className={`px-4 py-3 text-right font-bold tabular-nums ${total > 0 ? "text-royal" : total < 0 ? "text-red-600" : ""}`}>
                  {total > 0 ? "+" : ""}{total.toFixed(2)} h
                </td>
                <td className="px-4 py-3" colSpan={3} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} labelledBy="balance-adj-title">
        <h3 id="balance-adj-title" className="text-lg font-black tracking-tight">Saldo-Korrektur</h3>
        <p className="mt-1 text-sm text-ink/60">
          Positive Stunden = Saldo wird höher. Negative = Saldo wird
          niedriger (z. B. bei Auszahlung von Überstunden „−30 h").
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Wirksam ab</span>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Stunden (±)</span>
            <input type="text" className="input" value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder='z. B. "-30" oder "12,5"' />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Begründung</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder='z. B. "Auszahlung Überstunden Q4 2025"' />
          </label>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setAdding(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Speichere…" : "Buchen"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
