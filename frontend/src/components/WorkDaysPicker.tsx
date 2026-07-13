import { WEEKDAY_LABELS, WEEKDAY_ORDER, type WeekDay } from "../api";

interface Props {
  value: WeekDay[];
  onChange: (days: WeekDay[]) => void;
}

export default function WorkDaysPicker({ value, onChange }: Props) {
  const toggle = (d: WeekDay) => {
    const set = new Set(value);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    // Reihenfolge stabil halten
    onChange(WEEKDAY_ORDER.filter((x) => set.has(x)));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAY_ORDER.map((d) => {
        const active = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(d)}
            className={`rounded-md border px-3 py-2 text-sm font-bold ${
              active
                ? "border-royal bg-royal/10 text-royal"
                : "border-ink/15 text-ink/70 hover:border-royal/50"
            }`}
          >
            {WEEKDAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}
