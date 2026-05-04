"""Wochenarbeitstage und gesetzlicher Mindesturlaub (BUrlG § 3).

Wochentag-Codes: 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'
Datums-API: weekday() liefert 0..6 mit Mo=0, So=6.
"""
from datetime import date

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DEFAULT_WORK_DAYS = ["mon", "tue", "wed", "thu", "fri"]


def normalize(work_days: list[str] | None) -> list[str]:
    if not work_days:
        return list(DEFAULT_WORK_DAYS)
    return [d for d in WEEKDAY_KEYS if d in work_days]


def is_work_day(work_days: list[str] | None, d: date) -> bool:
    return WEEKDAY_KEYS[d.weekday()] in normalize(work_days)


def legal_min_vacation_days(work_days: list[str] | None) -> int:
    """§ 3 BUrlG: 24 Werktage bei 6-Tage-Woche, anteilig sonst.

    24 / 6 * arbeitstage_pro_woche, abgerundet aufs Ganze.
    """
    days_per_week = len(normalize(work_days))
    return int(24 * days_per_week / 6)
