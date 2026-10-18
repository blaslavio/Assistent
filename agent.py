"""De agent: Claude met hulpmiddelen voor taken, agenda, leren en zoeken op internet."""

import json
from datetime import date

import anthropic
from anthropic import beta_tool

import opslag

MODEL = "claude-opus-5-5"
MAX_HERVATTINGEN = 5

SYSTEEM = """Je bent een persoonlijke assistent die in het Nederlands antwoordt.
Je helpt met dagelijkse taken, de agenda, vakanties plannen en leren.

Werkwijze:
- Houd antwoorden kort en praktisch; gebruik lijstjes als dat helpt.
- Gebruik de hulpmiddelen om taken, afspraken en leervoortgang echt op te slaan,
  in plaats van alleen te zeggen dat je het onthoudt.
- Vraag eerst om bevestiging voordat je iets verwijdert.
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
def afspraak_toevoegen(titel: str, start: str, einde: str = "", notitie: str = "") -> str:
    """Zet een afspraak in de agenda.

    Args:
        titel: Naam van de afspraak.
        start: Begin als JJJJ-MM-DD of JJJJ-MM-DDTHH:MM.
        einde: Optioneel einde in hetzelfde formaat.
        notitie: Optionele extra informatie, zoals locatie.
    """
    return _json(opslag.afspraak_toevoegen(titel, start, einde or None, notitie))


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
    systeem = SYSTEEM + f"\nDatum van vandaag: {date.today().isoformat()}."
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
