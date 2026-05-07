import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import { api, type EmployeeCreatePayload, type User } from "../../api";

export default function Employers() {
  const navigate = useNavigate();
  const [list, setList] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showOff, setShowOff] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EmployeeCreatePayload>({
    username: "", email: "", role: "employer",
  });
  const [error, setError] = useState<string | null>(null);
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  const load = async () => {
    const all = await api.listEmployees(true);
    setAllUsers(all);
    setList(all.filter((u) => u.role === "employer"));
  };
  useEffect(() => { load(); }, []);

  const employeeCounts = useMemo(() => {
    const counts: Record<number, { active: number; offboarded: number }> = {};
    for (const u of allUsers) {
      if (u.role !== "employee" || u.supervisor_id == null) continue;
      const slot = counts[u.supervisor_id] ?? { active: 0, offboarded: 0 };
      if (u.offboarded_at) slot.offboarded += 1;
      else slot.active += 1;
      counts[u.supervisor_id] = slot;
    }
    return counts;
  }, [allUsers]);

  const submit = async () => {
    setError(null);
    try {
      const created = await api.createEmployee({ ...form, role: "employer" });
      setCreating(false);
      setForm({ username: "", email: "", role: "employer" });
      setCreatedNote(`Einladung an ${created.email} gesendet.`);
      setTimeout(() => setCreatedNote(null), 4000);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const filtered = showOff ? list : list.filter((e) => !e.offboarded_at);

  return (
    <Shell>
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <h2>Arbeitgeber</h2>
          <span className="spacer" />
          <label className="toggle">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
            <span>Offboarded anzeigen</span>
          </label>
          <button onClick={() => setCreating(true)}>+ Arbeitgeber</button>
        </div>

        {createdNote && <div className="issue">{createdNote}</div>}

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Firma</th>
              <th>Username</th>
              <th>Mitarbeiter</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const c = employeeCounts[u.id] ?? { active: 0, offboarded: 0 };
              return (
                <tr key={u.id} onClick={() => navigate(`/admin/employers/${u.id}`)}
                    style={{ cursor: "pointer" }}>
                  <td><strong>{u.full_name ?? "–"}</strong></td>
                  <td>{u.company_name ?? "–"}</td>
                  <td className="muted small">@{u.username}</td>
                  <td>
                    {c.active}{c.offboarded > 0 && <span className="muted small"> (+ {c.offboarded} off.)</span>}
                  </td>
                  <td>
                    {u.offboarded_at
                      ? <span className="status status-rejected">offboarded</span>
                      : <span className="status status-approved">aktiv</span>}
                  </td>
                  <td>
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/employers/${u.id}`); }}>
                      Öffnen
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="muted">Keine Arbeitgeber.</td></tr>}
          </tbody>
        </table>

        {creating && (
          <div className="modal-backdrop" onClick={() => setCreating(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Neuer Arbeitgeber</h3>
              <p className="muted small">
                Der neue Arbeitgeber bekommt eine Einladungsmail und setzt
                Passwort und Stammdaten selbst.
              </p>
              <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
              <label>E-Mail<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Voller Name<input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
              {error && <div className="error">{error}</div>}
              <div className="modal-actions">
                <button onClick={() => setCreating(false)}>Abbrechen</button>
                <button onClick={submit}>Anlegen &amp; einladen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
