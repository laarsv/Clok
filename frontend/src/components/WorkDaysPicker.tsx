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
    <div className="workdays">
      {WEEKDAY_ORDER.map((d) => (
        <label key={d} className={`workday ${value.includes(d) ? "active" : ""}`}>
          <input
            type="checkbox"
            checked={value.includes(d)}
            onChange={() => toggle(d)}
          />
          <span>{WEEKDAY_LABELS[d]}</span>
        </label>
      ))}
    </div>
  );
}
