import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import { api, ABSENCE_TYPE_LABELS, type Absence, type User } from "../../api";
import { StatusBadge } from "../employee/Absences";

export default function AbsenceInbox() {
  const [list, setList] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    const emps = await api.listEmployees(true);
    setEmployees(emps);
    const all: Absence[] = [];
    for (const e of emps) {
      const abs = await api.listAbsences(e.id);
      all.push(...abs);
    }
    all.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
    setList(all);
  };

  useEffect(() => { load(); }, []);

  const empById = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );

  const decide = async (id: number, approve: boolean) => {
    if (approve) await api.approveAbsence(id, reason || undefined);
    else await api.rejectAbsence(id, reason || undefined);
    setDecidingId(null);
    setReason("");
    load();
  };

  const pending = list.filter((a) => a.status === "pending");
  const decided = list.filter((a) => a.status !== "pending");

  return (
    <Shell>
      <div className="absences">
        <h2>Anträge</h2>

        <section className="card-section">
          <h3>Offen ({pending.length})</h3>
          <table>
            <thead>
              <tr><th>Mitarbeiter</th><th>Art</th><th>Von</th><th>Bis</th><th>Notiz</th><th></th></tr>
            </thead>
            <tbody>
              {pending.map((a) => (
                <tr key={a.id}>
                  <td>{empById[a.user_id]?.full_name ?? `User #${a.user_id}`}</td>
                  <td>{ABSENCE_TYPE_LABELS[a.type]}</td>
                  <td>{a.start_date}</td>
                  <td>{a.end_date}</td>
                  <td className="muted small">{a.note ?? ""}</td>
                  <td>
                    {decidingId === a.id ? (
                      <div className="row-actions">
                        <input placeholder="Grund (optional)"
                          value={reason} onChange={(e) => setReason(e.target.value)} />
                        <button onClick={() => decide(a.id, true)}>Genehmigen</button>
                        <button className="danger" onClick={() => decide(a.id, false)}>Ablehnen</button>
                        <button onClick={() => { setDecidingId(null); setReason(""); }}>Abbrechen</button>
                      </div>
                    ) : (
                      <button onClick={() => setDecidingId(a.id)}>Entscheiden</button>
                    )}
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr><td colSpan={6} className="muted">Keine offenen Anträge.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card-section">
          <h3>Entschieden</h3>
          <table>
            <thead>
              <tr><th>Mitarbeiter</th><th>Art</th><th>Von</th><th>Bis</th><th>Status</th><th>Notiz</th></tr>
            </thead>
            <tbody>
              {decided.map((a) => (
                <tr key={a.id}>
                  <td>{empById[a.user_id]?.full_name ?? `User #${a.user_id}`}</td>
                  <td>{ABSENCE_TYPE_LABELS[a.type]}</td>
                  <td>{a.start_date}</td>
                  <td>{a.end_date}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="muted small">{a.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}
