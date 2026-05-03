# Clok

Selbst-gehostete Arbeitszeiterfassung nach deutschem Recht (ArbZG-konform).
Entwickelt für lokale Nutzung auf dem MacBook (mit Claude Code) und produktiv
auf Proxmox/Docker im Homelab.

## Features (Rohfassung)

- **Login** mit Benutzername/Passwort, JWT-Token-basiert
- **Zwei Abrechnungsmodi pro User:**
  - `hourly` – stundenbasierte Abrechnung mit individuellem Stundensatz
  - `salary` – Festgehalt mit Soll-Stunden pro Monat
- **Zeiterfassung** mit Start/Ende, Pause, Kommentar, optional Projekt/Kunde
- **ArbZG-Validierung** in Echtzeit:
  - Warnung ab 8 h/Tag, harter Stopp bei 10 h
  - Pflichtpause: ≥30 min bei >6 h, ≥45 min bei >9 h
  - 11 h Mindest-Ruhezeit zwischen zwei Arbeitstagen
  - Wochenarbeitszeit max. 48 h
- **Dashboard** mit Tag/Woche/Monat-Übersicht
  - Verbleibende Soll-Stunden (Festgehalt)
  - Abrechnungssumme brutto (Stundenbasis)
- **CSV-Export** pro Monat (für Lohnbuchhaltung / DATEV-Vorbereitung)

## Tech-Stack

| Komponente | Technologie                        |
| ---------- | ---------------------------------- |
| Backend    | FastAPI + SQLAlchemy 2 + Pydantic  |
| Auth       | JWT (python-jose, bcrypt)          |
| DB         | PostgreSQL 16                      |
| Frontend   | React 18 + Vite + TypeScript       |
| Webserver  | Nginx (statisches Frontend)        |
| Container  | Docker Compose                     |

## Schnellstart (lokal auf MacBook)

```bash
# 1. .env anlegen
cp .env.example .env
# Werte anpassen, SECRET_KEY mit `openssl rand -hex 32` generieren

# 2. Container hochfahren
docker compose up --build

# 3. Initialen Admin-User anlegen
docker compose exec backend python -m app.cli create-user \
  --username lars --password "deinpasswort" --admin

# 4. Browser:
# Frontend  http://localhost:8080
# API-Docs  http://localhost:8000/docs
```

## Deployment Homelab

1. Repo auf den Proxmox-Host pushen (oder via Git auf den LXC ziehen)
2. `.env` mit produktiven Werten anlegen (starkes `SECRET_KEY`!)
3. `docker compose up -d`
4. In Nginx Proxy Manager: `clok.home.f-lv.de` → `http://clok-frontend-1:80`
   (Container im gemeinsamen `proxy-net`, SSL via Let's Encrypt DNS-01)
5. Optional später: Authentik als OIDC-Provider davorschalten

## Architekturhinweise für Claude Code

- ArbZG-Logik liegt isoliert in `backend/app/arbzg.py` – einfacher Ort zum Erweitern
  (z. B. Sonn-/Feiertagsregeln, Schichtarbeit, Tarifvertragsausnahmen)
- Pausen werden bei jedem POST/PATCH eines Eintrags automatisch validiert
- Datenmodell hält bewusst beide Abrechnungsmodi parallel – im UI wird je nach
  User-Profil das passende Widget gerendert
- DB-Migrationen sind in der Rohfassung über `Base.metadata.create_all` gelöst.
  Sobald das Schema stabilisiert ist, auf Alembic umstellen.

## Was bewusst noch fehlt (Backlog)

- [ ] Alembic-Migrations
- [ ] Authentik-OIDC-Integration
- [ ] Feiertagskalender (Baden-Württemberg)
- [ ] Urlaubsverwaltung & Krankheitstage
- [ ] Mehr Export-Formate (DATEV-CSV, PDF-Stundenzettel)
- [ ] Mehrmandantenfähigkeit
- [ ] Audit-Log / unveränderliche Einträge nach Monatsabschluss
- [ ] 2FA / WebAuthn
