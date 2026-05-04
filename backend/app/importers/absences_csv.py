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


_VALID_TYPES = {"vacation", "sick", "unpaid", "special", "parental", "training"}


def _parse_type(raw: str) -> AbsenceType:
    raw = raw.strip().lower()
    if raw not in _VALID_TYPES:
        raise ValueError(
            f"art muss einer von {', '.join(sorted(_VALID_TYPES))} sein – "
            f"gefunden: {raw!r}"
        )
    return AbsenceType(raw)


def _parse_date(s: str):
    """Akzeptiert TT.MM.JJJJ und TT.MM.JJ (Excel-DE schreibt oft kurz)."""
    s = s.strip()
    for fmt in ("%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"datum ungültig: {s!r} (erwartet TT.MM.JJJJ)")


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
            d_from = _parse_date(row[1])
            d_to = _parse_date(row[2])
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
