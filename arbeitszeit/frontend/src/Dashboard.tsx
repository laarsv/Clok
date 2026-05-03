import { useEffect, useState } from "react";
import {
  api, type Issue, type PeriodSummary, type TimeEntry, type User,
} from "./api";

interface Props {
  user: User;
  onLogout: () => void;
  onUserUpdate: (u: User) => void;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtHours(h: number) {
  return h.toFixed(2).replace(".", ",") + " h";
}

export default function Dashboard({ user, onLogout, onUserUpdate }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summaries, setSummaries] = useState<PeriodSummary[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const load = async () => {
    const [e, s] = await Promise.all([api.listEntries(), api.summary()]);
    setEntries(e);
    setSummaries(s);
    setRunning(e.find((x) => !x.end_at) ?? null);
  };

  useEffect(() => { load(); }, []);

  const start = async () => {
    await api.start();
    await load();
  };
  const stop = async () => {
    const breakStr = prompt("Pause in Minuten?", "30");
    if (breakStr === null) return;
    const res = await api.stop(parseInt(breakStr || "0", 10));
    setIssues(res.issues);
    await load();
  };

  const exportMonth = () => {
    const now = new Date();
    window.open(api.exportUrl(now.getFullYear(), now.getMonth() + 1), "_blank");
  };

  return (
    <div className="app">
      <header>
        <h1>Arbeitszeit</h1>
        <div className="header-actions">
          <span>{user.full_name || user.username}</span>
          <button onClick={() => setShowSettings(true)}>Profil</button>
          <button onClick={exportMonth}>CSV-Export</button>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <section className="summaries">
        {summaries.map((s) => (
          <div key={s.period} className="summary-card">
            <h3>{labelFor(s.period)}</h3>
            <div className="summary-hours">{fmtHours(s.net_hours)}</div>
            {s.target_hours != null && (
              <div className="summary-meta">
                Soll {fmtHours(s.target_hours)}
                <br />
                Verbleibend {fmtHours(s.remaining_hours ?? 0)}
              </div>
            )}
            {s.billable_eur != null && (
              <div className="summary-meta">
                Abrechnung {s.billable_eur.toFixed(2).replace(".", ",")} €
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="timer">
        {running ? (
          <>
            <div>
              <strong>Läuft seit:</strong> {fmtDateTime(running.start_at)}
            </div>
            <button onClick={stop} className="stop">Stoppen</button>
          </>
        ) : (
          <button onClick={start} className="start">Start</button>
        )}
      </section>

      {issues.length > 0 && (
        <section className="issues">
          {issues.map((i, idx) => (
            <div key={idx} className={`issue ${i.severity}`}>
              <strong>[{i.code}]</strong> {i.message}
            </div>
          ))}
        </section>
      )}

      <ManualEntryForm onSaved={load} />

      <section>
        <h2>Einträge</h2>
        <table>
          <thead>
            <tr>
              <th>Start</th><th>Ende</th><th>Pause</th>
              <th>Netto</th><th>Projekt</th><th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{fmtDateTime(e.start_at)}</td>
                <td>{e.end_at ? fmtDateTime(e.end_at) : "—"}</td>
                <td>{e.break_minutes} min</td>
                <td>{e.end_at ? fmtHours(e.net_hours) : "—"}</td>
                <td>{e.project ?? ""}</td>
                <td>
                  <button onClick={async () => {
                    if (confirm("Eintrag löschen?")) {
                      await api.deleteEntry(e.id);
                      await load();
                    }
                  }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showSettings && (
        <SettingsModal
          user={user}
          onClose={() => setShowSettings(false)}
          onSaved={(u) => { onUserUpdate(u); setShowSettings(false); }}
        />
      )}
    </div>
  );
}

function labelFor(p: string) {
  return p === "day" ? "Heute" : p === "week" ? "Woche" : "Monat";
}

// ----- Manuelles Hinzufügen -----

function ManualEntryForm({ onSaved }: { onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:30");
  const [breakMin, setBreakMin] = useState(30);
  const [project, setProject] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null); setIssues([]);
    try {
      const res = await api.createEntry({
        start_at: `${date}T${start}:00`,
        end_at: `${date}T${end}:00`,
        break_minutes: breakMin,
        project: project || undefined,
        note: note || undefined,
      });
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
      <h2>Manueller Eintrag</h2>
      <div className="manual-grid">
        <label>Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Ende<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>Pause (min)<input type="number" min={0} value={breakMin}
          onChange={(e) => setBreakMin(parseInt(e.target.value || "0", 10))} /></label>
        <label>Projekt<input value={project} onChange={(e) => setProject(e.target.value)} /></label>
        <label className="full">Notiz<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <button onClick={submit}>Speichern</button>
      {error && <div className="error">{error}</div>}
      {issues.map((i, idx) => (
        <div key={idx} className={`issue ${i.severity}`}>
          <strong>[{i.code}]</strong> {i.message}
        </div>
      ))}
    </section>
  );
}

// ----- Profilmodal -----

function SettingsModal({ user, onClose, onSaved }: {
  user: User; onClose: () => void; onSaved: (u: User) => void;
}) {
  const [mode, setMode] = useState(user.billing_mode);
  const [rate, setRate] = useState(user.hourly_rate_eur);
  const [target, setTarget] = useState(user.monthly_target_hours);
  const [name, setName] = useState(user.full_name ?? "");

  const save = async () => {
    const u = await api.updateMe({
      full_name: name,
      billing_mode: mode,
      hourly_rate_eur: rate,
      monthly_target_hours: target,
    });
    onSaved(u);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Profil & Abrechnung</h2>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Abrechnungsmodell
          <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="salary">Festgehalt (Soll-Stunden)</option>
            <option value="hourly">Stundenbasiert</option>
          </select>
        </label>
        {mode === "hourly" ? (
          <label>Stundensatz (EUR)
            <input type="number" step="0.01" value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value || "0"))} />
          </label>
        ) : (
          <label>Soll-Stunden / Monat
            <input type="number" step="0.5" value={target}
              onChange={(e) => setTarget(parseFloat(e.target.value || "0"))} />
          </label>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Abbrechen</button>
          <button onClick={save}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
