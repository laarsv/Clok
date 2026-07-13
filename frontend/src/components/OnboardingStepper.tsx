interface Step {
  num: number;
  label: string;
}

const STEPS: Step[] = [
  { num: 1, label: "Account" },
  { num: 2, label: "Firma" },
  { num: 3, label: "Standards" },
  { num: 4, label: "Erster MA" },
  { num: 5, label: "Fertig" },
];

export default function OnboardingStepper({ active }: { active: number }) {
  const last = STEPS.length - 1;
  return (
    <ol className="mb-6 flex items-start" aria-label="Onboarding-Schritte">
      {STEPS.map((s, i) => {
        const done = s.num < active;
        const current = s.num === active;
        return (
          <li key={s.num} className={i < last ? "flex-1" : ""}>
            <div className="flex items-center">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done || current
                    ? "bg-royal text-paper"
                    : "border border-ink/20 bg-paper text-ink/50"
                }`}
              >
                {done ? "✓" : s.num}
              </span>
              {i < last && (
                <span className={`mx-2 h-0.5 flex-1 ${done ? "bg-royal" : "bg-ink/15"}`} />
              )}
            </div>
            <span className="mt-1 hidden text-xs text-ink/60 sm:block">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
