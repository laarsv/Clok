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
        await api.employerOnboardingComplete();
        await refresh();
        // kurze visuelle Pause, dann ins Dashboard
        setTimeout(() => navigate("/employer", { replace: true }), 1500);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [navigate, refresh]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <OnboardingStepper active={5} />
      <div className="card p-6 text-center sm:p-8">
        {error ? (
          <>
            <h1 className="text-2xl font-black tracking-tight">Hm, das hat nicht geklappt</h1>
            <p className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</p>
            <button
              className="btn-primary mt-6"
              onClick={() => { ran.current = false; setError(null); }}
            >
              Nochmal versuchen
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-royal text-2xl font-black text-paper">✓</div>
            <h1 className="mt-4 text-2xl font-black tracking-tight">Alles eingerichtet</h1>
            <p className="mt-2 text-sm text-ink/60">
              Dein Account ist live. Du wirst gleich ins Team-Dashboard
              weitergeleitet.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
