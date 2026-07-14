// Produkt-Lockup „Standalone" gemäß VRWB CI (DESIGN.md §1b): vrwb in Roboto 900
// (Ink bzw. Weiß auf Ink), der Unterstrich wird zum Trenner in Royal, der Toolname
// hängt direkt dran in Roboto Mono 500 Royal, ~0,83× Größe, Laufweite −1 %.
// Toolname immer klein, ein Wort. Auf Ink: vrwb weiß, _clok in Royal Soft.
export default function Wordmark({ onInk = false, className = "" }: { onInk?: boolean; className?: string }) {
  return (
    <span className={`font-black tracking-wordmark ${onInk ? "text-paper" : "text-ink"} ${className}`}>
      vrwb
      <span className={onInk ? "text-royal-soft" : "text-royal"}>
        _<span className="font-mono font-medium tracking-toolname text-[0.83em]">clok</span>
      </span>
    </span>
  );
}
