import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import MiniLineChart from "../../components/MiniLineChart";
import MiniBarChart from "../../components/MiniBarChart";
import { api, type BalanceOut, type YearOverview } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import { fmtHours } from "../../lib/datetime";

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
                      "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export default function Year() {
  const { user } = useCurrentUser();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<YearOverview | null>(null);
  const [balance, setBalance] = useState<BalanceOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.yearOverview(year).then(setData).catch((e) => setError(e.message));
    // Saldo per heute – dieselbe Zahl unabhängig vom gewählten Jahr,
    // wird unten als „Saldo aktuell" gerendert.
    api.balance().then(setBalance).catch(() => setBalance(null));
  }, [year]);

  // Saldo-Linie endet beim letzten abgeschlossenen Monat (laufender
  // Monat hat balance_at_end=null und fliegt aus der Linie raus).
  const balancePoints = useMemo(() => {
    if (!data) return { values: [] as number[], labels: [] as string[] };
    const values: number[] = [];
    const labels: string[] = [];
    for (const m of data.months) {
      if (m.balance_at_end !== null) {
        values.push(m.balance_at_end);
        labels.push(MONTH_LABELS[m.month - 1]);
      }
    }
    return { values, labels };
  }, [data]);
  const visibleMonthLabels = useMemo(
    () => data?.months.map((m) => MONTH_LABELS[m.month - 1]) ?? MONTH_LABELS,
    [data],
  );

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
              <p className="muted small">Saldo zum Monatsende, kumuliert seit Eintritt. Zeigt nur abgeschlossene Monate.</p>
              <MiniLineChart values={balancePoints.values} labels={balancePoints.labels} height={160} />
            </section>

            <section className="card-section">
              <h3>Soll vs. Ist (Stunden)</h3>
              <p className="muted small">Nur Monate mit Daten. Künftige Monate werden nicht hochgerechnet.</p>
              <MiniBarChart
                labels={visibleMonthLabels}
                series={[
                  { name: "Soll", color: "var(--text-muted)", values: data.months.map((m) => m.target_hours) },
                  { name: "Ist", color: "var(--accent)", values: data.months.map((m) => m.actual_hours) },
                ]}
              />
            </section>

            <section className="card-section">
              <h3>Abwesenheiten pro Monat</h3>
              <MiniBarChart
                labels={visibleMonthLabels}
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
