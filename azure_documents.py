"""Opt-in indexing of selected private documents with backend identity and reauthorization."""
import hashlib

import azure_search_ready
import azure_services
import documenten
import opslag

API_VERSION = "2025-09-01"


def _owner():
    if not opslag.online():
        raise PermissionError("Azure-documentzoeken vereist een online account.")
    # Always revalidate the current credentials with the backend, not a form/session-selected owner.
    identity = opslag._rpc_ik("mijn_gegevens").get("gebruiker") or {}
    owner = identity.get("id")
    if not isinstance(owner, int) or isinstance(owner, bool) or owner <= 0:
        raise PermissionError("Inloggen vereist.")
    return str(owner)


def _config():
    try:
        config = azure_search_ready.azure_config()
    except ValueError:
        raise azure_services.AzureError("Controleer de Azure Search-configuratie op de server.") from None
    if not config:
        raise azure_services.AzureError("Azure AI Search is nog niet geconfigureerd op de server.")
    return config


def _request(config, action, payload):
    response = azure_services.request("POST", f"{config.endpoint}/indexes/{config.index_name}/docs/{action}",
                key=config.api_key, params={"api-version": API_VERSION}, json=payload)
    try:
        value = response.json().get("value")
        if isinstance(value, list) and all(isinstance(item, dict) for item in value):
            return value
    except (ValueError, AttributeError):
        pass
    raise azure_services.AzureError("Azure Search gaf een ongeldig antwoord terug.")


def _text(doc):
    return documenten.naar_tekst(doc.get("html") or "")


def index_documents(document_ids, *, consent):
    if consent is not True:
        raise PermissionError("Geef toestemming om de geselecteerde documentinhoud naar Azure te sturen.")
    if (not isinstance(document_ids, list) or not 1 <= len(document_ids) <= 10
            or any(type(i) is not int or i <= 0 for i in document_ids)):
        raise ValueError("Selecteer 1 tot 10 eigen documenten.")
    owner, config = _owner(), _config()
    records = []
    for document_id in dict.fromkeys(document_ids):
        doc = documenten.lezen(document_id)  # Existing backend checks current access.
        text = _text(doc)
        if len(text) > 48000:
            raise ValueError("Een document bevat meer dan 48.000 tekens. Splits het eerst op.")
        digest = hashlib.sha256(text.encode()).hexdigest()
        for number, start in enumerate(range(0, len(text), 2400)):
            key = hashlib.sha256(f"{owner}:{document_id}:{number}".encode()).hexdigest()
            records.append({"@search.action": "mergeOrUpload", "id": key, "owner_id": owner,
                "scope": "prive", "document_id": document_id, "content_hash": digest,
                "title": str(doc.get("titel") or "Document")[:200], "content": text[start:start + 2400]})
    if not records:
        raise ValueError("De geselecteerde documenten bevatten geen tekst.")
    results = _request(config, "index", {"value": records})
    if len(results) != len(records) or any(r.get("status") is not True for r in results):
        raise azure_services.AzureError("Niet alle documentdelen zijn geïndexeerd. Probeer opnieuw.")
    return len(records)


def search(query, *, consent):
    if consent is not True:
        raise PermissionError("Geef toestemming voor zoeken in Azure.")
    owner, config = _owner(), _config()
    prepared = azure_search_ready.prepare_search_request(query, owner, "prive", consent=True)
    results = _request(config, "search", {"search": prepared["search_text"], "filter": prepared["filter"],
        "top": 5, "select": "owner_id,scope,document_id,content_hash,title,content"})
    allowed, current = [], {}
    for hit in results:
        if hit.get("owner_id") != owner or hit.get("scope") != "prive":
            continue
        document_id = hit.get("document_id")
        if type(document_id) is not int or document_id <= 0:
            continue
        if document_id not in current:
            try:
                current[document_id] = documenten.lezen(document_id)
            except (documenten.Fout, opslag.GeenToegang):
                current[document_id] = None
        doc = current[document_id]
        if not doc:
            continue
        text = _text(doc)
        content = hit.get("content")
        if (hit.get("content_hash") != hashlib.sha256(text.encode()).hexdigest()
                or not isinstance(content, str) or not content or content not in text):
            continue  # Deleted, modified or no-longer-accessible records never become AI context.
        allowed.append({"document_id": document_id, "titel": doc.get("titel", "Document"),
                        "fragment": content[:2400], "bron": f"Document {document_id}"})
    return allowed


def remove_documents(document_ids, *, consent):
    if consent is not True:
        raise PermissionError("Bevestig het verwijderen uit de zoekindex.")
    if (not isinstance(document_ids, list) or not 1 <= len(document_ids) <= 10
            or any(type(i) is not int or i <= 0 for i in document_ids)):
        raise ValueError("Selecteer 1 tot 10 documentnummers.")
    owner, config = _owner(), _config()
    records = [{"@search.action": "delete", "id": hashlib.sha256(f"{owner}:{doc}:{n}".encode()).hexdigest()}
               for doc in set(document_ids) for n in range(20)]
    results = _request(config, "index", {"value": records})
    if len(results) != len(records) or any(r.get("status") is not True for r in results):
        raise azure_services.AzureError("Verwijderen uit de Azure-index is niet volledig bevestigd.")
    return len(set(document_ids))
