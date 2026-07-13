import { useEffect, useState } from "react";
import WorkDaysPicker from "./WorkDaysPicker";
import Button from "./ui/Button";
import Select from "./ui/Select";
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
    <div>
      <h3 className="text-lg font-black">{initial ? "Vertrag bearbeiten" : "Neuer Vertrag ab Stichtag"}</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Stichtag (gilt ab)</span>
          <input className="input" type="date" value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <div>
          <span className="field-label">Abrechnung</span>
          <Select
            value={billingMode}
            onChange={(v) => setBillingMode(v as any)}
            options={[
              { value: "salary", label: "Festgehalt" },
              { value: "hourly", label: "Stundenbasis" },
            ]}
            aria-label="Abrechnung"
          />
        </div>
        {billingMode === "hourly" && (
          <label className="block">
            <span className="field-label">Stundensatz (EUR)</span>
            <input className="input" type="number" step="0.01" value={hourlyRate}
              onChange={(e) => setHourlyRate(parseFloat(e.target.value || "0"))} />
          </label>
        )}
        <label className="block">
          <span className="field-label">Wochenstunden</span>
          <input className="input" type="number" step="0.5" value={weeklyHours}
            onChange={(e) => setWeeklyHours(parseFloat(e.target.value || "0"))} />
          <span className="mt-1 block text-xs text-ink/60">
            Soll/Monat wird automatisch aus Wochenstunden, Arbeitstagen und
            Feiertagen des Bundeslandes berechnet.
          </span>
        </label>
        <div className="sm:col-span-2">
          <span className="field-label">Arbeitstage pro Woche</span>
          <WorkDaysPicker value={workDays} onChange={setWorkDays} />
        </div>
        <label className="block">
          <span className="field-label">Urlaub/Jahr (Tage)</span>
          <input className="input" type="number" value={vacation}
            onChange={(e) => setVacation(parseFloat(e.target.value || "0"))} />
          <span className={`mt-1 block text-xs ${vacInvalid ? "text-red-600" : "text-ink/60"}`}>
            Mindestens {legalMin} Tage (BUrlG § 3) bei {workDays.length}-Tage-Woche.
          </span>
        </label>
        <label className="block sm:col-span-2">
          <span className="field-label">Notiz (optional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder='z. B. "Gehaltserhöhung 2026"' />
        </label>
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button onClick={submit} disabled={busy || vacInvalid}>
          {busy ? "Speichere…" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}
