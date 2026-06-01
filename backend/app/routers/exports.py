"""Exports: monthly CSV (DE locale, semicolon-separated for Excel-DE)."""
import csv
import io
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.balance import target_hours_for_period
from app.database import get_db
from app.models import BillingMode, TimeEntry, User
from app.pdf_timesheet import build_monthly_pdf
from app.permissions import require_active_user, visible_user_ids

router = APIRouter(prefix="/api/exports", tags=["exports"])


def _fmt_dt(dt: datetime | None) -> str:
    return dt.strftime("%d.%m.%Y %H:%M") if dt else ""


def _fmt_num(n: float) -> str:
    # DE-Formatierung: Komma statt Punkt
    return f"{n:.2f}".replace(".", ",")


@router.get("/monthly.csv")
def monthly_csv(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    start = datetime.combine(datetime(year, month, 1).date(), time.min)
    end = (datetime(year + 1, 1, 1) if month == 12
           else datetime(year, month + 1, 1))

    entries = db.query(TimeEntry).filter(
        TimeEntry.user_id == user.id,
        TimeEntry.start_at >= start,
        TimeEntry.start_at < end,
    ).order_by(TimeEntry.start_at).all()

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)

    # Kopfzeile
    writer.writerow([f"# Arbeitszeitnachweis {month:02d}/{year}"])
    writer.writerow([f"# Mitarbeiter: {user.full_name or user.username}"])
    writer.writerow([f"# Abrechnungsmodell: "
                     f"{'Stundenbasis' if user.billing_mode == BillingMode.HOURLY else 'Festgehalt'}"])
    if user.billing_mode == BillingMode.HOURLY:
        writer.writerow([f"# Stundensatz: {_fmt_num(user.hourly_rate_eur)} EUR"])
    else:
        target = target_hours_for_period(
            db, user, start.date(), (end - timedelta(days=1)).date(),
        )
        writer.writerow([f"# Soll-Stunden in diesem Monat: {_fmt_num(target)}"])
    writer.writerow([])

    writer.writerow([
        "Datum", "Beginn", "Ende", "Pause (min)",
        "Brutto (h)", "Netto (h)", "Projekt", "Notiz",
    ])

    total_net = 0.0
    for e in entries:
        if e.end_at is None:
            continue
        gross = (e.end_at - e.start_at).total_seconds() / 3600
        net = gross - e.break_minutes / 60
        total_net += net
        writer.writerow([
            e.start_at.strftime("%d.%m.%Y"),
            e.start_at.strftime("%H:%M"),
            e.end_at.strftime("%H:%M"),
            e.break_minutes,
            _fmt_num(gross),
            _fmt_num(net),
            e.project_ref.name if e.project_ref else "",
            (e.note or "").replace("\n", " "),
        ])

    writer.writerow([])
    writer.writerow(["Summe Netto (h)", "", "", "", "", _fmt_num(total_net)])
    if user.billing_mode == BillingMode.HOURLY:
        writer.writerow(["Abrechnungsbetrag (EUR)", "", "", "", "",
                         _fmt_num(total_net * user.hourly_rate_eur)])
    else:
        target = target_hours_for_period(
            db, user, start.date(), (end - timedelta(days=1)).date(),
        )
        diff = total_net - target
        writer.writerow(["Differenz zu Soll (h)", "", "", "", "", _fmt_num(diff)])

    buf.seek(0)
    filename = f"clok_{user.username}_{year}-{month:02d}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/monthly.pdf")
def monthly_pdf(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user_id: int | None = Query(None, description="Admin/AG: anderer MA"),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Stundenzettel als PDF (DIN A4) zur Vorlage in der Lohnbuchhaltung."""
    target_id = user_id if user_id is not None else user.id
    if target_id != user.id:
        if target_id not in visible_user_ids(user, db):
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")

    pdf_bytes = build_monthly_pdf(db, target, year, month)
    filename = f"clok_{target.username}_{year}-{month:02d}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
