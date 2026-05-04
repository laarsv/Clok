from datetime import date

from app.holidays_de import holidays_for_year, is_holiday


def test_neujahr_ist_in_jedem_bl_feiertag():
    for state in ("BW", "BY", "BE", "NW", "HH"):
        assert is_holiday(date(2026, 1, 1), state)


def test_fronleichnam_nur_in_katholischen_bl():
    fronleichnam_2026 = date(2026, 6, 4)
    assert is_holiday(fronleichnam_2026, "BW")
    assert is_holiday(fronleichnam_2026, "BY")
    assert not is_holiday(fronleichnam_2026, "HH")


def test_holidays_for_year_enthaelt_namen():
    items = holidays_for_year("BW", 2026)
    assert any(it["name"] for it in items)
    assert all("date" in it and "name" in it for it in items)
