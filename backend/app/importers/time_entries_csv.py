"""CSV-Import für historische Zeiteinträge beim Onboarding.

Format laut docs/import-format.md:
  Header (Pflicht):  datum;start;ende;pause_min;projekt;notiz
  Datum:             TT.MM.JJJJ
  Zeiten:            HH:MM
  Pause:             Ganzzahl (Minuten), 0 erlaubt
  Trenner:           Semikolon (Excel-DE)
  BOM:               wird toleriert (UTF-8 oder UTF-8-BOM)
  Dezimalkomma:      bei zukünftigen Float-Feldern (vorerst nur pause_min, integer)

Validiert mit der bestehenden ArbZG-Logik. Fehlerhafte Zeilen werden
NICHT importiert; die Funktion gibt eine strukturierte Liste der
Fehler zurück, damit das Frontend sie zeigen kann.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Iterable

from app.arbzg import validate_entry
from app.models import TimeEntry, User
from sqlalchemy.orm import Session


REQUIRED_HEADER = ["datum", "start", "ende", "pause_min", "projekt", "notiz"]


@dataclass
class ImportError:
    line: int
    message: str


@dataclass
class ImportResult:
    imported: int
    errors: list[ImportError]


def _parse_int(value: str) -> int:
    value = value.strip().replace(",", ".")
    if "." in value:
        # Excel-DE schreibt manchmal "30,0" → wir akzeptieren das, runden auf int
        return int(round(float(value)))
    return int(value)


def parse_csv(content: bytes) -> tuple[list[dict], list[ImportError]]:
    """Liefert (Zeilen-dicts, parse-Fehler). Header-Mismatch raised ValueError."""
    text = content.decode("utf-8-sig")  # tolerant gegenüber BOM
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
            continue  # Leerzeile
        if len(row) < 6:
            errors.append(ImportError(i, "Zu wenige Spalten."))
            continue
        try:
            d = datetime.strptime(row[0].strip(), "%d.%m.%Y").date()
            t_start = datetime.strptime(row[1].strip(), "%H:%M").time()
            t_end = datetime.strptime(row[2].strip(), "%H:%M").time()
            pause = _parse_int(row[3]) if row[3].strip() else 0
        except ValueError as e:
            errors.append(ImportError(i, f"Format ungültig: {e}"))
            continue

        start_dt = datetime.combine(d, t_start)
        end_dt = datetime.combine(d, t_end)
        if end_dt <= start_dt:
            # über Mitternacht? Im Briefing nicht spezifiziert; wir lehnen ab.
            errors.append(ImportError(i, "Ende ≤ Start (Nachtschichten via API anlegen)."))
            continue

        parsed.append({
            "line": i,
            "start_at": start_dt,
            "end_at": end_dt,
            "break_minutes": pause,
            "project": row[4].strip() or None,
            "note": row[5].strip() or None,
        })

    return parsed, errors


def import_time_entries(
    db: Session,
    user: User,
    content: bytes,
) -> ImportResult:
    parsed, errors = parse_csv(content)

    imported = 0
    for row in parsed:
        # ArbZG-Validierung pro Zeile (ohne Wochen-/Vortag-Kontext, das wäre
        # bei Massenimport explosiv). Tagesgrenze und Mindest-Pause prüfen.
        issues = validate_entry(
            start=row["start_at"],
            end=row["end_at"],
            break_minutes=row["break_minutes"],
        )
        hard = [i for i in issues if i.severity == "error"]
        if hard:
            errors.append(ImportError(
                row["line"],
                "ArbZG: " + "; ".join(i.message for i in hard),
            ))
            continue
        db.add(TimeEntry(
            user_id=user.id,
            start_at=row["start_at"],
            end_at=row["end_at"],
            break_minutes=row["break_minutes"],
            project=row["project"],
            note=row["note"],
        ))
        imported += 1

    db.commit()
    return ImportResult(imported=imported, errors=errors)
