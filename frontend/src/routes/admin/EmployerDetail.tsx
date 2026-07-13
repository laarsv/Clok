import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmployeeMasterDataForm from "../../components/EmployeeMasterDataForm";
import StammdatenView from "../../components/StammdatenView";
import { api, type User } from "../../api";

/** Drill-Down auf einen Arbeitgeber – aus Admin-Sicht.
 *  Bewusst KEINE Mitarbeiter-Liste mit Namen/Daten: Admin sieht nur
 *  Anzahl der MA pro Arbeitgeber, nicht die einzelnen Personen. */
export default function EmployerDetail() {
  const { id } = useParams<{ id: string }>();
  const employerId = Number(id);
  const navigate = useNavigate();
  const [employer, setEmployer] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [emp, all] = await Promise.all([
      api.getEmployee(employerId),
      api.listEmployees(true),
    ]);
    setEmployer(emp);
    setAllUsers(all);
  };
  useEffect(() => { load(); }, [employerId]);

  const counts = useMemo(() => {
    const team = allUsers.filter((u) => u.role === "employee" && u.supervisor_id === employerId);
    return {
      active: team.filter((u) => !u.offboarded_at).length,
      offboarded: team.filter((u) => u.offboarded_at).length,
      onboardingPending: team.filter((u) => u.onboarding_pending && !u.offboarded_at).length,
    };
  }, [allUsers, employerId]);

  if (!employer) return <Shell><div className="p-12 text-center text-ink/50">Lade…</div></Shell>;

  const offboard = async () => {
    if (!confirm(`${employer.full_name || employer.username} offboarden?`)) return;
    setBusy(true);
    try {
      const u = await api.offboardEmployee(employer.id);
      setEmployer(u);
    } finally { setBusy(false); }
  };
  const reactivate = async () => {
    setBusy(true);
    try {
      const u = await api.reactivateEmployee(employer.id);
      setEmployer(u);
    } finally { setBusy(false); }
  };
  const resendInvite = async () => {
    setBusy(true);
    try {
      const u = await api.resendInvite(employer.id);
      setEmployer(u);
      alert("Einladung erneut gesendet.");
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };
  const hardDelete = async () => {
    const ok = confirm(
      `Arbeitgeber "${employer.full_name || employer.username}" endgültig löschen?\n\n` +
      `Es werden ALLE Daten unwiderruflich entfernt. Mitarbeiter unter diesem ` +
      `Arbeitgeber stehen danach ohne Vorgesetzten da – sie müssen einem ` +
      `anderen Arbeitgeber zugewiesen oder selbst gelöscht werden.\n\n` +
      `Trotzdem fortfahren?`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.hardDeleteEmployee(employer.id);
      navigate("/admin");
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <Link to="/admin" className="text-sm font-bold text-royal hover:underline">← zurück</Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Arbeitgeber</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{employer.full_name || employer.username}</h1>
              <div className="mt-1 text-sm text-ink/50">@{employer.username}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {employer.onboarding_pending && (
                <Button variant="outline" onClick={resendInvite} disabled={busy}>Einladung erneut senden</Button>
              )}
              {employer.offboarded_at
                ? <Button variant="outline" onClick={reactivate} disabled={busy}>Reaktivieren</Button>
                : <Button variant="danger" onClick={offboard} disabled={busy}>Offboarden</Button>}
              <Button variant="danger" disabled={busy} onClick={hardDelete}>Endgültig löschen</Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card p-4 sm:p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-ink/50">Status</div>
            <div className={`mt-1 text-2xl font-black leading-tight ${employer.offboarded_at ? "text-red-600" : "text-royal"}`}>
              {employer.offboarded_at
                ? "offboarded"
                : employer.onboarding_pending
                  ? "Onboarding offen"
                  : "aktiv"}
            </div>
          </div>
          <div className="card p-4 sm:p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-ink/50">Mitarbeiter aktiv</div>
            <div className="mt-1 text-2xl font-black tabular-nums leading-tight">{counts.active}</div>
            <div className="mt-1 text-xs text-ink/60">
              {counts.onboardingPending > 0 && `${counts.onboardingPending} Onboarding offen`}
              {counts.onboardingPending === 0 && "alle eingerichtet"}
            </div>
          </div>
          <div className="card p-4 sm:p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-ink/50">Offboarded</div>
            <div className="mt-1 text-2xl font-black tabular-nums leading-tight">{counts.offboarded}</div>
            <div className="mt-1 text-xs text-ink/60">noch in den Daten erhalten</div>
          </div>
        </div>

        <section className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-black sm:text-lg">Stammdaten</h2>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Bearbeiten</Button>
          </div>
          <div className="mt-4">
            <StammdatenView user={employer} />
          </div>
        </section>

        <Modal open={editing} onClose={() => setEditing(false)} className="sm:max-w-2xl">
          <EmployeeMasterDataForm
            user={employer}
            onSaved={(u) => { setEmployer(u); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      </div>
    </Shell>
  );
}
