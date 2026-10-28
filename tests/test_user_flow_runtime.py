"""Runtime flow checks using isolated data and fake transports; no mail or money is sent."""
import copy
from datetime import datetime, timedelta, timezone
import imaplib
import ssl
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import agenda_import
import boekpagina
import extern_inloggen
import integraties_voorbereiding
import mail
import pay_in_chat_core as payments
import resource_booking_core as resources


def test_public_booking_accepts_a_normal_email():
    with patch.object(boekpagina.opslag, "_rpc", return_value={"code": "test-booking"}) as backend:
        result = boekpagina.boeken("test", 0, datetime.now(timezone.utc) + timedelta(days=1),
                                  "Test Klant", "test@example.com")
    assert result["code"] == "test-booking"
    assert backend.call_args.kwargs["p_email"] == "test@example.com"


@pytest.mark.parametrize("address", ["test user@example.com", "test\n@example.com", "test@example", ""])
def test_public_booking_rejects_bad_email_without_calling_backend(address):
    with patch.object(boekpagina.opslag, "_rpc") as backend:
        with pytest.raises(boekpagina.samen.Fout):
            boekpagina.boeken("test", 0, datetime.now(timezone.utc) + timedelta(days=1), "Test Klant", address)
        backend.assert_not_called()


def test_payment_intent_understands_dutch_amount_without_executing_payment():
    result = integraties_voorbereiding.intent_naar_concept("Maak een betaalverzoek van 75,25 euro voor intake")
    assert result["type"] == "betaalconcept" and result["bedrag_cent"] == 7525
    assert integraties_voorbereiding.intent_naar_concept("Betaalverzoek van 75,259 euro")["type"] == "onbekend"


def payment_kwargs(**changes):
    return {"provider_verified": True, "provider_status": "paid", "provider_reference": "req-1",
            "expected_reference": "req-1", "amount_cents": 7500, "expected_amount_cents": 7500, **changes}


def test_payment_requires_real_boolean_verification():
    with pytest.raises(PermissionError):
        payments.verified_payment_status(**payment_kwargs(provider_verified="false"))


@pytest.mark.parametrize("changes", [{"provider_reference": "", "expected_reference": ""},
                                   {"amount_cents": 0, "expected_amount_cents": 0},
                                   {"amount_cents": True, "expected_amount_cents": True}])
def test_payment_cannot_be_paid_with_empty_reference_or_invalid_amount(changes):
    with pytest.raises(ValueError):
        payments.verified_payment_status(**payment_kwargs(**changes))


def test_failed_payment_does_not_keep_showing_pending():
    assert payments.verified_payment_status(**payment_kwargs(provider_status="failed")) == payments.PaymentStatus.FAILED
    assert payments.verified_payment_status(**payment_kwargs()) == payments.PaymentStatus.PAID


@pytest.fixture
def booking_store(monkeypatch):
    data = {resources.RESOURCE_KEY: [{"id": "room", "name": "Ruimte", "kind": "Zaal"}], resources.KEY: []}
    monkeypatch.setattr(resources.opslag, "laden", lambda: copy.deepcopy(data))
    def save(value):
        data.clear()
        data.update(copy.deepcopy(value))
    monkeypatch.setattr(resources.opslag, "opslaan", save)
    return data


def test_resource_booking_cancel_then_rebook(booking_store):
    start = datetime(2027, 1, 5, 10)
    first = resources.create_booking("room", start, start + timedelta(hours=1), "Eerste")
    with pytest.raises(ValueError):
        resources.create_booking("room", start, start + timedelta(minutes=30), "Overlap")
    assert resources.cancel_booking(first["id"])
    assert resources.create_booking("room", start, start + timedelta(hours=1), "Nieuwe")["status"] == "bevestigd"


def test_resource_duration_limit_is_exact(booking_store):
    start = datetime(2027, 1, 5, 10)
    with pytest.raises(ValueError, match="30 dagen"):
        resources.create_booking("room", start, start + timedelta(days=30, minutes=1), "Te lang")


def test_resource_overlap_understands_local_and_utc_times(booking_store):
    resources.create_booking("room", datetime(2027, 1, 5, 10), datetime(2027, 1, 5, 11), "Lokaal")
    with pytest.raises(ValueError, match="gereserveerd"):
        resources.create_booking("room", datetime(2027, 1, 5, 9, 30, tzinfo=timezone.utc),
                                 datetime(2027, 1, 5, 10, 30, tzinfo=timezone.utc), "UTC-overlap")


def test_calendar_conflicts_normalizes_new_utc_events():
    old = [{"start": "2027-01-05T10:00", "einde": "2027-01-05T11:00"}]
    new = [{"start": "2027-01-05T09:30:00+00:00", "einde": "2027-01-05T10:30:00+00:00"}]
    assert agenda_import.conflicten(new, old) == new


def test_calendar_unknown_timezone_is_a_user_error():
    with pytest.raises(ValueError, match="tijdzone"):
        agenda_import._tijd("20270105T100000", "Unknown/TestZone")


def test_calendar_suggestions_fit_office_hours():
    slots = agenda_import.voorstellen([], minuten=90, limiet=80, nu=datetime(2027, 1, 4))
    assert slots and all((slot + timedelta(minutes=90)).hour < 17 or
                         (slot + timedelta(minutes=90)).time().isoformat() == "17:00:00" for slot in slots)


def test_oauth_rejects_broken_redirects():
    with patch.object(extern_inloggen, "aanbieders", return_value=["azure"]):
        for url in ("https://", "https:///missing-host", "https://user:secret@example.com/"):
            with pytest.raises(ValueError):
                extern_inloggen.start("azure", url)


def test_oauth_keeps_state_outside_url_fragments():
    from urllib.parse import parse_qs, urlsplit
    with patch.object(extern_inloggen, "aanbieders", return_value=["azure"]):
        redirect = parse_qs(urlsplit(extern_inloggen.start("azure", "https://example.com/#section")).query)["redirect_to"][0]
    assert parse_qs(urlsplit(redirect).query).get("extern")
    assert not urlsplit(redirect).fragment


def test_oauth_does_not_accept_tokens_from_an_error_response():
    import time
    extern_inloggen._wacht["test-oauth-state"] = ("test-verifier", time.time() + 30)
    failed = SimpleNamespace(status_code=400, json=lambda: {"access_token": "not-a-valid-success"})
    with patch.object(extern_inloggen.opslag._verbinding, "post", return_value=failed) as post:
        result = extern_inloggen.afronden("test-oauth-state", "test-code", "test-device")
    assert "fout" in result
    assert post.call_count == 1
    assert "fout" in extern_inloggen.afronden("test-oauth-state", "test-code", "test-device")


def test_mail_imap_verifies_server_certificate_and_closes_failed_login():
    transport = MagicMock()
    transport.login.side_effect = imaplib.IMAP4.error("bad login")
    with patch.object(mail.imaplib, "IMAP4_SSL", return_value=transport) as connect:
        with pytest.raises(imaplib.IMAP4.error):
            mail._imap({"adres": "test@example.com", "wachtwoord": "test-only", "imap": "imap.example.com"})
    context = connect.call_args.kwargs.get("ssl_context")
    assert context and context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    transport.shutdown.assert_called_once()


def test_smtp_cleanup_failure_does_not_report_delivered_mail_as_unsent():
    transport = MagicMock()
    transport.quit.side_effect = OSError("connection closed after delivery")
    settings = {"adres": "test@example.com", "wachtwoord": "test-only", "smtp": "smtp.example.com", "imap": "imap.example.com"}
    with patch.object(mail, "instellingen", return_value=settings), \
         patch.object(mail.smtplib, "SMTP", return_value=transport):
        mail.versturen("recipient@example.com", "Test", "Alleen neptransport; geen echte verzending.")
    context = transport.starttls.call_args.kwargs.get("context")
    assert context and context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    transport.close.assert_called_once()
