import { useEffect, useMemo, useState } from "react";
import Shell from "../components/Shell";
import MiniLineChart from "../components/MiniLineChart";
import MiniBarChart from "../components/MiniBarChart";
import {
  api, type BalanceOut, type PeriodKpiOut, type YearOverview,
} from "../api";
import { useCurrentUser } from "../auth/CurrentUser";
import { fmtHours, isoDate } from "../lib/datetime";

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
                      "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

type Preset = "current_month" | "last_month" | "current_quarter" | "current_year" | "custom";
const PRESET_LABELS: Record<Preset, string> = {
  current_month: "Aktueller Monat",
  last_month: "Letzter Monat",
  current_quarter: "Aktuelles Quartal",
  current_year: "Aktuelles Jahr",
  custom: "Benutzerdefiniert",
};
const PRESETS: Preset[] = [
  "current_month", "last_month", "current_quarter", "current_year", "custom",
];

interface Range { start: Date; end: Date; }

function startOfDay(d: Date): Date {
  const o = new Date(d); o.setHours(0, 0, 0, 0); return o;
}

function rangeFromPreset(preset: Preset, custom?: Range): Range {
  const today = startOfDay(new Date());
  if (preset === "current_month") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
  }
  if (preset === "last_month") {
    const lastEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const lastStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { start: lastStart, end: lastEnd };
  }
  if (preset === "current_quarter") {
    const q = Math.floor(today.getMonth() / 3);
    const start = new Date(today.getFullYear(), q * 3, 1);
    return { start, end: today };
  }
  if (preset === "current_year") {
    return { start: new Date(today.getFullYear(), 0, 1), end: today };
  }
  // custom
  return custom ?? { start: today, end: today };
}

export default function Dashboard() {
  const { user } = useCurrentUser();
  const [preset, setPreset] = useState<Preset>("current_year");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // Effektiver Zeitraum aus Preset oder Custom-Inputs.
  const range = useMemo<Range>(() => {
    if (preset === "custom" && customStart && customEnd) {
      const s = new Date(customStart); const e = new Date(customEnd);
      const today = startOfDay(new Date());
      // End-Datum auf heute klemmen – nirgendwo Werte für die Zukunft.
      return { start: startOfDay(s), end: e > today ? today : startOfDay(e) };
    }
    return rangeFromPreset(preset);
  }, [preset, customStart, customEnd]);

  const [kpis, setKpis] = useState<PeriodKpiOut | null>(null);
  const [balance, setBalance] = useState<BalanceOut | null>(null);
  const [yearData, setYearData] = useState<YearOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const start = isoDate(range.start);
    const end = isoDate(range.end);
    api.periodKpis(start, end).then(setKpis).catch((e) => setError(e.message));
    api.balance().then(setBalance).catch(() => setBalance(null));
    // Jahr für Charts laden – unabhängig vom Filter, FE filtert dann
    // auf die im Range liegenden Monate.
    api.yearOverview(range.start.getFullYear()).then(setYearData)
      .catch(() => setYearData(null));
  }, [range.start.getTime(), range.end.getTime()]);

  // Charts: nur Monate aus year_overview, deren 1. im Range liegt.
  const chartMonths = useMemo(() => {
    if (!yearData) return [];
    return yearData.months.filter((m) => {
      const mStart = new Date(yearData.year, m.month - 1, 1);
      return mStart >= new Date(range.start.getFullYear(), range.start.getMonth(), 1)
        && mStart <= range.end;
    });
  }, [yearData, range]);

  const chartLabels = chartMonths.map((m) => MONTH_LABELS[m.month - 1]);

  const balanceChart = useMemo(() => {
    const values: number[] = [];
    const labels: string[] = [];
    for (const m of chartMonths) {
      if (m.balance_at_end !== null) {
        values.push(m.balance_at_end);
        labels.push(MONTH_LABELS[m.month - 1]);
      }
    }
    return { values, labels };
  }, [chartMonths]);

  if (!user) return null;

  return (
    <Shell>
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <h2>Dashboard</h2>
        </div>

        <section className="card-section dashboard-filter">
          <div className="filter-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`preset-pill ${preset === p ? "active" : ""}`}
                onClick={() => setPreset(p)}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="filter-custom">
              <label>Von
                <input type="date" value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)} />
              </label>
              <label>Bis
                <input type="date" value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)} />
              </label>
            </div>
          )}
          <p className="muted small range-display">
            Zeitraum: {range.start.toLocaleDateString("de-DE")} – {range.end.toLocaleDateString("de-DE")}
          </p>
        </section>

        {error && <div className="error">{error}</div>}

        <div className="team-summary">
          <div className="summary-tile">
            <div className="summary-label">Stunden Ist</div>
            <div className="summary-value">
              {kpis ? fmtHours(kpis.actual_hours) : "—"}
            </div>
            <div className="summary-meta">
              {kpis ? `von ${fmtHours(kpis.target_hours)} Soll` : ""}
            </div>
          </div>

          <div className="summary-tile">
            <div className="summary-label">Saldo aktuell</div>
            <div className={`summary-value ${
              balance && balance.balance_hours > 0.5 ? "positive"
                : balance && balance.balance_hours < -0.5 ? "negative" : ""
            }`}>
              {balance
                ? `${balance.balance_hours > 0 ? "+" : ""}${balance.balance_hours.toFixed(1)} h`
                : "—"}
            </div>
            <div className="summary-meta">
              {balance
                ? `${fmtHours(balance.actual_hours_to_date)} Ist gegen ${fmtHours(balance.target_hours_to_date)} Soll`
                : "Stichtag heute"}
            </div>
          </div>

          <div className="summary-tile">
            <div className="summary-label">Urlaub</div>
            <div className="summary-value">{kpis ? `${kpis.vacation_days} d` : "—"}</div>
            <div className="summary-meta">
              {yearData ? `${yearData.vacation_remaining} Tage übrig` : ""}
            </div>
          </div>

          <div className="summary-tile">
            <div className="summary-label">Krankheit</div>
            <div className="summary-value">{kpis ? `${kpis.sick_days} d` : "—"}</div>
            <div className="summary-meta">im Zeitraum</div>
          </div>
        </div>

        {chartMonths.length > 0 && (
          <>
            <section className="card-section">
              <h3>Saldo-Verlauf</h3>
              <p className="muted small">
                Saldo zum Monatsende, kumuliert seit Eintritt. Nur abgeschlossene Monate im Zeitraum.
              </p>
              {balanceChart.values.length > 0 ? (
                <MiniLineChart values={balanceChart.values} labels={balanceChart.labels} height={160} />
              ) : (
                <p className="muted small">Im gewählten Zeitraum gibt es noch keine abgeschlossenen Monate.</p>
              )}
            </section>

            <section className="card-section">
              <h3>Soll vs. Ist (Stunden)</h3>
              <MiniBarChart
                labels={chartLabels}
                series={[
                  { name: "Soll", color: "var(--text-muted)", values: chartMonths.map((m) => m.target_hours) },
                  { name: "Ist", color: "var(--accent)", values: chartMonths.map((m) => m.actual_hours) },
                ]}
              />
            </section>

            <section className="card-section">
              <h3>Abwesenheiten pro Monat</h3>
              <MiniBarChart
                labels={chartLabels}
                series={[
                  { name: "Urlaub", color: "var(--accent)", values: chartMonths.map((m) => m.vacation_days) },
                  { name: "Krankheit", color: "var(--error)", values: chartMonths.map((m) => m.sick_days) },
                  { name: "Sonstiges", color: "var(--warning)", values: chartMonths.map((m) => m.other_absence_days) },
                ]}
              />
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
