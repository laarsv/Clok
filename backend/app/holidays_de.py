"""Wrapper um die python-holidays-Lib für deutsche Bundesländer.

Liegt isoliert in einem Modul, damit a) die Lib austauschbar bleibt
und b) Tests einen festen API-Punkt haben.
"""
from datetime import date
from functools import lru_cache
from typing import Optional

import holidays as _holidays


@lru_cache(maxsize=64)
def _calendar(state: str, year: int):
    return _holidays.Germany(years=year, subdiv=state)


def is_holiday(d: date, state: Optional[str]) -> bool:
    """True, wenn d ein gesetzlicher Feiertag in `state` ist. Ohne state: bundesweit."""
    cal = _calendar(state or "", d.year)
    return d in cal


def holidays_for_year(state: Optional[str], year: int) -> list[dict]:
    cal = _calendar(state or "", year)
    return [
        {"date": d.isoformat(), "name": name}
        for d, name in sorted(cal.items())
    ]
