"""Helper für Onboarding-Invite-Tokens.

Klartext-Token wird einmal beim Erstellen erzeugt und per Mail
verschickt; in der DB liegt nur der SHA-256-Hash. Da die Tokens 32
zufällige Bytes (256 bit) Entropie tragen, reicht ein deterministischer
Hash – kein bcrypt/Argon2-Salt-Aufwand. Der Vergleich beim Einlösen ist
ein simpler `WHERE token_hash = $1` über den UNIQUE-Index.
"""
import hashlib
import secrets


# 32 Bytes URL-safe ergeben ~43 Base64-Zeichen, das passt komfortabel
# in einen Link und ist gegen Brute-Force absurd weit jenseits jeder
# realistischen Angreifer-Ressource.
TOKEN_BYTES = 32


def generate_invite_token() -> str:
    """Erzeugt einen frischen Klartext-Token."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_invite_token(token: str) -> str:
    """SHA-256 hex (64 chars). Identisch zum Datentyp `token_hash` in
    der `employer_invites`-Tabelle (UNIQUE indexiert)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
