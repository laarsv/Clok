import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import {
  api, EMPLOYER_INVITE_STATUS_LABELS,
  type EmployerInvite, type EmployerInviteStatusFilter,
} from "../../api";

const FILTERS: EmployerInviteStatusFilter[] = [
  "all", "pending", "accepted", "expired", "revoked",
];

const FILTER_LABELS: Record<EmployerInviteStatusFilter, string> = {
  all: "Alle",
  pending: "Offen",
  accepted: "Eingelöst",
  expired: "Abgelaufen",
  revoked: "Zurückgezogen",
};

export default function AdminInvites() {
  const [list, setList] = useState<EmployerInvite[]>([]);
  const [filter, setFilter] = useState<EmployerInviteStatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Frisch erstellter Invite – Klartext-Link wird einmalig angezeigt.
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [freshEmail, setFreshEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const r = await api.listEmployerInvites(filter);
      setList(r);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { load(); }, [filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, accepted: 0, expired: 0, revoked: 0 };
    for (const i of list) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [list]);

  const onCreated = (link: string, email: string) => {
    setFreshLink(link);
    setFreshEmail(email);
    setCopied(false);
    setShowCreate(false);
    load();
  };

  const copyLink = async () => {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: Prompt – manche Browser blocken clipboard-API ohne HTTPS
      window.prompt("Link kopieren:", freshLink);
    }
  };

  const dismissFresh = () => {
    setFreshLink(null);
    setFreshEmail(null);
  };

  const revoke = async (inv: EmployerInvite) => {
    if (!confirm(`Invite an ${inv.email} wirklich zurückziehen?`)) return;
    try {
      await api.deleteEmployerInvite(inv.id);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const resend = async (inv: EmployerInvite) => {
    if (!confirm(
      `Invite an ${inv.email} erneut senden?\n` +
      `Achtung: der bisherige Link wird ungültig, nur der neue Link in der Mail funktioniert.`
    )) return;
    setBusy(true);
    try {
      await api.resendEmployerInvite(inv.id);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Shell>
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <h2>Arbeitgeber-Einladungen</h2>
          <span className="spacer" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as EmployerInviteStatusFilter)}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>{FILTER_LABELS[f]}</option>
            ))}
          </select>
          <button className="primary" onClick={() => setShowCreate(true)}>
            Neuen Invite anlegen
          </button>
        </div>

        <div className="team-summary">
          {(["pending","accepted","expired","revoked"] as const).map((s) => (
            <div key={s} className="summary-tile">
              <div className="summary-label">{EMPLOYER_INVITE_STATUS_LABELS[s]}</div>
              <div className="summary-value">{counts[s] ?? 0}</div>
            </div>
          ))}
        </div>

        {freshLink && (
          <section className="card-section invite-fresh">
            <h3>Einladung an {freshEmail} verschickt</h3>
            <p className="muted small">
              Der Empfänger hat die Mail bereits. Falls du den Link auch hier
              brauchst, kannst du ihn einmalig kopieren – nach dem Schließen
              ist er nicht mehr abrufbar.
            </p>
            <div className="invite-link-row">
              <code className="invite-link">{freshLink}</code>
              <button onClick={copyLink}>
                {copied ? "Kopiert ✓" : "Link kopieren"}
              </button>
            </div>
            <button onClick={dismissFresh} style={{ marginTop: "0.6rem" }}>
              Ausblenden
            </button>
          </section>
        )}

        {error && <div className="error">{error}</div>}

        <table>
          <thead>
            <tr>
              <th>Empfänger</th>
              <th>Firma</th>
              <th>Status</th>
              <th>Erstellt</th>
              <th>Ablauf</th>
              <th>Resend</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <strong>{inv.full_name || inv.email}</strong>
                  <div className="muted small">{inv.email}</div>
                </td>
                <td>{inv.company_name || "—"}</td>
                <td>
                  <span className={`status invite-status-${inv.status}`}>
                    {EMPLOYER_INVITE_STATUS_LABELS[inv.status]}
                  </span>
                </td>
                <td className="muted small">
                  {new Date(inv.created_at).toLocaleDateString("de-DE")}
                </td>
                <td className="muted small">
                  {new Date(inv.expires_at).toLocaleDateString("de-DE")}
                </td>
                <td className="muted small">
                  {inv.last_resent_at
                    ? new Date(inv.last_resent_at).toLocaleDateString("de-DE")
                    : "—"}
                </td>
                <td className="action-cell">
                  {(inv.status === "pending" || inv.status === "expired") && (
                    <button onClick={() => resend(inv)} disabled={busy}>
                      Erneut senden
                    </button>
                  )}
                  {inv.status === "pending" && (
                    <button className="danger" onClick={() => revoke(inv)}>
                      Zurückziehen
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={7} className="muted">Keine Einträge.</td></tr>
            )}
          </tbody>
        </table>

        {showCreate && (
          <CreateInviteModal
            onClose={() => setShowCreate(false)}
            onCreated={onCreated}
          />
        )}
      </div>
    </Shell>
  );
}


function CreateInviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (link: string, email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim()) { setError("E-Mail ist Pflicht."); return; }
    setBusy(true);
    try {
      const res = await api.createEmployerInvite({
        email: email.trim(),
        full_name: fullName.trim() || undefined,
        company_name: companyName.trim() || undefined,
      });
      onCreated(res.onboarding_url, res.invite.email);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <h3>Neuen Arbeitgeber einladen</h3>
        <p className="muted small">
          Der Empfänger bekommt eine Mail mit Onboarding-Link. Name und
          Firmenname sind optional – wenn gesetzt, werden sie im Wizard
          vorausgefüllt.
        </p>

        <label>E-Mail *
          <input type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="z. B. anna@beispiel.de" />
        </label>
        <label>Voller Name (optional)
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>Firmenname (optional)
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose}>Abbrechen</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? "Verschicke…" : "Einladung verschicken"}
          </button>
        </div>
      </div>
    </div>
  );
}
