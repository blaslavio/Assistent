"""Azure AI Search configuration and private/work/community scope boundaries.

Preparation only: no Azure connection or data synchronization occurs here.
"""
from dataclasses import dataclass, field
import os
from urllib.parse import urlsplit

SCOPES = ("prive", "zakelijk", "community")
AZURE_SETTINGS = ("AZURE_SEARCH_ENDPOINT", "AZURE_SEARCH_INDEX", "AZURE_SEARCH_API_KEY")


def validate_scope(scope: str) -> str:
    if scope not in SCOPES:
        raise ValueError("Onbekende werkruimte")
    return scope


def search_filter(owner_id: str, scope: str) -> str:
    """Return a filter for an index with owner_id and scope filterable fields.

    Server must derive owner_id from authenticated identity, never user input.
    """
    validate_scope(scope)
    if not isinstance(owner_id, str) or not owner_id.strip():
        raise PermissionError("Inloggen vereist")
    safe_owner = owner_id.replace("'", "''")
    return f"owner_id eq '{safe_owner}' and scope eq '{scope}'"


@dataclass(frozen=True)
class AzureConfig:
    endpoint: str
    index_name: str
    api_key: str = field(repr=False)


def azure_config(settings=None) -> AzureConfig | None:
    """Read secrets on server; never expose API key in UI or logs."""
    settings = os.environ if settings is None else settings
    values = [settings.get(key, "") for key in AZURE_SETTINGS]
    if not all(isinstance(value, str) and value.strip() for value in values):
        return None
    endpoint, index, api_key = values
    parsed = urlsplit(endpoint)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.port not in (None, 443)):
        raise ValueError("Ongeldig Azure Search endpoint")
    if not parsed.hostname.endswith(".search.windows.net"):
        raise ValueError("Azure AI Search endpoint verwacht")
    if not all(c.isalnum() or c in "-_" for c in index):
        raise ValueError("Ongeldige indexnaam")
    return AzureConfig(endpoint.rstrip("/"), index, api_key)


def azure_status(settings=None) -> str:
    try:
        return "Configuratie aanwezig; verbinding niet getest" if azure_config(settings) else "Niet geconfigureerd"
    except ValueError:
        return "Configuratie ongeldig; controleer de serverinstellingen"


def prepare_search_request(query: str, owner_id: str, scope: str, *, consent: bool) -> dict:
    """Build a server-side request only; caller must enforce auth and consent."""
    if not consent:
        raise PermissionError("Expliciete toestemming voor zoeken vereist")
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 500:
        raise ValueError("Ongeldige zoekopdracht")
    if scope == "community":
        raise ValueError("Community vereist een aparte publieke zoekindex en publicatiecontrole")
    return {"search_text": query.strip(), "filter": search_filter(owner_id, scope), "top": 5}
