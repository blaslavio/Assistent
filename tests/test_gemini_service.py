"""Offline tests for Gemini service input validation."""
from unittest.mock import patch
import gemini_service


def test_empty_question():
    assert gemini_service.get_gemini_response(" ", "{}") == "Voer eerst een vraag in."


def test_invalid_context():
    assert gemini_service.get_gemini_response("Vraag", {}) == "Ongeldige bedrijfsgegevens."


def test_oversized_prompt():
    assert "omvangrijk" in gemini_service.get_gemini_response("a" * 8001, "{}")


def test_missing_key():
    with patch.object(gemini_service, "_api_key", return_value=""):
        assert "niet geconfigureerd" in gemini_service.get_gemini_response("Vraag", "{}")
