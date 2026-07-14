#!/usr/bin/env bash
# Clok – Deploy auf dem Hetzner-Host (übliche Stelle: /opt/appdata/clok).
# Holt den aktuellen Stand, baut die Container neu und startet sie.
#
# Voraussetzungen: git-Checkout, gefüllte .env, externes Docker-Netz "proxy"
# (gemeinsam mit dem zentralen Caddy), Caddyfile.snippet ins zentrale
# Caddyfile eingebunden. Migrationen laufen automatisch beim Backend-Start
# (app.main führt "alembic upgrade head" aus).
set -euo pipefail

# Immer im Repo-Root arbeiten, egal von wo aufgerufen.
cd "$(dirname "$0")"

PULL=1
COMPOSE="docker-compose.prod.yml"
PROXY_NET="proxy"

usage() {
  cat <<'EOF'
Clok Deploy (Hetzner)

Verwendung: ./deploy.sh [Optionen]

Optionen:
  --no-pull   Kein 'git pull' – den aktuell ausgecheckten Stand deployen
  -h, --help  Diese Hilfe

Ablauf: git pull (optional) -> proxy-Netz sicherstellen -> docker compose
-f docker-compose.prod.yml up -d --build -> Status & Backend-Logs -> Aufräumen.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unbekannte Option: $arg" >&2; usage; exit 2 ;;
  esac
done

log() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- Docker / Compose vorhanden? ---
command -v docker >/dev/null 2>&1 || die "docker ist nicht installiert."
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose -f "$COMPOSE")
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose -f "$COMPOSE")
else
  die "Weder 'docker compose' noch 'docker-compose' gefunden."
fi

# --- .env vorhanden? (Compose braucht sie für env_file + ${VAR}-Ersetzung) ---
[ -f .env ] || die ".env fehlt. Einmalig anlegen: cp .env.example .env (und Werte setzen)."

# --- Aktuellen Stand holen ---
if [ "$PULL" -eq 1 ] && [ -d .git ]; then
  log "git pull (nur fast-forward)"
  git pull --ff-only
else
  log "git pull übersprungen"
fi

# --- proxy-Netz (gemeinsam mit dem zentralen Caddy) sicherstellen ---
if ! docker network inspect "$PROXY_NET" >/dev/null 2>&1; then
  log "Externes Netz '$PROXY_NET' fehlt – wird angelegt"
  docker network create "$PROXY_NET" >/dev/null
fi

# --- Build & Start ---
log "Container bauen und starten"
"${DC[@]}" up -d --build --remove-orphans

# --- Status & letzte Backend-Logs (zeigen u.a. 'alembic upgrade head') ---
log "Status"
"${DC[@]}" ps
log "Letzte Backend-Logs"
"${DC[@]}" logs --tail=25 backend || true

# --- Aufräumen: verwaiste (dangling) Images entfernen ---
log "Alte, ungenutzte Images aufräumen"
docker image prune -f >/dev/null

log "Deploy fertig."
echo
echo "Erstdeploy? Einmalig den ersten Admin anlegen:"
echo "  ${DC[*]} exec backend python -m app.cli bootstrap-admin \\"
echo "    --username <name> --email <mail> --password '<pw>'"
echo "Caddy: Caddyfile.snippet ins zentrale Caddyfile einbinden (clok.f-lv.de -> clok-api/clok-web)."
