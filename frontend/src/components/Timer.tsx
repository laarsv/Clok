import { useEffect, useMemo, useState } from "react";
import { api, type Project, type TimeEntry } from "../api";
import Button from "./ui/Button";
import Select from "./ui/Select";
import { nowLocalIso } from "../lib/datetime";

function elapsed(startIso: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

function parseErr(e: any): string {
  try {
    const p = JSON.parse(e.message);
    return Array.isArray(p.detail) ? p.detail.map((x: any) => x.message).join("; ") : (p.detail ?? e.message);
  } catch {
    return e?.message ?? "Fehler";
  }
}

/** Live-Timer: startet einen laufenden Eintrag (end_at leer) und stoppt ihn
 *  (setzt end_at). onChange signalisiert dem Parent, seine Ansichten neu zu laden. */
export default function Timer({ onChange }: { onChange?: () => void }) {
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.runningEntry().then(setRunning).catch(() => setRunning(null));
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running?.id]);

  const start = async () => {
    setError(null); setBusy(true);
    try {
      const res = await api.createEntry({
        start_at: nowLocalIso(),
        break_minutes: 0,
        project_id: projectId ? Number(projectId) : null,
      });
      setRunning(res.entry);
      setNow(Date.now());
      onChange?.();
    } catch (e: any) { setError(parseErr(e)); }
    finally { setBusy(false); }
  };

  const stop = async () => {
    if (!running) return;
    setError(null); setBusy(true);
    try {
      await api.updateEntry(running.id, {
        start_at: running.start_at,
        end_at: nowLocalIso(),
        break_minutes: running.break_minutes,
        project_id: running.project_id ?? null,
      });
      setRunning(null);
      onChange?.();
    } catch (e: any) { setError(parseErr(e)); }
    finally { setBusy(false); }
  };

  const options = useMemo(() => [
    { value: "", label: "— kein Projekt —" },
    ...projects.map((p) => ({ value: String(p.id), label: p.name })),
  ], [projects]);

  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      {running ? (
        <>
          <span className="inline-flex items-center gap-2 text-sm font-bold text-royal">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-royal" /> läuft
          </span>
          <span className="text-2xl font-black tabular-nums">{elapsed(running.start_at, now)}</span>
          <span className="text-sm text-ink/60">
            seit {running.start_at.slice(11, 16)} Uhr{running.project ? ` · ${running.project}` : ""}
          </span>
          <span className="flex-1" />
          <Button variant="danger" onClick={stop} disabled={busy}>■ Stoppen</Button>
        </>
      ) : (
        <>
          <span className="text-sm font-bold">Timer</span>
          {projects.length > 0 && (
            <Select value={projectId} onChange={setProjectId} options={options} aria-label="Projekt" className="w-48" />
          )}
          <span className="flex-1" />
          <Button onClick={start} disabled={busy}>▶ Starten</Button>
        </>
      )}
      {error && <div className="w-full text-sm text-red-600">{error}</div>}
    </div>
  );
}
