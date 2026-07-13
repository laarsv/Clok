import { useEffect, useId, useRef, useState } from "react";
import { IconChevronDown, IconCheck } from "./Icons";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** Barrierefreies Custom-Dropdown (kein natives <select>, DESIGN.md §4).
 *  Tastatur: ↑/↓ navigiert, Enter/Space wählt, Esc schließt; Klick außerhalb schließt. */
export default function Select({
  value, onChange, options, placeholder = "Bitte wählen",
  disabled = false, className = "", "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[active] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active]);

  const choose = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="input flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${selected ? "text-ink" : "text-ink/40"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <IconChevronDown size={16} className={`shrink-0 text-ink/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          id={listId}
          tabIndex={-1}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink/10 bg-paper py-1 shadow-lg"
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isActive = i === active;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm
                  ${isActive ? "bg-royal/10 text-ink" : "text-ink"}
                  ${isSelected ? "font-bold" : ""}`}
              >
                <span className="truncate">{o.label}</span>
                {isSelected && <IconCheck size={16} className="shrink-0 text-royal" />}
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink/50">Keine Optionen</li>
          )}
        </ul>
      )}
    </div>
  );
}
