import { useEffect, useState } from "react";
import Shell from "../components/Shell";
import Button from "../components/ui/Button";
import Select from "../components/ui/Select";
import {
  api, FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS,
  type FeedbackEntry, type FeedbackKind, type FeedbackStatus,
} from "../api";

const FEEDBACK_PILL: Record<FeedbackStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-royal/10 text-royal",
  rejected: "bg-red-50 text-red-700",
  duplicate: "bg-ink/10 text-ink/60",
};

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
      <div className="space-y-6">
        <div>
          <div className="eyebrow">Deine Meinung</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Feedback geben</h1>
        </div>

        <section className="card p-4 sm:p-5">
          <p className="text-sm text-ink/60">
            Fehler gefunden? Idee für ein neues Feature? Etwas könnte besser
            laufen? Schreib's hier rein – der Admin sieht deinen Eintrag und
            antwortet mit Status / Kommentar.
          </p>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="field-label">Art</span>
              <Select
                value={kind}
                onChange={(v) => setKind(v as FeedbackKind)}
                options={[
                  { value: "bug", label: FEEDBACK_KIND_LABELS.bug },
                  { value: "improvement", label: FEEDBACK_KIND_LABELS.improvement },
                  { value: "idea", label: FEEDBACK_KIND_LABELS.idea },
                ]}
                aria-label="Art"
                className="w-56"
              />
            </label>
            <label className="block">
              <span className="field-label">Titel</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='z. B. "Wochenansicht auf Mobile zu eng"'
              />
            </label>
            <label className="block">
              <span className="field-label">Beschreibung</span>
              <textarea
                className="input min-h-[6rem] resize-y"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Was ist passiert / was wünschst du dir?"
              />
            </label>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
          )}
          {sentNote && (
            <div className="mt-4 rounded-lg border-l-4 border-royal bg-royal/10 p-3 text-sm text-ink">{sentNote}</div>
          )}
          <Button onClick={submit} disabled={busy} className="mt-4">
            {busy ? "Sende…" : "Absenden"}
          </Button>
        </section>

        <div className="space-y-3">
          <h2 className="text-base font-black sm:text-lg">Deine Einträge</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                  <th className="px-4 py-3">Wann</th>
                  <th className="px-4 py-3">Art</th>
                  <th className="px-4 py-3">Titel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Antwort</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.id} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-4 py-3 text-ink/60">{new Date(f.created_at).toLocaleDateString("de-DE")}</td>
                    <td className="px-4 py-3">{FEEDBACK_KIND_LABELS[f.kind]}</td>
                    <td className="px-4 py-3">
                      <strong>{f.title}</strong>
                      <div className="whitespace-pre-wrap text-ink/60">{f.description}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${FEEDBACK_PILL[f.status]}`}>
                        {FEEDBACK_STATUS_LABELS[f.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-pre-wrap text-ink/60">{f.admin_response ?? "—"}</td>
                    <td className="px-4 py-3">
                      {f.status === "open" && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            if (!confirm("Eintrag löschen?")) return;
                            await api.deleteFeedback(f.id);
                            load();
                          }}
                        >
                          ×
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-3 text-ink/60">Noch keine Einträge.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
