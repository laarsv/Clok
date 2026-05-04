import { useEffect, useState } from "react";
import WorkDaysPicker from "./WorkDaysPicker";
import {
  legalMinVacationDays, type EmploymentTerms, type TermsPayload, type WeekDay,
} from "../api";

interface Props {
  initial?: EmploymentTerms;
  defaultValidFrom?: string; // YYYY-MM-DD
  onSubmit: (payload: TermsPayload) => Promise<void> | void;
  onCancel: () => void;
}

const DEFAULT_WORK_DAYS: WeekDay[] = ["mon", "tue", "wed", "thu", "fri"];

export default function TermsForm({ initial, defaultValidFrom, onSubmit, onCancel }: Props) {
  const [validFrom, setValidFrom] = useState(
    initial?.valid_from ?? defaultValidFrom ?? new Date().toISOString().slice(0, 10),
  );
  const [billingMode, setBillingMode] = useState(initial?.billing_mode ?? "salary");
  const [hourlyRate, setHourlyRate] = useState(initial?.hourly_rate_eur ?? 0);
  const [monthlyTarget, setMonthlyTarget] = useState(initial?.monthly_target_hours ?? 160);
  const [weeklyHours, setWeeklyHours] = useState(initial?.weekly_hours ?? 40);
  const [workDays, setWorkDays] = useState<WeekDay[]>(
    (initial?.work_days as WeekDay[] | null | undefined) ?? DEFAULT_WORK_DAYS,
  );
  const [vacation, setVacation] = useState(initial?.annual_vacation_days ?? 30);
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setValidFrom(initial.valid_from);
      setBillingMode(initial.billing_mode);
      setHourlyRate(initial.hourly_rate_eur);
      setMonthlyTarget(initial.monthly_target_hours);
      setWeeklyHours(initial.weekly_hours ?? 40);
      setWorkDays((initial.work_days as WeekDay[] | null | undefined) ?? DEFAULT_WORK_DAYS);
      setVacation(initial.annual_vacation_days ?? 30);
      setNote(initial.note ?? "");
    }
  }, [initial?.id]);

  const legalMin = legalMinVacationDays(workDays);
  const vacInvalid = vacation < legalMin;

  const submit = async () => {
    setError(null);
    if (vacInvalid) {
      setError(`Urlaub muss mindestens ${legalMin} Tage haben.`);
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        valid_from: validFrom,
        billing_mode: billingMode,
        hourly_rate_eur: hourlyRate,
        monthly_target_hours: monthlyTarget,
        weekly_hours: weeklyHours,
        work_days: workDays,
        annual_vacation_days: vacation,
        note: note || undefined,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="terms-form">
      <h3>{initial ? "Vertrag bearbeiten" : "Neuer Vertrag ab Stichtag"}</h3>
      <div className="manual-grid">
        <label>Stichtag (gilt ab)<input type="date" value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)} /></label>
        <label>Abrechnung
          <select value={billingMode} onChange={(e) => setBillingMode(e.target.value as any)}>
            <option value="salary">Festgehalt</option>
            <option value="hourly">Stundenbasis</option>
          </select>
        </label>
        {billingMode === "hourly"
          ? <label>Stundensatz (EUR)<input type="number" step="0.01" value={hourlyRate}
              onChange={(e) => setHourlyRate(parseFloat(e.target.value || "0"))} /></label>
          : <label>Soll-Stunden / Monat<input type="number" step="0.5" value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(parseFloat(e.target.value || "0"))} /></label>}
        <label>Wochenstunden<input type="number" step="0.5" value={weeklyHours}
          onChange={(e) => setWeeklyHours(parseFloat(e.target.value || "0"))} /></label>
        <label className="full">Arbeitstage pro Woche
          <WorkDaysPicker value={workDays} onChange={setWorkDays} />
        </label>
        <label>Urlaub/Jahr (Tage)
          <input type="number" value={vacation}
            onChange={(e) => setVacation(parseFloat(e.target.value || "0"))} />
          <span className={`hint ${vacInvalid ? "hint-error" : ""}`}>
            Mindestens {legalMin} Tage (BUrlG § 3) bei {workDays.length}-Tage-Woche.
          </span>
        </label>
        <label className="full">Notiz (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder='z. B. "Gehaltserhöhung 2026"' />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button onClick={submit} disabled={busy || vacInvalid}>
          {busy ? "Speichere…" : "Speichern"}
        </button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
