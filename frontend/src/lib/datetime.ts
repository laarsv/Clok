export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeek(d: Date): Date {
  // Montag als Wochenstart
  const out = new Date(d);
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function fmtHours(h: number): string {
  return h.toFixed(2).replace(".", ",") + " h";
}

/** Aktuelle lokale Zeit als "YYYY-MM-DDTHH:MM:SS" (ohne TZ) – passend zum
 *  Rest der App, der Wanduhrzeit ohne Zeitzone speichert. Für den Timer. */
export function nowLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtDe(d: Date): string {
  return d.toLocaleDateString("de-DE");
}

export function deWeekday(d: Date): string {
  return d.toLocaleDateString("de-DE", { weekday: "short" });
}

/** True, wenn das Datum im aktuellen oder direkt vorhergehenden Kalendermonat liegt.
 *  Mitarbeiter dürfen ihre eigenen Einträge nur in diesem Fenster ändern. */
export function isInEditableWindow(isoDay: string): boolean {
  const day = new Date(isoDay);
  const today = new Date();
  const floor = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return day >= floor;
}
