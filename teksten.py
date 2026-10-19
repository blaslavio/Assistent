"""Voorwaarden en privacyverklaring.

CONCEPT: deze teksten zijn een eerste opzet en moeten door een jurist worden
nagekeken voordat de app breed wordt aangeboden.
"""

# Vul hier het contactadres van de app in (bijvoorbeeld een apart mailadres).
CONTACT = ""

BIJGEWERKT = "19 oktober 2026"


def _contact() -> str:
    return CONTACT or "de beheerder van de app (contactadres volgt)"


def voorwaarden() -> str:
    return f"""
**Algemene voorwaarden** (concept, bijgewerkt {BIJGEWERKT})

1. **Wat de app is.** Een persoonlijke assistent voor agenda, taken, leren, mail en boodschappen, met de mogelijkheid
   om dingen te delen, samen aan projecten te werken en op de marktplaats iets aan te bieden of te boeken.
2. **Wie mag meedoen.** Je bent 16 jaar of ouder. Je kiest zelf een gebruikersnaam en wachtwoord en houdt dat
   wachtwoord geheim. Eén account per persoon.
3. **Advies, geen garantie.** De assistent helpt en adviseert, maar kan fouten maken. Controleer belangrijke
   informatie zelf. De assistent geeft geen medisch, juridisch of financieel advies; ga daarvoor naar een
   deskundige, zoals je huisarts.
4. **De marktplaats.** De app brengt aanbieders en kopers met elkaar in contact. Koop, verkoop en boekingen sluit je
   rechtstreeks met de ander af; de app is geen partij bij die afspraak. **Er gaat geen geld via de app.** Je regelt
   de betaling zelf, bijvoorbeeld bij ophalen of met een betaalverzoek. Aanbieders zijn zelf verantwoordelijk voor
   hun aanbod, prijzen, belastingen en eventuele vergunningen en verzekeringen.
5. **Niet toegestaan.** Illegale producten of diensten, wapens, drugs, medicijnen op recept, namaak, dieren,
   oplichting, spam, haatdragende of seksuele inhoud, en gegevens van anderen zonder toestemming.
6. **Melden en blokkeren.** Zie je iets wat niet mag? Gebruik de knop 🚩 Melden. De beheerder bekijkt meldingen zo
   snel mogelijk en kan aanbod offline halen of een account blokkeren. Je kunt bezwaar maken via {_contact()}.
7. **Delen en projecten.** Wat je deelt of in een project zet, kunnen de ontvangers of projectleden zien. Deel alleen
   wat je wilt delen.
8. **Stoppen.** Je kunt je account altijd verwijderen via Instellingen > Account. De beheerder kan accounts die
   deze voorwaarden overtreden blokkeren.
9. **Aansprakelijkheid.** De app wordt aangeboden zoals hij is. De beheerder is niet aansprakelijk voor afspraken
   tussen gebruikers onderling, of voor schade door het gebruik van de app, behalve bij opzet of grove schuld.
10. **Wijzigingen.** Als deze voorwaarden veranderen, zie je dat in de app. Op deze voorwaarden is Nederlands recht
    van toepassing.

Contact: {_contact()}.
"""


def privacy() -> str:
    return f"""
**Privacyverklaring** (concept, bijgewerkt {BIJGEWERKT})

**Welke gegevens.** Je gebruikersnaam, weergavenaam en een versleutelde versie van je wachtwoord (het wachtwoord zelf
bewaren we niet). Verder wat je zelf invult: agenda, taken, contacten, leerdoelen, boodschappen, foto's en
geluidsopnames bij afspraken, wat je deelt, projecten, aanbod, boekingen en berichten op de marktplaats.

**Waarom.** Alleen om de app te laten werken: jouw gegevens tonen, de assistent laten helpen, en gebruikers met
elkaar in contact brengen. We verkopen niets en tonen geen advertenties.

**Waar het staat.** In een database van Supabase in de Europese Unie (Ierland). De app draait bij Streamlit
(Verenigde Staten). Als je de chat gebruikt, gaat je vraag met de nodige context naar Anthropic (Verenigde Staten)
via je eigen sleutel. Voor weer, routes, plaatsen en bronnen gebruikt de app open diensten (Open-Meteo,
OpenStreetMap, OpenAlex, Crossref); daarvoor gaat alleen de zoekvraag of plaats mee, niet je naam. Koppel je je
mail of Strava, dan haalt de app daar alleen gegevens op als jij erom vraagt.

**Wie het ziet.** Alleen jij, behalve wat je zelf deelt, in een project zet of op de marktplaats plaatst.
Aanbod en je weergavenaam zijn zichtbaar voor andere gebruikers. De beheerder kan meldingen en het gemelde aanbod
zien.

**Hoe lang.** Zolang je account bestaat. Verwijder je je account, dan worden je gegevens gewist en gaat je aanbod
offline. Berichten die je naar anderen stuurde, blijven bij de ontvanger zichtbaar.

**Je rechten.** Je kunt je gegevens inzien en downloaden (Instellingen > Account > Mijn gegevens downloaden),
aanpassen en laten verwijderen. Vragen of een klacht? Neem contact op via {_contact()}. Je kunt ook een klacht
indienen bij de Autoriteit Persoonsgegevens.

**Beveiliging.** Gegevens zijn alleen bereikbaar met je naam en wachtwoord. Na 10 foute pogingen wordt inloggen een
kwartier geblokkeerd.
"""
