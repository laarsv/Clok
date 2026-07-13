import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import { api, type Absence, type TeamAbsences } from "../../api";
import { endOfMonth, isoDate, startOfMonth } from "../../lib/datetime";

const TYPE_LABEL: Record<string, string> = {
  vacation: "Urlaub", sick: "Krank", unpaid: "Unbezahlt",
  special: "Sonderurlaub", parental: "Elternzeit", training: "Fortbildung",
};
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// approved = kräftig, pending = heller
function cellClass(a: Absence): string {
  const pending = a.status === "pending";
  if (a.type === "vacation") return pending ? "bg-royal/30" : "bg-royal";
  if (a.type === "sick") return pending ? "bg-red-300" : "bg-red-500";
  return pending ? "bg-amber-200" : "bg-amber-400";
}

export default function Calendar() {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [data, setData] = useState<TeamAbsences | null>(null);

  const monthStart = useMemo(() => startOfMonth(anchor), [anchor]);
  const monthEnd = useMemo(() => endOfMonth(anchor), [anchor]);

  useEffect(() => {
    api.teamAbsences(isoDate(monthStart), isoDate(monthEnd)).then(setData).catch(() => setData(null));
  }, [anchor.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(
    () => Array.from({ length: monthEnd.getDate() }, (_, i) =>
      new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1)),
    [monthStart, monthEnd],
  );

  // Lookup `${user_id}:${iso}` → Absence (lokale Datumskonstruktion, kein TZ-Versatz).
  const lookup = useMemo(() => {
    const map = new Map<string, Absence>();
    if (!data) return map;
    const mStart = isoDate(monthStart);
    const mEnd = isoDate(monthEnd);
    for (const a of data.absences) {
      const [ys, ms, ds] = a.start_date.split("-").map(Number);
      const [ye, me, de] = a.end_date.split("-").map(Number);
      let cur = new Date(ys, ms - 1, ds);
      const end = new Date(ye, me - 1, de);
      while (cur <= end) {
        const iso = isoDate(cur);
        if (iso >= mStart && iso <= mEnd) map.set(`${a.user_id}:${iso}`, a);
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      }
    }
    return map;
  }, [data, monthStart, monthEnd]);

  const todayIso = isoDate(new Date());

  return (
    <Shell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Übersicht</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Abwesenheitskalender</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-outline btn-sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>← Monat</button>
            <strong className="min-w-[9rem] text-center text-sm">{anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</strong>
            <button className="btn-outline btn-sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>Monat →</button>
            <button className="btn-ghost btn-sm" onClick={() => setAnchor(new Date())}>Heute</button>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10">
                <th className="sticky left-0 z-10 bg-paper px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink/50">Mitarbeiter</th>
                {days.map((d) => {
                  const iso = isoDate(d);
                  const we = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th key={iso} className={`w-7 px-0 py-1 text-center text-[10px] font-bold ${we ? "text-ink/30" : "text-ink/60"} ${iso === todayIso ? "bg-royal/10" : ""}`}>
                      <div>{WD[d.getDay()]}</div>
                      <div className="tabular-nums">{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data?.employees.map((emp) => (
                <tr key={emp.user_id} className="border-b border-ink/5 last:border-b-0">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-paper px-3 py-1.5 font-bold">{emp.name}</td>
                  {days.map((d) => {
                    const iso = isoDate(d);
                    const a = lookup.get(`${emp.user_id}:${iso}`);
                    const we = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <td
                        key={iso}
                        className={`h-7 border-l border-ink/5 ${!a && we ? "bg-ink/5" : ""} ${iso === todayIso ? "outline outline-1 -outline-offset-1 outline-royal/40" : ""}`}
                        title={a ? `${emp.name}: ${TYPE_LABEL[a.type] ?? a.type}${a.status === "pending" ? " (beantragt)" : ""}` : undefined}
                      >
                        {a && <div className={`h-full w-full ${cellClass(a)}`} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data && data.employees.length === 0 && (
                <tr><td className="px-3 py-8 text-center text-ink/50" colSpan={days.length + 1}>Keine Mitarbeiter.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-ink/60">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-royal" /> Urlaub</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-red-500" /> Krank</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-amber-400" /> Sonstiges</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-royal/30" /> beantragt (offen)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-ink/5" /> Wochenende</span>
        </div>
      </div>
    </Shell>
  );
}
