import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Shell from "../../components/Shell";
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

  if (!employer) return <Shell><div className="placeholder">Lade…</div></Shell>;

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
      <div className="employer-detail">
        <div className="dashboard-toolbar">
          <Link to="/admin" className="muted small">← zurück</Link>
          <h2 style={{ margin: 0 }}>{employer.full_name || employer.username}</h2>
          <span className="muted">@{employer.username}</span>
          <span className="spacer" />
          {employer.onboarding_pending && (
            <button onClick={resendInvite} disabled={busy}>Einladung erneut senden</button>
          )}
          {employer.offboarded_at
            ? <button onClick={reactivate} disabled={busy}>Reaktivieren</button>
            : <button onClick={offboard} disabled={busy} className="danger">Offboarden</button>}
          <button className="danger" disabled={busy} onClick={hardDelete}>
            Endgültig löschen
          </button>
        </div>

        <div className="team-summary">
          <div className="summary-tile">
            <div className="summary-label">Status</div>
            <div className={`summary-value ${employer.offboarded_at ? "negative" : "positive"}`}>
              {employer.offboarded_at
                ? "offboarded"
                : employer.onboarding_pending
                  ? "Onboarding offen"
                  : "aktiv"}
            </div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Mitarbeiter aktiv</div>
            <div className="summary-value">{counts.active}</div>
            <div className="summary-meta">
              {counts.onboardingPending > 0 && `${counts.onboardingPending} Onboarding offen`}
              {counts.onboardingPending === 0 && "alle eingerichtet"}
            </div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Offboarded</div>
            <div className="summary-value">{counts.offboarded}</div>
            <div className="summary-meta">noch in den Daten erhalten</div>
          </div>
        </div>

        <section className="card-section">
          <div className="dashboard-toolbar">
            <h3 style={{ margin: 0 }}>Stammdaten</h3>
            <span className="spacer" />
            <button onClick={() => setEditing(true)}>Bearbeiten</button>
          </div>
          <StammdatenView user={employer} />
        </section>

        {editing && (
          <div className="modal-backdrop" onClick={() => setEditing(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
              <EmployeeMasterDataForm
                user={employer}
                onSaved={(u) => { setEmployer(u); setEditing(false); }}
                onCancel={() => setEditing(false)}
              />
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
