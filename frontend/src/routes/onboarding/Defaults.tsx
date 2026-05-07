import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type BillingMode, type FederalState } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import OnboardingStepper from "../../components/OnboardingStepper";

const STATES: FederalState[] = [
  "BW","BY","BE","BB","HB","HH","HE","MV",
  "NI","NW","RP","SL","SN","ST","SH","TH",
];

export default function OnboardingDefaults() {
  const navigate = useNavigate();
  const { refresh } = useCurrentUser();

  const [weeklyHours, setWeeklyHours] = useState<number>(40);
  const [vacationDays, setVacationDays] = useState<number>(28);
  const [bundesland, setBundesland] = useState<FederalState>("NW");
  const [billingMode, setBillingMode] = useState<BillingMode>("salary");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (weeklyHours <= 0 || weeklyHours > 80) {
      setError("Wochenstunden müssen zwischen 1 und 80 liegen.");
      return;
    }
    if (vacationDays < 0 || vacationDays > 60) {
      setError("Urlaubstage zwischen 0 und 60.");
      return;
    }
    setBusy(true);
    try {
      await api.onboardingPostDefaults({
        default_weekly_hours: weeklyHours,
        default_vacation_days: vacationDays,
        default_bundesland: bundesland,
        default_billing_mode: billingMode,
      });
      await refresh();
      navigate("/onboarding/first-employee", { replace: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding-shell">
      <OnboardingStepper active={3} />
      <div className="card onboarding-card">
        <h2>Standardwerte für Mitarbeiter</h2>
        <p className="muted">
          Vorbelegung beim Anlegen neuer Mitarbeiter. Pro Mitarbeiter
          überschreibbar – das hier sind nur Defaults.
        </p>

        <div className="manual-grid">
          <label>Wochenstunden
            <input type="number" min={1} max={80} step={0.5}
              value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value))} />
          </label>
          <label>Urlaubstage / Jahr
            <input type="number" min={0} max={60} step={0.5}
              value={vacationDays} onChange={(e) => setVacationDays(Number(e.target.value))} />
          </label>
          <label>Bundesland (Default für Feiertage)
            <select value={bundesland} onChange={(e) => setBundesland(e.target.value as FederalState)}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Abrechnungsmodell
            <select value={billingMode} onChange={(e) => setBillingMode(e.target.value as BillingMode)}>
              <option value="salary">Festgehalt (Soll-Stunden)</option>
              <option value="hourly">Stundenbasis</option>
            </select>
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={busy} style={{ marginTop: "0.8rem" }}>
          {busy ? "Speichere…" : "Weiter"}
        </button>
      </div>
    </div>
  );
}
