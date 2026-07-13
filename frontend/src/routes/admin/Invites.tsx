import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import {
  api, EMPLOYER_INVITE_STATUS_LABELS,
  type EmployerInvite, type EmployerInviteStatus, type EmployerInviteStatusFilter,
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

const INVITE_PILL: Record<EmployerInviteStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-royal/10 text-royal",
  expired: "bg-red-50 text-red-700",
  revoked: "bg-ink/10 text-ink/60",
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
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Verwaltung</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Arbeitgeber-Einladungen</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={filter}
              onChange={(v) => setFilter(v as EmployerInviteStatusFilter)}
              options={FILTERS.map((f) => ({ value: f, label: FILTER_LABELS[f] }))}
              aria-label="Statusfilter"
              className="w-44"
            />
            <Button onClick={() => setShowCreate(true)}>Neuen Invite anlegen</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["pending","accepted","expired","revoked"] as const).map((s) => (
            <div key={s} className="card p-4 sm:p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-ink/50">{EMPLOYER_INVITE_STATUS_LABELS[s]}</div>
              <div className="mt-1 text-2xl font-black tabular-nums leading-tight">{counts[s] ?? 0}</div>
            </div>
          ))}
        </div>

        {freshLink && (
          <section className="card p-4 sm:p-5">
            <h2 className="text-base font-black sm:text-lg">Einladung an {freshEmail} verschickt</h2>
            <p className="mt-1 text-sm text-ink/60">
              Der Empfänger hat die Mail bereits. Falls du den Link auch hier
              brauchst, kannst du ihn einmalig kopieren – nach dem Schließen
              ist er nicht mehr abrufbar.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-x-auto rounded-lg border border-ink/10 bg-ink/5 px-3 py-2 text-sm">{freshLink}</code>
              <Button variant="outline" onClick={copyLink}>
                {copied ? "Kopiert ✓" : "Link kopieren"}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="mt-3" onClick={dismissFresh}>
              Ausblenden
            </Button>
          </section>
        )}

        {error && (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                <th className="px-4 py-3">Empfänger</th>
                <th className="px-4 py-3">Firma</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Erstellt</th>
                <th className="px-4 py-3">Ablauf</th>
                <th className="px-4 py-3">Resend</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-4 py-3">
                    <strong>{inv.full_name || inv.email}</strong>
                    <div className="text-ink/60">{inv.email}</div>
                  </td>
                  <td className="px-4 py-3">{inv.company_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${INVITE_PILL[inv.status]}`}>
                      {EMPLOYER_INVITE_STATUS_LABELS[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/60">
                    {new Date(inv.created_at).toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-4 py-3 text-ink/60">
                    {new Date(inv.expires_at).toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-4 py-3 text-ink/60">
                    {inv.last_resent_at
                      ? new Date(inv.last_resent_at).toLocaleDateString("de-DE")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {(inv.status === "pending" || inv.status === "expired") && (
                        <Button size="sm" variant="outline" onClick={() => resend(inv)} disabled={busy}>
                          Erneut senden
                        </Button>
                      )}
                      {inv.status === "pending" && (
                        <Button size="sm" variant="danger" onClick={() => revoke(inv)}>
                          Zurückziehen
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-3 text-ink/60">Keine Einträge.</td></tr>
              )}
            </tbody>
          </table>
        </div>

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
    <Modal open onClose={onClose}>
      <h2 className="text-base font-black sm:text-lg">Neuen Arbeitgeber einladen</h2>
      <p className="mt-1 text-sm text-ink/60">
        Der Empfänger bekommt eine Mail mit Onboarding-Link. Name und
        Firmenname sind optional – wenn gesetzt, werden sie im Wizard
        vorausgefüllt.
      </p>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="field-label">E-Mail *</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="z. B. anna@beispiel.de"
          />
        </label>
        <label className="block">
          <span className="field-label">Voller Name (optional)</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Firmenname (optional)</span>
          <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>

        {error && (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Verschicke…" : "Einladung verschicken"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
