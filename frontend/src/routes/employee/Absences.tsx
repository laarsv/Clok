import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, type Absence, type AbsenceType } from "../../api";

export default function Absences() {
  const [list, setList] = useState<Absence[]>([]);
  const [type, setType] = useState<AbsenceType>("vacation");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listAbsences().then(setList);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError(null);
    if (!start || !end) { setError("Datum fehlt."); return; }
    try {
      await api.createAbsence({
        type, start_date: start, end_date: end,
        note: note || undefined,
      });
      setStart(""); setEnd(""); setNote("");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Shell>
      <div className="absences">
        <h2>Abwesenheiten</h2>

        <section className="card-section">
          <h3>Neuer Antrag</h3>
          <div className="manual-grid">
            <label>Art
              <select value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
                <option value="vacation">Urlaub</option>
                <option value="sick">Krankheit</option>
                <option value="unpaid">Unbezahlt</option>
              </select>
            </label>
            <label>Von<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Bis<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label className="full">Notiz<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          <button onClick={submit}>
            {type === "sick" ? "Krankmeldung eintragen" : "Antrag stellen"}
          </button>
          {error && <div className="error">{error}</div>}
          <p className="muted small">
            {type === "vacation" && "Dein Antrag geht zur Genehmigung an deinen Arbeitgeber."}
            {type === "sick" && "Krankmeldungen werden sofort verbucht. Dein Arbeitgeber wird informiert."}
            {type === "unpaid" && "Unbezahlte Abwesenheit braucht ebenfalls Genehmigung."}
          </p>
        </section>

        <section className="card-section">
          <h3>Deine Anträge</h3>
          <table>
            <thead>
              <tr><th>Art</th><th>Von</th><th>Bis</th><th>Status</th><th>Notiz</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} id={String(a.id)}>
                  <td>{a.type === "vacation" ? "Urlaub" : a.type === "sick" ? "Krank" : "Unbezahlt"}</td>
                  <td>{a.start_date}</td>
                  <td>{a.end_date}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="muted small">{a.note ?? ""}</td>
                  <td>
                    {a.status === "pending" && (
                      <button onClick={async () => {
                        if (confirm("Antrag zurückziehen?")) {
                          await api.deleteAbsence(a.id);
                          load();
                        }
                      }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="muted">Noch keine Abwesenheiten erfasst.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}

export function StatusBadge({ status }: { status: Absence["status"] }) {
  const label = status === "pending" ? "offen" : status === "approved" ? "genehmigt" : "abgelehnt";
  return <span className={`status status-${status}`}>{label}</span>;
}
