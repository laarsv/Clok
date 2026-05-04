interface Props {
  values: number[];
  labels?: string[];
  height?: number;
  color?: string;
  zeroLine?: boolean;
}

/** Schmale, eingebaute Line-Chart-Komponente ohne externe Library.
 *  Liefert eine Polyline + Punkte über `values`. zeroLine zeichnet
 *  zusätzlich die Y=0-Linie, wenn der Wertebereich Vorzeichen wechselt. */
export default function MiniLineChart({
  values, labels, height = 140, color = "var(--accent)", zeroLine = true,
}: Props) {
  if (values.length === 0) return null;
  const w = 600;
  const padX = 32;
  const padY = 14;
  const innerW = w - 2 * padX;
  const innerH = height - 2 * padY;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = (max - min) || 1;
  const x = (i: number) => padX + (i / Math.max(1, values.length - 1)) * innerW;
  const y = (v: number) => padY + innerH - ((v - min) / range) * innerH;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}>
      {/* Y-Achsen-Beschriftung min/max */}
      <text x={4} y={padY + 4} fill="var(--text-muted)" fontSize="11">
        {max.toFixed(0)}
      </text>
      <text x={4} y={padY + innerH} fill="var(--text-muted)" fontSize="11">
        {min.toFixed(0)}
      </text>

      {zeroLine && min < 0 && max > 0 && (
        <line x1={padX} x2={w - padX / 2} y1={zeroY} y2={zeroY}
          stroke="var(--text-muted)" strokeDasharray="3 4" strokeWidth="1" />
      )}

      <polyline points={points} fill="none" stroke={color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={color} />
      ))}

      {labels && labels.map((lab, i) => (
        <text key={`l-${i}`} x={x(i)} y={height - 2}
          fill="var(--text-muted)" fontSize="10" textAnchor="middle">
          {lab}
        </text>
      ))}
    </svg>
  );
}
