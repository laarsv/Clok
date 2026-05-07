import { useEffect, useState } from "react";
import Shell from "../components/Shell";
import {
  api, FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS,
  type FeedbackEntry, type FeedbackKind,
} from "../api";

export default function Feedback() {
  const [list, setList] = useState<FeedbackEntry[]>([]);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const load = () => api.listFeedback().then(setList);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError(null);
    if (title.trim().length < 3) { setError("Titel zu kurz."); return; }
    if (description.trim().length < 5) { setError("Beschreibung zu kurz."); return; }
    setBusy(true);
    try {
      await api.createFeedback({
        kind, title: title.trim(), description: description.trim(),
      });
      setTitle(""); setDescription("");
      setSentNote("Danke! Dein Feedback ist beim Admin gelandet.");
      setTimeout(() => setSentNote(null), 4000);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="feedback">
        <h2>Feedback geben</h2>

        <section className="card-section">
          <p className="muted small">
            Fehler gefunden? Idee für ein neues Feature? Etwas könnte besser
            laufen? Schreib's hier rein – der Admin sieht deinen Eintrag und
            antwortet mit Status / Kommentar.
          </p>
          <div className="manual-grid">
            <label>Art
              <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
                <option value="bug">{FEEDBACK_KIND_LABELS.bug}</option>
                <option value="improvement">{FEEDBACK_KIND_LABELS.improvement}</option>
                <option value="idea">{FEEDBACK_KIND_LABELS.idea}</option>
              </select>
            </label>
            <label className="full">Titel<input value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='z. B. "Wochenansicht auf Mobile zu eng"' /></label>
            <label className="full">Beschreibung
              <textarea rows={6} value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Was ist passiert / was wünschst du dir?" />
            </label>
          </div>
          {error && <div className="error">{error}</div>}
          {sentNote && <div className="issue">{sentNote}</div>}
          <button onClick={submit} disabled={busy}>
            {busy ? "Sende…" : "Absenden"}
          </button>
        </section>

        <section className="card-section">
          <h3>Deine Einträge</h3>
          <table>
            <thead>
              <tr><th>Wann</th><th>Art</th><th>Titel</th><th>Status</th><th>Antwort</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id}>
                  <td className="muted small">{new Date(f.created_at).toLocaleDateString("de-DE")}</td>
                  <td>{FEEDBACK_KIND_LABELS[f.kind]}</td>
                  <td><strong>{f.title}</strong>
                    <div className="muted small" style={{ whiteSpace: "pre-wrap" }}>{f.description}</div>
                  </td>
                  <td><span className={`status feedback-status-${f.status}`}>{FEEDBACK_STATUS_LABELS[f.status]}</span></td>
                  <td className="muted small" style={{ whiteSpace: "pre-wrap" }}>{f.admin_response ?? "—"}</td>
                  <td>
                    {f.status === "open" && (
                      <button onClick={async () => {
                        if (!confirm("Eintrag löschen?")) return;
                        await api.deleteFeedback(f.id);
                        load();
                      }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="muted">Noch keine Einträge.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}
