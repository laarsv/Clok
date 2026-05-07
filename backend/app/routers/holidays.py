"""Feiertags-Endpoint für das Frontend (Wochen-/Monatsraster)."""
from fastapi import APIRouter, Depends, Query

from app.holidays_de import holidays_for_year
from app.models import FederalState, User
from app.permissions import require_active_user

router = APIRouter(prefix="/api/holidays", tags=["holidays"])


@router.get("")
def list_holidays(
    state: FederalState = Query(...),
    year: int = Query(..., ge=2020, le=2100),
    _: User = Depends(require_active_user),
):
    return holidays_for_year(state.value, year)
