import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import OnboardingStepper from "../../components/OnboardingStepper";

export default function OnboardingFirstEmployee() {
  const navigate = useNavigate();
  const { refresh } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Schließt den Wizard (status → active) und springt direkt ins
   *  bestehende Mitarbeiter-Anlegen-Formular. Welcome- und Admin-
   *  Completed-Mails gehen dabei raus, wie auf Step 5 auch. */
  const completeAndAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.employerOnboardingComplete();
      await refresh();
      navigate("/employer/employees/new", { replace: true });
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="onboarding-shell">
      <OnboardingStepper active={4} />
      <div className="card onboarding-card">
        <h2>Erster Mitarbeiter</h2>
        <p className="muted">
          Magst du gleich deinen ersten Mitarbeiter anlegen? Er bekommt
          direkt einen Onboarding-Link per Mail. Du kannst das auch später
          aus dem Team-Dashboard tun – dann springst du jetzt direkt zum
          Abschluss.
        </p>

        <div className="onboarding-actions">
          <button className="primary" onClick={completeAndAdd} disabled={busy}>
            {busy ? "Schließe ab…" : "Mitarbeiter jetzt anlegen"}
          </button>
          <button
            onClick={() => navigate("/onboarding/done", { replace: true })}
            disabled={busy}
          >
            Später, jetzt abschließen
          </button>
        </div>

        {error && <div className="error" style={{ marginTop: "0.8rem" }}>{error}</div>}
      </div>
    </div>
  );
}
