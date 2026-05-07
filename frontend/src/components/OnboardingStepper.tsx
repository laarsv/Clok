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
  return (
    <ol className="stepper" aria-label="Onboarding-Schritte">
      {STEPS.map((s) => {
        const cls =
          s.num < active ? "done" :
          s.num === active ? "active" : "todo";
        return (
          <li key={s.num} className={`stepper-item ${cls}`}>
            <span className="stepper-bullet">
              {s.num < active ? "✓" : s.num}
            </span>
            <span className="stepper-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
