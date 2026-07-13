interface Props {
  actual: number;
  target: number;
}

export default function HoursBar({ actual, target }: Props) {
  if (target <= 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink/60">{actual.toFixed(1)} h (kein Soll)</span>
      </div>
    );
  }
  const pct = (actual / target) * 100;
  const fillPct = Math.min(100, pct);
  // Überstunden-Anteil: bis zu zusätzliche 50% vom Soll als Overflow
  const overPct = Math.max(0, Math.min(50, pct - 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-2.5 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full bg-royal transition-all" style={{ width: `${fillPct}%` }} />
        {overPct > 0 && (
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${overPct}%` }} />
        )}
      </div>
      <div className="flex justify-between gap-2 text-sm">
        <span>{actual.toFixed(1)} / {target.toFixed(0)} h</span>
        <span className={pct > 100 ? "text-royal" : pct < 80 ? "text-red-600" : ""}>
          {Math.round(pct)} %
        </span>
      </div>
    </div>
  );
}
