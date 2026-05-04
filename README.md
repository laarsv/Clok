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
- **Onboarding inkl. CSV-Import** historischer Zeiteinträge
  (Format: `docs/import-format.md`).
- **Audit-Log** für `time_entries`, `absences` und Geld-/Compliance-
  Felder am User-Datensatz.
- **Offboarding ohne Datenverlust**: `offboarded_at` als Soft-Delete-
  Marker, Hard-Delete nur durch Admin nach 10 Jahren.
- **E-Mails via Resend**: Antrags-/Entscheidungs-Mails, Krankmeldung,
  Reminders. Pro User abschaltbar pro Notification-Typ.
- **CSV-Export pro Monat** (DATEV-Vorbereitung).

## Tech-Stack

| Komponente | Technologie                              |
| ---------- | ---------------------------------------- |
| Backend    | FastAPI + SQLAlchemy 2 + Pydantic 2      |
| Auth       | JWT (python-jose, bcrypt)                |
| DB         | PostgreSQL 16, Alembic-Migrationen       |
| Mail       | Resend (HTTP-API), Jinja2-Templates      |
| Scheduler  | APScheduler im Backend-Prozess           |
| Frontend   | React 18 + Vite + TS + react-router-dom  |
| Webserver  | Nginx (statisches Frontend, API-Proxy)   |
| Container  | Docker Compose                           |

## Schnellstart (lokal)

```bash
cp .env.example .env
# SECRET_KEY: openssl rand -hex 32
# Resend kann erst mal leer bleiben → Dev-Modus, Mails landen nur im Log

docker compose up --build

# Beim ersten Start einmalig den ersten Admin anlegen:
docker compose exec backend python -m app.cli bootstrap-admin \
  --username lars --email lars@example.com --password '...'
```

Frontend: http://localhost:8080 · API-Docs: http://localhost:8000/docs

## Deployment Homelab (Proxmox-LXC + NPM)

1. Repo auf den LXC ziehen (`/opt/appdata/clok` ist die übliche Stelle).
2. `.env` mit produktiven Werten anlegen (starkes `SECRET_KEY`,
   Resend-Daten, `APP_BASE_URL=https://clok.home.f-lv.de`).
3. `docker compose up -d --build`.
4. Erstmaligen Admin via `bootstrap-admin` anlegen (siehe oben).
5. In Nginx Proxy Manager: `clok.home.f-lv.de` → `http://clok-frontend-1:80`
   (gemeinsames `proxy-net`, SSL via Let's Encrypt DNS-01).

## E-Mail-Setup (Resend)

Mail-Versand läuft über [Resend](https://resend.com). Solange
`RESEND_API_KEY` leer ist, läuft das Backend im **Dev-Modus**: Mails
werden strukturiert geloggt, **nicht** versendet. So kannst du das
System lokal benutzen, ohne dass deine Domain bei Resend verifiziert
sein muss.

### Schritte für die produktive Aktivierung

1. **Resend-Account anlegen**, im Dashboard eine Domain hinzufügen
   (`send.f-lv.de` für dieses Setup).
2. **DKIM + SPF + Return-Path** als DNS-Einträge bei deinem
   DNS-Provider (z. B. All-Inkl) eintragen, wie Resend sie anzeigt.
3. Domain-Status muss „verified" sein, sonst werden alle Mails von
   Resend abgelehnt.
4. **API-Key** im Resend-Dashboard erzeugen, in `.env` als
   `RESEND_API_KEY=…` eintragen, Container neu starten.

### Variablen

| Variable             | Bedeutung                                |
| -------------------- | ---------------------------------------- |
| `RESEND_API_KEY`     | Resend-Schlüssel; leer = Dev-Modus       |
| `RESEND_FROM_EMAIL`  | Absender, default `clok@send.f-lv.de`    |
| `RESEND_REPLY_TO`    | Optional: Reply-To-Adresse               |
| `APP_BASE_URL`       | Basis-URL für Mail-Links                 |

### Trigger im Überblick

| Ereignis                                  | Empfänger          | Trigger-Quelle |
| ----------------------------------------- | ------------------ | -------------- |
| Urlaubsantrag eingereicht                 | Arbeitgeber/Admin  | API            |
| Urlaubsantrag entschieden                 | Mitarbeiter        | API            |
| Krankmeldung eingetragen                  | Arbeitgeber/Admin  | API            |
| Krankmeldung durch Dritte                 | Mitarbeiter (Info) | API            |
| Letzter Werktag des Monats getrackt       | Arbeitgeber/Admin  | Scheduler      |
| Zwei Werktage ohne Eintrag                | Mitarbeiter        | Scheduler      |
| Resturlaub-Erinnerung (Q4, monatlich)     | Mitarbeiter        | Scheduler      |

Alle Trigger sind pro User unter `/me/profile` einzeln abschaltbar.

## Architekturhinweise

- ArbZG-Logik isoliert in `backend/app/arbzg.py`.
- Feiertagslogik in `backend/app/holidays_de.py` (Wrapper um
  `python-holidays`, 16 Bundesländer).
- Resturlaub & Saldo in `backend/app/absences.py` und `balance.py`,
  mit pytest-Tests in `backend/tests/`.
- Mail-Wrapper `backend/app/notifications/resend.py` – Provider
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
