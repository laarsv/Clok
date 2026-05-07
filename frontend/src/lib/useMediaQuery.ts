import { useEffect, useState } from "react";

/** Reagiert auf eine Media-Query (z. B. "(max-width: 768px)") und gibt
 *  den aktuellen Match-Zustand zurück. SSR-sicher (defaultet auf false,
 *  bevor `window` verfügbar ist). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
