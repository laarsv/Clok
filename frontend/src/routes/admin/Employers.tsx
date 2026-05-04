import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import { api, type EmployeeCreatePayload, type User } from "../../api";

export default function Employers() {
  const navigate = useNavigate();
  const [list, setList] = useState<User[]>([]);
  const [showOff, setShowOff] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EmployeeCreatePayload>({
    username: "", email: "", password: "", role: "employer",
  });
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const all = await api.listEmployees(true);
    setList(all.filter((u) => u.role === "employer"));
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError(null);
    try {
      await api.createEmployee({ ...form, role: "employer" });
      setCreating(false);
      setForm({ username: "", email: "", password: "", role: "employer" });
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

        <table>
          <thead>
            <tr><th>Name</th><th>Username</th><th>E-Mail</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name ?? "–"}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.offboarded_at ? <span className="status status-rejected">offboarded</span> : <span className="status status-approved">aktiv</span>}</td>
                <td>
                  <button onClick={() => navigate(`/employer/employees/${u.id}`)}>Öffnen</button>
                  {u.offboarded_at && (
                    <button className="danger" onClick={async () => {
                      if (!confirm("Endgültig löschen? Geht nur, wenn Aufbewahrungsfrist abgelaufen ist.")) return;
                      try {
                        await api.hardDeleteEmployee(u.id);
                        load();
                      } catch (e: any) { alert(e.message); }
                    }}>Hard-Delete</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="muted">Keine Arbeitgeber.</td></tr>}
          </tbody>
        </table>

        {creating && (
          <div className="modal-backdrop" onClick={() => setCreating(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Neuer Arbeitgeber</h3>
              <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
              <label>E-Mail<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Passwort<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              <label>Voller Name<input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
              {error && <div className="error">{error}</div>}
              <div className="modal-actions">
                <button onClick={() => setCreating(false)}>Abbrechen</button>
                <button onClick={submit}>Anlegen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
