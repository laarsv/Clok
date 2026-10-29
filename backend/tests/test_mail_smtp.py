"""SMTP-Versand: STARTTLS/SSL, Login, Dev-Modus, Fehlerbehandlung, Kopfzeilen-Schutz.

Kein echter Versand: smtplib wird durch eine Fake-Klasse ersetzt, die nur den Ablauf
aufzeichnet.
"""
import smtplib

import pytest
from pydantic import SecretStr

from app.config import Settings
from app.models import Role, User
from app.notifications import mail
from app.notifications.service import NotificationKind, notify


class FakeSMTP:
    """Zeichnet den Ablauf auf, statt ein Netz zu benutzen."""

    instances: list["FakeSMTP"] = []
    fail_login: Exception | None = None
    fail_send: Exception | None = None

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.timeout, self.context = host, port, timeout, context
        self.calls: list[str] = []
        self.sent = None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def ehlo(self):
        self.calls.append("ehlo")

    def starttls(self, context=None):
        self.calls.append("starttls")
        assert context is not None  # Zertifikat und Hostname werden geprüft
        assert context.check_hostname and context.verify_mode.name == "CERT_REQUIRED"

    def login(self, user, password):
        self.calls.append(f"login:{user}:{password}")
        if FakeSMTP.fail_login:
            raise FakeSMTP.fail_login

    def send_message(self, msg, from_addr, to_addrs):
        self.calls.append("send")
        if FakeSMTP.fail_send:
            raise FakeSMTP.fail_send
        self.sent = (msg, from_addr, to_addrs)


class FakeSMTPSSL(FakeSMTP):
    def __init__(self, host, port, timeout=None, context=None):
        super().__init__(host, port, timeout, context)
        self.calls.append("implicit-tls")
        assert context is not None and context.check_hostname


def make_settings(**overrides) -> Settings:
    values = dict(
        smtp_host="smtp.example.test",
        smtp_port=587,
        smtp_user="clok@example.test",
        smtp_password=SecretStr("geheim"),
        smtp_security="auto",
        email_from="Clok <noreply@example.test>",
        email_reply_to="",
    )
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture()
def smtp(monkeypatch):
    FakeSMTP.instances = []
    FakeSMTP.fail_login = None
    FakeSMTP.fail_send = None
    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", FakeSMTPSSL)
    state = {"settings": make_settings()}
    monkeypatch.setattr(mail, "get_settings", lambda: state["settings"])

    def configure(**overrides):
        state["settings"] = make_settings(**overrides)

    FakeSMTP.configure = staticmethod(configure)
    return FakeSMTP


def _send(to="max@example.test", subject="Betreff", html="<p>Hallo</p>", text="Hallo", **kw):
    return mail.send(to=to, subject=subject, html=html, text=text, **kw)


def test_starttls_on_587_with_login_text_and_html(smtp):
    result = _send()
    assert result.ok is True and result.dev_mode is False
    server = smtp.instances[0]
    assert (server.host, server.port) == ("smtp.example.test", 587)
    assert server.calls == ["ehlo", "starttls", "ehlo", "login:clok@example.test:geheim", "send"]
    msg, from_addr, to_addrs = server.sent
    assert from_addr == "noreply@example.test"  # reine Adresse im Umschlag
    assert to_addrs == ["max@example.test"]
    assert msg["From"] == "Clok <noreply@example.test>"
    assert msg["To"] == "max@example.test"
    assert msg["Subject"] == "Betreff"
    assert msg["Reply-To"] is None
    assert msg.get_body(("plain",)).get_content().strip() == "Hallo"
    assert msg.get_body(("html",)).get_content().strip() == "<p>Hallo</p>"
    # message_id ist die Message-ID-Kopfzeile der gesendeten Mail
    assert result.message_id == msg["Message-ID"]
    assert result.message_id.startswith("<") and "@example.test>" in result.message_id


def test_implicit_tls_on_465(smtp):
    smtp.configure(smtp_port=465)
    assert _send().ok is True
    calls = smtp.instances[0].calls
    assert calls[0] == "implicit-tls" and "starttls" not in calls
    assert "send" in calls


def test_explicit_security_overrides_port(smtp):
    smtp.configure(smtp_port=465, smtp_security="starttls")
    assert _send().ok is True
    assert "starttls" in smtp.instances[0].calls
    assert "implicit-tls" not in smtp.instances[0].calls

    smtp.instances.clear()
    smtp.configure(smtp_port=587, smtp_security="ssl")
    assert _send().ok is True
    assert smtp.instances[0].calls[0] == "implicit-tls"
    assert "starttls" not in smtp.instances[0].calls


def test_sender_defaults_to_smtp_user_when_empty(smtp):
    smtp.configure(email_from="")
    assert _send().ok is True
    msg, from_addr, _ = smtp.instances[0].sent
    assert from_addr == "clok@example.test"
    assert "clok@example.test" in msg["From"]


def test_plain_address_as_sender(smtp):
    smtp.configure(email_from="info@example.test")
    assert _send().ok is True
    msg, from_addr, _ = smtp.instances[0].sent
    assert from_addr == "info@example.test" and msg["From"] == "info@example.test"


def test_reply_to_from_argument_and_config(smtp):
    assert _send(reply_to="antwort@example.test").ok is True
    assert smtp.instances[0].sent[0]["Reply-To"] == "antwort@example.test"

    smtp.instances.clear()
    smtp.configure(email_reply_to="konfig@example.test")
    assert _send().ok is True
    assert smtp.instances[0].sent[0]["Reply-To"] == "konfig@example.test"


def test_umlauts_and_unicode_subject(smtp):
    result = _send(subject="Urlaubsantrag für Jörg", html="<p>Grüße</p>", text="Grüße")
    assert result.ok is True
    msg = smtp.instances[0].sent[0]
    assert msg["Subject"] == "Urlaubsantrag für Jörg"
    assert msg.get_body(("plain",)).get_content().strip() == "Grüße"
    assert msg.get_body(("html",)).get_content().strip() == "<p>Grüße</p>"


@pytest.mark.parametrize(
    "missing", ["smtp_host", "smtp_user", "smtp_password"]
)
def test_not_configured_is_dev_mode_without_connection(smtp, missing, caplog):
    smtp.configure(**{missing: SecretStr("") if missing == "smtp_password" else ""})
    with caplog.at_level("INFO"):
        result = _send()
    assert result.ok is True and result.dev_mode is True
    assert result.message_id is None
    assert smtp.instances == []
    assert "[email-dev-mode]" in caplog.text


@pytest.mark.parametrize(
    "error, code",
    [
        (smtplib.SMTPAuthenticationError(535, b"nope"), 535),
        (smtplib.SMTPServerDisconnected("weg"), None),
        (smtplib.SMTPSenderRefused(553, b"Absender nicht erlaubt", "x@example.test"), 553),
        (ConnectionRefusedError("zu"), None),
        (TimeoutError("zu langsam"), None),
    ],
)
def test_failures_return_error_result_and_never_raise(smtp, error, code):
    smtp.fail_login = error
    result = _send()
    assert result.ok is False and result.dev_mode is False
    assert result.error_name == type(error).__name__
    assert result.status_code == code
    assert result.error_message
    assert result.message_id is None


def test_send_phase_errors_do_not_raise(smtp):
    smtp.fail_send = smtplib.SMTPRecipientsRefused({"max@example.test": (550, b"unbekannt")})
    result = _send()
    assert result.ok is False
    assert result.status_code == 550
    assert result.error_name == "SMTPRecipientsRefused"
    assert result.error_message == "unbekannt"

    smtp.fail_send = UnicodeEncodeError("ascii", "ü", 0, 1, "nicht ASCII")
    assert _send().ok is False


def test_failure_log_has_no_address_subject_text_or_password(smtp, caplog):
    smtp.fail_login = smtplib.SMTPAuthenticationError(
        535, b"max@example.test geheim Geheimer-Betreff"
    )
    with caplog.at_level("DEBUG"):
        result = _send(subject="Geheimer-Betreff", text="Geheimer-Text", html="<p>Geheimer-Text</p>")
    assert result.ok is False
    for secret in ("max@example.test", "geheim", "Geheimer-Betreff", "Geheimer-Text"):
        assert secret not in caplog.text
    assert "SMTPAuthenticationError" in caplog.text
    assert "535" in caplog.text


def test_success_log_has_no_address_subject_or_text(smtp, caplog):
    with caplog.at_level("DEBUG"):
        assert _send(subject="Geheimer-Betreff", text="Geheimer-Text").ok is True
    for secret in ("max@example.test", "Geheimer-Betreff", "Geheimer-Text", "geheim"):
        assert secret not in caplog.text


@pytest.mark.parametrize(
    "to",
    [
        "a@b.test, c@d.test",
        "a@b.test;c@d.test",
        "a@b.test\nBcc: x@y.test",
        "Max <a@b.test>",
        '"a"@b.test',
        "kein-at",
        "",
    ],
)
def test_bad_recipient_is_rejected(smtp, to):
    result = _send(to=to)
    assert result.ok is False and result.dev_mode is False
    assert result.error_name == "invalid_address"
    assert smtp.instances == []


def test_bad_reply_to_is_rejected(smtp):
    result = _send(reply_to="a@b.test, c@d.test")
    assert result.ok is False and smtp.instances == []


@pytest.mark.parametrize("subject", ["Betreff\nBcc: x@y.test", "Betreff\rBcc: x@y.test"])
def test_header_injection_in_subject_is_rejected(smtp, subject):
    result = _send(subject=subject)
    assert result.ok is False
    assert result.error_name == "invalid_header"
    assert smtp.instances == []


def test_header_injection_in_sender_name_is_rejected(smtp):
    smtp.configure(email_from="Clok\nBcc: x@y.test <noreply@example.test>")
    result = _send()
    assert result.ok is False and smtp.instances == []


def test_notify_sends_rendered_mail_through_smtp(smtp, db_session):
    user = User(
        username="max", email="max@example.test", password_hash="x",
        full_name="Max Mustermann", role=Role.EMPLOYEE,
    )
    db_session.add(user)
    db_session.commit()
    ok = notify(
        db_session,
        kind=NotificationKind.PASSWORD_RESET,
        recipient=user,
        ctx={
            "requester": {"first_name": "Max", "full_name": "Max Mustermann", "email": user.email},
            "approver": {"first_name": ""},
            "link": "https://clok.example.test/reset-password/abc",
            "valid_minutes": 30,
        },
    )
    assert ok is True
    msg, _, to_addrs = smtp.instances[0].sent
    assert to_addrs == ["max@example.test"]
    assert msg["Subject"] == "Neues Passwort für Clok"
    assert "https://clok.example.test/reset-password/abc" in msg.get_body(("plain",)).get_content()
    assert "https://clok.example.test/reset-password/abc" in msg.get_body(("html",)).get_content()


def test_notify_returns_false_when_smtp_fails(smtp, db_session):
    smtp.fail_login = smtplib.SMTPAuthenticationError(535, b"nope")
    user = User(username="max", email="max@example.test", password_hash="x", role=Role.EMPLOYEE)
    db_session.add(user)
    db_session.commit()
    ok = notify(
        db_session,
        kind=NotificationKind.PASSWORD_RESET,
        recipient=user,
        ctx={
            "requester": {"first_name": "Max", "full_name": "Max", "email": user.email},
            "approver": {"first_name": ""},
            "link": "https://clok.example.test/x",
            "valid_minutes": 30,
        },
    )
    assert ok is False


def test_dev_mode_property_needs_host_user_and_password():
    assert make_settings().email_dev_mode is False
    assert make_settings(smtp_host="").email_dev_mode is True
    assert make_settings(smtp_user="  ").email_dev_mode is True
    assert make_settings(smtp_password=SecretStr("")).email_dev_mode is True
    assert Settings(_env_file=None).email_dev_mode is True
    assert Settings(_env_file=None).smtp_port == 587
