# CSV-Import beim Onboarding

Beim Anlegen eines Mitarbeiters lassen sich zwei Sorten historischer
Daten importieren – jeweils als eigene CSV-Datei:

- **Zeiteinträge** (`POST /api/employees/{id}/imports/times`)
- **Abwesenheiten** (`POST /api/employees/{id}/imports/absences`)

Vorlagen können direkt im Onboarding-Form heruntergeladen werden:
`/api/employees/import-template-times.csv` und
`/api/employees/import-template-absences.csv`.

## Zeiteinträge

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
| `datum` | `TT.MM.JJJJ` (oder `TT.MM.JJ`) | ja | `04.05.2026` |
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

### Aufruf

```http
POST /api/employees/{user_id}/imports/times
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

## Abwesenheiten

### Pflicht-Header

```
art;von;bis;notiz
```

### Spalten

| Spalte | Werte / Format | Pflicht | Beispiel |
|---|---|---|---|
| `art` | `vacation` · `sick` · `unpaid` | ja | `vacation` |
| `von` | `TT.MM.JJJJ` (oder `TT.MM.JJ`) | ja | `01.07.2026` |
| `bis` | `TT.MM.JJJJ` (inklusiv, ≥ von) | ja | `12.07.2026` |
| `notiz` | Freitext | nein | `Sommerurlaub` |

### Verhalten

- Importierte Einträge erhalten direkt **Status `approved`** – sie
  bilden historische Realität ab und sind nicht offene Anträge.
- `decided_by` wird auf den importierenden User (Arbeitgeber/Admin)
  gesetzt, `requested_at` und `decided_at` auf den Importzeitpunkt.
- BOM, Semikolon und Leerzeilen werden wie bei Zeiteinträgen behandelt.

### Beispiel

```csv
art;von;bis;notiz
vacation;01.07.2026;12.07.2026;Sommerurlaub
sick;15.06.2026;16.06.2026;
unpaid;20.08.2026;22.08.2026;Familienangelegenheit
```

### Aufruf

```http
POST /api/employees/{user_id}/imports/absences
Content-Type: multipart/form-data
file: <CSV-Datei>
```

Response identisch zu Zeiteinträgen (`{ imported, errors[] }`).
