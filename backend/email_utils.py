"""Email delivery via SMTP.

Provider-agnostic: configured entirely through env vars (see config.py), so it
works with Gmail (app password), a CMU SMTP relay, SendGrid/Mailgun SMTP, etc.
without code changes. If SMTP isn't configured, `email_configured()` is False
and callers fall back to a safe behavior rather than pretending a mail was sent.
"""
import logging
import smtplib
from email.message import EmailMessage

log = logging.getLogger(__name__)


def email_configured(config) -> bool:
    """True when enough SMTP settings are present to attempt a send."""
    return bool(config.get("SMTP_HOST") and config.get("SMTP_USER"))


def send_email(config, to_addr: str, subject: str, text_body: str, html_body: str | None = None) -> bool:
    """Send one email. Returns True on success, False on failure or if SMTP
    isn't configured. Never raises — delivery problems must not 500 the caller."""
    if not email_configured(config):
        log.warning("send_email called but SMTP is not configured; skipping send to %s", to_addr)
        return False

    host = config.get("SMTP_HOST")
    port = int(config.get("SMTP_PORT") or 587)
    user = config.get("SMTP_USER")
    password = config.get("SMTP_PASSWORD") or ""
    from_addr = config.get("SMTP_FROM") or user
    use_tls = config.get("SMTP_USE_TLS", True)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if use_tls:
                server.starttls()
            if password:
                server.login(user, password)
            server.send_message(msg)
        return True
    except Exception as exc:  # smtplib raises a family of exceptions; treat all as soft failures
        log.error("Failed to send email to %s via %s:%s — %s", to_addr, host, port, exc)
        return False
