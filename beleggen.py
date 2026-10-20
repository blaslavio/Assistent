"""Beleggen: je portefeuille en een volglijst met actuele koersen. Alleen meekijken en uitleg, nooit kopen of verkopen.

Koersen komen van Yahoo Finance (openbare grafiekgegevens, geen sleutel nodig) en worden een kwartier onthouden
voor alle gebruikers samen, zodat de app snel blijft. Lukt ophalen niet, dan vul je een koers zelf in.
Alles wordt omgerekend naar euro's. Je posities staan bij de instellingen (instellingen.beleggen).
"""

import os
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

import opslag

YAHOO = os.environ.get("YAHOO_URL", "https://query1.finance.yahoo.com")
YAHOO_ZOEK = os.environ.get("YAHOO_ZOEK_URL", "https://query2.finance.yahoo.com")
KOERS_SECONDEN = 900
KOPPEN = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"}
# Het marktoverzicht: een paar graadmeters die de meeste mensen kennen.
MARKT = {"AEX": "^AEX", "Wereld (MSCI World)": "IWDA.AS", "S&P 500 (VS)": "^GSPC", "Euro in dollar": "EURUSD=X",
         "Goud": "GC=F", "Bitcoin": "BTC-EUR"}
SOORTEN = {"ETF": "Indexfonds (ETF)", "EQUITY": "Aandeel", "MUTUALFUND": "Beleggingsfonds", "CRYPTOCURRENCY": "Crypto",
           "INDEX": "Index", "CURRENCY": "Valuta", "FUTURE": "Grondstof", "BOND": "Obligatie"}
WAARSCHUWING = ("Dit is uitleg, geen persoonlijk financieel advies. Beleggen kent risico's: je kunt (een deel van) je "
                "inleg verliezen. De app koopt of verkoopt nooit iets.")

_koersen: dict[str, tuple[float, dict | None]] = {}
_slot = threading.Lock()
_verbinding = httpx.Client(timeout=8, headers=KOPPEN, follow_redirects=True)


class Fout(Exception):
    """Iets ging mis; de tekst is geschikt om aan de gebruiker te tonen."""


# --- Instellingen ----------------------------------------------------------------------------------------------------

def instellingen() -> dict:
    b = opslag.instellingen().get("beleggen", {})
    return {"posities": b.get("posities", []), "volglijst": b.get("volglijst", [])}


def _bewaar(**velden) -> None:
    opslag.instellingen_bijwerken(beleggen={**opslag.instellingen().get("beleggen", {}), **velden})


def in_gebruik() -> bool:
    b = instellingen()
    return bool(b["posities"] or b["volglijst"])


def positie_toevoegen(symbool: str, naam: str, aantal: float, aankoopprijs: float, soort: str = "",
                      valuta: str = "EUR") -> dict:
    """Een belegging die je hebt (aankoopprijs per stuk, in euro's)."""
    p = {"id": secrets.token_hex(4), "symbool": symbool.strip().upper(), "naam": naam.strip() or symbool.upper(),
         "aantal": float(aantal), "aankoopprijs": round(float(aankoopprijs), 4), "soort": soort, "valuta": valuta}
    _bewaar(posities=instellingen()["posities"] + [p])
    return p


def positie_bijwerken(positie_id: str, **velden) -> None:
    toegestaan = {"aantal", "aankoopprijs", "naam", "eigen_koers"}
    _bewaar(posities=[{**p, **{k: v for k, v in velden.items() if k in toegestaan}} if p["id"] == positie_id else p
                      for p in instellingen()["posities"]])


def positie_weg(positie_id: str) -> None:
    _bewaar(posities=[p for p in instellingen()["posities"] if p["id"] != positie_id])


def volgen(symbool: str, naam: str, soort: str = "") -> None:
    lijst = [v for v in instellingen()["volglijst"] if v["symbool"] != symbool.upper()]
    _bewaar(volglijst=lijst + [{"symbool": symbool.strip().upper(), "naam": naam.strip() or symbool, "soort": soort}])


def niet_volgen(symbool: str) -> None:
    _bewaar(volglijst=[v for v in instellingen()["volglijst"] if v["symbool"] != symbool.upper()])


# --- Koersen ---------------------------------------------------------------------------------------------------------

def zoeken(zoekterm: str) -> list[dict]:
    """Zoekt een aandeel, ETF of crypto op naam of ticker. Geeft [{symbool, naam, beurs, soort}]."""
    if not zoekterm.strip():
        return []
    try:
        r = _verbinding.get(f"{YAHOO_ZOEK}/v1/finance/search",
                            params={"q": zoekterm.strip(), "quotesCount": 8, "newsCount": 0, "lang": "nl-NL",
                                    "region": "NL"})
        r.raise_for_status()
        gevonden = r.json().get("quotes", [])
    except (httpx.HTTPError, ValueError):
        raise Fout("Zoeken lukt nu niet. Probeer het straks nog eens, of vul de ticker zelf in (bijvoorbeeld VWRL.AS).")
    return [{"symbool": q["symbol"], "naam": q.get("longname") or q.get("shortname") or q["symbol"],
             "beurs": q.get("exchDisp") or q.get("exchange", ""), "soort": q.get("quoteType", "")}
            for q in gevonden if q.get("symbol") and q.get("quoteType") in SOORTEN]


def _ophalen(symbool: str) -> dict | None:
    try:
        r = _verbinding.get(f"{YAHOO}/v8/finance/chart/{symbool}", params={"range": "1mo", "interval": "1d"})
        r.raise_for_status()
        resultaat = r.json()["chart"]["result"][0]
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        return None
    meta = resultaat.get("meta", {})
    slot = [k for k in (resultaat.get("indicators", {}).get("quote", [{}])[0].get("close") or []) if k is not None]
    prijs = meta.get("regularMarketPrice") or (slot[-1] if slot else None)
    if prijs is None:
        return None
    vorige = slot[-2] if len(slot) >= 2 else meta.get("previousClose") or meta.get("chartPreviousClose")
    maand_begin = slot[0] if slot else None
    return {"symbool": symbool, "prijs": float(prijs), "valuta": meta.get("currency") or "EUR",
            "vandaag_pct": round((prijs / vorige - 1) * 100, 2) if vorige else None,
            "maand_pct": round((prijs / maand_begin - 1) * 100, 2) if maand_begin else None,
            "verloop": [round(float(k), 4) for k in slot][-22:], "soort": meta.get("instrumentType", ""),
            "naam": meta.get("longName") or meta.get("shortName") or symbool, "tijd": meta.get("regularMarketTime")}


def _ophalen_en_bewaren(symbolen: list[str]) -> dict[str, dict | None]:
    nu, uit = time.time(), {}
    with ThreadPoolExecutor(max_workers=min(8, len(symbolen))) as pool:
        for s, k in zip(symbolen, pool.map(_ophalen, symbolen)):
            uit[s] = k
            with _slot:
                _koersen[s] = (nu, k)
    return uit


def koersen(symbolen: list[str], achtergrond: bool = False) -> dict[str, dict | None]:
    """Actuele koersen (tegelijk opgehaald, een kwartier onthouden). None als een koers niet te krijgen is.

    Met achtergrond=True wacht de app nergens op: wat nog niet bekend is, wordt op de achtergrond opgehaald.
    """
    nu = time.time()
    uit, ophalen = {}, []
    with _slot:
        for s in dict.fromkeys(symbolen):
            bewaard = _koersen.get(s)
            # Een mislukte poging niet een kwartier onthouden, maar twee minuten.
            if bewaard and nu - bewaard[0] < (KOERS_SECONDEN if bewaard[1] else 120):
                uit[s] = bewaard[1]
            else:
                ophalen.append(s)
    if ophalen and achtergrond:
        threading.Thread(target=_ophalen_en_bewaren, args=(ophalen,), daemon=True).start()
        uit |= {s: (_koersen.get(s) or (0, None))[1] for s in ophalen}
    elif ophalen:
        uit |= _ophalen_en_bewaren(ophalen)
    return uit


def _naar_euro(bedrag: float, valuta: str, wissel: dict) -> float | None:
    if valuta in ("EUR", "", None):
        return bedrag
    if valuta == "GBp":  # Londen noteert in pence
        bedrag, valuta = bedrag / 100, "GBP"
    k = wissel.get(f"EUR{valuta}=X")
    return bedrag / k["prijs"] if k and k["prijs"] else None


# --- Overzicht --------------------------------------------------------------------------------------------------------

def portefeuille(achtergrond: bool = False) -> dict:
    """Waarde, winst of verlies en spreiding van je beleggingen, in euro's."""
    posities = instellingen()["posities"]
    k = koersen([p["symbool"] for p in posities], achtergrond)
    valuta = {v["valuta"] for v in k.values() if v and v["valuta"] not in ("EUR", "")}
    wissel = koersen([f"EUR{'GBP' if v == 'GBp' else v}=X" for v in valuta], achtergrond) if valuta else {}
    regels, waarde, inleg, vandaag = [], 0.0, 0.0, 0.0
    for p in posities:
        koers = k.get(p["symbool"])
        prijs = _naar_euro(koers["prijs"], koers["valuta"], wissel) if koers else None
        eigen = prijs is None and p.get("eigen_koers")
        if eigen:
            prijs = float(p["eigen_koers"])
        inleg_p = p["aantal"] * p["aankoopprijs"]
        regel = {**p, "inleg": round(inleg_p, 2), "koers": round(prijs, 4) if prijs is not None else None,
                 "eigen": bool(eigen), "soort": p.get("soort") or (koers or {}).get("soort", ""),
                 "vandaag_pct": (koers or {}).get("vandaag_pct"), "maand_pct": (koers or {}).get("maand_pct"),
                 "verloop": (koers or {}).get("verloop", [])}
        if prijs is not None:
            w = p["aantal"] * prijs
            regel |= {"waarde": round(w, 2), "resultaat": round(w - inleg_p, 2),
                      "resultaat_pct": round((w / inleg_p - 1) * 100, 2) if inleg_p else None}
            waarde += w
            inleg += inleg_p
            if regel["vandaag_pct"] is not None:
                vandaag += w - w / (1 + regel["vandaag_pct"] / 100)
        regels.append(regel)
    for r in regels:
        r["aandeel_pct"] = round(r["waarde"] / waarde * 100, 1) if waarde and r.get("waarde") else None
    spreiding: dict[str, float] = {}
    for r in regels:
        if r.get("waarde"):
            soort = SOORTEN.get(r["soort"], "Overig")
            spreiding[soort] = spreiding.get(soort, 0) + r["waarde"]
    let_op = []
    for r in regels:
        if r.get("aandeel_pct") and r["aandeel_pct"] > 30 and len(regels) > 1 and r["soort"] != "ETF":
            let_op.append(f"{r['naam']} is {r['aandeel_pct']:.0f}% van je portefeuille. Veel in één belegging "
                          f"maakt je gevoeliger voor tegenvallers.")
    if spreiding.get("Crypto", 0) > 0.2 * waarde > 0:
        let_op.append("Meer dan een vijfde zit in crypto. Dat kan hard op en neer gaan.")
    ontbreekt = [r["naam"] for r in regels if r["koers"] is None]
    return {"posities": regels, "waarde": round(waarde, 2), "inleg": round(inleg, 2),
            "resultaat": round(waarde - inleg, 2), "resultaat_pct": round((waarde / inleg - 1) * 100, 2) if inleg else None,
            "vandaag": round(vandaag, 2), "spreiding": {s: round(w, 2) for s, w in spreiding.items()},
            "let_op": let_op, "zonder_koers": ontbreekt, "uitleg": WAARSCHUWING}


def volglijst() -> list[dict]:
    lijst = instellingen()["volglijst"]
    k = koersen([v["symbool"] for v in lijst])
    return [{**v, **(k.get(v["symbool"]) or {}), "naam": v["naam"]} for v in lijst]


def markt() -> list[dict]:
    k = koersen(list(MARKT.values()))
    return [{**(k.get(s) or {}), "naam": naam, "symbool": s} for naam, s in MARKT.items()]


def kort() -> str | None:
    """Eén zin voor het ochtendoverzicht, of None."""
    if not instellingen()["posities"]:
        return None
    p = portefeuille(achtergrond=True)
    if not p["waarde"]:
        return None
    teken = "+" if p["vandaag"] >= 0 else "−"
    return (f"Je beleggingen zijn €{_euro(p['waarde'])} waard ({teken}€{_euro(abs(p['vandaag']))} sinds de vorige "
            f"slotkoers).")


def _euro(bedrag: float) -> str:
    return f"{bedrag:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
