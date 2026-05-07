"""Unit-Tests für die SHA-256-basierte Token-Helper-Funktionen."""
import re

from app.onboarding_tokens import (
    TOKEN_BYTES, generate_invite_token, hash_invite_token,
)


def test_token_ist_url_safe_und_lang_genug():
    t = generate_invite_token()
    # token_urlsafe(32) liefert ~43 Base64-URL-Zeichen ohne Padding.
    assert re.fullmatch(r"[A-Za-z0-9_-]+", t)
    assert len(t) >= 32  # konservativ; tatsächlich ~43


def test_zwei_tokens_unterscheiden_sich():
    a = generate_invite_token()
    b = generate_invite_token()
    assert a != b


def test_hash_ist_deterministisch_und_64_hex_zeichen():
    t = generate_invite_token()
    h1 = hash_invite_token(t)
    h2 = hash_invite_token(t)
    assert h1 == h2
    assert re.fullmatch(r"[0-9a-f]{64}", h1)


def test_unterschiedliche_tokens_haben_unterschiedliche_hashes():
    h1 = hash_invite_token("token-a")
    h2 = hash_invite_token("token-b")
    assert h1 != h2


def test_token_bytes_konstante_passt_zum_token_urlsafe():
    """token_urlsafe(N) liefert ~ceil(4N/3) Base64-URL-Zeichen.
    32 Bytes → 43 Zeichen. Stellt sicher, dass niemand TOKEN_BYTES
    versehentlich runtersetzt unter ein sicherheitsrelevantes Niveau."""
    assert TOKEN_BYTES >= 32
