"""Monatsabschluss-Helfer: Status pro (User, Monat) und Schreib-Sperre für
abgeschlossene Monate. Kein Datensatz = offen."""
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import MonthClosure, User


def closure_status(db: Session, user_id: int, year: int, month: int) -> str:
    """'open' | 'submitted' | 'approved'."""
    row = (
        db.query(MonthClosure)
        .filter(
            MonthClosure.user_id == user_id,
            MonthClosure.year == year,
            MonthClosure.month == month,
        )
        .first()
    )
    return row.status.value if row is not None else "open"


def assert_month_editable(db: Session, target_user_id: int, d: date, actor: User) -> None:
    """Wirft 409, wenn der Monat von `d` für `actor` gesperrt ist.

    - approved → für ALLE gesperrt (der Monat muss erst wieder geöffnet werden).
    - submitted → nur für den Mitarbeiter selbst gesperrt; Arbeitgeber/Admin
      dürfen weiterhin korrigieren.
    """
    status = closure_status(db, target_user_id, d.year, d.month)
    if status == "approved":
        raise HTTPException(
            status_code=409,
            detail=f"Der Monat {d.month:02d}/{d.year} ist abgeschlossen (freigegeben). "
                   "Zum Ändern muss er zuerst wieder geöffnet werden.",
        )
    if status == "submitted" and actor.id == target_user_id:
        raise HTTPException(
            status_code=409,
            detail=f"Der Monat {d.month:02d}/{d.year} ist eingereicht und wartet auf "
                   "Freigabe. Zieh die Einreichung zurück, um noch zu ändern.",
        )
