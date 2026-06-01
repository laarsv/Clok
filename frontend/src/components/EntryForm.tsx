import { useEffect, useState } from "react";
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
        setIssues(parsed.detail ?? []);
      } catch {
        setError(e.message);
      }
    }
  };

  return (
    <section className="manual">
      <h3>{initial ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h3>
      <div className="manual-grid">
        <label>Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Ende<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>Pause (min)<input type="number" min={0} value={breakMin}
          onChange={(e) => setBreakMin(parseInt(e.target.value || "0", 10))} /></label>
        <label>Projekt
          <select value={projectId === "" ? "" : String(projectId)}
            onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">— kein Projekt —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.archived ? " (archiviert)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="full">Notiz<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div className="row-actions">
        <button onClick={submit}>Speichern</button>
        {onCancel && <button onClick={onCancel}>Abbrechen</button>}
      </div>
      {error && <div className="error">{error}</div>}
      {issues.map((i, idx) => (
        <div key={idx} className={`issue ${i.severity}`}>
          <strong>[{i.code}]</strong> {i.message}
        </div>
      ))}
    </section>
  );
}
