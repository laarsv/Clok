import { Fragment, useEffect, useState } from "react";
import { api, type AuditLogEntry } from "../api";
import Button from "./ui/Button";
import Select from "./ui/Select";
import { IconChevronDown } from "./ui/Icons";

interface Props {
  /** wenn gesetzt: nur Logs zu diesem User */
  employeeId?: number;
}

const ENTITY_LABEL: Record<string, string> = {
  time_entry: "Zeiteintrag",
  absence: "Abwesenheit",
  employment_terms: "Vertrag",
  balance_adjustment: "Saldo-Korrektur",
  user: "Mitarbeiter",
};
const ACTION_LABEL: Record<string, string> = {
  create: "angelegt",
  update: "geändert",
  delete: "gelöscht",
};

export default function AuditLogViewer({ employeeId }: Props) {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.listAuditLog({
        user_id: employeeId,
        entity_type: filter || undefined,
        limit: 200,
      });
      setRows(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [employeeId, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-ink/60">
          Wer hat wann was geändert. Lückenlose Compliance-Spur,
          inkl. Vorher/Nachher-Snapshot.
        </p>
        <Select
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { value: "", label: "Alle Bereiche" },
            { value: "time_entry", label: "Zeiteinträge" },
            { value: "absence", label: "Abwesenheiten" },
            { value: "employment_terms", label: "Verträge" },
            { value: "balance_adjustment", label: "Saldo-Korrekturen" },
            { value: "user", label: "Stammdaten" },
          ]}
          aria-label="Bereich filtern"
          className="w-48"
        />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? "…" : "Aktualisieren"}
        </Button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
              <th className="px-4 py-3">Wann</th>
              <th className="px-4 py-3">Wer</th>
              <th className="px-4 py-3">Aktion</th>
              <th className="px-4 py-3">Bereich</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b border-ink/5 last:border-b-0">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("de-DE")}</td>
                  <td className="px-4 py-3">{r.actor_full_name || r.actor_username || "—"}</td>
                  <td className="px-4 py-3">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="px-4 py-3">{ENTITY_LABEL[r.entity_type] ?? r.entity_type}</td>
                  <td className="px-4 py-3 tabular-nums text-ink/60">#{r.entity_id}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={expandedId === r.id ? "Einklappen" : "Ausklappen"}
                      onClick={() =>
                        setExpandedId(expandedId === r.id ? null : r.id)
                      }
                      className="text-ink/60 hover:text-ink"
                    >
                      <IconChevronDown size={16} className={`transition-transform ${expandedId === r.id ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr className="border-b border-ink/5 last:border-b-0">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs text-ink/60">Vorher</div>
                          <pre className="overflow-auto rounded-lg border border-ink/10 bg-ink/5 p-2 text-xs">{r.before ? JSON.stringify(r.before, null, 2) : "—"}</pre>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-ink/60">Nachher</div>
                          <pre className="overflow-auto rounded-lg border border-ink/10 bg-ink/5 p-2 text-xs">{r.after ? JSON.stringify(r.after, null, 2) : "—"}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/60">Keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
