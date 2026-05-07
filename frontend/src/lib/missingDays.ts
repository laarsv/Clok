/**
 * Erkennung von Tagen ohne Eintrag, die laut Vertrag aber Werktage wären.
 *
 * Heuristik (siehe README + employee/Week.tsx):
 * - Tag in der Vergangenheit (< heute). Heute selbst wird nicht
 *   angemeckert – am laufenden Tag ist es plausibel, dass der MA noch
 *   etwas einträgt.
 * - Tag ist Werktag laut user.work_days (aktueller Cache; reicht für
 *   die UX, Vertragsverlauf wird hier nicht historisch ausgewertet).
 * - Kein Feiertag (holidays-Map mit ISO-Datum als Key).
 * - Keine Abwesenheit, die diesen Tag abdeckt – auch pending zählt:
 *   wenn der MA Urlaub beantragt hat, ist das eine Erklärung.
 * - Nach hire_date (wenn gesetzt).
 * - Kein TimeEntry an diesem Tag (sumByDay-Lookup leer/0).
 */
import type { Absence, User, WeekDay } from "../api";
import { isoDate } from "./datetime";

const JS_DAY_TO_WEEKDAY: Record<number, WeekDay> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed",
  4: "thu", 5: "fri", 6: "sat",
};

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function isMissingDay(args: {
  date: Date;
  user: Pick<User, "work_days" | "hire_date">;
  hasEntry: boolean;
  absences: Absence[];
  holidays: Record<string, string>;
}): boolean {
  const { date, user, hasEntry, absences, holidays } = args;

  const today = startOfDay(new Date());
  const day = startOfDay(date);
  if (day >= today) return false;

  const weekday = JS_DAY_TO_WEEKDAY[day.getDay()];
  if (!user.work_days || !user.work_days.includes(weekday)) return false;

  const k = isoDate(day);
  if (holidays[k]) return false;

  if (user.hire_date) {
    const hire = startOfDay(new Date(user.hire_date));
    if (day < hire) return false;
  }

  // Jede Absence, die den Tag überlappt – egal ob pending/approved –
  // ist eine Erklärung. Abgelehnte Anträge (rejected) zählen nicht.
  const covered = absences.some(
    (a) => a.status !== "rejected" && a.start_date <= k && a.end_date >= k,
  );
  if (covered) return false;

  return !hasEntry;
}
