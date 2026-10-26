import pytest
import extern_inloggen

def test_unconfigured_azure_cannot_start(monkeypatch):
    monkeypatch.setattr(extern_inloggen, "aanbieders", lambda: [])
    with pytest.raises(ValueError, match="geconfigureerd"):
        extern_inloggen.start("azure", "https://app.example.org/")

def test_unknown_provider_rejected(monkeypatch):
    monkeypatch.setattr(extern_inloggen, "aanbieders", lambda: ["azure"])
    with pytest.raises(ValueError, match="Onbekende"):
        extern_inloggen.start("unknown", "https://app.example.org/")

def test_http_redirect_rejected(monkeypatch):
    monkeypatch.setattr(extern_inloggen, "aanbieders", lambda: ["azure"])
    with pytest.raises(ValueError, match="beveiligd"):
        extern_inloggen.start("azure", "http://app.example.org/")

def test_enabled_azure_uses_pkce(monkeypatch):
    monkeypatch.setattr(extern_inloggen, "aanbieders", lambda: ["azure"])
    url = extern_inloggen.start("azure", "https://app.example.org/")
    assert "provider=azure" in url
    assert "code_challenge_method=S256" in url
    assert "code_challenge=" in url
    assert "scopes=email" in url
