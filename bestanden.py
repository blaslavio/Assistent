"""Je eigen bestanden in de app: mappen, uploaden, downloaden en een prullenbak (30 dagen).

De bestanden staan in Supabase Storage. De app komt er alleen bij via de Edge Function `bestanden`, die per keer
een kortlevende link geeft; wat van wie is en hoeveel ruimte er is, regelt de database (sql/bestanden.sql).
"""

import threading
import time

import httpx

import toegang
import opslag

MAX_GROOTTE = 200_000_000
VOORBEELD_MAX = 15_000_000

_opgeruimd: dict[str, float] = {}
_slot = threading.Lock()

Fout = toegang.Fout


def _rpc(functie: str, **parameters) -> dict:
    antwoord = opslag._rpc_ik(functie, **parameters) or {}
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    return antwoord


def lijst(map_: str = "", prullenbak: bool = False) -> dict:
    """{items: [{id, soort, map, naam, grootte, mime, gewijzigd}], gebruikt, opslag, prullenbak}."""
    return _rpc("bestanden_lijst", p_map=map_, p_prullenbak=prullenbak)


def zoeken(tekst: str) -> list[dict]:
    return _rpc("bestanden_zoeken", p_zoek=tekst)["items"]


def mappen() -> list[str]:
    return _rpc("bestanden_mappen")["mappen"]


def map_maken(map_: str, naam: str) -> None:
    _rpc("bestand_map_maken", p_map=map_, p_mapnaam=naam)


def wijzigen(bestand_id: int, naam: str | None = None, map_: str | None = None) -> None:
    _rpc("bestand_wijzigen", p_id=bestand_id, p_nieuwe_naam=naam, p_nieuwe_map=map_)


def prullenbak(bestand_id: int, weg: bool = True) -> None:
    _rpc("bestand_prullenbak", p_id=bestand_id, p_weg=weg)


def uploaden(map_: str, naam: str, inhoud: bytes, mime: str = "") -> None:
    """Eerst ruimte vastleggen, dan rechtstreeks naar de opslag, dan laten tellen wat er echt staat."""
    if len(inhoud) > MAX_GROOTTE:
        raise Fout("Een bestand mag hoogstens 200 MB zijn.")
    plek = toegang._functie("bestanden", "reserveren", map=map_, bestandsnaam=naam, grootte=len(inhoud),
                               mime=mime or "application/octet-stream")
    try:
        r = httpx.put(plek["upload"], content=inhoud, timeout=300,
                      headers={"content-type": mime or "application/octet-stream", "x-upsert": "false",
                               "apikey": toegang._publiek()})
        r.raise_for_status()
    except httpx.HTTPError:
        raise Fout(f"{naam} kon niet worden geüpload. Probeer het opnieuw.")
    toegang._functie("bestanden", "bevestigen", id=plek["id"])
    toegang.vergeten()


def link(bestand_id: int, opslaan: bool = False) -> str:
    """Een link van 5 minuten om te bekijken, of (opslaan=True) om te downloaden."""
    return toegang._functie("bestanden", "downloaden", id=bestand_id, opslaan=opslaan)["url"]


def inhoud(bestand_id: int) -> bytes:
    """De inhoud (voor een voorbeeld van een klein bestand)."""
    try:
        r = httpx.get(link(bestand_id), timeout=60)
        r.raise_for_status()
    except httpx.HTTPError:
        raise Fout("Dit bestand kon niet worden geopend.")
    return r.content[:VOORBEELD_MAX]


def definitief(bestand_id: int) -> None:
    """Uit je prullenbak echt weggooien (kan niet ongedaan)."""
    toegang._functie("bestanden", "definitief", id=bestand_id)
    toegang.vergeten()


def opruimen(alles: bool = False) -> None:
    """Verlopen prullenbak en afgebroken uploads echt weggooien. alles=True: alles (account verwijderen)."""
    toegang._functie("bestanden", "opruimen", alles=alles)


def vanzelf_opruimen() -> None:
    """Hooguit eens per dag per gebruiker, op de achtergrond."""
    naam, wachtwoord = opslag._naam.get(), opslag._wachtwoord.get()
    sleutel = naam or "eigenaar"
    with _slot:
        if time.time() - _opgeruimd.get(sleutel, 0) < 86400:
            return
        _opgeruimd[sleutel] = time.time()

    def werk() -> None:
        opslag.gebruik_account(naam, wachtwoord)
        try:
            opruimen()
        except Exception:
            pass

    threading.Thread(target=werk, daemon=True).start()


def soort(mime: str, naam: str) -> str:
    """Een eenvoudige soort voor het icoon en het voorbeeld."""
    m, n = (mime or "").lower(), naam.lower()
    if m.startswith("image/"):
        return "foto"
    if m.startswith("video/"):
        return "video"
    if m.startswith("audio/"):
        return "geluid"
    if m == "application/pdf" or n.endswith(".pdf"):
        return "pdf"
    if m.startswith("text/") or n.endswith((".txt", ".md", ".csv", ".json")):
        return "tekst"
    if n.endswith((".doc", ".docx", ".odt", ".pages")):
        return "document"
    if n.endswith((".xls", ".xlsx", ".ods", ".numbers")):
        return "rekenblad"
    if n.endswith((".zip", ".rar", ".7z")):
        return "archief"
    return "bestand"


ICONEN = {"map": ":material/folder:", "foto": ":material/image:", "video": ":material/movie:",
          "geluid": ":material/music_note:", "pdf": ":material/picture_as_pdf:", "tekst": ":material/article:",
          "document": ":material/description:", "rekenblad": ":material/table_chart:",
          "archief": ":material/folder_zip:", "bestand": ":material/draft:"}
