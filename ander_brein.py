"""Een ander brein voor de assistent: ChatGPT (OpenAI) of Gemini (Google), met de eigen sleutel van de gebruiker.

Beide spreken dezelfde taal (de chat-completions-vorm van OpenAI; Gemini biedt die ook aan), dus één stuk code
volstaat. De assistent krijgt dezelfde instructies en dezelfde hulpmiddelen als met Claude. Zoeken op internet
zit alleen in Claude ingebouwd; met een ander brein zoekt de assistent plekken via plaats_zoeken.
"""

import json
from datetime import datetime

import httpx

import agent
import opslag
import azure_services

AANBIEDERS = {
    "Azure OpenAI": {"model": azure_services.OPENAI_DEPLOYMENT, "sleutel": "azure_server",
                     "waar": "Azure-configuratie op de server"},
    "ChatGPT": {"url": "https://api.openai.com/v1/chat/completions", "model": "gpt-5", "sleutel": "openai_sleutel",
                "waar": "platform.openai.com › API keys"},
    "Gemini": {"url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
               "model": "gemini-2.5-pro", "sleutel": "gemini_sleutel", "waar": "aistudio.google.com › Get API key"},
}
MAX_RONDES = 10


class Fout(Exception):
    pass


def keuze() -> str:
    """Welk brein de gebruiker koos: Claude (standaard), ChatGPT of Gemini."""
    brein = opslag.instellingen().get("brein", "Claude")
    return brein if brein in AANBIEDERS else "Claude"


def sleutel(brein: str) -> str:
    if brein == "Azure OpenAI":
        try:
            config = azure_services.openai_config()
            return config.api_key if config else ""
        except azure_services.AzureError:
            return ""
    return opslag.instellingen().get(AANBIEDERS[brein]["sleutel"], "")


def model(brein: str) -> str:
    if brein == "Azure OpenAI":
        config = azure_services.openai_config()
        return config.deployment if config else azure_services.OPENAI_DEPLOYMENT
    return (opslag.instellingen().get("brein_modellen") or {}).get(brein) or AANBIEDERS[brein]["model"]


def _schema(schema: dict, brein: str) -> dict:
    """Gemini kent niet alle onderdelen van een JSON-schema; die laten we weg."""
    if brein != "Gemini":
        return schema
    if isinstance(schema, dict):
        return {k: _schema(v, brein) for k, v in schema.items() if k not in ("title", "additionalProperties", "default")}
    if isinstance(schema, list):
        return [_schema(v, brein) for v in schema]
    return schema


def _hulpmiddelen(brein: str) -> tuple[list[dict], dict]:
    lijst, per_naam = [], {}
    for h in agent.HULPMIDDELEN:
        if isinstance(h, dict):  # zoeken op internet is ingebouwd bij Claude, niet hier
            continue
        per_naam[h.name] = h
        lijst.append({"type": "function", "function": {"name": h.name, "description": h.description[:1000],
                                                       "parameters": _schema(h.input_schema, brein)}})
    return lijst, per_naam


def _veld(blok, naam, standaard=None):
    return blok.get(naam, standaard) if isinstance(blok, dict) else getattr(blok, naam, standaard)


def _tekst(inhoud) -> str:
    """Lees tekstblokken zonder de bestaande berichtstructuur te wijzigen."""
    if isinstance(inhoud, str):
        return inhoud
    delen = []
    for blok in inhoud or []:
        if _veld(blok, "type") == "text":
            waarde = _veld(blok, "text")
            if waarde:
                delen.append(waarde)
    return "\\n".join(delen)


def _geschiedenis(berichten: list) -> list[dict]:
    """Zet Claude-berichten om naar geldige Chat Completions tool-calls.

    Een assistent-tool-call en de bijbehorende resultaten moeten samen blijven.
    Losse toolresultaten worden niet doorgestuurd.
    """
    resultaat = []
    for beurt in berichten[-40:]:
        rol = beurt.get("role")
        if rol not in ("user", "assistant"):
            continue
        inhoud = beurt.get("content", "")
        tekst = _tekst(inhoud)
        if not isinstance(inhoud, list):
            if tekst:
                resultaat.append({"role": rol, "content": tekst})
            continue
        if rol == "user":
            losse_tekst = []
            for blok in inhoud:
                soort = _veld(blok, "type")
                if soort == "text":
                    losse_tekst.append(_veld(blok, "text", ""))
                elif soort == "tool_result":
                    identificatie = _veld(blok, "tool_use_id")
                    if identificatie:
                        waarde = _veld(blok, "content", "")
                        resultaat.append({"role": "tool", "tool_call_id": identificatie,
                                          "content": _tekst(waarde) if isinstance(waarde, list) else str(waarde)})
            if losse_tekst and any(losse_tekst):
                resultaat.append({"role": "user", "content": "\\n".join(losse_tekst)})
        else:
            aanroepen = []
            for blok in inhoud:
                if _veld(blok, "type") == "tool_use":
                    naam, identificatie = _veld(blok, "name"), _veld(blok, "id")
                    if naam and identificatie:
                        aanroepen.append({"id": identificatie, "type": "function",
                                          "function": {"name": naam,
                                                       "arguments": json.dumps(_veld(blok, "input", {}), default=str)}})
            if tekst or aanroepen:
                bericht = {"role": "assistant", "content": tekst or None}
                if aanroepen:
                    bericht["tool_calls"] = aanroepen
                resultaat.append(bericht)
    # Alleen complete tool-callgroepen mogen naar de provider: voorkom API 400.
    ids = {b["tool_call_id"] for b in resultaat if b["role"] == "tool"}
    geldig = []
    for b in resultaat:
        if b["role"] == "assistant" and b.get("tool_calls"):
            calls = b["tool_calls"]
            if not all(c["id"] in ids for c in calls):
                continue
        if b["role"] == "tool" and b["tool_call_id"] not in {
            c["id"] for a in resultaat if a["role"] == "assistant"
            for c in a.get("tool_calls", [])
        }:
            continue
        geldig.append(b)
    return geldig


def antwoord(brein: str, berichten: list, bij_tekst=None, bij_hulpmiddel=None, spraak: bool = False) -> str:
    """Zelfde werking als agent.antwoord, maar met ChatGPT of Gemini. Vult `berichten` aan met het antwoord."""
    try:
        extra = agent.context()
    except opslag.GeenToegang:
        raise
    except Exception:
        extra = f"Nu is het {datetime.now().strftime('%A %Y-%m-%d %H:%M')}."
    systeem = (agent.SYSTEEM + "\n\nJe kunt niet zelf op internet zoeken; gebruik plaats_zoeken voor plekken en zeg "
               "het eerlijk als je actuele informatie niet kunt opzoeken.\n\n" + extra
               + ("\n\n" + agent.SPRAAK if spraak else ""))
    gesprek = [{"role": "system", "content": systeem}]
    gesprek.extend(_geschiedenis(berichten))
    hulpmiddelen, per_naam = _hulpmiddelen(brein)
    a = AANBIEDERS[brein]
    if brein == "Azure OpenAI":
        try:
            config = azure_services.openai_config()
            if not config:
                raise azure_services.AzureError("Azure OpenAI is nog niet geconfigureerd op de server.")
        except azure_services.AzureError as fout:
            raise Fout(str(fout)) from None
        url, api_key, modelnaam = config.base_url + "chat/completions", config.api_key, config.deployment
    else:
        url, api_key, modelnaam = a["url"], sleutel(brein), model(brein)
    tekst = ""
    afgerond = False
    for _ in range(MAX_RONDES):
        try:
            r = httpx.post(url, headers={"Authorization": f"Bearer {api_key}"}, timeout=120,
                           json={"model": modelnaam, "messages": gesprek,
                                 **({"tools": hulpmiddelen} if hulpmiddelen else {})})
        except httpx.HTTPError:
            raise Fout(f"{brein} is even niet bereikbaar. Probeer het zo nog eens.")
        if r.status_code in (401, 403):
            raise Fout(f"Je {brein}-sleutel werkt niet. Kijk bij Instellingen › Assistent › Brein.")
        if r.status_code == 429:
            raise Fout(f"{brein} zegt dat het tegoed op is of dat het te druk is. Probeer het later of kies een ander brein.")
        if r.status_code >= 400:
            raise Fout(f"{brein} gaf een fout ({r.status_code}). Klopt het model bij Instellingen › Assistent › Brein?")
        bericht = r.json()["choices"][0]["message"]
        aanroepen = bericht.get("tool_calls") or []
        gesprek.append({k: v for k, v in bericht.items() if k in ("role", "content", "tool_calls") and v is not None})
        if not aanroepen:
            tekst = (bericht.get("content") or "").strip()
            afgerond = True
            break
        for aanroep in aanroepen:
            naam = aanroep["function"]["name"]
            if bij_hulpmiddel:
                bij_hulpmiddel(naam)
            try:
                uitkomst = per_naam[naam].call(json.loads(aanroep["function"].get("arguments") or "{}"))
            except Exception as fout:
                uitkomst = f"Fout: {fout}"
            gesprek.append({"role": "tool", "tool_call_id": aanroep["id"],
                            "content": uitkomst if isinstance(uitkomst, str) else json.dumps(uitkomst, default=str)})
    if not afgerond:
        raise Fout("De assistent heeft te veel opeenvolgende hulpmiddelacties uitgevoerd. Probeer je vraag opnieuw.")
    tekst = tekst or "De assistent heeft geen antwoord teruggegeven."
    if bij_tekst:
        bij_tekst(tekst)
    berichten.append({"role": "assistant", "content": tekst})
    return tekst
