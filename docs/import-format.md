# CSV-Import: Zeiteinträge

Format für den Onboarding-Import historischer Zeiteinträge.

## Pflicht-Header

Erste Zeile **muss** exakt sein (Reihenfolge zählt, Semikolon als Trenner):

```
datum;start;ende;pause_min;projekt;notiz
```

Falscher oder fehlender Header → harter Reject mit Fehlermeldung
„Erwarteter Header: …, gefunden: …".

## Spalten

| Spalte | Format | Pflicht | Beispiel |
|---|---|---|---|
| `datum` | `TT.MM.JJJJ` | ja | `04.05.2026` |
| `start` | `HH:MM` (24h) | ja | `09:00` |
| `ende` | `HH:MM` (24h) | ja | `17:30` |
| `pause_min` | Ganzzahl, 0 erlaubt | ja | `30` |
| `projekt` | Freitext | nein | `Kunde A` |
| `notiz` | Freitext | nein | `Sprint Planning` |

## Encoding & Sonderfälle

- **UTF-8 oder UTF-8-BOM** – Excel-DE schreibt häufig BOM mit, der wird toleriert.
- **Trenner: Semikolon (`;`)** – passt zu deutschem Excel.
- **Dezimalkomma** wird bei numerischen Feldern akzeptiert (`30,0` ↔ `30`).
- **Leerzeilen** werden übersprungen.
- **Nachtschichten** (Ende ≤ Start) werden vom Import abgelehnt; lege sie
  nachträglich über das Webfrontend an.

## Validierung

Jede Zeile durchläuft die ArbZG-Prüfung (Tagesgrenze 10 h, Pflicht-Pause).
Zeilen mit `error`-Issues werden **nicht** importiert; sie tauchen im
Response unter `errors[]` mit Zeilennummer und Begründung auf.

## Beispiel

```csv
datum;start;ende;pause_min;projekt;notiz
04.05.2026;09:00;17:30;30;Kunde A;Sprint Planning
05.05.2026;08:30;17:00;45;Kunde B;
06.05.2026;09:00;13:00;0;;Kurzer Tag
```

## Aufruf

```http
POST /api/employees/{user_id}/imports
Content-Type: multipart/form-data
file: <CSV-Datei>
```

Response:

```json
{
  "imported": 38,
  "errors": [
    {"line": 12, "message": "Format ungültig: time data '08:9' ..."},
    {"line": 17, "message": "ArbZG: Bei 10.50 h Arbeitszeit ist eine Pause ..."}
  ]
}
```
