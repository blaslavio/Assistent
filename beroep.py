"""Je beroep, en de zakelijke hulpmiddelen die daarbij horen.

Een beroep zet de passende onderdelen aan (Zakelijk, Marktplaats, ...) en geeft een voorstel voor de diensten op je
boekingspagina. Alles blijft ook zonder beroep te gebruiken; het beroep bepaalt vooral wat de app en de assistent
je als eerste laten zien. Bewaard in instellingen.beroep = {"soort": sleutel, "naam": omschrijving}.
"""

from datetime import date

import boekpagina
import opslag
import samen
import zaak

# Wat de app voor een zaak kan doen: sleutel → (naam, pagina, onderdeel dat aan moet staan).
TOOLS = {
    "boekingen": ("Boekingspagina", "boekingen", None),
    "lessen": ("Lesrooster", "zakelijk", "Zakelijk"),
    "werkrooster": ("Werkrooster en planning", "zakelijk", "Zakelijk"),
    "klanten": ("Klanten en saldo", "zakelijk", "Zakelijk"),
    "boekhouding": ("Boekhouding en btw", "zakelijk", "Zakelijk"),
    "webshop": ("Webshop bouwen", "webshop", "Marktplaats"),
    "integraties": ("Bestaande webshop koppelen", "koppelingen", None),
    "omzet": ("Omzet en verkoopresultaten", "zakelijk", "Zakelijk"),
    "verzenden": ("Bestellingen en verzenden", "bestellingen", "Marktplaats"),
    "reviews": ("Reviews", "webshop", "Marktplaats"),
    "marketing": ("Kortingscodes en nieuwtjes", "webshop", "Marktplaats"),
    "diensten": ("Dienst aanbieden", "verkopen", "Marktplaats"),
    "documenten": ("Offertes en documenten", "documenten", "Documenten"),
    "mail": ("Mail", "mail", "Mail"),
}

_AFSPRAAK = ["boekingen", "klanten", "boekhouding", "reviews", "marketing", "diensten", "mail"]
_LES = ["lessen", "boekingen", "klanten", "boekhouding", "reviews", "marketing", "mail"]
_KLUS = ["boekingen", "documenten", "klanten", "boekhouding", "reviews", "diensten", "mail"]
_WINKEL = ["webshop", "verzenden", "marketing", "reviews", "boekhouding", "mail"]

# sleutel → naam, soort zaak, groepslessen, afspraken, hulpmiddelen, diensten (naam, minuten) voor de boekingspagina.
BEROEPEN = {
    "schoonheid": ("Schoonheid of nagels", "dienst", False, True, _AFSPRAAK + ["webshop"],
                   [("Behandeling", 60), ("Manicure", 45), ("Kennismaking", 15)]),
    "trainer": ("Personal trainer", "trainer", False, True, _AFSPRAAK,
                [("Proefles", 30), ("Personal training", 60), ("Duotraining", 60)]),
    "sportschool": ("Sportschool of club", "gym", True, True, _LES,
                    [("Proefles", 60), ("Intake", 30)]),
    "lesgever": ("Yoga, dans of muziekles", "dienst", True, True, _LES,
                 [("Proefles", 45), ("Privéles", 60)]),
    "bijles": ("Bijles of huiswerkbegeleiding", "dienst", False, True, _AFSPRAAK,
               [("Kennismaking", 15), ("Bijles", 60)]),
    "coach": ("Coach of adviseur", "dienst", False, True, _AFSPRAAK + ["documenten"],
              [("Kennismaking", 30), ("Sessie", 60)]),
    "fotograaf": ("Fotograaf of filmmaker", "dienst", False, True, _KLUS + ["webshop"],
                  [("Kennismaking", 30), ("Fotoshoot", 90)]),
    "klusser": ("Klusser, schilder of installateur", "dienst", False, True, _KLUS,
                [("Opname op locatie", 30), ("Klus", 240)]),
    "schoonmaak": ("Schoonmaak", "dienst", False, True, _KLUS,
                   [("Kennismaking", 15), ("Schoonmaak", 180)]),
    "hovenier": ("Hovenier of tuinman", "dienst", False, True, _KLUS,
                 [("Opname op locatie", 30), ("Tuinonderhoud", 240)]),
    "winkel": ("Webwinkel of maker", "dienst", False, False, _WINKEL + ["diensten"], []),
    "horeca": ("Horeca of catering", "dienst", False, True, ["boekingen", "webshop", "verzenden", "reviews",
                                                             "marketing", "boekhouding", "mail"],
               [("Reservering", 90), ("Proeverij", 60)]),
    "zzp": ("Zzp'er of freelancer", "dienst", False, True, ["boekingen", "documenten", "klanten", "boekhouding",
                                                            "diensten", "mail"],
            [("Kennismaking", 30), ("Overleg", 60)]),
    "zorg": ("Zorgverlener of therapeut", "dienst", False, True, _AFSPRAAK + ["documenten"], [("Intake", 45), ("Behandeling", 60)]),
    "juridisch": ("Jurist of juridisch adviseur", "dienst", False, True, _KLUS, [("Intake", 45), ("Adviesgesprek", 60)]),
    "financieel": ("Accountant of financieel adviseur", "dienst", False, True, _KLUS, [("Kennismaking", 30), ("Advies", 60)]),
    "ict": ("Softwareontwikkelaar of IT-dienstverlener", "dienst", False, True, _KLUS, [("Projectoverleg", 60), ("Ondersteuning", 60)]),
    "bouw": ("Bouwbedrijf of aannemer", "dienst", False, True, _KLUS, [("Opname op locatie", 60)]),
    "onderwijs": ("Docent of opleider", "dienst", True, True, _LES + ["documenten"], [("Kennismaking", 30), ("Les", 60)]),
    "kunst": ("Kunstenaar of ontwerper", "dienst", False, True, _KLUS + ["webshop"], [("Projectbespreking", 45)]),
    "logistiek": ("Logistiek of transport", "dienst", False, True, _KLUS, [("Transportaanvraag", 30)]),
    "vastgoed": ("Vastgoed of makelaardij", "dienst", False, True, _KLUS, [("Bezichtiging", 45)]),
    "evenementen": ("Evenementen of organisatie", "dienst", False, True, _KLUS + ["webshop"], [("Kennismaking", 30)]),
    "landbouw": ("Landbouw of productie", "dienst", False, True, _WINKEL + ["documenten"], []),
    "media": ("Media of communicatie", "dienst", False, True, _KLUS + ["marketing"], [("Projectbespreking", 45)]),
    "architect": ("Architectuur en ontwerp", "dienst", False, True, _KLUS, [("Projectbespreking", 60)]),
    "automotive": ("Automotive en voertuigonderhoud", "dienst", False, True, _KLUS, [("Inspectie", 45)]),
    "beveiliging": ("Beveiliging en veiligheid", "dienst", False, True, _KLUS, [("Locatiebezoek", 60)]),
    "elektro": ("Elektrotechniek en installatie", "dienst", False, True, _KLUS, [("Technische inspectie", 60)]),
    "energie": ("Energie en duurzaamheid", "dienst", False, True, _KLUS, [("Energieadvies", 60)]),
    "evenementendienst": ("Evenemententechniek en verhuur", "dienst", False, True, _KLUS + ["webshop"], [("Aanvraagbespreking", 45)]),
    "gezondheid": ("Gezondheid en welzijn", "dienst", False, True, _AFSPRAAK, [("Intake", 45)]),
    "hr": ("HR en personeelsdiensten", "dienst", False, True, _KLUS, [("Adviesgesprek", 60)]),
    "interieur": ("Interieur en woninginrichting", "dienst", False, True, _KLUS + ["webshop"], [("Ontwerpgesprek", 60)]),
    "onderhoud": ("Onderhoud en reparatie", "dienst", False, True, _KLUS, [("Werkopname", 45)]),
    "recreatie": ("Recreatie en toerisme", "dienst", False, True, _AFSPRAAK + ["webshop"], [("Reservering", 60)]),
    "retail": ("Detailhandel en fysieke winkels", "dienst", False, False, _WINKEL, []),
    "techniek": ("Technische dienstverlening", "dienst", False, True, _KLUS, [("Technisch overleg", 45)]),
    "vertaling": ("Vertaling en taaldiensten", "dienst", False, True, _KLUS, [("Kennismaking", 30)]),
}
ANDERS = "anders"


def naam_van(sleutel: str) -> str:
    return BEROEPEN[sleutel][0] if sleutel in BEROEPEN else "Eigen beroep"


def huidig() -> dict:
    """{"soort": sleutel of "", "naam": omschrijving}. Leeg als er nog geen beroep gekozen is."""
    b = opslag.instellingen().get("beroep") or {}
    return {"soort": b.get("soort", ""), "naam": b.get("naam", "")}


def tools(sleutel: str | None = None) -> list[str]:
    sleutel = huidig()["soort"] if sleutel is None else sleutel
    basis = ["werkrooster", "webshop", "integraties", "omzet", "klanten", "boekhouding"]
    aanvullend = BEROEPEN[sleutel][4] if sleutel in BEROEPEN else \
        (["boekingen", "documenten", "reviews", "diensten", "mail"] if sleutel else [])
    return list(dict.fromkeys(basis + aanvullend))


def zoek(tekst: str) -> str | None:
    """Een beroep uit gewone woorden ('ik ben kapper', 'Personal trainer') → sleutel, of None."""
    t = (tekst or "").strip().lower()
    if not t:
        return None
    if t in BEROEPEN or t == ANDERS:
        return t
    for sleutel, b in BEROEPEN.items():
        woorden = [w.strip(" ,'") for w in b[0].lower().replace(" of ", ",").split(",")]
        if t == b[0].lower() or any(w and (w in t or t in w) for w in woorden + [sleutel]):
            return sleutel
    return None


def instellen(sleutel: str, eigen: str = "", diensten: list[dict] | None = None) -> list[str]:
    """Bewaart het beroep en zet de onderdelen aan die erbij horen. Geeft de namen van wat aangezet is.

    Uitzetten doet het nooit: wat je al gebruikt, blijft staan."""
    if sleutel not in BEROEPEN and sleutel != ANDERS:
        raise ValueError("Onbekend beroep.")
    eigen = (eigen or "").strip()[:60]
    inst = opslag.instellingen()
    uit = list(inst.get("onderdelen_uit", inst.get("tabbladen_uit", [])))
    bekend = list(inst.get("onderdelen_bekend", []))
    nodig = {"Zakelijk"} | {TOOLS[t][2] for t in tools(sleutel) if TOOLS[t][2]}
    # Onderdelen die standaard uit staan tot je ze kent: hier zet je ze bewust aan.
    aangezet = sorted(o for o in nodig if o in uit or (o == "Zakelijk" and o not in bekend))
    z = zaak.instellingen()
    if sleutel in BEROEPEN:
        _, soort, lessen, afspraken, _, _ = BEROEPEN[sleutel]
        z = z | {"soort": soort, "groepslessen": lessen, "afspraken": afspraken}
    opslag.instellingen_bijwerken(
        beroep={"soort": sleutel, "naam": eigen or naam_van(sleutel), **({"diensten": diensten} if diensten else {})},
        onderdelen_uit=[o for o in uit if o not in nodig],
        onderdelen_bekend=sorted(set(bekend) | {"Zakelijk"}), zaak=z)
    return aangezet


def wissen() -> None:
    opslag.instellingen_bijwerken(beroep={})


def diensten_voorstel(sleutel: str | None = None) -> list[dict]:
    eigen = (opslag.instellingen().get("beroep") or {}).get("diensten") if sleutel is None else None
    sleutel = huidig()["soort"] if sleutel is None else sleutel
    if eigen:  # voorgesteld door de assistent voor een beroep dat niet in de lijst staat
        return [{"naam": d["naam"], "minuten": d["minuten"]} for d in eigen]
    lijst = BEROEPEN[sleutel][5] if sleutel in BEROEPEN else []
    return [{"naam": n, "minuten": m} for n, m in lijst] or [dict(s) for s in boekpagina.STANDAARD["soorten"]]


def boekingspagina_maken(diensten: list[dict] | None = None, aan: bool = False) -> dict:
    """Maakt je boekingspagina met de diensten van je beroep (of past de diensten aan als hij al bestaat)."""
    m = boekpagina.mijn()
    p = m.get("pagina") or dict(boekpagina.STANDAARD, adres=boekpagina.voorstel_adres(), aan=aan,
                                titel=zaak.instellingen().get("naam") or "")
    p = dict(p, soorten=(diensten or diensten_voorstel())[:6])
    if aan:
        p["aan"] = True
    return boekpagina.instellen(p)


def _veilig(functie, *args, standaard=None):
    try:
        return functie(*args)
    except opslag.GeenToegang:
        raise
    except Exception:
        return standaard


def overzicht() -> dict:
    """Hoe je zaak ervoor staat, kort: voor de assistent en voor 'Mijn zaak'. Alleen wat er is, geen lege velden."""
    b = huidig()
    uit: dict = {"beroep": b["naam"] or "nog niet gekozen", "hulpmiddelen": [TOOLS[t][0] for t in tools()]}
    vandaag = date.today()
    if opslag.instellingen().get("boekpagina"):
        m = _veilig(boekpagina.mijn, standaard={}) or {}
        if pagina := m.get("pagina"):
            uit["boekingspagina"] = {"aan": pagina.get("aan"), "diensten": [s["naam"] for s in pagina.get("soorten", [])]}
            if wacht := _veilig(boekpagina.nieuw, m, standaard=[]):
                uit["boekingen_te_bevestigen"] = len(wacht)
    z = zaak.instellingen()
    if z.get("groepslessen") and (lessen := _veilig(zaak.lessen, vandaag, vandaag, standaard=[])):
        uit["lessen_vandaag"] = [{"naam": l.get("naam"), "start": str(l.get("start", ""))[11:16],
                                  "aanmeldingen": len(l.get("deelnemers") or [])} for l in lessen]
    o = _veilig(zaak.overzicht, *zaak.periode("Maand"), standaard=None)
    if o:
        c = zaak.cijfers(o.get("posten", []))
        uit["deze_maand"] = {k: zaak.bedrag(c[k]) for k in ("omzet", "ontvangen", "kosten", "winst")}
        if open_ := [s for s in o.get("saldi", []) if s.get("saldo", 0) < 0]:
            uit["nog_te_betalen_door_klanten"] = [{"klant": s.get("klant"), "bedrag": zaak.bedrag(-s["saldo"])}
                                                  for s in open_[:10]]
        if af := zaak.nog_afvinken(o):
            uit["afspraken_nog_afvinken"] = len(af)
    winkel = _veilig(samen.mijn_winkel, standaard={}) or {}
    if w := winkel.get("winkel"):
        uit["webshop"] = {"naam": w.get("naam"), "open": w.get("open")}
    bestellingen = _veilig(samen.mijn_bestellingen, standaard=[]) or []
    verkocht = [x for x in bestellingen if x.get("rol") == "verkoper"]
    if te_doen := [x for x in verkocht if x["status"] in ("aangevraagd", "betaald")
                   or (x["status"] == "geaccepteerd" and x.get("betaalwijze") != "app")]:
        uit["bestellingen_te_doen"] = [{"id": x["id"], "titel": x["titel"], "status": x["status"],
                                        "levering": x["levering"],
                                        "track_en_trace": bool(x.get("track_code"))} for x in te_doen[:10]]
    return uit


def klantkennis() -> dict:
    """Wat een klant mag weten, voor de assistent die klantvragen in de chat beantwoordt: je aanbod met prijzen,
    je diensten, je webshop en je eigen notities. Nooit omzet, klantgegevens of andere privézaken."""
    uit: dict = {}
    b = huidig()
    if b["soort"]:
        uit["beroep"] = b["naam"]
    aanbod = [a for a in (_veilig(samen.mijn_aanbod, standaard=[]) or []) if a.get("actief", True)]
    if aanbod:
        uit["aanbod"] = [{k: a[k] for k in ("soort", "titel", "omschrijving", "prijs", "prijs_per", "voorraad", "levering",
                                             "betaalwijzen", "plaats") if a.get(k) not in (None, "", [])}
                         for a in aanbod[:40]]
        for a in uit["aanbod"]:
            if "omschrijving" in a:
                a["omschrijving"] = str(a["omschrijving"])[:400]
    winkel = (_veilig(samen.mijn_winkel, standaard={}) or {}).get("winkel") or {}
    if winkel.get("open"):
        uit["webshop"] = {k: winkel[k] for k in ("naam", "omschrijving", "verzendkosten", "gratis_vanaf", "retour")
                          if winkel.get(k) not in (None, "")}
    if opslag.instellingen().get("boekpagina"):
        pagina = (_veilig(boekpagina.mijn, standaard={}) or {}).get("pagina") or {}
        if pagina.get("aan"):
            uit["boeken"] = {"diensten": [{k: s[k] for k in ("naam", "minuten", "prijs") if s.get(k) is not None}
                                          for s in pagina.get("soorten", [])],
                             "locatie": pagina.get("locatie", ""),
                             "hoe": "Afspraken boeken kan in deze chat via Mijn diensten of via de boekingspagina."}
    if notities := str((opslag.instellingen().get("klantenchat") or {}).get("notities", "")).strip():
        uit["mijn_notities"] = notities[:2000]
    return uit
