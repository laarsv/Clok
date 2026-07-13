import { useEffect, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** zusätzliche Klassen fürs Panel (z. B. max-w-2xl) */
  className?: string;
  labelledBy?: string;
}

/** Modal-Primitive (DESIGN.md §4): role=dialog, aria-modal, ESC + Backdrop
 *  schließen, Body-Scroll-Lock, Mount-Transition. Mobil als Bottom-Sheet. */
export default function Modal({ open, onClose, children, className = "", labelledBy }: Props) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      setShown(false);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={onClose}
      className={`fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm
                  transition-opacity duration-200 sm:items-center sm:p-4
                  ${shown ? "opacity-100" : "opacity-0"}`}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`card max-h-[92vh] w-full overflow-y-auto rounded-t-2xl p-5 transition-all duration-200
                    sm:max-w-lg sm:rounded-2xl sm:p-6
                    ${shown ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-4 opacity-0 sm:scale-95"}
                    ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
