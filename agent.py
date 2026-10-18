"""De agent: Claude met hulpmiddelen voor taken, agenda, leren en zoeken op internet."""

import json
from datetime import datetime

import anthropic
from anthropic import beta_tool

import opslag
import planning
import reizen

MODEL = "claude-opus-5-5"
MAX_HERVATTINGEN = 5

SYSTEEM = """Je bent een persoonlijke assistent die in het Nederlands antwoordt.
Je helpt met dagelijkse taken, de agenda, vakanties plannen en leren.

Werkwijze:
- Houd antwoorden kort en praktisch; gebruik lijstjes als dat helpt.
- Gebruik de hulpmiddelen om taken, afspraken en leervoortgang echt op te slaan,
  in plaats van alleen te zeggen dat je het onthoudt.
- Vraag eerst om bevestiging voordat je iets verwijdert.
- Agenda: vraag bij een afspraak buiten de deur naar het adres en met wie de
  afspraak is. Koppel de afspraak aan een contactpersoon (zoek eerst, maak
  anders een nieuw contact). Is het thuisadres onbekend, vraag het één keer.
  Geef bij een vraag over een dag de dagplanning met vertrektijden en wijs op
  krappe overstappen. Vraag welk vervoer de gebruiker neemt als dat niet bekend is.
- Vakantie plannen: vraag naar periode, budget, reisgezelschap en wensen, zoek
  actuele informatie op internet en maak een dagschema met een kostenraming.
  Boeken doet de gebruiker zelf. Zet de reisdagen pas in de agenda na akkoord.
- Leren: maak bij een nieuw onderwerp een leerplan van 4 tot 10 kleine stappen
  en sla het op. Leg per stap kort uit en stel daarna 1 tot 3 controlevragen.
  Geef een score van 0 tot 5 op basis van de antwoorden en leg die vast.
  Begin een gesprek over leren met de herhalingen die vandaag gepland staan.
- Over geld en beleggen geef je algemene informatie, geen persoonlijk
  beleggingsadvies.
"""


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False)


@beta_tool
def taak_toevoegen(titel: str, deadline: str = "") -> str:
    """Voeg een taak toe aan de takenlijst.

    Args:
        titel: Korte omschrijving van de taak.
        deadline: Optionele datum als JJJJ-MM-DD, leeg laten als er geen deadline is.
    """
    return _json(opslag.taak_toevoegen(titel, deadline or None))


@beta_tool
def taken_bekijken() -> str:
    """Toon alle open taken, gesorteerd op deadline."""
    return _json(opslag.open_taken())


@beta_tool
def taak_afronden(taak_id: int) -> str:
    """Markeer een taak als klaar.

    Args:
        taak_id: Het id van de taak.
    """
    taak = opslag.taak_afronden(taak_id)
    return _json(taak) if taak else f"Geen taak met id {taak_id} gevonden."


@beta_tool
def afspraak_toevoegen(
    titel: str, start: str, einde: str = "", locatie: str = "", contact_id: int = 0, notitie: str = ""
) -> str:
    """Zet een afspraak in de agenda.

    Args:
        titel: Naam van de afspraak.
        start: Begin als JJJJ-MM-DDTHH:MM (of JJJJ-MM-DD voor een hele dag).
        einde: Optioneel einde in hetzelfde formaat.
        locatie: Volledig adres (straat, huisnummer, plaats), zodat de reistijd berekend kan worden.
        contact_id: Id van de contactpersoon uit contacten_zoeken of contact_opslaan, 0 als er geen is.
        notitie: Optionele extra informatie.
    """
    return _json(opslag.afspraak_toevoegen(titel, start, einde or None, notitie, locatie, contact_id or None))


@beta_tool
def contact_opslaan(
    naam: str, telefoon: str = "", email: str = "", adres: str = "", notitie: str = "", contact_id: int = 0
) -> str:
    """Sla een contactpersoon op, of werk een bestaande bij (met contact_id). Zoek eerst met contacten_zoeken
    om dubbele contacten te voorkomen.

    Args:
        naam: Naam van de persoon of organisatie.
        telefoon: Telefoonnummer.
        email: E-mailadres.
        adres: Adres.
        notitie: Extra informatie, zoals functie of waar je elkaar van kent.
        contact_id: Id van een bestaand contact om bij te werken, 0 voor een nieuw contact.
    """
    return _json(opslag.contact_opslaan(naam, telefoon, email, adres, notitie, contact_id or None))


@beta_tool
def contacten_zoeken(zoekterm: str = "") -> str:
    """Zoek contactpersonen op naam, telefoon, e-mail of notitie. Leeg laten voor alle contacten.

    Args:
        zoekterm: Tekst om op te zoeken.
    """
    return _json(opslag.contacten_zoeken(zoekterm))


@beta_tool
def thuisadres_instellen(adres: str) -> str:
    """Sla het thuisadres van de gebruiker op; de dagplanning begint en eindigt daar.

    Args:
        adres: Volledig adres (straat, huisnummer, plaats).
    """
    opslag.instellingen_bijwerken(thuisadres=adres)
    return "Thuisadres opgeslagen."


@beta_tool
def reistijd_berekenen(van: str, naar: str, vervoer: str = "auto") -> str:
    """Bereken afstand en reistijd tussen twee adressen. Gebruik "thuis" voor het thuisadres.

    Args:
        van: Vertrekadres of "thuis".
        naar: Bestemming of "thuis".
        vervoer: "auto", "fiets" of "lopen". Openbaar vervoer wordt niet berekend.
    """
    thuis = opslag.instellingen().get("thuisadres", "")
    van, naar = (thuis if a.strip().lower() == "thuis" else a for a in (van, naar))
    if not (van and naar):
        return "Geen thuisadres bekend. Vraag het adres en sla het op met thuisadres_instellen."
    try:
        return _json(reizen.reistijd(van, naar, vervoer))
    except reizen.AdresNietGevonden as fout:
        return f"Adres niet gevonden: {fout}. Vraag een vollediger adres."
    except Exception:
        return "De routedienst is even niet bereikbaar."


@beta_tool
def dagplanning(datum: str, vervoer: str = "auto") -> str:
    """Geef de planning van een dag: afspraken met contactpersoon, reistijd vanaf de vorige plek,
    vertrektijd (met 10 minuten marge) en waarschuwingen als het te krap is.

    Args:
        datum: Datum als JJJJ-MM-DD.
        vervoer: "auto", "fiets" of "lopen".
    """
    return _json(planning.dagplanning(datum, vervoer))


@beta_tool
def agenda_bekijken(van: str, tot: str) -> str:
    """Toon afspraken in een periode.

    Args:
        van: Begindatum JJJJ-MM-DD.
        tot: Einddatum JJJJ-MM-DD (inclusief).
    """
    return _json(opslag.afspraken_tussen(van, tot))


@beta_tool
def afspraak_verwijderen(afspraak_id: int) -> str:
    """Verwijder een afspraak. Alleen gebruiken nadat de gebruiker dit bevestigd heeft.

    Args:
        afspraak_id: Het id van de afspraak.
    """
    return "Verwijderd." if opslag.afspraak_verwijderen(afspraak_id) else "Afspraak niet gevonden."


@beta_tool
def leerdoel_starten(onderwerp: str, stappen: list[str]) -> str:
    """Sla een nieuw leerplan op met een reeks kleine stappen.

    Args:
        onderwerp: Wat de gebruiker wil leren.
        stappen: De stappen in volgorde, elk een korte titel.
    """
    return _json(opslag.leerdoel_starten(onderwerp, stappen))


@beta_tool
def oefening_vastleggen(leerdoel_id: int, stap_nummer: int, score: int) -> str:
    """Leg vast hoe goed de gebruiker een stap beheerst en plan de volgende herhaling.

    Args:
        leerdoel_id: Het id van het leerdoel.
        stap_nummer: Nummer van de stap binnen het leerplan.
        score: 0 (helemaal niet) tot 5 (perfect).
    """
    stap = opslag.oefening_vastleggen(leerdoel_id, stap_nummer, score)
    return _json(stap) if stap else "Leerdoel of stap niet gevonden."


@beta_tool
def leervoortgang_bekijken() -> str:
    """Toon alle leerdoelen met hun stappen, scores en voortgang in procenten."""
    return _json([{**d, "voortgang_procent": opslag.voortgang(d)} for d in opslag.leerdoelen()])


@beta_tool
def herhalingen_vandaag() -> str:
    """Toon de leerstappen die vandaag (of eerder) herhaald moeten worden."""
    return _json(opslag.herhalingen_vandaag())


HULPMIDDELEN = [
    taak_toevoegen,
    taken_bekijken,
    taak_afronden,
    afspraak_toevoegen,
    agenda_bekijken,
    dagplanning,
    reistijd_berekenen,
    thuisadres_instellen,
    contact_opslaan,
    contacten_zoeken,
    afspraak_verwijderen,
    leerdoel_starten,
    oefening_vastleggen,
    leervoortgang_bekijken,
    herhalingen_vandaag,
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 5},
]


def antwoord(client: anthropic.Anthropic, berichten: list) -> str:
    """Laat Claude reageren op het gesprek.

    `berichten` wordt aangevuld met de beurten van Claude en de resultaten van
    hulpmiddelen, zodat het volgende verzoek de hele geschiedenis meestuurt.
    """
    systeem = SYSTEEM + f"\nNu is het {datetime.now().strftime('%A %Y-%m-%d %H:%M')}."
    laatste = None
    for _ in range(MAX_HERVATTINGEN + 1):
        runner = client.beta.messages.tool_runner(
            model=MODEL,
            max_tokens=16000,
            system=systeem,
            tools=HULPMIDDELEN,
            messages=berichten,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        for bericht in runner:
            laatste = bericht
            berichten.append({"role": "assistant", "content": bericht.content})
            resultaat = runner.generate_tool_call_response()
            if resultaat is not None:
                berichten.append(resultaat)
        # Een lange zoekopdracht kan halverwege pauzeren; dan gaan we verder.
        if laatste is None or laatste.stop_reason != "pause_turn":
            break

    if laatste is None:
        return "Er kwam geen antwoord terug. Probeer het nog eens."
    if laatste.stop_reason == "refusal":
        return "Hier kan ik je helaas niet mee helpen."
    tekst = "".join(b.text for b in laatste.content if b.type == "text").strip()
    if laatste.stop_reason == "max_tokens":
        tekst += "\n\n_(Het antwoord werd afgebroken omdat het te lang werd.)_"
    return tekst or "Klaar."
