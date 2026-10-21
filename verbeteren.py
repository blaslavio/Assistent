"""Ideeën, problemen en fouten melden. Zie sql/verbeteren.sql.

Een vaste routine leest de meldingen, bouwt verbeteringen en zet er een kort antwoord bij dat de melder in de app ziet.
Fouten gaan zonder naam en zonder inhoud: alleen het soort fout en de plek in de code.
"""

import os
import traceback

import opslag

SOORTEN = {"idee": "Idee", "probleem": "Probleem"}
STATUS = {"nieuw": "Ontvangen", "opgepakt": "Mee bezig", "klaar": "Gedaan", "afgewezen": "Niet gedaan"}


def melden(soort: str, tekst: str, pagina: str = "") -> str | None:
    """Geeft een foutmelding terug als het niet lukte, anders None."""
    antwoord = opslag._rpc_ik("app_melden", p_soort=soort, p_tekst=tekst, p_pagina=pagina)
    return antwoord.get("fout")


def mijn_meldingen() -> list[dict]:
    return opslag._rpc_ik("mijn_app_meldingen").get("meldingen", [])


def fout_melden(fout: BaseException, pagina: str = "") -> None:
    """Meldt een onverwachte fout, zonder gegevens van de gebruiker. Mag zelf nooit iets laten mislukken."""
    try:
        if not opslag._wachtwoord.get():
            return
        plekken = [f for f in traceback.extract_tb(fout.__traceback__)
                   if os.path.dirname(os.path.abspath(f.filename)) == os.path.dirname(os.path.abspath(__file__))]
        plek = plekken[-1] if plekken else None
        tekst = type(fout).__name__ + (f" in {os.path.basename(plek.filename)}:{plek.lineno} ({plek.name})" if plek else "")
        opslag._rpc_ik("app_melden", p_soort="fout", p_tekst=tekst, p_pagina=pagina)
    except Exception:
        pass
