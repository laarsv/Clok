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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <OnboardingStepper active={4} />
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight">Erster Mitarbeiter</h1>
        <p className="mt-2 text-sm text-ink/60">
          Magst du gleich deinen ersten Mitarbeiter anlegen? Er bekommt
          direkt einen Onboarding-Link per Mail. Du kannst das auch später
          aus dem Team-Dashboard tun – dann springst du jetzt direkt zum
          Abschluss.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn-primary flex-1" onClick={completeAndAdd} disabled={busy}>
            {busy ? "Schließe ab…" : "Mitarbeiter jetzt anlegen"}
          </button>
          <button
            className="btn-outline flex-1"
            onClick={() => navigate("/onboarding/done", { replace: true })}
            disabled={busy}
          >
            Später, jetzt abschließen
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}
      </div>
    </div>
  );
}
