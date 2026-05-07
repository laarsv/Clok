import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import OnboardingStepper from "../../components/OnboardingStepper";

export default function OnboardingDone() {
  const navigate = useNavigate();
  const { refresh } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // Strict-Mode-sicher: nur einmal feuern.
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        await api.onboardingComplete();
        await refresh();
        // kurze visuelle Pause, dann ins Dashboard
        setTimeout(() => navigate("/employer", { replace: true }), 1500);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [navigate, refresh]);

  return (
    <div className="onboarding-shell">
      <OnboardingStepper active={5} />
      <div className="card onboarding-card center-text">
        {error ? (
          <>
            <h2>Hm, das hat nicht geklappt</h2>
            <p className="error">{error}</p>
            <button onClick={() => { ran.current = false; setError(null); }}>
              Nochmal versuchen
            </button>
          </>
        ) : (
          <>
            <div className="onboarding-checkmark">✓</div>
            <h2>Alles eingerichtet</h2>
            <p className="muted">
              Dein Account ist live. Du wirst gleich ins Team-Dashboard
              weitergeleitet.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
