import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import {
  api, FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS,
  type FeedbackEntry, type FeedbackKind, type FeedbackStatus,
} from "../../api";

const STATUS_KEYS: FeedbackStatus[] = ["open", "in_progress", "done", "rejected", "duplicate"];

const FEEDBACK_PILL: Record<FeedbackStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-royal/10 text-royal",
  rejected: "bg-red-50 text-red-700",
  duplicate: "bg-ink/10 text-ink/60",
};

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
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Admin</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Feedback</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={kindFilter}
              onChange={(v) => setKindFilter(v as FeedbackKind | "")}
              options={[
                { value: "", label: "Alle Arten" },
                { value: "bug", label: "Fehler" },
                { value: "improvement", label: "Verbesserung" },
                { value: "idea", label: "Neue Idee" },
              ]}
              aria-label="Nach Art filtern"
              className="w-44"
            />
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as FeedbackStatus | "")}
              options={[
                { value: "", label: "Alle Status" },
                ...STATUS_KEYS.map((k) => ({ value: k, label: FEEDBACK_STATUS_LABELS[k] })),
              ]}
              aria-label="Nach Status filtern"
              className="w-44"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_KEYS.map((s) => (
            <div key={s} className="card p-4 sm:p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-ink/50">{FEEDBACK_STATUS_LABELS[s]}</div>
              <div className="mt-1 text-2xl font-black tabular-nums leading-tight">{counts[s] ?? 0}</div>
            </div>
          ))}
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                <th className="px-4 py-3">Wann</th>
                <th className="px-4 py-3">Reporter</th>
                <th className="px-4 py-3">Art</th>
                <th className="px-4 py-3">Titel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id} onClick={() => openEdit(f)} className="cursor-pointer border-b border-ink/5 last:border-b-0 hover:bg-ink/5">
                  <td className="px-4 py-3 text-ink/60">{new Date(f.created_at).toLocaleDateString("de-DE")}</td>
                  <td className="px-4 py-3">
                    {f.reporter_full_name || f.reporter_username || "—"}
                    {f.reporter_role && <span className="text-ink/60"> · {f.reporter_role}</span>}
                  </td>
                  <td className="px-4 py-3">{FEEDBACK_KIND_LABELS[f.kind]}</td>
                  <td className="px-4 py-3">
                    <strong>{f.title}</strong>
                    <div className="max-w-[480px] whitespace-pre-wrap text-ink/60">
                      {f.description.length > 200 ? f.description.slice(0, 200) + "…" : f.description}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${FEEDBACK_PILL[f.status]}`}>
                      {FEEDBACK_STATUS_LABELS[f.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(f); }}>Bearbeiten</Button>
                      <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); remove(f); }}>×</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-3 text-ink/60">Keine Einträge.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Modal open={!!editing} onClose={() => setEditing(null)} className="sm:max-w-2xl">
          {editing && (
            <>
              <h2 className="text-base font-black sm:text-lg">{FEEDBACK_KIND_LABELS[editing.kind]}: {editing.title}</h2>
              <p className="mt-1 text-sm text-ink/60">
                Von {editing.reporter_full_name || editing.reporter_username || "—"} ·
                {" "}{new Date(editing.created_at).toLocaleString("de-DE")}
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-ink/10 bg-ink/5 p-3 text-sm">{editing.description}</pre>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="field-label">Status</span>
                  <Select
                    value={editStatus}
                    onChange={(v) => setEditStatus(v as FeedbackStatus)}
                    options={STATUS_KEYS.map((k) => ({ value: k, label: FEEDBACK_STATUS_LABELS[k] }))}
                    aria-label="Status"
                    className="w-56"
                  />
                </label>
                <label className="block">
                  <span className="field-label">Antwort (optional)</span>
                  <textarea
                    className="input min-h-[6rem] resize-y"
                    value={editResponse}
                    onChange={(e) => setEditResponse(e.target.value)}
                    placeholder="Was du dem Reporter mitteilen willst …"
                  />
                </label>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>Abbrechen</Button>
                  <Button onClick={saveEdit} disabled={busy}>
                    {busy ? "Speichere…" : "Speichern"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Modal>
      </div>
    </Shell>
  );
}
