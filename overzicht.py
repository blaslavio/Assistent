"""Samenvatting van een week, maand of jaar: agenda, sport en gezondheid samen.

Alles komt uit je eigen agenda (en sportresultaten); er gaat niets naar anderen. Werkt zonder Claude.
"""

import calendar
from datetime import date, datetime, timedelta

import opslag
import tijd

# Beweegrichtlijn van de Gezondheidsraad: minstens 150 minuten per week matig intensief bewegen.
BEWEEG_MINUTEN_PER_WEEK = 150
MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober",
           "november", "december"]


def periode(soort: str, stap: int = 0, vandaag: date | None = None) -> tuple[date, date, str]:
    """(van, tot, naam) van deze week/maand/jaar, of `stap` periodes terug (negatief) of vooruit."""
    vandaag = vandaag or date.today()
    if soort == "week":
        van = vandaag - timedelta(days=vandaag.weekday()) + timedelta(weeks=stap)
        tot = van + timedelta(days=6)
        return van, tot, f"week {van.isocalendar()[1]} ({van.day}-{van.month} t/m {tot.day}-{tot.month})"
    if soort == "maand":
        n = vandaag.year * 12 + vandaag.month - 1 + stap
        van = date(n // 12, n % 12 + 1, 1)
        return van, van.replace(day=calendar.monthrange(van.year, van.month)[1]), f"{MAANDEN[van.month - 1]} {van.year}"
    jaar = vandaag.year + stap
    return date(jaar, 1, 1), date(jaar, 12, 31), str(jaar)


def _duur(a: dict) -> int:
    """Geplande minuten van een afspraak (hele dag telt niet mee als tijd)."""
    if "T" not in a["start"]:
        return 0
    if a.get("einde") and "T" in a["einde"]:
        return max(0, int((datetime.fromisoformat(a["einde"][:16])
                           - datetime.fromisoformat(a["start"][:16])).total_seconds() // 60))
    return 60


def samenvatting(van: date, tot: date) -> dict:
    """Wat er in een periode in je agenda stond, wat je aan sport deed en wat er voor je gezondheid was."""
    afspraken = [a for a in opslag.afspraken_tussen(van.isoformat(), tot.isoformat())
                 if (a.get("uitnodiging") or {}).get("antwoord") != "nee"]
    tot_nu = min(tot, date.today())
    per_soort: dict[str, dict] = {}
    for a in afspraken:
        s = per_soort.setdefault(tijd.soort_van(a), {"aantal": 0, "minuten": 0})
        s["aantal"] += 1
        s["minuten"] += _duur(a)
    sport = tijd.sportoverzicht(van.isoformat(), tot_nu.isoformat()) if tot_nu >= van else \
        {"aantal": 0, "minuten": 0, "afstand_km": 0, "per_sport": {}}
    dagen_tot_nu = max(0, (tot_nu - van).days + 1)
    weken = max(1, dagen_tot_nu) / 7
    sportdagen = {a["start"][:10] for a in tijd.gedaan(van.isoformat(), tot_nu.isoformat())} if dagen_tot_nu else set()
    gezondheid = [a for a in afspraken if tijd.soort_van(a) == "gezondheid"]
    laat = [a for a in afspraken if "T" in a["start"] and ((a.get("einde") or "")[11:16] > "23:00"
                                                           or a["start"][11:16] >= "22:30")]
    verjaardagen = [a for a in afspraken if tijd.soort_van(a) == "verjaardag"]
    reizen = tijd.tijdsbesteding(van.isoformat(), tot_nu.isoformat())["totaal_minuten"] if dagen_tot_nu else {}
    return {
        "van": van.isoformat(), "tot": tot.isoformat(),
        "afspraken": len(afspraken),
        "uren_gepland": round(sum(s["minuten"] for s in per_soort.values()) / 60, 1),
        "per_soort": dict(sorted(per_soort.items(), key=lambda x: -x[1]["minuten"])),
        "sport": {**sport, "per_week_minuten": round(sport["minuten"] / weken) if dagen_tot_nu else 0,
                  "rustdagen": max(0, dagen_tot_nu - len(sportdagen))},
        "beweegrichtlijn": {"minuten_per_week": BEWEEG_MINUTEN_PER_WEEK,
                            "gehaald": dagen_tot_nu > 0 and sport["minuten"] / weken >= BEWEEG_MINUTEN_PER_WEEK},
        "gezondheid": [{"titel": a["titel"], "datum": a["start"][:10]} for a in gezondheid],
        "laat_op_pad": len(laat),
        "verjaardagen": [{"titel": a["titel"], "datum": a["start"][:10]} for a in verjaardagen],
        "reistijd_minuten": reizen.get("reistijd", 0),
    }


def vergelijk(soort: str, stap: int = 0) -> dict:
    """Samenvatting van een periode plus de periode ervoor (voor 'meer of minder dan vorige keer')."""
    van, tot, naam = periode(soort, stap)
    nu = samenvatting(van, tot)
    vorige_van, vorige_tot, _ = periode(soort, stap - 1)
    vorige = samenvatting(vorige_van, vorige_tot)
    return {"naam": naam, **nu, "vorige": {"afspraken": vorige["afspraken"], "sport_minuten": vorige["sport"]["minuten"],
                                           "sport_aantal": vorige["sport"]["aantal"]}}


def volgende_gezondheid(dagen: int = 365) -> dict | None:
    """De eerstvolgende afspraak voor je gezondheid (tandarts, huisarts, fysio...)."""
    vandaag = date.today()
    return next((a for a in opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=dagen)).isoformat())
                 if tijd.soort_van(a) == "gezondheid"), None)


def verjaardagen_binnenkort(dagen: int = 7) -> list[dict]:
    """Verjaardagen in de komende dagen (vandaag eerst)."""
    vandaag = date.today()
    return [a for a in opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=dagen)).isoformat())
            if tijd.soort_van(a) == "verjaardag"]


def tekst(s: dict) -> str:
    """Korte samenvatting in gewone taal (voor de assistent en het ochtendoverzicht)."""
    delen = [f"{s['afspraken']} afspraken ({s['uren_gepland']} uur gepland)"]
    sp = s["sport"]
    if sp["aantal"]:
        delen.append(f"{sp['aantal']} keer gesport, {sp['minuten']} minuten" +
                     (f", {sp['afstand_km']} km" if sp["afstand_km"] else ""))
    else:
        delen.append("niet gesport")
    if "vorige" in s and s["vorige"]["sport_minuten"]:
        verschil = sp["minuten"] - s["vorige"]["sport_minuten"]
        delen.append(f"{abs(verschil)} minuten {'meer' if verschil >= 0 else 'minder'} bewogen dan de vorige keer")
    if s["gezondheid"]:
        delen.append(f"{len(s['gezondheid'])} afspraak voor je gezondheid")
    return (s.get("naam", "") + ": " if s.get("naam") else "") + ", ".join(delen) + "."
