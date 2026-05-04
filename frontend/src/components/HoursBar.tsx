interface Props {
  actual: number;
  target: number;
}

export default function HoursBar({ actual, target }: Props) {
  if (target <= 0) {
    return (
      <div className="hours-bar">
        <span className="muted small">{actual.toFixed(1)} h (kein Soll)</span>
      </div>
    );
  }
  const pct = (actual / target) * 100;
  const fillPct = Math.min(100, pct);
  // Überstunden-Anteil: bis zu zusätzliche 50% vom Soll als Overflow
  const overPct = Math.max(0, Math.min(50, pct - 100));
  return (
    <div className="hours-bar">
      <div className="hours-bar-track">
        <div className="hours-bar-fill" style={{ width: `${fillPct}%` }} />
        {overPct > 0 && (
          <div className="hours-bar-over" style={{ width: `${overPct}%` }} />
        )}
      </div>
      <div className="hours-bar-labels">
        <span>{actual.toFixed(1)} / {target.toFixed(0)} h</span>
        <span className={pct > 100 ? "positive" : pct < 80 ? "negative" : ""}>
          {Math.round(pct)} %
        </span>
      </div>
    </div>
  );
}
