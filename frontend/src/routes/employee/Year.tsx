import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import MiniLineChart from "../../components/MiniLineChart";
import MiniBarChart from "../../components/MiniBarChart";
import { api, type YearOverview } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import { fmtHours } from "../../lib/datetime";

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
                      "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export default function Year() {
  const { user } = useCurrentUser();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<YearOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.yearOverview(year).then(setData).catch((e) => setError(e.message));
  }, [year]);

  const balanceTrend = useMemo(() => data?.months.map((m) => m.balance_at_end) ?? [], [data]);
  const balanceChange = data ? data.balance_at_year_end - data.balance_at_year_start : 0;

  if (!user) return null;

  return (
    <Shell>
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <h2>Jahr · {year}</h2>
          <span className="spacer" />
          <button onClick={() => setYear(year - 1)}>← {year - 1}</button>
          <button onClick={() => setYear(year + 1)} disabled={year >= thisYear + 1}>
            {year + 1} →
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {!data ? <div className="placeholder">Lade…</div> : (
          <>
            <div className="team-summary">
              <div className="summary-tile">
                <div className="summary-label">Stunden gesamt</div>
                <div className="summary-value">{fmtHours(data.total_actual)}</div>
                <div className="summary-meta">von {fmtHours(data.total_target)} Soll</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Saldo Jahresende</div>
                <div className={`summary-value ${data.balance_at_year_end > 0.5 ? "positive" : data.balance_at_year_end < -0.5 ? "negative" : ""}`}>
                  {data.balance_at_year_end > 0 ? "+" : ""}{data.balance_at_year_end.toFixed(1)} h
                </div>
                <div className="summary-meta">
                  Veränderung: {balanceChange > 0 ? "+" : ""}{balanceChange.toFixed(1)} h
                </div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Urlaub</div>
                <div className="summary-value">{data.vacation_used} d</div>
                <div className="summary-meta">{data.vacation_remaining} Tage übrig</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Krankheit</div>
                <div className="summary-value">{data.sick_total} d</div>
                <div className="summary-meta">{year}</div>
              </div>
            </div>

            <section className="card-section">
              <h3>Saldo-Verlauf</h3>
              <p className="muted small">Saldo zum Monatsende, kumuliert seit Eintritt.</p>
              <MiniLineChart values={balanceTrend} labels={MONTH_LABELS} height={160} />
            </section>

            <section className="card-section">
              <h3>Soll vs. Ist (Stunden)</h3>
              <MiniBarChart
                labels={MONTH_LABELS}
                series={[
                  { name: "Soll", color: "var(--text-muted)", values: data.months.map((m) => m.target_hours) },
                  { name: "Ist", color: "var(--accent)", values: data.months.map((m) => m.actual_hours) },
                ]}
              />
            </section>

            <section className="card-section">
              <h3>Abwesenheiten pro Monat</h3>
              <MiniBarChart
                labels={MONTH_LABELS}
                series={[
                  { name: "Urlaub", color: "var(--accent)", values: data.months.map((m) => m.vacation_days) },
                  { name: "Krankheit", color: "var(--error)", values: data.months.map((m) => m.sick_days) },
                  { name: "Sonstiges", color: "var(--warning)", values: data.months.map((m) => m.other_absence_days) },
                ]}
              />
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
