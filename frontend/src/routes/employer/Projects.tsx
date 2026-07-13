import { Fragment, useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import HoursBar from "../../components/HoursBar";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
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
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Verwaltung</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Projekte</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" className="h-4 w-4 accent-royal" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archivierte
            </label>
            <Button onClick={() => setEditing("new")}>+ Projekt</Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Kunde</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((p) => (
                <tr key={p.id} className={`border-b border-ink/5 last:border-b-0 ${p.archived ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color || "#e5e7eb" }} />
                      {p.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{p.client ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{p.hours_budget != null ? `${p.hours_budget} h` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${p.archived ? "bg-ink/10 text-ink/60" : "bg-royal/10 text-royal"}`}>
                      {p.archived ? "archiviert" : "aktiv"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Bearbeiten</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleArchive(p)}>{p.archived ? "Reaktivieren" : "Archivieren"}</Button>
                      <Button size="sm" variant="danger" onClick={() => remove(p)}>Löschen</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleProjects.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50">Noch keine Projekte. Lege oben rechts eins an.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black sm:text-lg">Auswertung</h2>
          <Button variant="outline" onClick={exportCsv} disabled={!report || report.rows.length === 0}>CSV-Export</Button>
        </div>

        <section className="card space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                  preset === p ? "bg-royal text-paper" : "border border-ink/15 text-ink/60 hover:text-ink"
                }`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex flex-wrap gap-4">
              <label className="block">
                <span className="field-label">Von</span>
                <input className="input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </label>
              <label className="block">
                <span className="field-label">Bis</span>
                <input className="input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </label>
            </div>
          )}
          <p className="text-xs text-ink/60">
            Zeitraum: {range.start.toLocaleDateString("de-DE")} – {range.end.toLocaleDateString("de-DE")}
          </p>
        </section>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Kunde</th>
                <th className="px-4 py-3 text-right">Stunden</th>
                <th className="px-4 py-3">Ist / Budget</th>
              </tr>
            </thead>
            <tbody>
              {report?.rows.map((r) => (
                <Fragment key={r.project_id}>
                  <tr onClick={() => toggleRow(r.project_id)} className="cursor-pointer border-b border-ink/5 text-ink last:border-b-0 hover:bg-ink/5">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color || "#e5e7eb" }} />
                        {r.by_employee.length > 0 && (
                          <span className="text-ink/40">{expanded.has(r.project_id) ? "▾" : "▸"}</span>
                        )}
                        {r.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/60">{r.client ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtHours(r.total_hours)}</td>
                    <td className="px-4 py-3" style={{ minWidth: 160 }}>
                      {r.hours_budget != null && r.hours_budget > 0
                        ? <HoursBar actual={r.total_hours} target={r.hours_budget} />
                        : <span className="text-xs text-ink/50">kein Budget</span>}
                    </td>
                  </tr>
                  {expanded.has(r.project_id) && r.by_employee.map((e) => (
                    <tr key={e.user_id} className="border-b border-ink/5 bg-ink/[0.02] text-ink/70 last:border-b-0">
                      <td colSpan={2} className="px-4 py-2 pl-8">↳ {e.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtHours(e.hours)}</td>
                      <td />
                    </tr>
                  ))}
                </Fragment>
              ))}
              {report && report.no_project_hours > 0 && (
                <tr className="border-b border-ink/5 text-ink/60 last:border-b-0">
                  <td className="px-4 py-3">Ohne Projekt</td><td className="px-4 py-3">—</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtHours(report.no_project_hours)}</td>
                  <td />
                </tr>
              )}
              {report && report.rows.length === 0 && report.no_project_hours === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/50">Keine erfassten Stunden im Zeitraum.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Modal open={editing !== null} onClose={() => setEditing(null)} className="sm:max-w-lg">
          {editing && (
            <ProjectForm
              initial={editing === "new" ? null : editing}
              onSaved={() => { setEditing(null); load(); }}
              onCancel={() => setEditing(null)}
            />
          )}
        </Modal>
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
    <div className="space-y-4">
      <h2 className="text-lg font-black">{initial ? "Projekt bearbeiten" : "Neues Projekt"}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Kunde / Auftraggeber</span>
          <input className="input" value={client} onChange={(e) => setClient(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Stunden-Budget</span>
          <input className="input" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <span className="field-label">Farbe</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setColor("")}
              title="keine"
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-ink/60 ${color === "" ? "border-royal ring-2 ring-royal/40" : "border-ink/20"}`}
            >—</button>
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                title={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`h-8 w-8 rounded-full border ${color === c ? "border-royal ring-2 ring-royal/40" : "border-ink/10"}`}
              />
            ))}
          </div>
        </div>
      </div>
      {error && (
        <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</Button>
        <Button variant="outline" onClick={onCancel}>Abbrechen</Button>
      </div>
    </div>
  );
}
