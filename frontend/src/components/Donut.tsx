interface Props {
  /** verbrauchter Anteil */
  value: number;
  /** Gesamt */
  max: number;
  /** Inhalt im Zentrum (z. B. "16") */
  centerLabel?: string;
  /** kleinere Beschriftung darunter (z. B. "Tage übrig") */
  centerSub?: string;
  size?: number;
  /** Farbe des gefüllten Rings */
  color?: string;
  /** Farbe Hintergrund-Ring */
  trackColor?: string;
}

export default function Donut({
  value, max, centerLabel, centerSub,
  size = 96, color = "var(--accent)", trackColor = "var(--border)",
}: Props) {
  const stroke = 9;
  const radius = (size / 2) - stroke;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 240ms ease" }} />
      </svg>
      {(centerLabel || centerSub) && (
        <div className="donut-center">
          {centerLabel && <strong>{centerLabel}</strong>}
          {centerSub && <span className="muted small">{centerSub}</span>}
        </div>
      )}
    </div>
  );
}
