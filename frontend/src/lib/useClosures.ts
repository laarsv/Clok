import { useEffect, useState } from "react";
import { api, type ClosureStatus } from "../api";

/**
 * Lädt die Monatsabschluss-Status eines Users für die angegebenen Jahre und
 * liefert Helfer zum Sperr-Check. Spiegelt die Backend-Regel wider:
 *   approved  → für alle gesperrt
 *   submitted → nur für den Mitarbeiter selbst (canEditAll=false) gesperrt
 * Rein für die UX – die eigentliche Sperre erzwingt das Backend (409).
 */
export function useClosures(userId: number | undefined, years: number[]) {
  const [map, setMap] = useState<Record<string, ClosureStatus>>({});
  const uniq = Array.from(new Set(years)).sort();
  const key = uniq.join(",");

  useEffect(() => {
    if (!userId || uniq.length === 0) return;
    let cancelled = false;
    Promise.all(uniq.map((y) => api.listClosures(userId, y)))
      .then((lists) => {
        if (cancelled) return;
        const m: Record<string, ClosureStatus> = {};
        for (const c of lists.flat()) m[`${c.year}-${c.month}`] = c.status;
        setMap(m);
      })
      .catch(() => { if (!cancelled) setMap({}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  const statusOf = (iso: string): ClosureStatus =>
    map[`${Number(iso.slice(0, 4))}-${Number(iso.slice(5, 7))}`] ?? "open";

  const isLocked = (iso: string, canEditAll = false): boolean => {
    const st = statusOf(iso);
    return st === "approved" || (st === "submitted" && !canEditAll);
  };

  return { statusOf, isLocked };
}
