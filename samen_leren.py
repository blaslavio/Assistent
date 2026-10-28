"""Samen leren: de app wordt slimmer van wat gebruikers samen doen, alleen als je daar zelf voor kiest.

Wat er heen gaat (zie sql/samen_leren.sql), en verder niets:
  * welke categorie je in je budget aan een winkel of bedrijf geeft ("albert heijn" -> Boodschappen);
  * per soort afspraak hoeveel minuten die bij jou gemiddeld uitloopt;
  * per onderwerp (agenda, mail, budget...) hoe vaak je een antwoord goed of niet goed vond.
Nooit tekst van vragen, antwoorden, mails of berichten, geen bedragen en geen namen van mensen.
Terug komt alleen wat minstens 5 mensen samen bijdroegen: zo kan niemand zien wat één persoon deed.
"""

import contextvars
import hashlib
import re
import threading
import time

import opslag

ELKE_SECONDEN = 24 * 60 * 60
# Een woord in de vraag -> het onderwerp waar een oordeel bij hoort. Alleen het onderwerp gaat mee.
ONDERWERPEN = {
    "agenda": ("agenda", "afspraak", "plan", "morgen", "vandaag", "week", "herinner", "taak", "taken"),
    "mail": ("mail", "inbox", "antwoord op", "bericht"),
    "geld": ("budget", "geld", "uitgave", "betaal", "factuur", "spaar", "€", "euro", "beleg", "koers"),
    "leren": ("leer", "toets", "overhoor", "uitleg", "scriptie", "studie", "huiswerk", "verslag"),
    "boodschappen": ("boodschap", "winkel", "supermarkt", "kopen", "prijs", "goedkoop"),
    "sport en gezondheid": ("sport", "train", "hardlo", "fiets", "gezond", "slaap", "stappen", "eten"),
    "onderweg": ("route", "reis", "trein", "rijden", "vertrek", "weer", "regen"),
}

_slot = threading.Lock()
_bezig: dict[str, float] = {}
_kennis: tuple[float, dict] = (0.0, {})


def aan() -> bool:
    return bool(opslag.instellingen().get("samen_leren"))


def instellen(waarde: bool) -> str | None:
    """Zet samen leren aan of uit. Uit maakt je bijdrage meteen leeg. Geeft een fout of None."""
    if not opslag.online():
        return "Kan alleen in de online versie."
    antwoord = opslag._rpc_ik("samen_leren_instellen", p_aan=bool(waarde))
    if fout := antwoord.get("fout"):
        return fout
    opslag.instellingen_bijwerken(samen_leren=bool(waarde), samen_leren_laatst=0)
    if waarde:
        vanzelf(direct=True)
    return None


def onderwerp(vraag: str) -> str:
    laag = (vraag or "").lower()
    return next((naam for naam, woorden in ONDERWERPEN.items() if any(w in laag for w in woorden)), "overig")


def _sleutel(tekst: str) -> str | None:
    """Een winkel- of bedrijfsnaam zoals hij gedeeld mag worden; None als het op iets persoonlijks lijkt."""
    s = re.sub(r"\s+", " ", (tekst or "").strip().lower())[:60]
    if not s or not re.fullmatch(r"[a-z0-9à-ÿ &'.-]+", s) or re.search(r"\d{4,}", s):
        return None
    # Overboekingen aan mensen ("j. jansen", "hr a de vries") niet delen.
    if re.match(r"^([a-z]\.\s?)+[a-z]", s) or re.match(r"^(hr|mw|mevr|dhr|de heer|mevrouw)\b", s):
        return None
    return s


def bijdrage() -> list[dict]:
    """Wat er van jou meegaat, precies zoals het verstuurd wordt (ook om te laten zien in de instellingen)."""
    import budget
    import tijd
    items = []
    for naam, categorie in (budget.instellingen().get("regels") or {}).items():
        if (s := _sleutel(naam)) and categorie in budget.CATEGORIEEN:
            items.append({"soort": "categorie", "sleutel": s, "waarde": categorie})
    for soort, g in tijd.gewoontes().items():
        if g["aantal"] >= 3:
            items.append({"soort": "uitloop", "sleutel": soort, "waarde": str(max(-120, min(240, g["gem_uitloop_min"])))})
    per: dict[str, list[int]] = {}
    for f in opslag.feedback():
        tel = per.setdefault(onderwerp(f.get("vraag", "")), [0, 0])
        tel[0 if f["goed"] else 1] += 1
    items += [{"soort": "oordeel", "sleutel": o, "waarde": f"{g}:{n}"} for o, (g, n) in per.items()]
    return items[:400]


def vanzelf(direct: bool = False) -> None:
    """Eén keer per dag je bijdrage bijwerken, op de achtergrond. Alleen als samen leren aanstaat."""
    if not opslag.online() or not aan():
        return
    if not direct and time.time() - float(opslag.instellingen().get("samen_leren_laatst") or 0) < ELKE_SECONDEN:
        return
    gebruiker = hashlib.sha256(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}".encode()).hexdigest()
    with _slot:
        if not direct and time.time() - _bezig.get(gebruiker, 0) < 600:
            return
        _bezig[gebruiker] = time.time()

    def werk() -> None:
        try:
            antwoord = opslag._rpc_ik("samen_leren_bijdragen", p_items=bijdrage())
            if antwoord.get("ok"):
                opslag.instellingen_bijwerken(samen_leren_laatst=time.time())
        except Exception:
            pass

    if direct:
        werk()
    else:
        threading.Thread(target=contextvars.copy_context().run, args=(werk,), daemon=True).start()


def kennis() -> dict:
    """Wat de app van iedereen samen heeft geleerd (een uur bewaard). Leeg als het niet lukt."""
    global _kennis
    if time.time() - _kennis[0] < 3600:
        return _kennis[1]
    if not opslag.online():
        return {}
    try:
        uit = opslag._rpc_ik("samen_leren_lezen")
    except Exception:
        return _kennis[1]
    if not isinstance(uit, dict) or uit.get("geen_toegang"):
        return _kennis[1]
    _kennis = (time.time(), {k: uit.get(k) or {} for k in ("categorie", "uitloop", "oordeel")} | {"mensen": uit.get("mensen", 0)})
    return _kennis[1]


def categorie(tegenpartij: str) -> str | None:
    """De categorie die de meeste mensen aan deze winkel of dit bedrijf geven, als het er genoeg zijn."""
    s = _sleutel(tegenpartij)
    return (kennis().get("categorie") or {}).get(s) if s else None


def voor_assistent(eigen_gewoontes: dict) -> str:
    """Een paar regels voor de assistent: wat iedereen samen leerde, waar je zelf nog weinig over weet."""
    k = kennis()
    regels = []
    for soort, u in (k.get("uitloop") or {}).items():
        if (eigen_gewoontes.get(soort) or {}).get("aantal", 0) < 3 and u["minuten"]:
            regels.append(f"- {soort}: loopt bij {u['mensen']} gebruikers gemiddeld {u['minuten']} min uit")
    minder = [o for o, x in (k.get("oordeel") or {}).items() if x["goed"] + x["niet"] >= 10 and x["niet"] > x["goed"] / 3]
    tekst = ""
    if regels:
        tekst += ("Wat de app van alle gebruikers samen leerde (anoniem), voor soorten waar je over deze gebruiker "
                  "nog weinig weet:\n" + "\n".join(regels))
    if minder:
        tekst += ("\n" if tekst else "") + ("Onderwerpen waar gebruikers antwoorden vaker niet goed vonden; wees hier "
                                           "extra zorgvuldig en concreet: " + ", ".join(minder) + ".")
    return tekst
