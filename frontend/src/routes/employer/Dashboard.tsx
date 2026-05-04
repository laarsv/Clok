import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import Donut from "../../components/Donut";
import HoursBar from "../../components/HoursBar";
import { api, type EmployerDashboardData, type EmployerDashboardRow } from "../../api";
import { fmtHours } from "../../lib/datetime";

type SortKey = "name" | "balance-asc" | "vacation-low" | "last-activity";

const MONTH_LABEL = (ref: string): string => {
  const [y, m] = ref.split("-").map(Number);
  return new Date(y, (m - 1), 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<EmployerDashboardData | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");

  useEffect(() => { api.employerDashboard().then(setData); }, []);

  const aggregate = useMemo(() => {
    if (!data) return null;
    const active = data.employees.filter((r) => !r.offboarded_at);
    return {
      activeCount: active.length,
      offboardedCount: data.employees.length - active.length,
      totalActual: active.reduce((s, r) => s + r.actual_hours_month, 0),
      totalTarget: active.reduce((s, r) => s + r.target_hours_month, 0),
      totalBalance: active.reduce((s, r) => s + r.balance_hours, 0),
      totalRemainingVacation: active.reduce((s, r) => s + r.vacation_remaining, 0),
      totalSickMonth: active.reduce((s, r) => s + r.sick_days_month, 0),
      employeesAtRisk: active.filter((r) => r.balance_hours < -8).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = showOff ? data.employees : data.employees.filter((r) => !r.offboarded_at);
    rows = [...rows].sort((a, b) => {
      if (sort === "balance-asc") return a.balance_hours - b.balance_hours;
      if (sort === "vacation-low") return a.vacation_remaining - b.vacation_remaining;
      if (sort === "last-activity") {
        const av = a.last_activity ?? "";
        const bv = b.last_activity ?? "";
        return av < bv ? 1 : av > bv ? -1 : 0;
      }
      return (a.full_name || a.username).localeCompare(b.full_name || b.username, "de");
    });
    return rows;
  }, [data, showOff, sort]);

  if (!data || !aggregate) return <Shell><div className="placeholder">Lade…</div></Shell>;

  return (
    <Shell>
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <h2>Team · {MONTH_LABEL(data.reference_month)}</h2>
          <span className="spacer" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="name">Sortierung: Name</option>
            <option value="balance-asc">Saldo: Minus zuerst</option>
            <option value="vacation-low">Resturlaub: am wenigsten zuerst</option>
            <option value="last-activity">Letzte Aktivität</option>
          </select>
          <label className="toggle">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
            <span>Offboarded</span>
          </label>
          <button onClick={() => navigate("/employer/employees/new")}>+ Mitarbeiter</button>
        </div>

        <div className="team-summary">
          <SummaryTile label="Aktive Mitarbeiter" value={String(aggregate.activeCount)}
            meta={aggregate.offboardedCount > 0 ? `+ ${aggregate.offboardedCount} offboarded` : undefined} />
          <SummaryTile label="Stunden im Monat"
            value={fmtHours(aggregate.totalActual)}
            meta={`von ${fmtHours(aggregate.totalTarget)} Soll`} />
          <SummaryTile label="Team-Saldo"
            value={`${aggregate.totalBalance > 0 ? "+" : ""}${aggregate.totalBalance.toFixed(1)} h`}
            valueClass={aggregate.totalBalance < -0.5 ? "negative" : aggregate.totalBalance > 0.5 ? "positive" : ""}
            meta={aggregate.employeesAtRisk > 0
              ? `${aggregate.employeesAtRisk} mit > 8 h im Minus`
              : "alle in Ordnung"} />
          <SummaryTile label="Resturlaub gesamt"
            value={`${aggregate.totalRemainingVacation.toFixed(0)} d`}
            meta={aggregate.totalSickMonth > 0
              ? `${aggregate.totalSickMonth} Krank-Tage im Monat`
              : "keine Krankheit im Monat"} />
        </div>

        <div className="employee-cards">
          {filtered.map((r) => (
            <EmployeeCard key={r.id} row={r}
              onOpen={() => navigate(`/employer/employees/${r.id}`)} />
          ))}
          {filtered.length === 0 && <div className="muted">Keine Mitarbeiter.</div>}
        </div>
      </div>
    </Shell>
  );
}

function SummaryTile({
  label, value, meta, valueClass = "",
}: { label: string; value: string; meta?: string; valueClass?: string }) {
  return (
    <div className="summary-tile">
      <div className="summary-label">{label}</div>
      <div className={`summary-value ${valueClass}`}>{value}</div>
      {meta && <div className="summary-meta">{meta}</div>}
    </div>
  );
}

function EmployeeCard({ row, onOpen }: { row: EmployerDashboardRow; onOpen: () => void }) {
  const initials = (row.full_name || row.username)
    .split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const vacationTotal = Math.max(row.vacation_used + row.vacation_remaining, 0);
  const vacationLow = row.vacation_remaining <= 0;
  const balance = row.balance_hours;
  const balanceClass = balance > 0.05 ? "positive" : balance < -0.05 ? "negative" : "";
  const balanceDisplay = balance > 0 ? `+${balance.toFixed(1)} h`
    : balance < 0 ? `${balance.toFixed(1)} h` : "±0 h";
  const offboarded = !!row.offboarded_at;

  return (
    <div className={`emp-card ${offboarded ? "is-offboarded" : ""}`} onClick={onOpen}>
      <div className="emp-card-head">
        <div className="emp-avatar">{initials || "?"}</div>
        <div className="emp-card-title">
          <strong>{row.full_name || row.username}</strong>
          <span className="muted small">@{row.username}</span>
        </div>
        <span className={`status ${offboarded ? "status-rejected" : "status-approved"}`}>
          {offboarded ? "offboarded" : "aktiv"}
        </span>
      </div>

      <div className="emp-card-body">
        <Donut
          value={row.vacation_used}
          max={vacationTotal}
          centerLabel={`${Math.max(0, row.vacation_remaining).toFixed(0)}`}
          centerSub="Tage übrig"
          color={vacationLow ? "var(--error)" : "var(--accent)"}
        />
        <div className="emp-stats">
          <div className="stat-row">
            <span className="stat-label">Stunden Monat</span>
            <HoursBar actual={row.actual_hours_month} target={row.target_hours_month} />
          </div>
          <div className="stat-row stat-row-inline">
            <span className="stat-label">Saldo</span>
            <span className={`balance-pill ${balanceClass}`}>{balanceDisplay}</span>
          </div>
          <div className="stat-row-mini">
            <Mini label="Urlaub" value={`${row.vacation_used.toFixed(0)} / ${vacationTotal.toFixed(0)}`} />
            <Mini label="Krank Monat" value={String(row.sick_days_month)} />
            <Mini label="Krank Jahr" value={String(row.sick_days_year)} />
          </div>
        </div>
      </div>

      <div className="emp-card-foot">
        <span className="muted small">Letzte Aktivität: {row.last_activity ?? "—"}</span>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <span className="stat-mini">
      <span className="stat-mini-label">{label}</span>
      <span className="stat-mini-value">{value}</span>
    </span>
  );
}
