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
   rechtstreeks met de ander af; de app is geen partij bij die afspraak. Aanbieders zijn zelf verantwoordelijk voor
   hun aanbod, prijzen, belastingen en eventuele vergunningen en verzekeringen. Je kiest zelf je accounttype: particulier,
   verkoper of ondernemer. Verkoop je als bedrijf of zzp'er, kies dan Ondernemer en vul je bedrijfsgegevens
   eerlijk in; kopers zien dan dat ze bij een bedrijf kopen en hebben de rechten uit het consumentenrecht, zoals
   14 dagen bedenktijd bij kopen op afstand. Wie als particulier stelselmatig met winst verkoopt, moet zich als
   ondernemer melden. De app kan gegevens van verkopers die veel verkopen aan de Belastingdienst moeten doorgeven (DAC7).
5. **Betalen.** Koper en verkoper spreken af hoe er betaald wordt: via de app, met een betaalverzoek, door over te
   maken of contant. **Betalen via de app** loopt via Stripe, een betaaldienst met een vergunning. Het geld blijft
   bij Stripe tot de koper bevestigt dat alles goed is ontvangen; daarna wordt het aan de verkoper uitbetaald. De
   koper betaalt daarvoor een vergoeding voor kopersbescherming (zie artikel 6), die je ziet voordat je betaalt. Meldt de koper
   een probleem, dan blijft het geld vastgehouden en beslist de beheerder op basis van de berichten en het bewijs:
   terugbetalen aan de koper of uitbetalen aan de verkoper. Verkopers die via de app betalingen ontvangen, laten hun
   identiteit door Stripe controleren en gaan akkoord met de voorwaarden van Stripe. Bij betalen buiten de app is er
   geen kopersbescherming.
6. **Kosten.** De app zelf is gratis, net als alle accounttypes. Je betaalt alleen in deze gevallen:
   - **Kopen via de app op de marktplaats:** de koper betaalt € 0,50 plus 3% van het bedrag voor kopersbescherming.
     De verkoper betaalt niets.
   - **Verkopen via je eigen webshop in de app:** de verkoper betaalt 5% van het
     verkochte bedrag (inclusief verzendkosten die de koper betaalt), met een minimum van € 0,35 per bestelling.
     Daarin zitten de betaalkosten van Stripe al. Er is geen abonnement en er zijn geen vaste maandkosten. Het
     bedrag wordt ingehouden op de uitbetaling en staat per bestelling in je verkoopoverzicht. De koper betaalt
     in een webshop niets extra.
   - Bij betalen buiten de app (contant, betaalverzoek, overmaken) rekent de app niets.
   Verandert een tarief, dan hoor je dat minstens 30 dagen van tevoren in de app. Het nieuwe tarief geldt alleen
   voor bestellingen daarna; je kunt in die tijd kosteloos stoppen.
7. **Niet toegestaan.** Illegale producten of diensten, wapens, drugs, medicijnen op recept, namaak, dieren,
   oplichting, spam, haatdragende of seksuele inhoud, en gegevens van anderen zonder toestemming.
8. **VR-ruimtes.** In een VR-ruimte laat je je eigen project zien. Zet er alleen foto's, teksten en 3D-modellen in
   die je zelf hebt gemaakt of mag gebruiken, en geen herkenbare mensen zonder hun toestemming. Een openbare ruimte
   kan iedereen bekijken, ook zonder account. Je kunt je ruimte en alles erin altijd zelf verwijderen.
9. **Reviews en marketing.** Een review kan alleen een echte klant geven: na een afgeronde bestelling via de app,
   of na een bezoek dat de winkel heeft bevestigd met een eenmalige bezoekcode. Eén review per aankoop of bezoek,
   binnen 60 dagen. Schrijf eerlijk en over je eigen ervaring; geen beledigingen, persoonsgegevens of nepreviews.
   Verkopers mogen niet betalen of iets beloven voor een (goede) review en geven een bezoekcode aan iedere klant,
   niet alleen aan tevreden klanten. De verkoper kan openbaar reageren en een review melden; de review blijft staan
   tot de beheerder heeft gekeken, en wordt alleen verborgen als hij deze regels breekt. Kortingscodes, acties en
   nieuwtjes moeten kloppen: geen nep-"van"-prijzen of misleidende beloftes. Nieuwtjes gaan alleen naar mensen die
   een winkel zelf volgen, hooguit één per dag; volgen kun je altijd stoppen.
10. **Melden en blokkeren.** Zie je iets wat niet mag? Gebruik de knop 🚩 Melden. De beheerder bekijkt meldingen zo
   snel mogelijk en kan aanbod offline halen of een account blokkeren. Wordt iets door meerdere mensen gemeld, dan
   gaat het automatisch offline tot de beheerder heeft gekeken. Nieuwe accounts kunnen de eerste week minder
   tegelijk aanbieden en bestellen. Je kunt bezwaar maken via {_contact()}.
11. **Delen en projecten.** Wat je deelt of in een project zet, kunnen de ontvangers of projectleden zien. Deel alleen
   wat je wilt delen.
12. **Stoppen.** Je kunt je account altijd verwijderen via Instellingen > Account. De beheerder kan accounts die
   deze voorwaarden overtreden blokkeren. Een account met een lopende betaling of een open geschil kun je pas
   verwijderen als die is afgerond.
13. **Aansprakelijkheid.** De app wordt aangeboden zoals hij is. De beheerder is niet aansprakelijk voor afspraken
   tussen gebruikers onderling, of voor schade door het gebruik van de app, behalve bij opzet of grove schuld.
14. **Wijzigingen.** Als deze voorwaarden veranderen, zie je dat in de app. Op deze voorwaarden is Nederlands recht
    van toepassing.

Contact: {_contact()}.
"""


def privacy() -> str:
    return f"""
**Privacyverklaring** (concept, bijgewerkt {BIJGEWERKT})

**Welke gegevens.** Je gebruikersnaam, weergavenaam, mailadres en een versleutelde versie van je wachtwoord (het
wachtwoord zelf bewaren we niet). Verder wat je zelf invult: agenda, taken, contacten, leerdoelen, boodschappen, foto's en
geluidsopnames bij afspraken, wat je deelt, projecten, aanbod, bestellingen, boekingen, beoordelingen en berichten op de marktplaats.

Heb je een winkel, dan zijn je winkelnaam, je reacties op reviews en (als je dat invult) het adres van je winkel
voor iedereen zichtbaar. Reviews tonen je weergavenaam, de sterren, je tekst en de datum. We tellen hoe vaak een
winkelpagina is bekeken, zonder bij te houden door wie. Een winkel ziet hoeveel volgers hij heeft, niet wie.

Je 👍/👎 en opmerkingen bij antwoorden bewaren we bij je eigen gegevens, zodat de assistent ervan leert. Zet je de
natuurlijke stem aan, dan gaat de tekst van het antwoord via je eigen sleutel naar ElevenLabs (Verenigde Staten) om
voorgelezen te worden.

In een VR-ruimte bewaren we de foto's, teksten en 3D-modellen die je erin zet, en hoe vaak hij is bezocht. De 3D-weergave gebruikt A-Frame, geladen via jsDelivr.

**Waarom.** Alleen om de app te laten werken: jouw gegevens tonen, de assistent laten helpen, en gebruikers met
elkaar in contact brengen. We verkopen niets en tonen geen advertenties.

**Waar het staat.** In een database van Supabase in de Europese Unie (Ierland). De app draait bij Streamlit
(Verenigde Staten). Als je de chat gebruikt, gaat je vraag met de nodige context naar Anthropic (Verenigde Staten)
via je eigen sleutel. Voor weer, routes, plaatsen en bronnen gebruikt de app open diensten (Open-Meteo,
OpenStreetMap, OpenAlex, Crossref) en voor het plaatje van je assistent DiceBear; daarvoor gaat alleen de zoekvraag,
plaats of een willekeurige code mee, niet je naam. Betaal of verkoop
je via de app, dan verwerkt Stripe je betaal- en (als verkoper) identiteitsgegevens; zie de privacyverklaring van
Stripe. Wij zien geen bank- of kaartgegevens. Koppel je je mail of Strava, dan haalt de app daar alleen gegevens op als jij erom vraagt.
Scan je een foto, dan gaat die naar Anthropic om te bekijken en wordt hij niet bewaard. De app herkent geen
gezichten en zegt nooit wie er op een foto staat.

**Wie het ziet.** Alleen jij, behalve wat je zelf deelt, in een project zet of op de marktplaats plaatst.
Aanbod, je weergavenaam en beoordelingen zijn zichtbaar voor andere gebruikers. Je mailadres niet. De beheerder kan meldingen en het gemelde aanbod
zien.

**Hoe lang.** Zolang je account bestaat. Verwijder je je account, dan worden je gegevens gewist en gaat je aanbod
offline. Berichten die je naar anderen stuurde, blijven bij de ontvanger zichtbaar.

**Je rechten.** Je kunt je gegevens inzien en downloaden (Instellingen > Account > Mijn gegevens downloaden),
aanpassen en laten verwijderen. Vragen of een klacht? Neem contact op via {_contact()}. Je kunt ook een klacht
indienen bij de Autoriteit Persoonsgegevens.

**Beveiliging.** Gegevens zijn alleen bereikbaar met je naam en wachtwoord, en als je dat aanzet ook met een code uit
je app (tweestapsverificatie). Na 10 foute pogingen wordt inloggen een kwartier geblokkeerd. We bewaren wanneer en met
welk soort apparaat (bijvoorbeeld Safari op iPad) is ingelogd, zodat jij kunt zien of iemand anders het probeerde.
"""
