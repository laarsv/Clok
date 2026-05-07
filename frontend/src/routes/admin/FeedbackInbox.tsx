import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import {
  api, FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS,
  type FeedbackEntry, type FeedbackKind, type FeedbackStatus,
} from "../../api";

const STATUS_KEYS: FeedbackStatus[] = ["open", "in_progress", "done", "rejected", "duplicate"];

export default function FeedbackInbox() {
  const [list, setList] = useState<FeedbackEntry[]>([]);
  const [kindFilter, setKindFilter] = useState<FeedbackKind | "">("");
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "">("");
  const [editing, setEditing] = useState<FeedbackEntry | null>(null);
  const [editStatus, setEditStatus] = useState<FeedbackStatus>("open");
  const [editResponse, setEditResponse] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api.listFeedback({
      kind: kindFilter || undefined,
      status: statusFilter || undefined,
    });
    setList(r);
  };
  useEffect(() => { load(); }, [kindFilter, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, in_progress: 0, done: 0, rejected: 0, duplicate: 0 };
    for (const f of list) c[f.status] = (c[f.status] || 0) + 1;
    return c;
  }, [list]);

  const openEdit = (f: FeedbackEntry) => {
    setEditing(f);
    setEditStatus(f.status);
    setEditResponse(f.admin_response ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.updateFeedback(editing.id, {
        status: editStatus,
        admin_response: editResponse || undefined,
      });
      setEditing(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: FeedbackEntry) => {
    if (!confirm(`"${f.title}" löschen?`)) return;
    try {
      await api.deleteFeedback(f.id);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <Shell>
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <h2>Feedback</h2>
          <span className="spacer" />
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as FeedbackKind | "")}>
            <option value="">Alle Arten</option>
            <option value="bug">Fehler</option>
            <option value="improvement">Verbesserung</option>
            <option value="idea">Neue Idee</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as FeedbackStatus | "")}>
            <option value="">Alle Status</option>
            {STATUS_KEYS.map((k) => (
              <option key={k} value={k}>{FEEDBACK_STATUS_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div className="team-summary">
          {STATUS_KEYS.map((s) => (
            <div key={s} className="summary-tile">
              <div className="summary-label">{FEEDBACK_STATUS_LABELS[s]}</div>
              <div className="summary-value">{counts[s] ?? 0}</div>
            </div>
          ))}
        </div>

        <table>
          <thead>
            <tr>
              <th>Wann</th>
              <th>Reporter</th>
              <th>Art</th>
              <th>Titel</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.id} onClick={() => openEdit(f)} style={{ cursor: "pointer" }}>
                <td className="muted small">{new Date(f.created_at).toLocaleDateString("de-DE")}</td>
                <td>
                  {f.reporter_full_name || f.reporter_username || "—"}
                  {f.reporter_role && <span className="muted small"> · {f.reporter_role}</span>}
                </td>
                <td>{FEEDBACK_KIND_LABELS[f.kind]}</td>
                <td><strong>{f.title}</strong>
                  <div className="muted small" style={{ whiteSpace: "pre-wrap", maxWidth: 480 }}>
                    {f.description.length > 200 ? f.description.slice(0, 200) + "…" : f.description}
                  </div>
                </td>
                <td><span className={`status feedback-status-${f.status}`}>{FEEDBACK_STATUS_LABELS[f.status]}</span></td>
                <td>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(f); }}>Bearbeiten</button>
                  <button className="danger" onClick={(e) => { e.stopPropagation(); remove(f); }}>×</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="muted">Keine Einträge.</td></tr>
            )}
          </tbody>
        </table>

        {editing && (
          <div className="modal-backdrop" onClick={() => setEditing(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
              <h3>{FEEDBACK_KIND_LABELS[editing.kind]}: {editing.title}</h3>
              <p className="muted small">
                Von {editing.reporter_full_name || editing.reporter_username || "—"} ·
                {" "}{new Date(editing.created_at).toLocaleString("de-DE")}
              </p>
              <pre className="feedback-desc">{editing.description}</pre>

              <label>Status
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as FeedbackStatus)}>
                  {STATUS_KEYS.map((k) => (
                    <option key={k} value={k}>{FEEDBACK_STATUS_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <label>Antwort (optional)
                <textarea rows={5} value={editResponse}
                  onChange={(e) => setEditResponse(e.target.value)}
                  placeholder="Was du dem Reporter mitteilen willst …" />
              </label>

              <div className="modal-actions">
                <button onClick={() => setEditing(null)}>Abbrechen</button>
                <button onClick={saveEdit} disabled={busy}>
                  {busy ? "Speichere…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
