from workspace_safe import privacy_guard, classify_intent, create_record, ai_answer
import pytest

def test_privacy():
    assert "[EMAIL]" in privacy_guard("mail naar test@example.com")
    assert "[TELEFOON]" in privacy_guard("bel 0612345678")
    assert "[IBAN]" in privacy_guard("NL91ABNA0417164300")

def test_intents():
    assert classify_intent("Plan massage") == "Dienstverlening"
    assert classify_intent("Organiseer een toernooi") == "Events & Club"
    assert classify_intent("Wat is dit?") == "Algemeen"

def test_auth():
    with pytest.raises(PermissionError):
        create_record("Test", "", "Trainer")

def test_record_no_fake_status():
    record = create_record("Afspraak maken", "user-1", "Trainer")
    assert record["status"] == "nieuw"
    assert "bedrag" not in record
    assert "lat" not in record

def test_ai_without_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert "niet geconfigureerd" in ai_answer("vraag", "Gebruiker")
