# Onboarding-Flow für neue Arbeitgeber

Stand: 2026-05-07. Diese Doku beschreibt den geplanten Invite-basierten
Arbeitgeber-Onboarding-Flow. Stand nach Review-Feedback vom 2026-05-07
(Stepper auf 5 Schritte gekürzt, Token-Strategie auf SHA-256 vereinfacht,
`require_active_user` als eigenes Refactor-Commit, Audit-Felder am
Invite, Race-Schutz beim Accept, Pre-Check auf doppelte E-Mail).

## 1. Abgrenzung

Es existieren bereits zwei Token-Flows, die wir **nicht** anfassen:

- **Mitarbeiter-Onboarding** (Token am `User`, `routers/onboarding.py`,
  Frontend `/onboarding/:token`). Bleibt unverändert. Ein bestehender
  Arbeitgeber legt Mitarbeiter an, der Mitarbeiter folgt seinem
  Token-Link und setzt Passwort + Stammdaten. Token liegt **klartext**
  am User-Datensatz.
- **Passwort-Reset** (Token am `User`).

Der neue Flow ist davon getrennt. Er hat eine eigene Tabelle
`employer_invites` mit **gehashtem** Token (SHA-256), eine eigene
Step-Maschine am User (`onboarding_status`) und einen mehrstufigen
Wizard.

Entscheidung: bestehende Pfade bleiben wie sie sind. Der neue Flow
nutzt unter `/api/onboarding/...` ausschließlich Sub-Pfade mit
festem Präfix (`/invite/...`, `/company`, `/defaults`, `/complete`,
`/status`), die mit dem bestehenden `/api/onboarding/{token}` nicht
kollidieren (FastAPI-Path-Params matchen nicht über `/`).

## 2. State-Diagramm

Im Invite-Flow gibt es **fünf** Schritte. Eine separate
E-Mail-Verifikation entfällt, weil der Klick auf den Token-Link bereits
beweist, dass der Empfänger Zugriff aufs Postfach hat. Ein optionaler
Public-Signup-Pfad (heute deaktiviert, siehe §11) würde diese
Verifikation später als Zwischenstatus `email_pending` ergänzen — ohne
die Nummerierung der fünf hier sichtbaren Schritte zu verschieben.

```
                          ┌──────────────────────────────────────┐
                          │ Admin legt Invite an                 │
                          │ POST /api/admin/employer-invites     │
                          └────────────────┬─────────────────────┘
                                           │ employer_invite-Mail
                                           ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Empfänger klickt Token-Link → /onboarding/invite/:token     │
   │ GET /api/onboarding/invite/{token}                          │
   └─────────────────────────────────────────────────────────────┘
                                           │
                       ┌───────────────────┴──────────────────┐
                       │                                      │
            (404 unbekannt /                          (200, vorausgefüllte
             410 abgelaufen /                          Felder)
             410 zurückgezogen /                              │
             409 schon eingelöst)                             ▼
                                          ┌─────────────────────────────────┐
                                          │ Step 1: Account anlegen         │
                                          │ POST /…/invite/{token}/accept   │
                                          │ → User(role=employer,           │
                                          │      onboarding_status=         │
                                          │      onboarding_step_2,         │
                                          │      email_verified_at=now)     │
                                          │ → Invite.accepted_at=now,       │
                                          │   accepted_by_user_id=user.id   │
                                          │ → Mail an alle Admins:          │
                                          │   admin_employer_onboarding_    │
                                          │   started                       │
                                          │ → JWT-Token zurück, User        │
                                          │   ist eingeloggt                │
                                          └────────────────┬────────────────┘
                                                           ▼
                                          ┌─────────────────────────────────┐
                                          │ Step 2: Firmendaten             │
                                          │ POST /api/onboarding/company    │
                                          │ → companies-Zeile anlegen,      │
                                          │   user.company_id=row.id,       │
                                          │   onboarding_status=            │
                                          │   onboarding_step_3             │
                                          └────────────────┬────────────────┘
                                                           ▼
                                          ┌─────────────────────────────────┐
                                          │ Step 3: Standardwerte für MA    │
                                          │ POST /api/onboarding/defaults   │
                                          │ → companies.default_*           │
                                          │   gesetzt,                      │
                                          │   onboarding_status=            │
                                          │   onboarding_step_4             │
                                          └────────────────┬────────────────┘
                                                           ▼
                                          ┌─────────────────────────────────┐
                                          │ Step 4: Erster Mitarbeiter      │
                                          │ → Button "jetzt anlegen"        │
                                          │   → bestehender                 │
                                          │     /employer/employees/new     │
                                          │   → nach Anlage zurück zu /done │
                                          │ → Button "später" → direkt      │
                                          │   /onboarding/done              │
                                          └────────────────┬────────────────┘
                                                           ▼
                                          ┌─────────────────────────────────┐
                                          │ Step 5: Abschluss               │
                                          │ POST /api/onboarding/complete   │
                                          │ → onboarding_status=active      │
                                          │ → Mail welcome_employer         │
                                          │ → Mail admin_employer_          │
                                          │   onboarding_completed          │
                                          │ → Redirect /employer            │
                                          └─────────────────────────────────┘
```

`onboarding_status`-Werte: `onboarding_step_1` (theoretisch — ein User
landet nie persistent in diesem Status, weil Schritt 1 in einem Request
abgeschlossen wird), `onboarding_step_2`, `onboarding_step_3`,
`onboarding_step_4`, `onboarding_step_5`, `active`. Default für alle
bestehenden User: `active`. Status-Semantik: der Wert beschreibt jeweils
den **nächsten offenen** Schritt.

Frontend-Guard-Regel: Wenn `user.onboarding_status != "active"`,
darf der User nur die Onboarding-Routen aufrufen. Backend-Guard:
`require_active_user`-Dependency wirft 409 in allen geschützten
Routen außer den Onboarding-Endpoints (siehe §4.4).

## 3. Datenmodell

### 3.1 Neue Tabelle `companies`

| Feld                    | Typ            | Pflicht | Notiz |
|-------------------------|----------------|:-------:|-------|
| id                      | int PK         | ✓       |       |
| name                    | varchar(255)   | ✓       | aus Step 2 |
| address_street          | varchar(255)   |         | Step 2 |
| address_zip             | varchar(10)    |         |       |
| address_city            | varchar(128)   |         |       |
| address_country         | varchar(2)     |         | Default `DE` |
| vat_id                  | varchar(32)    |         | optional |
| bundesland              | enum federal_state |     | Step 2, für Feiertagsregelung der Firma |
| industry                | varchar(128)   |         | Freitext (kein Enum, MVP) |
| employee_count_bucket   | enum company_size_bucket | | Werte `1`, `2_5`, `6_10`, `11_plus` |
| default_weekly_hours    | float          |         | Step 3, Default für neue MA |
| default_vacation_days   | float          |         |       |
| default_bundesland      | enum federal_state |     | Default = `bundesland` |
| default_billing_mode    | enum billing_mode |      | `hourly`/`salary` |
| created_at              | timestamp      | ✓       |       |
| created_by_user_id      | int FK users.id (SET NULL) |   |       |

### 3.2 Neue Tabelle `employer_invites`

| Feld                  | Typ            | Pflicht | Notiz |
|-----------------------|----------------|:-------:|-------|
| id                    | int PK         | ✓       |       |
| email                 | varchar(255)   | ✓       | indexiert, NICHT unique (revoked Invites dürfen wiederholt werden) |
| full_name             | varchar(128)   |         | Vorbelegung |
| company_name          | varchar(255)   |         | Vorbelegung |
| token_hash            | varchar(64)    | ✓       | hex-encoded SHA-256 vom Klartext-Token. UNIQUE indexiert. Lookup ist deterministisch (hash vergleichen), kein zusätzlicher Index nötig. Klartext-Token wird nur in der Create-Response zurückgegeben und nirgends gespeichert. |
| expires_at            | timestamp      | ✓       | now() + 14 Tage |
| created_by_admin_id   | int FK users.id (SET NULL) | ✓ |     |
| created_at            | timestamp      | ✓       |       |
| accepted_at           | timestamp      |         |       |
| accepted_by_user_id   | int FK users.id (SET NULL) |   |       |
| revoked_at            | timestamp      |         |       |
| revoked_by_admin_id   | int FK users.id (SET NULL) |   | wer hat zurückgezogen |
| last_resent_at        | timestamp      |         | letzter Resend |
| resent_by_admin_id    | int FK users.id (SET NULL) |   | wer hat zuletzt resendet |
| expired_digest_sent_at| timestamp      |         | wann der Eintrag im Digest war (verhindert Doppel-Mails) |

Status leitet sich aus den Timestamps ab:
- `revoked_at IS NOT NULL`         → revoked
- `accepted_at IS NOT NULL`        → accepted
- `expires_at < now()`             → expired
- sonst                            → pending

Token-Strategie (vereinfacht ggü. erstem Entwurf): SHA-256 reicht, weil
Tokens 32 zufällige Bytes (256 bit Entropie) sind — nicht ratebar und
nicht aus dem Hash rekonstruierbar. Anders als bei Passwörtern brauchen
wir keinen langsamen Hash und keinen Salt. `token_hash` ist UNIQUE
indexiert, der Lookup ist ein normaler `WHERE token_hash = $1` ohne
Constant-Time-Compare-Loop.

### 3.3 `User`-Erweiterung

Neue Spalten:

- `onboarding_status` (enum, Default `active` für alle existierenden Zeilen)
- `email_verified_at` (timestamp, nullable, Backfill: für alle
  bestehenden User auf `created_at` gesetzt — sie sind seit jeher
  ohne separate Verifikation aktiv)
- `company_id` (int FK companies.id, nullable, ON DELETE SET NULL)

### 3.4 Migration `0016`

Eine einzige Migration legt beides an. Backfill-Schritte:

1. `companies` und `employer_invites` anlegen, Enums `company_size_bucket`
   und `onboarding_status` anlegen.
2. `users` um `onboarding_status` (Default `active`),
   `email_verified_at` (Backfill = `users.created_at`) und `company_id`
   erweitern.
3. **Backfill bestehender Arbeitgeber:** für jeden User mit
   `role = 'employer'` eine `companies`-Zeile anlegen, gefüllt mit:
   - `name`              ← `users.company_name`, sonst `users.full_name`,
                            sonst `users.username`
   - `address_*`         ← `users.company_address_*` (street ← line1+line2)
   - `bundesland`        ← `users.federal_state`
   - `default_bundesland`← gleicher Wert
   - `default_weekly_hours` / `default_vacation_days`
                          ← `users.weekly_hours` / `users.annual_vacation_days`
   - `default_billing_mode` ← `users.billing_mode`
   - `created_by_user_id` ← `users.id`
   Anschließend `users.company_id = companies.id` setzen.
4. Bestehende `users.company_*`-Spalten **nicht** droppen in dieser
   Iteration. Lese-/Schreibpfade laufen ab jetzt über `companies`.
   Cleanup-Migration kommt separat, wenn alle Frontend-Codepfade
   nachweisbar umgezogen sind.

`downgrade()`: Tabellen + neue Spalten droppen, Enums droppen, alte
Felder bleiben unangetastet — also ohne Datenverlust.

### 3.5 NotificationSettings-Erweiterung

Eine zweite kleine Migration `0017_notification_settings_admin_flags`:
fügt drei Boolean-Spalten zu `notification_settings` hinzu, jeweils
Default `true`:

- `admin_employer_onboarding_started`
- `admin_employer_onboarding_completed`
- `admin_employer_invite_expired_digest`

Nur Admins haben sinnvollen Bezug, Felder existieren aber für alle —
die `service.notify`-Logik prüft das Flag pro Empfänger.

### 3.6 Hinweis Strukturvertriebs-Erweiterung

`parent_admin_id` an `users` (Self-FK, nullable, indexiert) ist in
dieser Iteration **nicht** Teil des Modells. Die `companies`-Tabelle
bleibt davon unberührt — eine spätere Hierarchie-Erweiterung filtert
nur über `users.parent_admin_id`, ohne `companies` zu migrieren. Die
Mail-Verteiler in §5 holen Admins per `db.query(User).filter(role=admin)`,
das lässt sich später mühelos auf eine Downline einschränken.

## 4. API-Endpoints

### 4.1 Admin-Verwaltung

| Methode | Pfad | Auth | Body / Query | Response |
|---------|------|------|--------------|----------|
| POST    | `/api/admin/employer-invites`             | Admin | `{ email, full_name?, company_name? }` | `{ invite, plaintext_token }` (Token nur hier!) |
| GET     | `/api/admin/employer-invites`             | Admin | `?status=pending|accepted|expired|revoked|all` (Default `all`) | `[ InviteOut ]` (kein Token) |
| GET     | `/api/admin/employer-invites/{id}`        | Admin |                                        | `InviteOut` |
| DELETE  | `/api/admin/employer-invites/{id}`        | Admin | — (zurückziehen, setzt `revoked_at` + `revoked_by_admin_id`) | 204 |
| POST    | `/api/admin/employer-invites/{id}/resend` | Admin | —                                      | `{ invite, plaintext_token? }` |

**Pre-Check beim POST:** Bevor ein neuer Invite angelegt wird, prüft
der Endpoint `db.query(User).filter(User.email == email)` — wenn die
E-Mail bereits einem Konto zugeordnet ist, antwortet er
`409 Conflict` mit `detail: "Für diese E-Mail existiert bereits ein
Konto. Wenn der User Arbeitgeber-Rechte braucht, befördere ihn statt
eines neuen Invites."`. So wird ein paralleles Zweitkonto unter der
gleichen Adresse verhindert. Offene, noch nicht eingelöste Invites
für dieselbe Adresse blockieren das Anlegen nicht — der Admin kann
mehrere Versuche fahren, das letzte gültige Token gewinnt (vorherige
werden via `expires_at` natürlich überlebt oder explizit revoked).

Resend-Verhalten: schickt die Mail erneut, setzt
`last_resent_at = now()` und `resent_by_admin_id = actor.id`. Wenn der
Invite **abgelaufen** ist, werden Token und `expires_at` rotiert;
Klartext-Token erscheint neu in der Response. Wenn der Invite noch
gültig ist, bleibt das Token erhalten und es gibt **keinen** Klartext
zurück (Security — der Admin hat den Link beim ersten Anlegen einmalig
gesehen; eine erneute Offenlegung wäre eine Privilegieneskalation
gegenüber dem zweiten Admin).

### 4.2 Onboarding (öffentlich, Token-basiert)

| Methode | Pfad | Auth | Status-Codes |
|---------|------|------|--------------|
| GET  | `/api/onboarding/invite/{token}`        | — | 200 ok / 404 unbekannt / 410 abgelaufen / 410 zurückgezogen / 409 bereits eingelöst |
| POST | `/api/onboarding/invite/{token}/accept` | — | 201 angelegt + JWT / 404 unbekannt / 410 abgelaufen / 410 zurückgezogen / 409 bereits eingelöst / 422 Validierung / 409 username-/email-Konflikt |

`accept`-Body:
```json
{
  "username": "string (^[a-z0-9._-]{3,32}$)",
  "password": "string (>= 12 chars)",
  "full_name": "string (Pflicht, falls nicht aus Invite)",
  "accept_terms": true
}
```
Antwort enthält `{ user: UserOut, token: { access_token, token_type } }`,
damit der Wizard sofort eingeloggt weiterläuft, ohne dass der User
zwei Schritte hintereinander Passwort eingibt.

### 4.3 Onboarding (auth, eingeloggter Wizard-User)

| Methode | Pfad | Erlaubt im Status |
|---------|------|-------------------|
| GET  | `/api/onboarding/status`   | beliebig — eigener Status |
| POST | `/api/onboarding/company`  | `onboarding_step_2` |
| POST | `/api/onboarding/defaults` | `onboarding_step_3` |
| POST | `/api/onboarding/complete` | `onboarding_step_4` (auch ohne ersten MA) |

Body-Schemas (gekürzt):

- `company`: `{ name, address_street, address_zip, address_city,
  address_country, vat_id?, bundesland, industry?,
  employee_count_bucket }`
- `defaults`: `{ default_weekly_hours, default_vacation_days,
  default_bundesland, default_billing_mode }`
- `complete`: leerer Body

Jede dieser Routen wirft 409, wenn der User nicht im erwarteten Status
ist — das Frontend interpretiert das und routet auf den richtigen
Schritt um.

### 4.4 Globale Auth-Verschärfung

Neue Dependency `require_active_user` (lebt in `app/permissions.py`):

```python
def require_active_user(user: User = Depends(get_current_user)) -> User:
    if user.onboarding_status != OnboardingStatus.ACTIVE:
        raise HTTPException(409, "Onboarding noch nicht abgeschlossen.")
    return user
```

Alle bestehenden Auth-Routen wechseln von `Depends(get_current_user)`
auf `Depends(require_active_user)` — **außer**:

- `/api/auth/me`, `/api/auth/change-password`
- `/api/onboarding/*`
- `/api/onboarding/invite/*` (öffentlich, kein Auth)

Ausgerollt als **Commit 4** (eigenes Refactor-Commit) **nach** den
Onboarding-Endpoints. Die Wizard-Routen selbst nutzen weiter
`get_current_user`. So ist die Reihenfolge sauber: erst legen wir die
Routen an, in die ein Onboarding-User darf (Commit 3), dann sperren
wir alle anderen Routen für ihn (Commit 4).

## 5. Mails

Templates in `backend/app/emails/` + Eintrag in `_TEMPLATES`-Map in
`notifications/service.py`. Plain-Text + HTML. Gemeinsamer
`_layout.html.j2` wird wiederverwendet.

| Trigger | Template | Empfänger | Settings-Toggle |
|---------|----------|-----------|-----------------|
| Admin legt Invite an / Resend | `employer_invite` | eingeladener Arbeitgeber | always-on |
| Step 1 abgeschlossen | `admin_employer_onboarding_started` | alle Admins | `admin_employer_onboarding_started` |
| Step 5 abgeschlossen | `welcome_employer` | Arbeitgeber | always-on |
| Step 5 abgeschlossen | `admin_employer_onboarding_completed` | alle Admins | `admin_employer_onboarding_completed` |
| Daily-Digest 08:00 | `admin_employer_invite_expired` | alle Admins | `admin_employer_invite_expired_digest` |

Neue `NotificationKind`-Enums: `EMPLOYER_INVITE`,
`EMPLOYER_ONBOARDING_STARTED`, `EMPLOYER_ONBOARDING_COMPLETED`,
`WELCOME_EMPLOYER`, `EMPLOYER_INVITE_EXPIRED_DIGEST`.

`_setting_enabled` muss auf `_invite_always_on`-Sentinel zurückgreifen
für die zwei always-on Mails (genauso wie `INVITE_EMPLOYEE` heute).

## 6. APScheduler-Job

`job_employer_invite_expired_digest`, Cron 08:00 Europe/Berlin, läuft
in `scheduler.py` neben den drei bestehenden Jobs. Logik:

1. Alle Invites mit `expires_at < now()`, `accepted_at IS NULL`,
   `revoked_at IS NULL`, `expired_digest_sent_at IS NULL`.
2. Wenn keine: still beenden.
3. Sonst: pro Admin (mit Setting `admin_employer_invite_expired_digest`)
   eine Sammel-Mail mit der Liste verschicken.
4. Auf jedem versendeten Invite `expired_digest_sent_at = now()` setzen,
   damit kein erneuter Hit am nächsten Tag.

Idempotenz pro Empfänger pro Tag wird zusätzlich über `notification_log`
mit `period_key = date.today().isoformat()` abgesichert (mehrfacher
Container-Restart führt nicht zu Doppelmails).

## 7. Frontend-Routen

Neu:

| Route | Zweck | Guard |
|-------|-------|-------|
| `/onboarding/invite/:token`   | Step 1 (Token-Preview + Account anlegen) | öffentlich |
| `/onboarding/company`         | Step 2 | OnboardingGuard expects step_2 |
| `/onboarding/defaults`        | Step 3 | step_3 |
| `/onboarding/first-employee`  | Step 4 | step_4 |
| `/onboarding/done`            | Step 5 | step_4 → triggert `complete`, nach Erfolg redirect /employer |
| `/admin/invites`              | Admin-Verwaltung | RoleGuard admin |

Bestehende Route `/onboarding/:token` (Mitarbeiter) **bleibt**.
Frontend-Routen-Reihenfolge in `App.tsx`: spezifische Pfade
(`/onboarding/invite/:token`, `/onboarding/company`, …) **vor** dem
generischen `/onboarding/:token`, damit React-Router korrekt matcht.

Neuer `OnboardingGuard`:

- Liest `user.onboarding_status`.
- Wenn aktive Route nicht zum Status passt: redirect auf den richtigen
  Schritt.
- Wenn Status `active`: redirect auf `homeForRole(user.role)`.
- Wenn nicht eingeloggt: redirect `/login`.

`RoleGuard` lässt User mit `onboarding_status != active` ebenfalls
nicht durch — er redirected sie auf den nächsten offenen Schritt.

Stepper-Komponente `<OnboardingStepper active={N} />` im Header der
Wizard-Seiten. **Fünf** Punkte mit Label, der aktive in mint, alle
früheren als check-marks. Keine durchgestrichenen oder ausgegrauten
Punkte — der User sieht eine geradlinige 1→2→3→4→5-Sequenz.

Admin-Seite `/admin/invites`:

- Tabelle mit Spalten: Empfänger (E-Mail), Erstellt am, Ablauf, Status,
  Eingeladen von, Aktionen.
- Status-Pille (offen / eingelöst / abgelaufen / zurückgezogen) in
  konsistenten Farben (mint / muted / warning / error — wie Feedback-
  Status).
- Header-Button „Neuen Invite anlegen" öffnet Modal mit E-Mail (Pflicht),
  Name, Firmenname.
- Nach erfolgreichem Anlegen: Toast „Einladung verschickt" plus Box
  mit Klartext-Link, Copy-Button. Schließen löscht den Klartext aus
  dem DOM.
- Aktionen pro Zeile: „Erneut senden", „Zurückziehen" (nur wenn
  pending), „Link kopieren" (nur direkt nach dem Anlegen, nicht
  retrospektiv — Klartext ist weg).

Nav-Eintrag: Admin bekommt zusätzlichen Tab „Einladungen" links neben
„Feedback".

## 8. Validierung & Sicherheit

- Passwort min. 12 Zeichen (frontend live-Indikator: Zeichenzahl,
  Stärke-Hinweis ohne externe Lib — einfache Heuristik).
- E-Mail per `pydantic.EmailStr`, MX-Check **nicht** in der Iteration
  (würde DNS-Lookups ans Backend hängen).
- Username: `^[a-z0-9._-]{3,32}$`. Eindeutigkeit gegen `users.username`.
- **Token-Erzeugung:** 32 Bytes URL-Safe Random
  (`secrets.token_urlsafe(32)`).
- **Token-Hashing:** SHA-256 hex (`hashlib.sha256(token.encode()).hexdigest()`).
  Klartext-Token wird **nie** gespeichert, nicht geloggt, nicht
  gemailt außer im signierten Onboarding-Link selbst. Wo Logs nötig
  sind (z. B. Resend-Endpoint), wird `tok_***` ausgegeben.
- **Race-Schutz beim Accept:** Der `POST /api/onboarding/invite/{token}/accept`
  läuft komplett in einer Transaktion und liest den Invite mit
  `db.query(EmployerInvite).filter(token_hash=h).with_for_update().first()`.
  So wird verhindert, dass zwei parallele Requests denselben Token
  einlösen — die zweite Transaktion wartet, sieht dann
  `accepted_at IS NOT NULL` und antwortet 409.
- `accept_terms` muss `true` sein. Backend prüft das hart und
  speichert in `users.email_verified_at` zusätzlich zur Step-Marker
  (DSGVO-relevant: Akzeptanz fehlt sonst).

## 9. Tests

`backend/tests/test_onboarding_invite.py` (neu):

- happy path: Invite anlegen → preview → accept → status `step_2` → JWT
  funktioniert
- ungültiger Token: 404
- abgelaufener Token: 410
- doppelt eingelöst: 409 beim zweiten Aufruf
- duplicate username/email beim accept: 409
- accept_terms=false: 422
- zurückgezogener Invite: 410
- Pre-Check: POST /api/admin/employer-invites mit existierender E-Mail → 409
- Race: zwei parallele accepts auf denselben Token → genau ein 201, ein 409
  (über `pytest`-Threadtest oder via `with_for_update` und manueller
  Transaktions-Choreographie verifiziert)

`backend/tests/test_onboarding_wizard.py`:

- Status `step_2`: company-Endpoint klappt, defaults-Endpoint 409
- Status `step_3`: company-Endpoint 409, defaults-Endpoint klappt
- Status `step_4`: complete setzt status=active, schickt 2 Mails (die
  zweite über alle Admins)
- ein Onboarding-User wird von `require_active_user` an einer
  beliebigen normalen Route mit 409 abgewiesen

`backend/tests/test_admin_invites.py`:

- POST/GET/DELETE/resend
- nur Admin-User (Employer/Employee → 403)
- Resend bei abgelaufenem Invite rotiert das Token
- DELETE/Resend setzen die neuen Audit-Felder (`revoked_by_admin_id`,
  `last_resent_at`, `resent_by_admin_id`)

`backend/tests/test_invite_expired_digest.py`:

- Time-Travel mit `freezegun.freeze_time` (Dependency hinzufügen, falls
  nicht vorhanden — pyproject prüfen)
- 3 Invites: einer abgelaufen, einer akzeptiert, einer pending →
  Digest enthält nur den abgelaufenen
- zweiter Job-Lauf am gleichen Tag: keine Doppel-Mail (über
  `expired_digest_sent_at` und `notification_log`)

`backend/tests/test_migration_0016.py`:

- `alembic upgrade head` kommt durch
- Backfill: bestehender Arbeitgeber-User hat danach `company_id !=
  NULL` und `companies`-Zeile mit den richtigen Default-Werten
- `alembic downgrade -1` rückwärts ohne Datenverlust für unberührte
  Spalten

## 10. Commits (Reihenfolge)

1. `feat(db)`: Migration 0016 + companies/employer_invites-Modelle +
   `User.onboarding_status / email_verified_at / company_id`. Mit
   Backfill-Logik. Migration 0017 für admin-NotificationSettings-Flags.
2. `feat(api)`: Admin-Invite-Endpoints + Mail-Template
   `employer_invite` + Token-Hashing-Helper (SHA-256) + Pre-Check auf
   bestehende E-Mail.
3. `feat(api)`: Onboarding-Endpoints (`accept`, `status`, `company`,
   `defaults`, `complete`) + alle Wizard-Mail-Templates.
   `accept` mit `with_for_update`-Race-Schutz.
4. `refactor(api)`: `require_active_user` global ausrollen — alle
   bestehenden Auth-Routen umschreiben, Onboarding- und `/auth/me`-/
   `change-password`-Routen ausgenommen.
5. `feat(fe)`: Wizard-Routen + 5-Step-Stepper + OnboardingGuard.
6. `feat(fe)`: Admin-Verwaltungsseite `/admin/invites` inkl. Modal,
   Copy-Link, Resend, Revoke.
7. `feat(scheduler)`: Daily-Digest-Job für abgelaufene Invites.
8. `test`: alle pytest-Suiten + README/`.env.example` (neue Settings:
   `EMPLOYER_INVITE_TTL_DAYS=14`, `PUBLIC_SIGNUP_ENABLED=false`).

## 11. Was offen bleibt / explizit nicht in dieser Iteration

- **Kein Public-Signup-Endpoint** aktiv. Code-seitig wird die
  Einstiegsstelle (`POST /api/onboarding/signup`) als Stub mit
  `if not settings.public_signup_enabled: raise 404` vorbereitet, damit
  später nur das Flag und ein eigener `email_pending`-Zwischenstatus
  zu aktivieren sind. Die fünf hier beschriebenen Schritte ändern sich
  dadurch nicht.
- **Kein Drop der alten `users.company_*`-Spalten.** Die Daten werden
  bei der Migration kopiert, das User-Feld bleibt schreibbar — wir
  räumen erst, wenn nachweislich kein Code mehr darauf zugreift.
- **Kein 2FA, Captcha, Social Login, Payment.**

## 12. Review-Verlauf

- 2026-05-07, V1: ursprünglicher Entwurf mit 6 Steps, bcrypt + Token-Lookup-
  Prefix, `require_active_user` als Teil von Commit 3.
- 2026-05-07, V2 (dieses Dokument): Stepper auf 5 Schritte gekürzt,
  Token-Strategie auf SHA-256 vereinfacht, `require_active_user` als
  eigenes Refactor-Commit (jetzt Commit 4), Pre-Check auf bestehende
  E-Mail beim Anlegen, Race-Schutz beim Accept via `with_for_update`,
  Audit-Felder am Invite (`revoked_by_admin_id`, `resent_by_admin_id`,
  `last_resent_at`), Status-Tabelle ergänzt um `revoked → 410` für
  beide öffentlichen Endpoints.
