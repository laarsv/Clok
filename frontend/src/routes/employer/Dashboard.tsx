import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import Donut from "../../components/Donut";
import HoursBar from "../../components/HoursBar";
import Button from "../../components/ui/Button";
import Select from "../../components/ui/Select";
import { IconPlus } from "../../components/ui/Icons";
import { api, type EmployerDashboardData, type EmployerDashboardRow } from "../../api";
import { fmtHours } from "../../lib/datetime";

type SortKey = "name" | "balance-asc" | "vacation-low" | "last-activity";

const SORT_OPTIONS = [
  { value: "name", label: "Sortierung: Name" },
  { value: "balance-asc", label: "Saldo: Minus zuerst" },
  { value: "vacation-low", label: "Resturlaub: wenigste zuerst" },
  { value: "last-activity", label: "Letzte Aktivität" },
];

const MONTH_LABEL = (ref: string): string => {
  const [y, m] = ref.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
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

  if (!data || !aggregate) {
    return <Shell><div className="p-12 text-center text-ink/50">Lade…</div></Shell>;
  }

  return (
    <Shell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Übersicht</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              Team · {MONTH_LABEL(data.reference_month)}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={SORT_OPTIONS}
              aria-label="Sortierung"
              className="w-56"
            />
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                className="h-4 w-4 accent-royal"
                checked={showOff}
                onChange={(e) => setShowOff(e.target.checked)}
              />
              Offboarded
            </label>
            <Button onClick={() => navigate("/employer/employees/new")}>
              <IconPlus size={18} /> Mitarbeiter
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile label="Aktive Mitarbeiter" value={String(aggregate.activeCount)}
            meta={aggregate.offboardedCount > 0 ? `+ ${aggregate.offboardedCount} offboarded` : undefined} />
          <SummaryTile label="Stunden im Monat"
            value={fmtHours(aggregate.totalActual)}
            meta={`von ${fmtHours(aggregate.totalTarget)} Soll`} />
          <SummaryTile label="Team-Saldo"
            value={`${aggregate.totalBalance > 0 ? "+" : ""}${aggregate.totalBalance.toFixed(1)} h`}
            valueClass={aggregate.totalBalance < -0.5 ? "text-red-600" : aggregate.totalBalance > 0.5 ? "text-royal" : ""}
            meta={aggregate.employeesAtRisk > 0 ? `${aggregate.employeesAtRisk} mit > 8 h im Minus` : "alle in Ordnung"} />
          <SummaryTile label="Resturlaub gesamt"
            value={`${aggregate.totalRemainingVacation.toFixed(0)} d`}
            meta={aggregate.totalSickMonth > 0 ? `${aggregate.totalSickMonth} Krank-Tage im Monat` : "keine Krankheit im Monat"} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <EmployeeCard key={r.id} row={r} onOpen={() => navigate(`/employer/employees/${r.id}`)} />
          ))}
          {filtered.length === 0 && (
            <div className="card col-span-full p-12 text-center text-ink/50">Keine Mitarbeiter.</div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function SummaryTile({ label, value, meta, valueClass = "" }: {
  label: string; value: string; meta?: string; valueClass?: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-ink/50">{label}</div>
      <div className={`mt-1 text-2xl font-black tabular-nums leading-tight ${valueClass}`}>{value}</div>
      {meta && <div className="mt-1 text-xs text-ink/60">{meta}</div>}
    </div>
  );
}

function EmployeeCard({ row, onOpen }: { row: EmployerDashboardRow; onOpen: () => void }) {
  const initials = (row.full_name || row.username)
    .split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const vacationTotal = Math.max(row.vacation_used + row.vacation_remaining, 0);
  const vacationLow = row.vacation_remaining <= 0;
  const balance = row.balance_hours;
  const balanceCls = balance > 0.05
    ? "bg-royal/10 text-royal"
    : balance < -0.05 ? "bg-red-50 text-red-700" : "bg-ink/5 text-ink/70";
  const balanceDisplay = balance > 0 ? `+${balance.toFixed(1)} h`
    : balance < 0 ? `${balance.toFixed(1)} h` : "±0 h";
  const offboarded = !!row.offboarded_at;

  return (
    <button
      onClick={onOpen}
      className={`card group w-full p-4 text-left text-ink transition hover:border-royal/40 hover:shadow-md ${offboarded ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-royal text-sm font-bold text-paper">
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{row.full_name || row.username}</div>
          <div className="truncate text-xs text-ink/50">@{row.username}</div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${offboarded ? "bg-ink/10 text-ink/60" : "bg-royal/10 text-royal"}`}>
          {offboarded ? "offboarded" : "aktiv"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <Donut
          value={row.vacation_used}
          max={vacationTotal}
          centerLabel={`${Math.max(0, row.vacation_remaining).toFixed(0)}`}
          centerSub="Tage übrig"
          color={vacationLow ? "var(--error)" : "var(--accent)"}
        />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/50">Stunden Monat</div>
            <HoursBar actual={row.actual_hours_month} target={row.target_hours_month} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink/50">Saldo</span>
            <span className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${balanceCls}`}>{balanceDisplay}</span>
          </div>
          <div className="flex gap-3">
            <Mini label="Urlaub" value={`${row.vacation_used.toFixed(0)} / ${vacationTotal.toFixed(0)}`} />
            <Mini label="Krank M" value={String(row.sick_days_month)} />
            <Mini label="Krank J" value={String(row.sick_days_year)} />
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-ink/10 pt-2 text-xs text-ink/50">
        Letzte Aktivität: {row.last_activity ?? "—"}
      </div>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-ink/45">{label}</span>
      <span className="block text-sm font-bold tabular-nums">{value}</span>
    </span>
  );
}
