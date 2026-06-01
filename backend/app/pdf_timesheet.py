"""PDF-Stundenzettel pro Monat. Pure ReportLab/Platypus, keine externen
System-Bibliotheken (kein libcairo/pango).

Layout:
- Kopfbereich: "Arbeitszeitnachweis", Mitarbeiter-Stammzeile, Monat.
- Tabelle: Datum | Tag | Beginn | Ende | Pause (min) | Brutto (h) | Netto (h) | Projekt | Notiz.
  Tage ohne Eintrag werden mit "—" angezeigt, damit der Nachweis lückenlos ist.
- Footer: Summe Soll/Ist/Differenz (bei Salary), Abrechnungsbetrag (bei Hourly),
  zwei Unterschriften-Linien (Mitarbeiter / Arbeitgeber).
"""
from __future__ import annotations

import io
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer,
)
from sqlalchemy.orm import Session

from app.balance import target_hours_for_period
from app.holidays_de import is_holiday
from app.models import Absence, AbsenceStatus, BillingMode, TimeEntry, User


WEEKDAY_LABELS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def _net(entries: list[TimeEntry]) -> float:
    out = 0.0
    for e in entries:
        if e.end_at is None:
            continue
        out += max(0.0, (e.end_at - e.start_at).total_seconds() / 3600
                   - e.break_minutes / 60)
    return out


def _fmt_hours(n: float) -> str:
    return f"{n:.2f}".replace(".", ",")


def build_monthly_pdf(
    db: Session, user: User, year: int, month: int,
) -> bytes:
    days_in_month = monthrange(year, month)[1]
    m_start = date(year, month, 1)
    m_end_inclusive = date(year, month, days_in_month)
    m_end_exclusive = m_end_inclusive + timedelta(days=1)

    # Daten laden
    entries = db.query(TimeEntry).filter(
        TimeEntry.user_id == user.id,
        TimeEntry.start_at >= datetime.combine(m_start, time.min),
        TimeEntry.start_at < datetime.combine(m_end_exclusive, time.min),
    ).order_by(TimeEntry.start_at).all()

    absences = db.query(Absence).filter(
        Absence.user_id == user.id,
        Absence.status == AbsenceStatus.APPROVED,
        Absence.start_date <= m_end_inclusive,
        Absence.end_date >= m_start,
    ).all()

    state = user.federal_state.value if user.federal_state else None
    holidays_in_month: dict[date, str] = {}
    try:
        from app.holidays_de import holidays_for_year
        for h in holidays_for_year(state or "", year):
            d = date.fromisoformat(h["date"])
            if m_start <= d <= m_end_inclusive:
                holidays_in_month[d] = h["name"]
    except Exception:
        holidays_in_month = {}

    # Eintrag pro Tag (mehrere möglich) → flache Liste pro Tag mit None-Lücken
    entries_by_day: dict[date, list[TimeEntry]] = {}
    for e in entries:
        d = e.start_at.date()
        entries_by_day.setdefault(d, []).append(e)

    absences_by_day: dict[date, Absence] = {}
    for a in absences:
        cur = max(a.start_date, m_start)
        stop = min(a.end_date, m_end_inclusive)
        while cur <= stop:
            absences_by_day[cur] = a
            cur += timedelta(days=1)

    total_net = _net(entries)
    target = (
        target_hours_for_period(db, user, m_start, m_end_inclusive)
        if user.billing_mode == BillingMode.SALARY else 0.0
    )

    # ---- PDF aufbauen ----
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Arbeitszeitnachweis {month:02d}/{year}",
        author="Clok",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=18, spaceAfter=4)
    sub = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=10,
                         textColor=colors.HexColor("#555"))
    body = styles["Normal"]
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8,
                           textColor=colors.HexColor("#777"))

    story = []
    story.append(Paragraph("Arbeitszeitnachweis", h1))
    story.append(Paragraph(
        f"Monat {month:02d}/{year} · "
        f"{user.full_name or user.username} · "
        f"@{user.username}",
        sub,
    ))
    if user.federal_state:
        story.append(Paragraph(
            f"Bundesland: {user.federal_state.value} · "
            f"Eintritt: {user.hire_date.isoformat() if user.hire_date else '–'} · "
            f"Wochenstunden: {user.weekly_hours or '–'}",
            sub,
        ))
    story.append(Spacer(1, 6 * mm))

    # Tabelle aufbauen – Zeile pro Tag
    table_data: list[list] = [[
        "Datum", "Tag", "Beginn", "Ende", "Pause", "Brutto", "Netto", "Projekt / Notiz",
    ]]
    holiday_rows: list[int] = []
    weekend_rows: list[int] = []
    absence_rows: list[int] = []

    for day_offset in range(days_in_month):
        d = m_start + timedelta(days=day_offset)
        weekday_label = WEEKDAY_LABELS_DE[d.weekday()]
        is_weekend = d.weekday() >= 5
        holiday_name = holidays_in_month.get(d)
        absence = absences_by_day.get(d)
        day_entries = entries_by_day.get(d, [])

        if not day_entries:
            # Tag ohne Arbeitszeit
            note_parts = []
            if holiday_name:
                note_parts.append(f"Feiertag: {holiday_name}")
            if absence:
                note_parts.append(_absence_label(absence))
            table_data.append([
                d.strftime("%d.%m.%Y"), weekday_label, "—", "—", "—", "—", "—",
                " · ".join(note_parts) or ("Wochenende" if is_weekend else ""),
            ])
            row_idx = len(table_data) - 1
            if absence: absence_rows.append(row_idx)
            elif holiday_name: holiday_rows.append(row_idx)
            elif is_weekend: weekend_rows.append(row_idx)
            continue

        # Bei mehreren Einträgen pro Tag: jeder bekommt eine eigene Zeile
        for idx, e in enumerate(day_entries):
            gross = (e.end_at - e.start_at).total_seconds() / 3600 if e.end_at else 0
            net = max(0.0, gross - e.break_minutes / 60)
            datum_cell = d.strftime("%d.%m.%Y") if idx == 0 else ""
            day_cell = weekday_label if idx == 0 else ""
            note = " · ".join(filter(None, [
                e.project_ref.name if e.project_ref else None, e.note,
            ]))
            table_data.append([
                datum_cell, day_cell,
                e.start_at.strftime("%H:%M"),
                e.end_at.strftime("%H:%M") if e.end_at else "—",
                str(e.break_minutes),
                _fmt_hours(gross),
                _fmt_hours(net),
                note or "",
            ])

    col_widths = [22*mm, 10*mm, 16*mm, 16*mm, 14*mm, 16*mm, 16*mm, 60*mm]
    table = Table(table_data, colWidths=col_widths, repeatRows=1)

    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d1d1b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f7f5")]),
        ("ALIGN", (4, 0), (6, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#1d1d1b")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#dddddd")),
    ]
    for r in holiday_rows:
        style_cmds.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#fff3d6")))
    for r in absence_rows:
        style_cmds.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#e3f3e6")))
    for r in weekend_rows:
        style_cmds.append(("TEXTCOLOR", (0, r), (-1, r), colors.HexColor("#888")))
    table.setStyle(TableStyle(style_cmds))

    story.append(table)
    story.append(Spacer(1, 6 * mm))

    # Summen-Zeile
    summary_rows = [["Summe Netto (h)", _fmt_hours(total_net)]]
    if user.billing_mode == BillingMode.HOURLY:
        amount = total_net * (user.hourly_rate_eur or 0.0)
        summary_rows.append(["Stundensatz (EUR)", _fmt_hours(user.hourly_rate_eur or 0)])
        summary_rows.append(["Abrechnungsbetrag (EUR)", _fmt_hours(amount)])
    else:
        summary_rows.append(["Soll-Stunden (h)", _fmt_hours(target)])
        summary_rows.append(["Differenz (h)", _fmt_hours(total_net - target)])

    summary = Table(summary_rows, colWidths=[80*mm, 30*mm])
    summary.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#1d1d1b")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(summary)
    story.append(Spacer(1, 14 * mm))

    # Unterschriften-Block
    sign_data = [[
        Paragraph("Mitarbeiter:in<br/>_______________________________<br/>"
                  "Datum / Unterschrift", small),
        Paragraph("Arbeitgeber:in<br/>_______________________________<br/>"
                  "Datum / Unterschrift", small),
    ]]
    sign = Table(sign_data, colWidths=[85*mm, 85*mm])
    sign.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(sign)

    doc.build(story)
    return buf.getvalue()


def _absence_label(absence: Absence) -> str:
    labels = {
        "vacation": "Urlaub",
        "sick": "Krankheit",
        "unpaid": "Unbezahlt",
        "special": "Sonderurlaub",
        "parental": "Elternzeit",
        "training": "Fortbildung",
    }
    raw = absence.type.value if hasattr(absence.type, "value") else str(absence.type)
    return labels.get(raw, raw)
