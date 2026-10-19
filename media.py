"""Foto's en geluidsfragmenten bij afspraken, als herinnering.

Online staan ze in een aparte tabel in Supabase (niet in de gewone gegevens,
want die worden bij elke wijziging helemaal opgeslagen). Ook hier is het
naam en wachtwoord van de gebruiker nodig.
"""

import base64
import io
import json

from PIL import Image, ImageOps

import opslag

MAX_FOTO_PIXELS = 1600
MAX_BYTES = 10_000_000
MEDIA_MAP = opslag.DATA_BESTAND.parent / "media"


class TeGroot(Exception):
    pass


def foto_verkleinen(inhoud: bytes) -> bytes:
    """Draait de foto rechtop en verkleint hem, zodat hij snel laadt en weinig ruimte kost."""
    foto = ImageOps.exif_transpose(Image.open(io.BytesIO(inhoud)))
    foto.thumbnail((MAX_FOTO_PIXELS, MAX_FOTO_PIXELS))
    uit = io.BytesIO()
    foto.convert("RGB").save(uit, "JPEG", quality=82, optimize=True)
    return uit.getvalue()


def toevoegen(afspraak_id: int, soort: str, naam: str, mime: str, inhoud: bytes) -> int:
    """soort: "foto" of "geluid". Geeft het id van het bestand."""
    if soort == "foto":
        inhoud, mime = foto_verkleinen(inhoud), "image/jpeg"
    if len(inhoud) > MAX_BYTES:
        raise TeGroot
    if not opslag.online():
        index = _lokale_index()
        nieuw = max((m["id"] for m in index), default=0) + 1
        (MEDIA_MAP / str(nieuw)).write_bytes(inhoud)
        index.append({"id": nieuw, "afspraak_id": afspraak_id, "soort": soort, "naam": naam, "mime": mime})
        _lokale_index_opslaan(index)
        return nieuw
    nieuw = opslag._rpc_ik("media_toevoegen", p_afspraak_id=afspraak_id, p_soort=soort, p_bestandsnaam=naam,
                           p_mime=mime, p_inhoud=base64.b64encode(inhoud).decode())
    if nieuw is None:
        raise opslag.GeenToegang
    return nieuw


def lijst(afspraak_id: int) -> list[dict]:
    if not opslag.online():
        return [m for m in _lokale_index() if m["afspraak_id"] == afspraak_id]
    return opslag._rpc_ik("media_lijst", p_afspraak_id=afspraak_id)["media"]


def ophalen(media_id: int) -> bytes:
    if not opslag.online():
        return (MEDIA_MAP / str(media_id)).read_bytes()
    antwoord = opslag._rpc_ik("media_ophalen", p_id=media_id) or {}
    return base64.b64decode(antwoord.get("inhoud", ""))


def weghalen(media_id: int) -> None:
    if not opslag.online():
        _lokale_index_opslaan([m for m in _lokale_index() if m["id"] != media_id])
    elif not opslag._rpc_ik("media_weghalen", p_id=media_id):
        raise opslag.GeenToegang


def _lokale_index() -> list[dict]:
    MEDIA_MAP.mkdir(parents=True, exist_ok=True)
    bestand = MEDIA_MAP / "index.json"
    return json.loads(bestand.read_text()) if bestand.exists() else []


def _lokale_index_opslaan(index: list[dict]) -> None:
    (MEDIA_MAP / "index.json").write_text(json.dumps(index))
