"""Cursussen en abonnementen in een community (zie sql/community_aanbod.sql en de betaalfunctie `betalen`).

De eigenaar maakt cursussen met lessen; leden volgen ze in de app. Een cursus is gratis, eenmalig te koop, of
inbegrepen bij een abonnement op de community. Betalen gaat via Stripe naar de eigenaar.
"""

import re

import opslag
import geldwaarden
import samen
from samen import Fout

SOORTEN = {"gratis": "Gratis voor leden", "koop": "Te koop", "abonnement": "Bij abonnement"}


def soort(c: dict) -> str:
    return "abonnement" if c.get("voor_abonnees") else "koop" if c.get("prijs_cent") else "gratis"


def prijs(cent: int | None) -> str:
    return samen.euro((cent or 0) / 100)


def mijn() -> dict:
    """{communities, bezig, gekocht, abonnementen}."""
    return samen._ok(opslag._rpc_ik("mijn_cursussen"))


def aanbod(community: int) -> dict:
    return samen._ok(opslag._rpc_ik("community_aanbod", p_community=int(community)))


def lezen(cursus: int) -> dict:
    return samen._ok(opslag._rpc_ik("cursus_lezen", p_cursus=int(cursus)))


def opslaan(community: int | None, cursus: int | None, titel: str, omschrijving: str, soort_: str, prijs_euro: float,
            gepubliceerd: bool) -> int:
    cent = geldwaarden.centen(0 if prijs_euro is None else prijs_euro, negatief=False) if soort_ == "koop" else 0
    return samen._ok(opslag._rpc_ik("cursus_opslaan", p_community=community, p_cursus=cursus, p_titel=titel,
                                    p_omschrijving=omschrijving, p_prijs_cent=cent,
                                    p_voor_abonnees=soort_ == "abonnement", p_gepubliceerd=gepubliceerd))["id"]


def weg(cursus: int) -> None:
    samen._ok(opslag._rpc_ik("cursus_weg", p_cursus=int(cursus)))


def les_opslaan(cursus: int, les: int | None, titel: str, inhoud: str, video: str, minuten: int) -> int:
    return samen._ok(opslag._rpc_ik("les_opslaan", p_cursus=int(cursus), p_les=les, p_titel=titel, p_inhoud=inhoud,
                                    p_video=video.strip(), p_minuten=int(minuten or 0)))["id"]


def les_wijzigen(les: int, actie: str) -> None:
    samen._ok(opslag._rpc_ik("les_wijzigen", p_les=int(les), p_actie=actie))


def les_klaar(les: int, klaar: bool = True) -> None:
    samen._ok(opslag._rpc_ik("les_klaar", p_les=int(les), p_klaar=bool(klaar)))


def plan_opslaan(community: int | None, plan: int | None, naam: str, prijs_euro: float, voordelen: str,
                 actief: bool = True) -> int:
    return samen._ok(opslag._rpc_ik("plan_opslaan", p_community=community, p_plan=plan, p_titel=naam,
                                    p_prijs_cent=geldwaarden.centen(0 if prijs_euro is None else prijs_euro, negatief=False), p_voordelen=voordelen,
                                    p_actief=actief))["id"]


# --- Betalen (Stripe, via de betaalfunctie) -------------------------------------------------------

def kopen(cursus: int) -> str:
    """Link naar de betaalpagina. Alleen na akkoord met meteen beginnen (geen bedenktijd bij digitale inhoud)."""
    return samen._stripe("cursus_afrekenen", cursus=int(cursus), akkoord=True)["url"]


def gekocht_controleren(sessie: str) -> dict:
    return samen._stripe("cursus_controleren", sessie=sessie)


def abonneren(plan: int) -> str:
    return samen._stripe("community_abonneren", plan=int(plan))["url"]


def abonnement_controleren(sessie: str) -> dict:
    return samen._stripe("community_controleren", sessie=sessie)


def opzeggen(plan: int, terug: bool = False) -> None:
    samen._stripe("community_opzeggen", plan=int(plan), terug=terug)


# --- Video ---------------------------------------------------------------------------------------

_YOUTUBE = re.compile(r"^https://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)[\w-]{6,}")
_VIMEO = re.compile(r"^https://(www\.|player\.)?vimeo\.com/(video/)?\d+")


def video_soort(url: str) -> str:
    """speler (YouTube, Vimeo of een videobestand: in de app afspelen), link (andere site) of leeg."""
    url = (url or "").strip()
    if not url.startswith("https://"):
        return ""
    if _YOUTUBE.match(url) or _VIMEO.match(url) or re.search(r"\.(mp4|webm|mov)(\?|$)", url, re.I):
        return "speler"
    return "link"


__all__ = ["Fout"]
