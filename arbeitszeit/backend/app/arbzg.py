"""
ArbZG-Validierung (Arbeitszeitgesetz).

Quelle: § 3, § 4, § 5 ArbZG (Stand 2024/2026, vor möglicher Novelle).

Zentrale Regeln:
- § 3: Tägliche Arbeitszeit max. 8 h, verlängerbar auf 10 h, wenn im
  6-Monats-Schnitt 8 h nicht überschritten werden.
- § 4: Pflichtpausen
    > 6 h bis 9 h Arbeit  -> mind. 30 min Pause
    > 9 h Arbeit          -> mind. 45 min Pause
    Pausen können in 15-min-Blöcke aufgeteilt werden.
    Spätestens nach 6 h muss eine Pause eingelegt werden.
- § 5: Mind. 11 h ununterbrochene Ruhezeit zwischen zwei Arbeitstagen.
- Wochenarbeitszeit: max. 48 h (6 Werktage * 8 h).

Diese Datei ist bewusst der einzige Ort, an dem gesetzliche Schwellwerte
gesetzt werden. Spätere Anpassungen (z. B. Tarifausnahmen, ArbZG-Novelle,
Sonderregelungen für leitende Angestellte nach § 18) zentral hier pflegen.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable


# Schwellen
MAX_DAILY_HOURS_SOFT = 8.0          # Warnung darüber
MAX_DAILY_HOURS_HARD = 10.0         # darüber: Ablehnung
MAX_WEEKLY_HOURS = 48.0
MIN_REST_HOURS_BETWEEN_DAYS = 11.0
BREAK_REQUIRED_AFTER_HOURS = 6.0
BREAK_MIN_30 = 30
BREAK_MIN_45 = 45
HOURS_FOR_45_MIN_BREAK = 9.0


@dataclass
class ValidationIssue:
    severity: str   # "warning" | "error"
    code: str
    message: str


def gross_hours(start: datetime, end: datetime) -> float:
    """Bruttozeit in Stunden zwischen Start und Ende (ohne Pausenabzug)."""
    return (end - start).total_seconds() / 3600.0


def net_hours(start: datetime, end: datetime, break_minutes: int) -> float:
    """Nettoarbeitszeit in Stunden (Brutto minus Pause)."""
    return gross_hours(start, end) - (break_minutes / 60.0)


def required_break_minutes(net_h: float) -> int:
    """Gesetzlich vorgeschriebene Mindestpause für eine gegebene Nettoarbeitszeit."""
    if net_h > HOURS_FOR_45_MIN_BREAK:
        return BREAK_MIN_45
    if net_h > BREAK_REQUIRED_AFTER_HOURS:
        return BREAK_MIN_30
    return 0


def validate_entry(
    start: datetime,
    end: datetime,
    break_minutes: int,
    same_day_other_entries: Iterable[tuple[datetime, datetime, int]] = (),
    previous_day_last_end: datetime | None = None,
    weekly_hours_already: float = 0.0,
) -> list[ValidationIssue]:
    """
    Prüft einen einzelnen Eintrag gegen das ArbZG.

    same_day_other_entries: weitere Einträge desselben Users am gleichen Tag,
        damit Tagessumme korrekt berechnet wird.
    previous_day_last_end: Ende des letzten Eintrags am Vortag (für 11h-Ruhezeit).
    weekly_hours_already: bereits in dieser Kalenderwoche gebuchte Nettostunden.
    """
    issues: list[ValidationIssue] = []

    if end <= start:
        issues.append(ValidationIssue("error", "INVALID_RANGE",
                                      "Ende muss nach Start liegen."))
        return issues

    gross = gross_hours(start, end)
    net = gross - break_minutes / 60.0

    if net < 0:
        issues.append(ValidationIssue("error", "BREAK_TOO_LONG",
                                      "Pause ist länger als der Eintrag."))
        return issues

    # § 4 - Pflichtpause
    needed = required_break_minutes(net)
    if needed > 0 and break_minutes < needed:
        issues.append(ValidationIssue(
            "error", "BREAK_REQUIRED",
            f"Bei {net:.2f} h Arbeitszeit ist eine Pause von mindestens "
            f"{needed} min vorgeschrieben (§ 4 ArbZG)."
        ))

    # § 3 - Tagesgrenze inkl. anderer Einträge desselben Tages
    daily_total = net + sum(
        max(0.0, (e - s).total_seconds() / 3600.0 - b / 60.0)
        for s, e, b in same_day_other_entries
    )
    if daily_total > MAX_DAILY_HOURS_HARD:
        issues.append(ValidationIssue(
            "error", "DAILY_HARD_LIMIT",
            f"Tagessumme {daily_total:.2f} h überschreitet die gesetzliche "
            f"Höchstgrenze von {MAX_DAILY_HOURS_HARD} h (§ 3 ArbZG)."
        ))
    elif daily_total > MAX_DAILY_HOURS_SOFT:
        issues.append(ValidationIssue(
            "warning", "DAILY_SOFT_LIMIT",
            f"Tagessumme {daily_total:.2f} h liegt über der Regelgrenze von "
            f"{MAX_DAILY_HOURS_SOFT} h. Im Halbjahresschnitt zulässig, sonst "
            f"unzulässig (§ 3 ArbZG)."
        ))

    # § 5 - 11h Ruhezeit zum Vortag
    if previous_day_last_end is not None:
        rest_h = (start - previous_day_last_end).total_seconds() / 3600.0
        if 0 < rest_h < MIN_REST_HOURS_BETWEEN_DAYS:
            issues.append(ValidationIssue(
                "error", "REST_PERIOD",
                f"Ruhezeit zum Vortag beträgt nur {rest_h:.2f} h, "
                f"mindestens {MIN_REST_HOURS_BETWEEN_DAYS} h erforderlich (§ 5 ArbZG)."
            ))

    # 48h-Wochengrenze
    if weekly_hours_already + net > MAX_WEEKLY_HOURS:
        issues.append(ValidationIssue(
            "warning", "WEEKLY_LIMIT",
            f"Wochensumme würde {weekly_hours_already + net:.2f} h erreichen "
            f"(Grenze {MAX_WEEKLY_HOURS} h)."
        ))

    return issues
