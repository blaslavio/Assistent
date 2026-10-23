"""Winkelen: een mandje per winkel en afrekenen in één keer, ook voor bezorgen. Gedeeld door het scherm en de assistent.

Het mandje staat in je instellingen (instellingen.mandje = {winkeladres: {"naam", "regels": {id: {...}}}}), zodat het
er na opnieuw openen nog is en de assistent er ook iets in kan leggen.
"""

import functools

import opslag
import samen
import winkelkaart

MAX_REGELS = 30


def mandje() -> dict:
    return opslag.instellingen().get("mandje") or {}


def aantal_in_mandje() -> int:
    return sum(r["aantal"] for m in mandje().values() for r in m["regels"].values())


def _bewaar(m: dict) -> None:
    opslag.instellingen_bijwerken(mandje={a: w for a, w in m.items() if w["regels"]})


def in_mandje(winkel: str, winkelnaam: str, product: dict, aantal: int = 1) -> int:
    """Legt een product in het mandje van die winkel. Geeft het nieuwe aantal."""
    m = mandje()
    w = m.setdefault(winkel, {"naam": winkelnaam, "regels": {}})
    sleutel = str(product["id"])
    if sleutel not in w["regels"] and len(w["regels"]) >= MAX_REGELS:
        raise samen.Fout(f"Hooguit {MAX_REGELS} producten per winkel.")
    regel = w["regels"].setdefault(sleutel, {"titel": product["titel"], "prijs": float(product.get("prijs") or 0),
                                              "aantal": 0})
    regel["aantal"] = max(1, min(99, regel["aantal"] + aantal))
    _bewaar(m)
    return regel["aantal"]


def aantal_zetten(winkel: str, product_id: int | str, aantal: int) -> None:
    """0 haalt het product uit het mandje."""
    m = mandje()
    if winkel not in m:
        return
    if aantal <= 0:
        m[winkel]["regels"].pop(str(product_id), None)
    elif str(product_id) in m[winkel]["regels"]:
        m[winkel]["regels"][str(product_id)]["aantal"] = min(99, aantal)
    _bewaar(m)


def leegmaken(winkel: str) -> None:
    m = mandje()
    m.pop(winkel, None)
    _bewaar(m)


def subtotaal(winkel: str) -> float:
    return round(sum(r["prijs"] * r["aantal"] for r in (mandje().get(winkel) or {"regels": {}})["regels"].values()), 2)


@functools.lru_cache(maxsize=256)
def plek(adres: str) -> tuple[float, float, str]:
    """Adres op de kaart; bewaard, zodat we hetzelfde adres niet steeds opnieuw opzoeken."""
    return winkelkaart.plek(adres)


def waar() -> tuple[float, float, str] | None:
    """De plek om vanuit te zoeken: wat je bij Winkelen invulde, anders je thuisadres. None als die onbekend is."""
    inst = opslag.instellingen()
    adres = (inst.get("winkelen_plek") or inst.get("thuisadres") or "").strip()
    if not adres:
        return None
    try:
        return plek(adres)
    except Exception:
        return None


def afrekenen(winkel: str, levering: str, bezorgadres: str = "", bericht: str = "", code: str = "") -> dict:
    """Plaatst de bestelling voor het mandje van één winkel en geeft {"id", "bedrag", "betaallink"}.

    Bij bezorgen zoeken we het adres op de kaart op; de winkel controleert of het binnen het bezorggebied ligt."""
    m = mandje().get(winkel)
    if not m or not m["regels"]:
        raise samen.Fout("Je mandje is leeg.")
    lat = lon = None
    if levering == "bezorgen":
        if not bezorgadres.strip():
            raise samen.Fout("Vul je bezorgadres in.")
        try:
            lat, lon, _ = plek(bezorgadres.strip())
        except Exception:
            raise samen.Fout("Dit adres kan ik niet vinden. Controleer straat, huisnummer en plaats.") from None
    b = samen.winkel_afrekenen(winkel, [{"id": int(i), "aantal": r["aantal"]} for i, r in m["regels"].items()],
                               levering, bezorgadres.strip(), lat, lon, bericht, code)
    leegmaken(winkel)
    try:
        b["betaallink"] = samen.afrekenen(b["id"])
    except Exception:
        b["betaallink"] = ""
    return b


def bezorg_tekst(w: dict) -> str:
    """Kort: 'Bezorgt · 30-45 min · € 2,50 · vanaf € 15'."""
    if not w.get("bezorgen"):
        return ""
    delen = ["Bezorgt", f"{max(w['bezorg_minuten'] - 10, 5)}-{w['bezorg_minuten'] + 10} min",
             samen.euro(w["bezorgkosten"]) if w.get("bezorgkosten") else "gratis bezorgd"]
    if w.get("bezorg_minimum"):
        delen.append(f"vanaf {samen.euro(w['bezorg_minimum'])}")
    if not w.get("bezorgt_nu") and w.get("bezorg_van"):
        delen = [f"Bezorgt van {w['bezorg_van']} tot {w['bezorg_tot']}"]
    return " · ".join(delen)
