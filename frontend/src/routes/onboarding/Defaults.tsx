import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type BillingMode, type FederalState } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import OnboardingStepper from "../../components/OnboardingStepper";
import Select from "../../components/ui/Select";

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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <OnboardingStepper active={3} />
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight">Standardwerte für Mitarbeiter</h1>
        <p className="mt-2 text-sm text-ink/60">
          Vorbelegung beim Anlegen neuer Mitarbeiter. Pro Mitarbeiter
          überschreibbar – das hier sind nur Defaults.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Wochenstunden</span>
            <input className="input" type="number" min={1} max={80} step={0.5}
              value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="field-label">Urlaubstage / Jahr</span>
            <input className="input" type="number" min={0} max={60} step={0.5}
              value={vacationDays} onChange={(e) => setVacationDays(Number(e.target.value))} />
          </label>
          <div>
            <span className="field-label">Bundesland (Default für Feiertage)</span>
            <Select
              value={bundesland}
              onChange={(v) => setBundesland(v as FederalState)}
              options={STATES.map((s) => ({ value: s, label: s }))}
              aria-label="Bundesland (Default für Feiertage)"
            />
          </div>
          <div>
            <span className="field-label">Abrechnungsmodell</span>
            <Select
              value={billingMode}
              onChange={(v) => setBillingMode(v as BillingMode)}
              options={[
                { value: "salary", label: "Festgehalt (Soll-Stunden)" },
                { value: "hourly", label: "Stundenbasis" },
              ]}
              aria-label="Abrechnungsmodell"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}
        <button onClick={submit} disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "Speichere…" : "Weiter"}
        </button>
      </div>
    </div>
  );
}
