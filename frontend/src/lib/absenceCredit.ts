import type { Absence, User } from "../api";
import { isoDate } from "./datetime";

// Bezahlte Abwesenheiten zählen als Lohnfortzahlung (wie gearbeitet).
const PAID = new Set(["vacation", "sick", "special", "training"]);
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Tages-Lohnfortzahlung: Tagessatz (Wochenstunden ÷ Arbeitstage) an einem
 *  genehmigten bezahlten Abwesenheitstag, sofern Arbeitstag & kein Feiertag.
 *  0 bei unbezahlt/pending/Feiertag/Nicht-Arbeitstag/Nicht-Salary.
 *
 *  Client-seitige Näherung des Backend-Werts für die Kalender-/Wochenanzeige;
 *  die maßgeblichen Zahlen (Saldo, Monats-KPI) kommen weiterhin vom Backend. */
export function absenceDayCredit(
  d: Date,
  absence: Absence | undefined,
  user: User | null,
  holidays: Record<string, string>,
): number {
  if (!user || user.billing_mode !== "salary") return 0;
  if (!absence || absence.status !== "approved" || !PAID.has(absence.type)) return 0;
  const weekly = user.weekly_hours;
  const days = user.work_days;
  if (!weekly || !days || days.length === 0) return 0;
  if (!(days as string[]).includes(DOW[d.getDay()])) return 0;
  if (holidays[isoDate(d)]) return 0;
  return weekly / days.length;
}
