"""Rollen- und Sichtbarkeits-Checks als FastAPI-Dependencies.

Designprinzip: alle Pfad-Handler holen sich den aktuellen User über
get_current_user und ergänzen einen require_*-Aufruf, sobald die
Aktion eingeschränkt sein soll. Lieber explizit pro Route, als
Middleware-Magie, weil so jede Route ihr Berechtigungs-Verhalten
inline dokumentiert.
"""
from typing import Iterable

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Role, User


def require_role(*roles: Role):
    allowed = set(roles)

    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Für diese Aktion fehlen dir die Rechte.",
            )
        return user

    return dep


def visible_user_ids(viewer: User, db: Session) -> set[int]:
    """IDs aller User, deren Daten der viewer sehen darf (inklusive sich selbst)."""
    if viewer.role == Role.ADMIN:
        return {row[0] for row in db.query(User.id).all()}
    if viewer.role == Role.EMPLOYER:
        ids = {viewer.id}
        ids.update(
            row[0]
            for row in db.query(User.id).filter(User.supervisor_id == viewer.id).all()
        )
        return ids
    return {viewer.id}


def require_can_view_user(target_user_id: int):
    """Wirft 403, wenn viewer den Zieluser nicht sehen darf."""
    def dep(
        viewer: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if target_user_id not in visible_user_ids(viewer, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Kein Zugriff auf diesen Mitarbeiter.",
            )
        target = db.query(User).filter(User.id == target_user_id).first()
        if target is None:
            raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
        return target

    return dep


def supervises(viewer: User, target: User) -> bool:
    """True, wenn viewer für target Approval-Entscheidungen treffen darf."""
    if viewer.role == Role.ADMIN:
        return True
    if viewer.role == Role.EMPLOYER and target.supervisor_id == viewer.id:
        return True
    return False
