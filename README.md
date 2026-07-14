# Clok

Selbst-gehostete Arbeitszeiterfassung nach deutschem Recht (ArbZG-konform),
für Mehrnutzer-Setups mit Rollen **Admin / Arbeitgeber / Mitarbeiter**.
Entwickelt für lokale Nutzung auf dem MacBook (mit Claude Code) und
produktiv auf Proxmox/Docker im Homelab.

## Features

- **Rollenmodell**: Admin (übergreifend), Arbeitgeber (verwaltet eigene
  MA), Mitarbeiter (trackt sich selbst).
- **Manuelle Zeiterfassung** (kein Stoppuhr-Modus): Start, Ende, Pause,
  Notiz, Projekt – auch nachträglich.
- **Zwei Abrechnungsmodelle pro User**: `hourly` (Stundensatz) oder
  `salary` (Soll-Stunden/Monat).
- **ArbZG-Validierung in Echtzeit**: Tagesgrenzen 8 h soft / 10 h hart,
  Pflichtpause ≥ 30 / 45 min, 11 h Ruhezeit, 48 h-Wochengrenze.
- **Urlaub & Krankheit**: Anträge mit Approve/Reject-Flow, Krankheit
  durch MA selbst (auto-approved) oder durch Arbeitgeber (Vertretungs-
  fall, mit Audit + Info-Mail an MA).
- **Wochen- und Monatsansicht** mit Feiertags-Markierung pro Bundesland
  und Urlaub/Krankheit als farbigen Tagesblock.
- **Arbeitgeber-Dashboard** mit aggregierter Übersicht (Soll/Ist, Saldo,
  Urlaubsstand, Krankheitstage, letzte Aktivität).
- **Self-Service-Onboarding für Mitarbeiter**: Arbeitgeber legt nur
  Vertragsdaten an (E-Mail, Beschäftigung, Urlaub, Bundesland),
  Mitarbeiter bekommt eine Einladungsmail mit Link, setzt Passwort
  und ergänzt persönliche Stammdaten (Adresse, IBAN, …) selbst.
- **Invite-basiertes Onboarding für Arbeitgeber**: Admin lädt einen
  Arbeitgeber per Mail ein, dieser durchläuft einen 5-Schritt-Wizard
  (Account → Firmendaten → MA-Defaults → Erster MA optional → Live)
  und legt direkt los. Token-Lebenszyklus mit Resend, Revoke und
  Daily-Digest abgelaufener Invites. Details: `docs/onboarding-flow.md`.
- **Arbeitstage pro Woche** (`work_days`) pro Mitarbeiter wählbar.
  Mindesturlaub nach BUrlG § 3 wird automatisch berechnet
  (24 / 6 × Arbeitstage) und als Floor erzwungen; mehr als das Minimum
  bleibt erlaubt.
- **Onboarding inkl. CSV-Import** historischer Zeiteinträge **und**
  Abwesenheiten (Format: `docs/import-format.md`).
- **Audit-Log** für `time_entries`, `absences` und Geld-/Compliance-
  Felder am User-Datensatz.
- **Offboarding ohne Datenverlust**: `offboarded_at` als Soft-Delete-
  Marker, Hard-Delete nur durch Admin nach 10 Jahren.
- **E-Mails via Brevo**: Antrags-/Entscheidungs-Mails, Krankmeldung,
  Reminders. Pro User abschaltbar pro Notification-Typ.
- **CSV-Export pro Monat** (DATEV-Vorbereitung).

## Tech-Stack

| Komponente | Technologie                              |
| ---------- | ---------------------------------------- |
| Backend    | FastAPI + SQLAlchemy 2 + Pydantic 2      |
| Auth       | JWT (python-jose, bcrypt)                |
| DB         | PostgreSQL 16, Alembic-Migrationen       |
| Mail       | Brevo (Transactional-API), Jinja2-Templates |
| Scheduler  | APScheduler im Backend-Prozess           |
| Frontend   | React 18 + Vite + TS + react-router-dom  |
| Webserver  | Nginx (statisches Frontend, API-Proxy)   |
| Container  | Docker Compose                           |

## Schnellstart (lokal)

```bash
cp .env.example .env
# SECRET_KEY: openssl rand -hex 32
# BREVO_API_KEY kann erst mal leer bleiben → Dev-Modus, Mails landen nur im Log

docker compose up --build

# Beim ersten Start einmalig den ersten Admin anlegen:
docker compose exec backend python -m app.cli bootstrap-admin \
  --username lars --email lars@example.com --password '...'
```

Frontend: http://localhost:8080 · API-Docs: http://localhost:8000/docs

## Deployment Hetzner (Docker Compose + zentraler Caddy)

Läuft im House-Style neben den anderen Tools: gemeinsames externes Docker-Netz
`proxy`, ein zentraler Caddy terminiert TLS und routet per Container-Namen.
Deploy-Target ist `docker-compose.prod.yml` (Container `clok-api`/`clok-web`,
Postgres im privaten Netz `internal`).

1. Repo auf den Host ziehen (`/opt/appdata/clok` ist die übliche Stelle).
2. `.env` mit produktiven Werten anlegen (starkes `SECRET_KEY`, Brevo-Daten,
   `APP_BASE_URL=https://clok.vrwb.de`).
3. `Caddyfile.snippet` ins zentrale Caddyfile einbinden und Caddy neu laden
   (`clok.vrwb.de` → `/api/*` an `clok-api:8000`, sonst `clok-web:80`).
4. `./deploy.sh` (git pull + `docker compose -f docker-compose.prod.yml up -d --build`;
   legt das Netz `proxy` an, falls es fehlt).
5. Erstmaligen Admin via `bootstrap-admin` anlegen (siehe oben).

Migrationen laufen automatisch beim Backend-Start (`alembic upgrade head`).

## E-Mail-Setup (Brevo)

Mail-Versand läuft über die [Brevo](https://brevo.com) Transactional-API.
Solange `BREVO_API_KEY` leer ist, läuft das Backend im **Dev-Modus**: Mails
werden strukturiert geloggt, **nicht** versendet.

Der Absender (`EMAIL_FROM`) muss in Brevo als verifizierter Absender bzw. über
eine authentifizierte Domain (DKIM/SPF) freigeschaltet sein.

### Schritte für die produktive Aktivierung

1. **Brevo-Account anlegen**, unter *Senders, Domains & Dedicated IPs* die
   Domain hinzufügen.
2. **DKIM + SPF (+ DMARC)** als DNS-Einträge beim DNS-Provider eintragen.
3. Domain-/Absender-Status muss „verified" sein, sonst lehnt Brevo den
   Versand ab.
4. **API-Key** unter *SMTP & API → API Keys* erzeugen, in `.env` als
   `BREVO_API_KEY=xkeysib-…` eintragen, Container neu starten.

### Variablen

| Variable          | Bedeutung                                             |
| ----------------- | ----------------------------------------------------- |
| `BREVO_API_KEY`   | Brevo-Schlüssel (`xkeysib-…`); leer = Dev-Modus       |
| `EMAIL_FROM`      | Absender, `clok@f-lv.de` oder `Clok <clok@f-lv.de>`   |
| `EMAIL_REPLY_TO`  | Optional: Reply-To-Adresse                            |
| `APP_BASE_URL`    | Basis-URL für Mail-Links                              |

### Test-Workflow

Drei Wege, Mailversand zu prüfen:

**1. CLI im Backend-Container** (am direktesten):

```bash
docker compose exec backend python -m app.cli send-test-email --to lars@example.com
```

Mögliche Ausgaben:
- `OK – an lars@example.com verschickt. message_id=<uuid>` – Mail bei
  Brevo angenommen, Message-ID lässt sich im Brevo-Dashboard prüfen.
- `Dev-Modus aktiv …` – `BREVO_API_KEY` nicht gesetzt.
- `FEHLER 4xx <name>: <message>` – Brevo hat abgelehnt, Text aus der
  API-Response.

**2. Admin-Endpoint** `POST /api/admin/test-email` (Rolle Admin):

```bash
TOKEN=$(curl -s -X POST https://clok.example.com/api/auth/login \
  -d "username=lars&password=…" \
  -H "Content-Type: application/x-www-form-urlencoded" | jq -r .access_token)

curl -s -X POST https://clok.example.com/api/admin/test-email \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "lars@example.com"}' | jq
```

Response: `dev_mode`, `success`, `message_id`, `status_code`,
`error_name`, `error_message`.

**3. UI-Button im Profil** (Admin/Arbeitgeber): testet immer an die
eigene E-Mail-Adresse.

### Fehler-Diagnose

Bei jedem Brevo-Fehler (4xx/5xx) loggt der Wrapper den vollen
Response-Body als `logger.error`:

```bash
docker compose logs backend | grep "Brevo"
```

Im Erfolgsfall: `Brevo ok messageId=<id> to=… subject=…`.

### Trigger im Überblick

| Ereignis                                  | Empfänger          | Trigger-Quelle |
| ----------------------------------------- | ------------------ | -------------- |
| Mitarbeiter angelegt (Onboarding-Invite)  | Mitarbeiter        | API            |
| Urlaubsantrag eingereicht                 | Arbeitgeber/Admin  | API            |
| Urlaubsantrag entschieden                 | Mitarbeiter        | API            |
| Krankmeldung eingetragen                  | Arbeitgeber/Admin  | API            |
| Krankmeldung durch Dritte                 | Mitarbeiter (Info) | API            |
| Letzter Werktag des Monats getrackt       | Arbeitgeber/Admin  | Scheduler      |
| Zwei Werktage ohne Eintrag                | Mitarbeiter        | Scheduler      |
| Resturlaub-Erinnerung (Q4, monatlich)     | Mitarbeiter        | Scheduler      |
| Arbeitgeber eingeladen                    | Arbeitgeber        | API            |
| Arbeitgeber-Onboarding gestartet          | Admins             | API            |
| Arbeitgeber-Onboarding abgeschlossen      | Admins + neuer AG  | API            |
| Arbeitgeber-Invites abgelaufen (Digest)   | Admins             | Scheduler      |

Invite-Mails sind **nicht** über User-Settings abschaltbar – ohne sie
kommt der MA nicht ins Konto.

Alle Trigger sind pro User unter `/me/profile` einzeln abschaltbar.

## Vertragsverlauf

Beim Anlegen eines Mitarbeiters entsteht automatisch der erste
Vertragseintrag mit `valid_from = hire_date` (oder heute). Über
**Mitarbeiter-Detail → Vertragsverlauf → + Neuer Vertrag** legt der
Arbeitgeber/Admin spätere Änderungen ab Stichtag an.

- **In die Zukunft**: Wirksam ab Stichtag, ändert nichts an
  vergangenen Berechnungen.
- **In die Vergangenheit** (Korrektur): überschreibt rückwirkend ab
  dem Stichtag. Saldo & Resturlaub werden beim nächsten Aufruf neu
  errechnet.
- **Letzter Eintrag** ist nicht löschbar – jedem User muss
  mindestens ein gültiger Vertragsstand bleiben.
- Alle Änderungen landen im **Audit-Log** unter
  `entity_type = "employment_terms"`.

Die User-Spalten (`hourly_rate_eur`, `monthly_target_hours`, …)
sind ein Cache des aktuell gültigen Vertrags und werden bei jeder
Vertragsänderung automatisch synchronisiert. Wer Vergangenheits-
Saldi prüft, sollte sich auf `employment_terms` und `terms_at(d)`
verlassen.

## Architekturhinweise

- ArbZG-Logik isoliert in `backend/app/arbzg.py`.
- Feiertagslogik in `backend/app/holidays_de.py` (Wrapper um
  `python-holidays`, 16 Bundesländer).
- Resturlaub & Saldo in `backend/app/absences.py` und `balance.py`,
  mit pytest-Tests in `backend/tests/`.
- Vertragsverlauf in `backend/app/terms.py` – `terms_at(user, d)`
  ist der zentrale Helper für historisch korrekte Berechnungen.
- Mail-Wrapper `backend/app/notifications/brevo.py` – Provider
  austauschbar, Templates in `backend/app/emails/*.j2`.
- Frontend-Routing rollenbasiert (`/me`, `/employer`, `/admin`),
  `RoleGuard` prüft pro Route.

## CSV-Import

Format und Beispiele: [`docs/import-format.md`](docs/import-format.md).

## Backlog

- [ ] Authentik-OIDC-Integration
- [ ] DATEV-CSV / PDF-Stundenzettel
- [ ] Mehrmandantenfähigkeit über mehrere Admins hinaus
- [ ] 2FA / WebAuthn
- [ ] Persistenter APScheduler-Job-Store (für Multi-Worker)
