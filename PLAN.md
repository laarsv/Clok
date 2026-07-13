# Clok – Refactor-Plan

Status: **Verabschiedet**, alle 8 offenen Fragen geklärt
(siehe Abschnitt 10). Bereit zur Umsetzung in der unten genannten
Commit-Reihenfolge.

Dieser Plan setzt das Briefing für den Multi-User-Refactor in konkrete
Schemata, Endpoints und eine Commit-Reihenfolge um. Offene Fragen am Ende.

---

## 1. Konzeptionelle Eckpunkte

- **Rollen** statt `is_admin`-Flag: `admin`, `employer`, `employee`.
- **Hierarchie über `supervisor_id`** (FK auf `users.id`):
  Mitarbeiter → Arbeitgeber → Admin. NULL für System-Admin.
  Eine Spalte, kein Self-Join-Spaghetti, beliebig erweiterbar
  (z. B. später Team-Lead-Zwischenebene).
- **Stoppuhr-Modus fliegt komplett raus** (Endpoints + UI). Mitarbeiter
  pflegen Einträge nur noch manuell.
- **Alembic ab Tag 1** statt `Base.metadata.create_all`. Schema wird sich
  in den nächsten Iterationen oft ändern; ohne Migrationen wird das ein Krampf.
- **APScheduler** (im Backend-Prozess) für zeitbasierte Mails.
  Begründung: keine zusätzliche Redis-/Worker-Dependency, läuft im selben
  uvicorn-Prozess, für Single-Worker-Setup im Homelab völlig ausreichend.
  Falls später skaliert wird, können wir auf Celery/RQ wechseln, ohne den
  Domain-Code zu ändern (Trigger-Funktionen sind reine Sync-Funktionen).

---

## 2. Datenmodell-Änderungen

### 2.1 Bestehende Tabelle `users` — erweitern

| Feld | Typ | Notiz |
|---|---|---|
| `role` | Enum (`admin`,`employer`,`employee`) | ersetzt `is_admin` |
| `supervisor_id` | FK `users.id` NULL | Hierarchie |
| `email` | String unique | Pflicht für Mailversand |
| `date_of_birth` | Date NULL | |
| `address_line1` | String NULL | |
| `address_line2` | String NULL | |
| `postal_code` | String(10) NULL | |
| `city` | String NULL | |
| `country` | String(2) default `DE` | |
| `social_security_number` | String NULL | sensibel; im UI nur Arbeitgeber/Admin |
| `iban` | String NULL | sensibel; siehe oben |
| `phone` | String NULL | |
| `emergency_contact_name` | String NULL | |
| `emergency_contact_phone` | String NULL | |
| `hire_date` | Date NULL | Eintrittsdatum |
| `federal_state` | Enum BL-Code (`BW`,`BY`,…) NULL | für Feiertage |
| `weekly_hours` | Float NULL | z. B. 40 |
| `annual_vacation_days` | Float NULL | Urlaubsanspruch/Jahr |
| `initial_overtime_hours` | Float default 0 | Übernahme Altsystem |
| `initial_remaining_vacation` | Float default 0 | Übernahme Altsystem |
| `offboarded_at` | DateTime NULL | Soft-Delete-Marker |

Begründung Adresse als Einzelfelder statt JSON: spätere Suche, Export und
DATEV-Anbindung profitieren davon. Notfallkontakt nur als zwei Felder
(Name, Telefon) — komplexer brauchen wir's nicht.

### 2.2 Bestehende Tabelle `time_entries` — unverändert

`break_minutes` bleibt eine Summe; mehrere Pausen werden weiter über
mehrere Einträge pro Tag abgebildet. Falls später echte Pausen-Liste
gewünscht wird, ist das eine eigene Iteration.

### 2.3 Neue Tabelle `absences`

| Feld | Typ |
|---|---|
| `id` | PK |
| `user_id` | FK `users.id` |
| `type` | Enum (`vacation`, `sick`, `unpaid`) |
| `start_date` | Date |
| `end_date` | Date (inklusiv) |
| `status` | Enum (`pending`, `approved`, `rejected`) |
| `requested_at` | DateTime |
| `decided_at` | DateTime NULL |
| `decided_by` | FK `users.id` NULL |
| `note` | Text NULL |
| `created_at`, `updated_at` | |

Krankheit (`sick`) wird beim Anlegen automatisch auf `approved` gesetzt.

### 2.4 Neue Tabelle `audit_log`

| Feld | Typ |
|---|---|
| `id` | PK |
| `actor_user_id` | FK `users.id` |
| `action` | Enum (`create`, `update`, `delete`) |
| `entity_type` | String (`time_entry`, `absence`, `user`) |
| `entity_id` | Integer |
| `before` | JSON NULL |
| `after` | JSON NULL |
| `created_at` | DateTime |

Geschrieben aus dem Service-Layer (siehe 4.1).

**Auditierte Felder (geklärt):**
- `time_entries`: alle Felder, jede CRUD-Aktion.
- `absences`: alle Felder inkl. Status-Übergänge `pending → approved/rejected`.
- `users` — **nur** Felder mit Geld-/Compliance-Effekt:
  `hourly_rate_eur`, `monthly_target_hours`, `weekly_hours`,
  `annual_vacation_days`, `billing_mode`, `role`, `offboarded_at`.
  Reine Stammdaten-Edits (Adresse, Telefon) werden bewusst nicht
  auditiert — würde nur Rauschen erzeugen.

Logging anderer Aktionen (Login, generelle User-Edits, Onboarding-Form
selbst) **nicht** in dieser Iteration — Scope-Schutz.

### 2.5 Neue Tabelle `notification_settings`

Eine Zeile pro User mit Bool-Spalten pro Notification-Typ:
`reminder_no_entry`, `reminder_remaining_vacation`,
`vacation_decided`, `incoming_vacation_request`, `incoming_sick_note`,
`month_complete`. Default alles `true`. Eigene Tabelle (nicht JSON-Feld
auf User), damit Defaults sauber gesetzt werden und neue Trigger ohne
Migration auf bestehende Daten ergänzbar sind.

### 2.6 Neue Tabelle `notification_log`

Dedup-Schutz: pro User+Typ+Bezugszeitraum (z. B. `2026-10` für
Resturlaubsmail) ein Eintrag. Verhindert, dass der Scheduler dieselbe
Mail mehrfach pro Monat verschickt.

### 2.7 Indexe

- `users(supervisor_id)`
- `time_entries(user_id, start_at)` (existiert teilweise)
- `absences(user_id, start_date)`
- `audit_log(entity_type, entity_id)`
- `notification_log(user_id, kind, period_key)` UNIQUE

---

## 3. API-Endpoints

Konvention: Pfade unter `/api/`, Auth via JWT (existiert).
Berechtigungs-Check via FastAPI-Dependencies (`require_role(...)`,
`require_self_or_supervisor(user_id)`).

### 3.1 Bleibt / nur intern angepasst

- `POST   /api/auth/login` (unverändert)
- `GET    /api/auth/me` (Response um neue Felder erweitert)
- `PATCH  /api/auth/me` (Mitarbeiter darf nur Notification-Settings
  ändern, alles andere geht über Arbeitgeber-Endpoints)
- `GET    /api/entries` — listet eigene; Arbeitgeber/Admin können
  `?user_id=` setzen, wenn der Ziel-User in ihrer Hierarchie liegt
- `POST   /api/entries`, `PATCH /api/entries/{id}`,
  `DELETE /api/entries/{id}` — wie bisher, aber mit Audit-Log
- `GET    /api/stats/summary?user_id=` — analog
- `GET    /api/exports/monthly.csv?year&month&user_id=` — analog

### 3.2 Entfernt

- `POST /api/entries/start`
- `POST /api/entries/stop`

### 3.3 Neu — Mitarbeiter-Verwaltung

- `GET    /api/employees` — Arbeitgeber: eigene; Admin: alle
- `POST   /api/employees` — anlegen (Arbeitgeber/Admin)
- `GET    /api/employees/{id}` — Drill-Down
- `PATCH  /api/employees/{id}` — Stammdaten ändern
- `POST   /api/employees/{id}/offboard` — setzt `offboarded_at`
- `POST   /api/employees/{id}/reactivate` — setzt `offboarded_at` zurück
- `DELETE /api/employees/{id}` — Hard-Delete, **nur Admin**, prüft
  10-Jahres-Frist
- `POST   /api/employees/{id}/imports` — Multipart-CSV
  (Format siehe `docs/import-format.md`)

### 3.4 Neu — Abwesenheiten

- `GET    /api/absences` — eigene; mit `?user_id=` für Vorgesetzte
- `POST   /api/absences` — Antrag stellen. Mitarbeiter darf für sich
  selbst (Vacation→pending, Sick→approved). Arbeitgeber/Admin darf
  zusätzlich für seine Mitarbeiter Krankheit eintragen — dann läuft
  parallel eine Info-Mail an den Mitarbeiter („Es wurde eine Krankmeldung
  für dich eingetragen"), damit kein heimliches Manipulieren möglich
  ist. Audit-Log hält `actor_user_id` ≠ `user_id` fest.
- `PATCH  /api/absences/{id}/approve` — Arbeitgeber/Admin
- `PATCH  /api/absences/{id}/reject` — Arbeitgeber/Admin
- `DELETE /api/absences/{id}` — nur eigener `pending`-Antrag oder Admin

### 3.5 Neu — Arbeitgeber-Übersicht

- `GET /api/employer/dashboard` — aggregierte Übersicht für alle
  zugeordneten Mitarbeiter (siehe Spec-Spalten). Eine Query, ein
  Response-Objekt, damit das Frontend nicht N+1-mal nachladen muss.

### 3.6 Neu — Hilfsdienste

- `GET /api/holidays?state=BW&year=2026` — Liste der Feiertage,
  gefüttert aus `python-holidays`
- `GET /api/audit-log?entity_type=&entity_id=` — Arbeitgeber/Admin
- `GET /api/notification-settings` / `PATCH /api/notification-settings`

### 3.7 Berechtigungs-Matrix (Kurz)

| Aktion | Employee | Employer | Admin |
|---|---|---|---|
| Eigene Einträge CRUD | ✓ | – (selbst trackt nicht) | – |
| Fremde Einträge lesen | – | nur eigene MA | alle |
| Fremde Einträge ändern | – | – (Audit!) | – (Audit!) |
| Mitarbeiter anlegen | – | ✓ | ✓ |
| Urlaub beantragen | ✓ | – | – |
| Urlaub entscheiden | – | eigene MA | alle |
| Audit-Log lesen | – | eigene MA | alle |
| Hard-Delete User | – | – | ✓ (mit Frist-Check) |

Lese-/Schreibrechte für Arbeitgeber sind **strikt auf direkte Untergebene**
beschränkt — keine kreuzweise Sichtbarkeit zwischen Arbeitgebern.

---

## 4. Backend-Architektur

### 4.1 Neue Module

```
backend/app/
├── auth.py               (bestehend; Rollen-Helper ergänzen)
├── permissions.py        NEU: require_role, require_supervises(user_id)
├── audit.py              NEU: log_change(actor, action, entity, before, after)
├── holidays_de.py        NEU: Wrapper um python-holidays
├── absences.py           NEU: Geschäftslogik (Resturlaub, Working-Days)
├── balance.py            NEU: Saldo-Berechnung (Soll vs Ist, Übernahme)
├── importers/
│   └── time_entries_csv.py  NEU
├── notifications/
│   ├── resend.py         NEU: HTTP-Client-Wrapper
│   ├── service.py        NEU: send(notification_kind, user, ctx)
│   └── templates loader
├── scheduler.py          NEU: APScheduler-Bootstrap
├── emails/
│   ├── _layout.html.j2
│   ├── vacation_request.txt.j2 + .html.j2
│   ├── vacation_decided.txt.j2 + .html.j2
│   ├── sick_note.txt.j2 + .html.j2
│   ├── month_complete.txt.j2 + .html.j2
│   ├── reminder_no_entry.txt.j2 + .html.j2
│   └── reminder_remaining_vacation.txt.j2 + .html.j2
└── routers/
    ├── employees.py      NEU
    ├── absences.py       NEU
    ├── employer.py       NEU (dashboard)
    ├── holidays.py       NEU
    ├── notifications.py  NEU (settings)
    └── (bestehende)
```

### 4.2 Saldo-Berechnung (`balance.py`)

```
saldo(stichtag) =
    initial_overtime_hours
  + Summe(net_hours bis Stichtag)
  - Summe(target_hours für jeden bisherigen Monat ab hire_date,
          abzüglich Urlaubs-/Kranktage bei Salary)
```

Für Salary-Modell. Bei Hourly: Saldo nicht relevant, stattdessen
`abrechenbar_eur` summieren. Test in `tests/test_balance.py`.

### 4.3 Resturlaub (`absences.py`)

```
resturlaub(jahr) =
    initial_remaining_vacation (nur im Jahr des hire_date / Übernahme)
  + annual_vacation_days
  - Summe(Werktage in approved+pending Urlaubs-Anträgen des Jahres)
```

Werktag = Mo–Fr, Feiertag des Bundeslandes ausgeklammert. Tests dafür.

### 4.4 Audit-Log

Wird aus den Service-Funktionen für `time_entries` und `absences`
geschrieben. Keine Magie via SQLAlchemy-Events, weil wir den Akteur
brauchen — der lebt im Request-Context.

---

## 5. Notifications

### 5.1 Wrapper

`notifications/resend.py` ist ein dünner HTTP-POST-Wrapper auf
`api.resend.com/emails`. Eine Funktion: `send(to, subject, html, text,
reply_to=None)`. Fehler werden geloggt, die aufrufende Aktion läuft
weiter.

**Dev-Modus:** Wenn `RESEND_API_KEY` leer oder ungesetzt ist, wird die
Mail nicht versendet, sondern strukturiert geloggt (Empfänger, Subject,
Text-Body). Damit lokale Entwicklung und CI funktionieren, ohne Resend
zu treffen, und das Verifizieren der Domain `mail.example.com` (DKIM/SPF
bei All-Inkl) parallel laufen kann, ohne den Refactor zu blockieren.

### 5.2 Service-Layer

`notifications/service.py` exportiert genau eine Funktion:

```python
def notify(kind: NotificationKind, user: User, ctx: dict) -> None
```

Sie checkt:
1. Settings des Users für `kind` aktiviert?
2. `notification_log` für Dedup?
3. Lädt Template (txt + html), rendert, ruft Resend-Wrapper.
4. Schreibt `notification_log`.

Aufrufer: API-Routes (synchron, fire-and-forget) und Scheduler-Jobs.

### 5.3 Scheduler-Jobs (APScheduler, daily)

| Job | Zeit | Logik |
|---|---|---|
| `month_complete_check` | letzter Werktag 23:55 | wenn Mitarbeiter heute Eintrag hat → Mail an Arbeitgeber |
| `reminder_no_entry` | täglich 18:00 | s. unten – „zwei aufeinanderfolgende Werktage" |
| `remaining_vacation` | 1. Tag des Monats, ab Oktober | wenn Resturlaub > 50% Jahresanspruch → Mail |

**`reminder_no_entry`-Definition (geklärt):** Werktag = Mo–Fr,
ausgenommen Feiertage des Bundeslandes des Mitarbeiters und Tage mit
genehmigtem Urlaub oder eingetragener Krankheit. Trigger feuert genau
dann, wenn die **zwei letzten Werktage** vor dem Heute-Tag (heute selbst
ausgenommen, weil der MA noch eintragen darf) **beide** keinen
Zeiteintrag haben. Begründung: Ein-Tag-Karenz schützt MA, die spontan
einen Tag krank waren und sich noch nicht gemeldet haben.

Scheduler-Start in `main.py` als `lifespan`-Hook.

### 5.4 Tonalität (Stilrichtlinie)

- **Anrede:** „Hi [Vorname]," — kein „Sehr geehrte/r".
- **Ton:** direkt, knapp, freundlich. Wie eine Slack-Nachricht von
  einem Kollegen, nur in vollständigen Sätzen.
- **Du-Form**, aktive Verben, kurze Sätze, **eine** klare Handlung
  pro Mail.
- **Verbotene Floskeln:** „anbei", „im Anhang finden Sie", „wir möchten
  Sie darauf hinweisen", „Mit freundlichen Grüßen", „bezüglich".
- **Signatur:** „– Clok" oder „– Dein Clok". Kein Disclaimer, keine
  Telefonnummer, keine Werbung.

**Anker-Beispiel 1 — Reminder „keine Zeit eingetragen":**

```
Hi Lars,

du hast die letzten zwei Werktage keine Arbeitszeit eingetragen.
Falls du krank warst oder Urlaub hattest, trag's kurz nach – sonst
geht der Saldo in die Minusstunden.

[Jetzt nachtragen →]

– Clok
```

**Anker-Beispiel 2 — Urlaubsantrag abgelehnt:**

```
Hi Lars,

dein Urlaubsantrag für den 12.–16. August wurde leider abgelehnt.
Grund: "Team-Offsite in der Woche".

Sprich am besten kurz mit Miriam, ob ihr einen anderen Zeitraum findet.

[Antrag öffnen →]

– Clok
```

Diese beiden Beispiele sind die Referenz für Tonalität und Aufbau aller
weiteren Templates: Anrede, ein Sachstand-Satz, ein Handlungs-Satz,
ein CTA-Link, Signatur. HTML-Variante setzt den CTA als Button, sonst
gleicher Inhalt.

---

## 6. Frontend

### 6.1 Routing (react-router-dom v6)

```
/login                     → öffentlich
/                          → Redirect je nach role:
                             admin   → /admin
                             employer → /employer
                             employee → /me
/me                        → Mitarbeiter-Home (Wochenansicht)
/me/month                  → Monatsansicht (Kalender)
/me/absences               → Urlaub/Krankheit
/me/profile                → Stammdaten + Notification-Settings
/employer                  → Dashboard (Tabelle aller MA)
/employer/employees/new    → Onboarding-Form (inkl. CSV-Upload)
/employer/employees/:id    → Drill-Down (Wochen-/Monatsansicht)
/employer/absences         → Posteingang Urlaubsanträge
/admin                     → wie /employer, aber alle Arbeitgeber
                             auswählbar, plus Hard-Delete-UI
/admin/employers           → Arbeitgeber-Verwaltung
```

### 6.2 Komponenten-Skeleton

```
frontend/src/
├── api.ts                  (erweitert um neue Calls)
├── auth/                   (RoleGuard, useCurrentUser)
├── components/
│   ├── WeekView.tsx
│   ├── MonthCalendar.tsx
│   ├── EntryForm.tsx       (ehem. ManualEntryForm aus Dashboard)
│   ├── AbsenceForm.tsx
│   ├── HolidayBadge.tsx
│   └── NotificationSettings.tsx
├── routes/
│   ├── Login.tsx
│   ├── employee/Week.tsx
│   ├── employee/Month.tsx
│   ├── employee/Absences.tsx
│   ├── employee/Profile.tsx
│   ├── employer/Dashboard.tsx
│   ├── employer/EmployeeForm.tsx
│   ├── employer/EmployeeDetail.tsx
│   ├── employer/AbsenceInbox.tsx
│   └── admin/...
└── App.tsx                  (Router-Setup)
```

Bestehende `Dashboard.tsx` wird in `routes/employee/Week.tsx` aufgespalten,
Stoppuhr-Block fliegt raus.

---

## 7. Tests (pytest)

Neu in `backend/tests/`:

- `test_arbzg.py` – Refactor-sicher behalten
- `test_balance.py` – Saldo inkl. Übernahme, Salary vs Hourly
- `test_vacation.py` – Resturlaub mit Feiertagen + pending/approved
- `test_holidays.py` – `python-holidays`-Wrapper für 16 BL
- `test_permissions.py` – Rollen-Matrix
- `test_audit_log.py` – Audit-Einträge bei CRUD
- `test_imports.py` – CSV-Roundtrip + Fehlerzeilen-Report

`requirements-dev.txt` mit `pytest`, `pytest-asyncio`, `httpx` (TestClient).

---

## 8. Migrations-Strategie (Alembic)

1. `alembic init` in `backend/alembic/`
2. **Migration 0001** — baselined das aktuelle Live-Schema
   (`users`, `time_entries`).
3. Ab Migration 0002 jeder Schema-Schritt in eigener Revision (siehe
   Commit-Reihenfolge unten).
4. CLI bekommt `app.cli upgrade-db` als Convenience-Wrapper um
   `alembic upgrade head`.
5. Backend startet mit Alembic-Auto-Upgrade in einem Lifespan-Hook
   (idempotent).

**Tabula rasa für Test-User (geklärt):** Migration 0002 löscht alle
bestehenden User und time_entries (sind Test-Daten, kein echter
Bestand). Anschließend wird der erste Admin per CLI angelegt:

```bash
docker compose exec backend python -m app.cli bootstrap-admin \
  --username lars --email lars@... --password '...'
```

`bootstrap-admin` ist idempotent (refused, wenn bereits ein Admin
existiert), legt Rolle `admin` und alle Notification-Settings auf
Default an. Den Rest (Arbeitgeber, Mitarbeiter) machst du über die UI.

Hinweis Typer-CLI: `bootstrap-admin` ist der zweite Subcommand neben
`create-user` — sobald die App mehr als einen Befehl hat, ruft Typer
sie wieder mit Subcommand-Namen auf (Single-Command-Modus entfällt
automatisch). Das README wird in Commit 25 entsprechend angepasst.

---

## 9. Commit-Reihenfolge

Jeder Punkt ist ein eigener, lauffähiger Commit auf `main` (Repo ist
Solo-Branch, kein PR-Workflow nötig laut Briefing — aber ich kann auch
Feature-Branches öffnen, falls dir das lieber ist).

1. **chore: Alembic einführen, Schema 0001 einfrieren**
2. **feat: Rollenmodell (admin/employer/employee) + supervisor_id**
   inkl. CLI `create-admin`
3. **feat: User-Stammdaten erweitern (Adresse, SV, IBAN, BL, Urlaub …)**
4. **feat: Permissions-Layer (require_role, require_supervises)**
5. **feat: Audit-Log für time_entries**
6. **feat: Absences-Tabelle + CRUD (ohne Mails)**
7. **feat: Audit-Log für absences**
8. **feat: python-holidays-Wrapper + Endpoint**
9. **feat: Resturlaub-/Saldo-Berechnung + Tests**
10. **feat: Notification-Wrapper (Resend) + Settings-Tabelle**
11. **feat: E-Mail-Templates + Trigger an API-Routes anbinden**
12. **feat: APScheduler + zeitbasierte Erinnerungen**
13. **feat: Mitarbeiter-Onboarding-Endpoint + CSV-Import**
14. **feat: Offboarding/Reactivate, Hard-Delete (Admin)**
15. **feat: Arbeitgeber-Dashboard-Endpoint**
16. **chore: Stoppuhr-Endpoints entfernen**
17. **feat(fe): react-router-dom + RoleGuard**
18. **feat(fe): Mitarbeiter-Wochenansicht + Monatskalender**
19. **feat(fe): Mitarbeiter-Profil + Notification-Settings**
20. **feat(fe): Absences-UI (Antrag + Inbox)**
21. **feat(fe): Arbeitgeber-Dashboard + Drill-Down**
22. **feat(fe): Onboarding-Form + CSV-Upload**
23. **feat(fe): Admin-Routen**
24. **chore(fe): Stoppuhr/Timer-UI entfernen**
25. **docs: README, import-format.md, E-Mail-Setup**

Reihenfolge so gewählt, dass:
- Alembic vor jedem Schema-Schritt steht.
- Backend vor Frontend (UI gegen stabile API bauen).
- Stoppuhr-Endpoint **erst spät** entfernt wird, damit das System bis
  dahin benutzbar bleibt.

---

## 10. Geklärte Punkte (vormals offene Fragen)

**F1 – Reminder „keine Zeit eingetragen":** Trigger feuert, wenn
**zwei aufeinanderfolgende Werktage** vor heute keinen Eintrag haben.
Werktag = Mo–Fr ohne BL-Feiertage, ohne genehmigten Urlaub/Krankheit.
Heutiger Tag wird ausgespart (MA darf noch eintragen).

**F2 – Krankmeldung durch Dritte:** Erlaubt für Arbeitgeber/Admin
für eigene MA. `actor_user_id ≠ user_id` wandert ins Audit-Log; MA
bekommt parallel Info-Mail.

**F3 – Audit-Felder:** `time_entries` (alle), `absences` (alle inkl.
Status), `users` nur Geld-/Compliance-Felder (Stundensatz, Soll-Stunden,
Wochenstunden, Urlaubsanspruch, billing_mode, role, offboarded_at).

**F4 – E-Mail unique:** ja. Plus-Aliase reichen für Sonderfälle.

**F5 – CSV-Header:** Pflicht-Header
`datum;start;ende;pause_min;projekt;notiz`. BOM wird toleriert
(Excel-DE schreibt das oft mit). Numerische Felder (zukünftig)
akzeptieren Dezimalkomma. Falsche/fehlende Header → harter Reject mit
Fehlermeldung im Format „Erwarteter Header: …, gefunden: …".

**F6 – Resend-Domain:** noch nicht verifiziert (Lars verifiziert
parallel bei All-Inkl). Code läuft im Dev-Modus weiter, wenn
`RESEND_API_KEY` leer ist — Mails werden geloggt statt versendet.

**F7 – Tonalität:** Stilrichtlinie + zwei Anker-Beispiele in 5.4 oben.

**F8 – Test-User:** Tabula rasa in Migration 0002, anschließend
`bootstrap-admin`-CLI für den ersten Admin (siehe 8).

---

## 11. Was nicht in diesem Refactor ist

(aus Briefing übernommen, hier nur zur Dokumentation)
- 2FA / WebAuthn
- Authentik / OIDC
- PDF-Stundenzettel
- Mehrmandantenfähigkeit über mehrere Admins hinaus
- DATEV-CSV (separat, später)

---

**Plan ist verabschiedet. Implementierung startet mit Commit 1
(Alembic-Einführung) auf Bestätigung „los" hin.**
