import { useEffect, useState } from "react";
import Button from "./ui/Button";
import Select from "./ui/Select";
import { api, type Issue, type Project, type TimeEntry } from "../api";

interface Props {
  initial?: TimeEntry | null;
  defaultDate?: string; // YYYY-MM-DD
  onSaved: () => void;
  onCancel?: () => void;
}

export default function EntryForm({ initial, defaultDate, onSaved, onCancel }: Props) {
  const [date, setDate] = useState(
    initial?.start_at?.slice(0, 10) ?? defaultDate ?? new Date().toISOString().slice(0, 10),
  );
  const [start, setStart] = useState(initial?.start_at?.slice(11, 16) ?? "09:00");
  const [end, setEnd] = useState(initial?.end_at?.slice(11, 16) ?? "17:30");
  const [breakMin, setBreakMin] = useState(initial?.break_minutes ?? 30);
  const [projectId, setProjectId] = useState<number | "">(initial?.project_id ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (initial) {
      setDate(initial.start_at.slice(0, 10));
      setStart(initial.start_at.slice(11, 16));
      setEnd(initial.end_at?.slice(11, 16) ?? "17:30");
      setBreakMin(initial.break_minutes);
      setProjectId(initial.project_id ?? "");
      setNote(initial.note ?? "");
    }
  }, [initial?.id]);

  // Hängt der Eintrag an einem archivierten/nicht-gelisteten Projekt, blenden
  // wir es als aktuelle Option zusätzlich ein, damit die Auswahl korrekt bleibt.
  const options = [...projects];
  if (initial?.project_id && !projects.some((p) => p.id === initial.project_id)) {
    options.unshift({
      id: initial.project_id,
      owner_user_id: 0,
      name: initial.project ?? "Projekt",
      archived: true,
      created_at: "",
    });
  }

  const submit = async () => {
    setError(null); setIssues([]);
    const payload = {
      start_at: `${date}T${start}:00`,
      end_at: `${date}T${end}:00`,
      break_minutes: breakMin,
      project_id: projectId === "" ? null : projectId,
      note: note || undefined,
    };
    try {
      const res = initial
        ? await api.updateEntry(initial.id, payload)
        : await api.createEntry(payload);
      setIssues(res.issues);
      onSaved();
    } catch (e: any) {
      try {
        const parsed = JSON.parse(e.message);
        // Validierungsfehler liefern detail als Array von Issues; HTTP-Fehler
        // (z. B. 409 gesperrter Monat) als String – den zeigen wir als Text.
        if (Array.isArray(parsed.detail)) setIssues(parsed.detail);
        else setError(typeof parsed.detail === "string" ? parsed.detail : e.message);
      } catch {
        setError(e.message);
      }
    }
  };

  return (
    <div>
      <h3 className="text-lg font-black">{initial ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Datum</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Start</span>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Ende</span>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Pause (min)</span>
          <input className="input" type="number" min={0} value={breakMin}
            onChange={(e) => setBreakMin(parseInt(e.target.value || "0", 10))} />
        </label>
        <div>
          <span className="field-label">Projekt</span>
          <Select
            value={projectId === "" ? "" : String(projectId)}
            onChange={(v) => setProjectId(v === "" ? "" : Number(v))}
            options={[
              { value: "", label: "— kein Projekt —" },
              ...options.map((p) => ({
                value: String(p.id),
                label: `${p.name}${p.archived ? " (archiviert)" : ""}`,
              })),
            ]}
            aria-label="Projekt"
          />
        </div>
        <label className="block sm:col-span-2">
          <span className="field-label">Notiz</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>}
        <Button onClick={submit}>Speichern</Button>
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      {issues.map((i, idx) => (
        <div
          key={idx}
          className={`mt-2 rounded-lg border-l-4 p-3 text-sm ${
            i.severity === "error"
              ? "border-red-500 bg-red-50 text-red-900"
              : "border-amber-500 bg-amber-50 text-amber-900"
          }`}
        >
          <strong>[{i.code}]</strong> {i.message}
        </div>
      ))}
    </div>
  );
}
