"""Feiertags-Endpoint für das Frontend (Wochen-/Monatsraster)."""
from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.holidays_de import holidays_for_year
from app.models import FederalState, User

router = APIRouter(prefix="/api/holidays", tags=["holidays"])


@router.get("")
def list_holidays(
    state: FederalState = Query(...),
    year: int = Query(..., ge=2020, le=2100),
    _: User = Depends(get_current_user),
):
    return holidays_for_year(state.value, year)
