import { Fragment, useEffect, useState } from "react";
import { api, type AuditLogEntry } from "../api";

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
    <div>
      <div className="dashboard-toolbar">
        <p className="muted small" style={{ flex: 1, margin: 0 }}>
          Wer hat wann was geändert. Lückenlose Compliance-Spur,
          inkl. Vorher/Nachher-Snapshot.
        </p>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Alle Bereiche</option>
          <option value="time_entry">Zeiteinträge</option>
          <option value="absence">Abwesenheiten</option>
          <option value="employment_terms">Verträge</option>
          <option value="balance_adjustment">Saldo-Korrekturen</option>
          <option value="user">Stammdaten</option>
        </select>
        <button onClick={load} disabled={loading}>
          {loading ? "…" : "Aktualisieren"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Wann</th>
            <th>Wer</th>
            <th>Aktion</th>
            <th>Bereich</th>
            <th>ID</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr>
                <td>{new Date(r.created_at).toLocaleString("de-DE")}</td>
                <td>{r.actor_full_name || r.actor_username || "—"}</td>
                <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                <td>{ENTITY_LABEL[r.entity_type] ?? r.entity_type}</td>
                <td className="muted small">#{r.entity_id}</td>
                <td>
                  <button onClick={() =>
                    setExpandedId(expandedId === r.id ? null : r.id)
                  }>
                    {expandedId === r.id ? "▲" : "▼"}
                  </button>
                </td>
              </tr>
              {expandedId === r.id && (
                <tr>
                  <td colSpan={6} className="audit-detail">
                    <div className="audit-snapshots">
                      <div>
                        <div className="muted small">Vorher</div>
                        <pre>{r.before ? JSON.stringify(r.before, null, 2) : "—"}</pre>
                      </div>
                      <div>
                        <div className="muted small">Nachher</div>
                        <pre>{r.after ? JSON.stringify(r.after, null, 2) : "—"}</pre>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && !loading && (
            <tr><td colSpan={6} className="muted">Keine Einträge.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
