import io
import runpy
import sys
import types
import wave
from unittest.mock import patch

import httpx
import pytest

import azure_services as azure
import azure_search_ready as search_config


def test_azure_configuration_rejects_credential_redirects_and_private_hosts():
    for url in ("http://localhost/openai/v1", "https://example.org/openai/v1",
                "https://x.openai.azure.com/openai/v1?key=secret",
                "https://user:pass@x.openai.azure.com/openai/v1",
                "https://x.openai.azure.com:8443/openai/v1"):
        with pytest.raises(azure.AzureError):
            azure.openai_config({"AZURE_OPENAI_API_KEY": "secret", "AZURE_OPENAI_BASE_URL": url})
    config = azure.openai_config({"AZURE_OPENAI_API_KEY": "secret"})
    assert config.deployment == "gpt-5-mini"
    assert "secret" not in repr(config)
    assert azure.openai_config({}) is None
    assert search_config.azure_config({}) is None


def test_transport_never_follows_redirect_or_echoes_response_secret():
    response = httpx.Response(403, text="credential: secret-key")
    with patch.object(azure.httpx, "request", return_value=response) as request:
        with pytest.raises(azure.AzureError) as error:
            azure.request("POST", "https://x.openai.azure.com/openai/v1/chat/completions", key="secret-key")
    assert "secret-key" not in str(error.value)
    assert request.call_args.kwargs["follow_redirects"] is False


def test_speech_escapes_ssml_and_keeps_key_server_side(monkeypatch):
    monkeypatch.setenv("AZURE_SPEECH_KEY", "secret")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "swedencentral")
    with patch.object(azure, "request", return_value=types.SimpleNamespace(content=b"mp3")) as request:
        assert azure.speech_audio('<voice name="other">Hallo & dag</voice>') == b"mp3"
    body = request.call_args.kwargs["content"].decode()
    assert '&lt;voice name="other"&gt;' in body
    assert "Hallo &amp; dag" in body
    assert "secret" not in body


def wav_bytes(seconds=1, channels=1, rate=16000):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b"\x00\x00" * rate * seconds * channels)
    return output.getvalue()


def test_transcription_rejects_oversize_stereo_and_wrong_rate_before_network(monkeypatch):
    monkeypatch.setenv("AZURE_SPEECH_KEY", "secret")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "swedencentral")
    with patch.object(azure, "request") as request:
        for audio in (b"not wav", wav_bytes(61), wav_bytes(channels=2), wav_bytes(rate=44100)):
            with pytest.raises(azure.AzureError):
                azure.transcribe(audio)
        request.assert_not_called()
    result = types.SimpleNamespace(json=lambda: {"RecognitionStatus": "Success", "DisplayText": "Training morgen."})
    with patch.object(azure, "request", return_value=result):
        assert azure.transcribe(wav_bytes()) == "Training morgen."


@pytest.fixture
def documents_module():
    store = types.ModuleType("opslag")
    store.online = lambda: True
    store._rpc_ik = lambda name: {"gebruiker": {"id": 7}}
    store.GeenToegang = type("GeenToegang", (Exception,), {})
    docs = types.ModuleType("documenten")
    docs.Fout = type("Fout", (Exception,), {})
    docs.naar_tekst = lambda text: text
    docs.lezen = lambda doc_id: {"id": doc_id, "titel": "Eigen document", "html": "Eigen tekst"}
    with patch.dict(sys.modules, {"opslag": store, "documenten": docs}):
        module = runpy.run_path("azure_documents.py")
    # Functions retain their separate module namespace, without polluting other app tests.
    return module, module["search"].__globals__, store, docs


def test_search_requires_consent_and_backend_identity(documents_module):
    module, namespace, store, docs = documents_module
    with patch.object(azure, "request") as request:
        with pytest.raises(PermissionError):
            module["search"]("tekst", consent=False)
        store._rpc_ik = lambda name: {"gebruiker": {"id": "user supplied"}}
        with pytest.raises(PermissionError):
            module["search"]("tekst", consent=True)
        request.assert_not_called()


def test_search_reauthorizes_hits_and_filters_stale_or_foreign_content(documents_module):
    module, namespace, store, docs = documents_module
    import hashlib
    good = {"owner_id": "7", "scope": "prive", "document_id": 1,
            "content_hash": hashlib.sha256(b"Eigen tekst").hexdigest(), "content": "Eigen tekst"}
    hits = [good, {**good, "owner_id": "8"}, {**good, "scope": "community"},
            {**good, "content_hash": "old"}, {**good, "content": "geheim van ander"}]
    namespace["_config"] = lambda: object()
    namespace["_request"] = lambda config, action, payload: hits
    assert len(module["search"]("tekst", consent=True)) == 1
    def denied(doc_id):
        raise docs.Fout("verwijderd")
    docs.lezen = denied
    assert module["search"]("tekst", consent=True) == []


def test_indexing_checks_partial_failure_and_uses_backend_owner(documents_module):
    module, namespace, store, docs = documents_module
    namespace["_config"] = lambda: object()
    payloads = []
    def respond(config, action, payload):
        payloads.append(payload)
        return [{"status": False}]
    namespace["_request"] = respond
    with pytest.raises(azure.AzureError):
        module["index_documents"]([1], consent=True)
    assert payloads[0]["value"][0]["owner_id"] == "7"
    assert payloads[0]["value"][0]["scope"] == "prive"
    with pytest.raises(PermissionError):
        module["index_documents"]([1], consent=False)


def test_search_odata_filter_escapes_owner_and_cannot_change_scope():
    assert "a'' or" in search_config.search_filter("a' or owner_id ne ''", "prive")
    with pytest.raises(ValueError):
        search_config.prepare_search_request("tekst", "7", "community", consent=True)
