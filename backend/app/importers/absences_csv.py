"""CSV-Import für historische Abwesenheiten beim Onboarding.

Format (siehe docs/import-format.md):
  Header (Pflicht):  art;von;bis;notiz
  art:               vacation | sick | unpaid
  Datum:             TT.MM.JJJJ
  Trenner:           Semikolon
  BOM:               toleriert
  Status:            importierte Einträge sind sofort 'approved'
                     (historische Daten – keine offenen Anträge)

Fehlerhafte Zeilen werden gemeldet, nicht importiert.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Absence, AbsenceStatus, AbsenceType, User


REQUIRED_HEADER = ["art", "von", "bis", "notiz"]


@dataclass
class ImportError:
    line: int
    message: str


@dataclass
class ImportResult:
    imported: int
    errors: list[ImportError]


def _parse_type(raw: str) -> AbsenceType:
    raw = raw.strip().lower()
    if raw not in {"vacation", "sick", "unpaid"}:
        raise ValueError(
            f"art muss vacation, sick oder unpaid sein – gefunden: {raw!r}"
        )
    return AbsenceType(raw)


def parse_csv(content: bytes) -> tuple[list[dict], list[ImportError]]:
    """(Parsed rows, parse-errors). Header-Mismatch raised ValueError."""
    text = content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)
    if not rows:
        raise ValueError("Datei ist leer.")
    header = [h.strip().lower() for h in rows[0]]
    if header != REQUIRED_HEADER:
        raise ValueError(
            f"Erwarteter Header: {';'.join(REQUIRED_HEADER)}, "
            f"gefunden: {';'.join(header)}"
        )

    parsed: list[dict] = []
    errors: list[ImportError] = []
    for i, row in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in row):
            continue
        if len(row) < 4:
            errors.append(ImportError(i, "Zu wenige Spalten."))
            continue
        try:
            atype = _parse_type(row[0])
            d_from = datetime.strptime(row[1].strip(), "%d.%m.%Y").date()
            d_to = datetime.strptime(row[2].strip(), "%d.%m.%Y").date()
        except ValueError as e:
            errors.append(ImportError(i, f"Format ungültig: {e}"))
            continue

        if d_to < d_from:
            errors.append(ImportError(i, "bis liegt vor von."))
            continue

        parsed.append({
            "line": i,
            "type": atype,
            "start_date": d_from,
            "end_date": d_to,
            "note": row[3].strip() or None,
        })

    return parsed, errors


def import_absences(
    db: Session,
    user: User,
    actor_id: int,
    content: bytes,
) -> ImportResult:
    parsed, errors = parse_csv(content)
    now = datetime.utcnow()

    imported = 0
    for row in parsed:
        absence = Absence(
            user_id=user.id,
            type=row["type"],
            start_date=row["start_date"],
            end_date=row["end_date"],
            status=AbsenceStatus.APPROVED,  # historische Daten = bereits genehmigt
            requested_at=now,
            decided_at=now,
            decided_by=actor_id,
            note=row["note"],
        )
        db.add(absence)
        imported += 1

    db.commit()
    return ImportResult(imported=imported, errors=errors)
