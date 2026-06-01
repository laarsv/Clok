import { Fragment, useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import HoursBar from "../../components/HoursBar";
import { api, type Project, type ProjectInput, type ProjectReport } from "../../api";
import { fmtHours, isoDate } from "../../lib/datetime";

const PALETTE = ["#00a984", "#ffcc4d", "#ff6b6b", "#5b8def", "#a78bfa", "#9aa0a6"];

// --- Zeitraum-Filter (Muster aus routes/Dashboard.tsx) ---
type Preset = "current_month" | "last_month" | "current_quarter" | "current_year" | "custom";
const PRESET_LABELS: Record<Preset, string> = {
  current_month: "Aktueller Monat",
  last_month: "Letzter Monat",
  current_quarter: "Aktuelles Quartal",
  current_year: "Aktuelles Jahr",
  custom: "Benutzerdefiniert",
};
const PRESETS: Preset[] = ["current_month", "last_month", "current_quarter", "current_year", "custom"];

interface Range { start: Date; end: Date; }
function startOfDay(d: Date): Date { const o = new Date(d); o.setHours(0, 0, 0, 0); return o; }
function rangeFromPreset(preset: Preset): Range {
  const today = startOfDay(new Date());
  if (preset === "current_month") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
  if (preset === "last_month") {
    return {
      start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      end: new Date(today.getFullYear(), today.getMonth(), 0),
    };
  }
  if (preset === "current_quarter") {
    const q = Math.floor(today.getMonth() / 3);
    return { start: new Date(today.getFullYear(), q * 3, 1), end: today };
  }
  if (preset === "current_year") return { start: new Date(today.getFullYear(), 0, 1), end: today };
  return { start: today, end: today };
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.listProjects(true).then(setProjects).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // --- Auswertung ---
  const [preset, setPreset] = useState<Preset>("current_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = useMemo<Range>(() => {
    if (preset === "custom" && customStart && customEnd) {
      const today = startOfDay(new Date());
      const e = new Date(customEnd);
      return { start: startOfDay(new Date(customStart)), end: e > today ? today : startOfDay(e) };
    }
    return rangeFromPreset(preset);
  }, [preset, customStart, customEnd]);
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.projectReport(isoDate(range.start), isoDate(range.end))
      .then(setReport).catch(() => setReport(null));
    // `projects` als Dep: nach Anlegen/Bearbeiten/Archivieren neu laden,
    // damit Budget/Name/Farbe in der Auswertung aktuell sind.
  }, [range.start.getTime(), range.end.getTime(), projects]);

  const visibleProjects = showArchived ? projects : projects.filter((p) => !p.archived);

  const toggleArchive = async (p: Project) => {
    await api.updateProject(p.id, { archived: !p.archived });
    load();
  };
  const remove = async (p: Project) => {
    if (!confirm(`Projekt "${p.name}" löschen? Bestehende Einträge verlieren die Projekt-Zuordnung. Tipp: stattdessen archivieren.`)) return;
    try { await api.deleteProject(p.id); load(); }
    catch (e: any) { alert(e.message); }
  };

  const exportCsv = () => {
    if (!report) return;
    const rows = [["Projekt", "Kunde", "Stunden", "Budget"]];
    for (const r of report.rows) {
      rows.push([r.name, r.client ?? "", r.total_hours.toFixed(2), r.hours_budget != null ? String(r.hours_budget) : ""]);
    }
    if (report.no_project_hours > 0) rows.push(["Ohne Projekt", "", report.no_project_hours.toFixed(2), ""]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projekte_${isoDate(range.start)}_${isoDate(range.end)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleRow = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Shell>
      <div className="projects">
        <div className="dashboard-toolbar">
          <h2>Projekte</h2>
          <span className="spacer" />
          <label className="toggle">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span>Archivierte</span>
          </label>
          <button onClick={() => setEditing("new")}>+ Projekt</button>
        </div>

        {error && <div className="error">{error}</div>}

        <section className="card-section">
          <table>
            <thead>
              <tr><th>Projekt</th><th>Kunde</th><th>Budget</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {visibleProjects.map((p) => (
                <tr key={p.id} className={p.archived ? "muted" : ""}>
                  <td>
                    <span className="project-dot" style={{ background: p.color || "var(--border)" }} />
                    {p.name}
                  </td>
                  <td className="muted small">{p.client ?? "—"}</td>
                  <td className="tabular-nums">{p.hours_budget != null ? `${p.hours_budget} h` : "—"}</td>
                  <td>
                    <span className={`status ${p.archived ? "status-rejected" : "status-approved"}`}>
                      {p.archived ? "archiviert" : "aktiv"}
                    </span>
                  </td>
                  <td className="action-cell">
                    <button onClick={() => setEditing(p)}>Bearbeiten</button>
                    <button onClick={() => toggleArchive(p)}>{p.archived ? "Reaktivieren" : "Archivieren"}</button>
                    <button className="danger" onClick={() => remove(p)}>Löschen</button>
                  </td>
                </tr>
              ))}
              {visibleProjects.length === 0 && (
                <tr><td colSpan={5} className="muted">Noch keine Projekte. Lege oben rechts eins an.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="dashboard-toolbar" style={{ marginTop: "1.5rem" }}>
          <h2>Auswertung</h2>
          <span className="spacer" />
          <button onClick={exportCsv} disabled={!report || report.rows.length === 0}>CSV-Export</button>
        </div>

        <section className="card-section dashboard-filter">
          <div className="filter-presets">
            {PRESETS.map((p) => (
              <button key={p} className={`preset-pill ${preset === p ? "active" : ""}`}
                onClick={() => setPreset(p)}>{PRESET_LABELS[p]}</button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="filter-custom">
              <label>Von<input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label>
              <label>Bis<input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></label>
            </div>
          )}
          <p className="muted small range-display">
            Zeitraum: {range.start.toLocaleDateString("de-DE")} – {range.end.toLocaleDateString("de-DE")}
          </p>
        </section>

        <section className="card-section">
          <table>
            <thead>
              <tr><th>Projekt</th><th>Kunde</th><th style={{ textAlign: "right" }}>Stunden</th><th>Ist / Budget</th></tr>
            </thead>
            <tbody>
              {report?.rows.map((r) => (
                <Fragment key={r.project_id}>
                  <tr onClick={() => toggleRow(r.project_id)} style={{ cursor: "pointer" }}>
                    <td>
                      <span className="project-dot" style={{ background: r.color || "var(--border)" }} />
                      {r.by_employee.length > 0 && (
                        <span className="muted" style={{ marginRight: 4 }}>
                          {expanded.has(r.project_id) ? "▾" : "▸"}
                        </span>
                      )}
                      {r.name}
                    </td>
                    <td className="muted small">{r.client ?? "—"}</td>
                    <td className="tabular-nums" style={{ textAlign: "right" }}>{fmtHours(r.total_hours)}</td>
                    <td style={{ minWidth: 160 }}>
                      {r.hours_budget != null && r.hours_budget > 0
                        ? <HoursBar actual={r.total_hours} target={r.hours_budget} />
                        : <span className="muted small">kein Budget</span>}
                    </td>
                  </tr>
                  {expanded.has(r.project_id) && r.by_employee.map((e) => (
                    <tr key={e.user_id} className="project-sub-row">
                      <td colSpan={2}>↳ {e.name}</td>
                      <td className="tabular-nums" style={{ textAlign: "right" }}>{fmtHours(e.hours)}</td>
                      <td />
                    </tr>
                  ))}
                </Fragment>
              ))}
              {report && report.no_project_hours > 0 && (
                <tr className="muted">
                  <td>Ohne Projekt</td><td>—</td>
                  <td className="tabular-nums" style={{ textAlign: "right" }}>{fmtHours(report.no_project_hours)}</td>
                  <td />
                </tr>
              )}
              {report && report.rows.length === 0 && report.no_project_hours === 0 && (
                <tr><td colSpan={4} className="muted">Keine erfassten Stunden im Zeitraum.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {editing && (
          <div className="modal-backdrop" onClick={() => setEditing(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
              <ProjectForm
                initial={editing === "new" ? null : editing}
                onSaved={() => { setEditing(null); load(); }}
                onCancel={() => setEditing(null)}
              />
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function ProjectForm({ initial, onSaved, onCancel }: {
  initial: Project | null; onSaved: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [color, setColor] = useState(initial?.color ?? "");
  const [budget, setBudget] = useState(initial?.hours_budget != null ? String(initial.hours_budget) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError("Name fehlt."); return; }
    const payload: ProjectInput = {
      name: name.trim(),
      client: client.trim() || null,
      color: color || null,
      hours_budget: budget.trim() ? Number(budget.replace(",", ".")) : null,
    };
    setBusy(true);
    try {
      if (initial) await api.updateProject(initial.id, payload);
      else await api.createProject(payload);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{initial ? "Projekt bearbeiten" : "Neues Projekt"}</h3>
      <div className="manual-grid">
        <label className="full">Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Kunde / Auftraggeber<input value={client} onChange={(e) => setClient(e.target.value)} /></label>
        <label>Stunden-Budget<input type="number" min={0} value={budget}
          onChange={(e) => setBudget(e.target.value)} /></label>
        <label className="full">Farbe
          <div className="palette">
            <button type="button" className={`swatch none ${color === "" ? "active" : ""}`}
              onClick={() => setColor("")} title="keine">—</button>
            {PALETTE.map((c) => (
              <button type="button" key={c} title={c}
                className={`swatch ${color === c ? "active" : ""}`}
                style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
