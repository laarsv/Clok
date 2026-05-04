"""Geschäftslogik für Vertragsverlauf (employment_terms).

terms_at(user, d) liefert den zum Datum d gültigen Vertrag.
current_terms(user) ist äquivalent zu terms_at(user, today).

Spiegel-Pattern: Der jeweils heute gültige Vertrag wird parallel auf
das User-Modell zurückgespiegelt (User.billing_mode, .hourly_rate_eur,
…). Vorhandene UI-Stellen, die direkt auf User lesen, sehen also
immer die aktuellen Werte. Nur Berechnungen über Zeiträume holen sich
den Vertrag jeweils per terms_at(user, d).
"""
from datetime import date
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import EmploymentTerms, User
from app.work_days import normalize as normalize_work_days


_MIRROR_FIELDS = (
    "billing_mode",
    "hourly_rate_eur",
    "weekly_hours",
    "work_days",
    "annual_vacation_days",
)


def terms_at(db: Session, user: User, d: date) -> Optional[EmploymentTerms]:
    return (
        db.query(EmploymentTerms)
        .filter(
            EmploymentTerms.user_id == user.id,
            EmploymentTerms.valid_from <= d,
        )
        .order_by(EmploymentTerms.valid_from.desc())
        .first()
    )


def current_terms(db: Session, user: User) -> Optional[EmploymentTerms]:
    return terms_at(db, user, date.today())


def list_terms(db: Session, user: User) -> list[EmploymentTerms]:
    return (
        db.query(EmploymentTerms)
        .filter(EmploymentTerms.user_id == user.id)
        .order_by(EmploymentTerms.valid_from.asc())
        .all()
    )


def field_at(db: Session, user: User, d: date, field: str) -> Optional[object]:
    """Wert eines Vertragsfelds zum Stichtag, mit Fallback auf User-Spalte."""
    t = terms_at(db, user, d)
    if t is not None:
        return getattr(t, field)
    return getattr(user, field, None)


def work_days_at(db: Session, user: User, d: date) -> list[str]:
    """Arbeitstage zum Stichtag – fällt auf User-Spalte zurück, falls
    (noch) kein Vertrag existiert."""
    t = terms_at(db, user, d)
    raw = t.work_days if t else user.work_days
    return normalize_work_days(raw)


def _sync_user_mirror(user: User, terms: EmploymentTerms) -> None:
    for f in _MIRROR_FIELDS:
        setattr(user, f, getattr(terms, f))


def refresh_user_mirror(db: Session, user: User) -> None:
    """Spiegelt den aktuell gültigen Vertrag auf die User-Spalten."""
    cur = current_terms(db, user)
    if cur is not None:
        _sync_user_mirror(user, cur)


def create_initial_terms(
    db: Session,
    user: User,
    *,
    valid_from: date,
    creator_id: Optional[int] = None,
) -> EmploymentTerms:
    """Erzeugt den initialen Vertrag für einen frisch angelegten MA aus
    den bereits am User gesetzten Werten."""
    t = EmploymentTerms(
        user_id=user.id,
        valid_from=valid_from,
        billing_mode=user.billing_mode,
        hourly_rate_eur=user.hourly_rate_eur,
        weekly_hours=user.weekly_hours,
        work_days=user.work_days,
        annual_vacation_days=user.annual_vacation_days,
        created_by=creator_id,
        note="Initialer Vertrag",
    )
    db.add(t)
    db.flush()
    return t


def apply_new_terms(
    db: Session,
    user: User,
    *,
    valid_from: date,
    fields: dict,
    creator_id: Optional[int],
    note: Optional[str] = None,
) -> EmploymentTerms:
    """Legt einen neuen Vertragsabschnitt an. Wenn der Stichtag in
    Vergangenheit oder Heute liegt, wird das User-Spiegelobjekt mit
    den neuen Werten synchronisiert."""
    # Werte aus dem aktuell gültigen Vertrag als Baseline, dann
    # mit den übergebenen Feldern überschreiben.
    base = current_terms(db, user)
    base_values = {f: getattr(base, f) for f in _MIRROR_FIELDS} if base else {
        f: getattr(user, f) for f in _MIRROR_FIELDS
    }
    base_values.update({k: v for k, v in fields.items() if v is not None})

    t = EmploymentTerms(
        user_id=user.id,
        valid_from=valid_from,
        created_by=creator_id,
        note=note,
        **base_values,
    )
    db.add(t)
    db.flush()
    refresh_user_mirror(db, user)
    return t
