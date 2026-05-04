interface SeriesValue {
  value: number;
  /** override Farbe für einzelne Bar */
  color?: string;
}

interface Props {
  /** Reihen, jede ein Array gleicher Länge wie labels. */
  series: { name: string; color: string; values: (number | SeriesValue)[] }[];
  labels: string[];
  height?: number;
}

export default function MiniBarChart({ series, labels, height = 160 }: Props) {
  const n = labels.length;
  if (!n) return null;
  const w = 600;
  const padX = 28;
  const padY = 18;
  const innerW = w - 2 * padX;
  const innerH = height - 2 * padY;

  const allValues = series.flatMap((s) =>
    s.values.map((v) => (typeof v === "number" ? v : v.value)),
  );
  const max = Math.max(1, ...allValues);
  const groupWidth = innerW / n;
  const seriesCount = series.length;
  const barWidth = (groupWidth * 0.7) / seriesCount;

  return (
    <div className="mini-bar-chart">
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}>
        <text x={4} y={padY + 4} fill="var(--text-muted)" fontSize="11">{max.toFixed(0)}</text>
        <text x={4} y={padY + innerH} fill="var(--text-muted)" fontSize="11">0</text>

        {labels.map((lab, i) => (
          <text key={`l-${i}`} x={padX + groupWidth * (i + 0.5)} y={height - 2}
            fill="var(--text-muted)" fontSize="10" textAnchor="middle">
            {lab}
          </text>
        ))}

        {series.map((s, sIdx) =>
          s.values.map((vRaw, i) => {
            const v = typeof vRaw === "number" ? vRaw : vRaw.value;
            const color = (typeof vRaw === "number" ? undefined : vRaw.color) ?? s.color;
            const h = (Math.max(0, v) / max) * innerH;
            const x = padX + groupWidth * i + (groupWidth - barWidth * seriesCount) / 2 + sIdx * barWidth;
            const y = padY + innerH - h;
            return (
              <rect key={`${sIdx}-${i}`} x={x} y={y} width={barWidth - 1} height={h}
                fill={color} rx="2">
                <title>{`${labels[i]} – ${s.name}: ${v.toFixed(1)}`}</title>
              </rect>
            );
          })
        )}
      </svg>
      <div className="mini-bar-legend">
        {series.map((s) => (
          <span key={s.name} className="mini-bar-legend-item">
            <span className="dot" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
