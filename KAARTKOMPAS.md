# Eigen kaartfuncties in één app

De actuele code staat op `main`, met `/workspace/Assistent` als vaste werkmap. Er is één kaartscherm, één kaartmotor en één reisschattingsmodel. De functies hieronder zijn eigen applicatiecode in `web/src/lib/kaartkompas.ts` en `web/src/schermen/KaartKompas.tsx`.

MapLibre verzorgt het tekenen en bewegen van de kaart; OpenFreeMap/OpenStreetMap leveren de geografische gegevens. Deze bibliotheken en gegevens zijn niet door ons geschreven. Het onderscheid zit in de combinatie met de bestaande app, niet in een onbewezen claim dat geen andere app dergelijke functies heeft.

| Functie | Waarom deze bij de app past |
| --- | --- |
| Automatische reistijdindicatie | De gebruiker hoeft geen reistijd te kennen of in te vullen. Eigen afstandsmodellen geven per vervoermiddel een ruime bandbreedte. Auto gebruikt opeenvolgende stads-, regio- en langeafstandsegmenten, zodat meer afstand niet ineens een kortere schatting oplevert. |
| Past een bezoek vóór de volgende afspraak? | Combineert de ruime kant van beide reisindicaties met bezoekduur en extra buffer. De app controleert bestaande afspraken lokaal en blokkeert een geruststellende uitkomst bij ontbrekende, dubbele of ongeldige tijdgrenzen. Dit sluit op de agenda aan zonder die automatisch te wijzigen. |
| Maximaal vijf stops vergelijken | Vergelijkt alle hoogstens 120 volgordes op hemelsbrede afstand, met optioneel terugkeren. Een voorstel wordt alleen na een klik overgenomen. Dit helpt boodschappen, ophalen en projectbezoeken combineren, zonder te doen alsof geometrie een verkeersroute is. |
| Privéplekken bij je account | Bewaart eigen locaties via de bestaande versiegecontroleerde opslag. Herhalen na een verloren antwoord maakt geen extra plek; een gewijzigde plek wordt niet stilzwijgend overschreven of gewist. De namen worden geen openbare winkels. |
| Routebriefje voor chat of project | Een zichtbaar tekstvoorbeeld met gekozen stops; de gebruiker kopieert en plakt zelf. Privélabels staan standaard uit. De agenda, vertrekplek en coördinaatvelden gaan niet automatisch mee. Er wordt geen bericht gestuurd en geen AI aangeroepen. |
| Herkomst en zekerheid | Onderscheidt appwinkels, OpenStreetMap en eigen plekken. Appwinkels openen via hun echte adrescode; er wordt niet op een mogelijk dubbele winkelnaam gegokt. Openingstijden, verkeer en voorraad worden niet verzonnen. |

## Automatische schattingen en privacy

Reistijd is een **ruwe indicatie**, geen live verkeers- of dienstregelingsinformatie. De eigen modellen gebruiken afstand, een omwegfactor, snelheidsbanden en extra tijd; ze zijn niet statistisch geijkt met echte ritten. Water, grenzen, bereikbaarheid, weer, parkeren en files kunnen de werkelijke reis sterk veranderen. Voor OV zijn vertrektijden niet bekend. De externe navigatie-app blijft de plek om de werkelijke route en actuele situatie te controleren.

Zonder bekend vertrekpunt wordt geen persoonlijke reistijd verzonnen: het eerste kaartbeeld bij Utrecht is geen gebruikerslocatie. Kies een vertrekplek of gebruik expliciet Bij mij. De bezoekduur kiest de gebruiker met korte presets; reistijden worden automatisch berekend en zijn geen invulvelden.

Om de reis naar de volgende afspraak te schatten, kan de gebruiker uitsluitend het locatieadres laten opzoeken bij de bestaande OpenStreetMap-geocoder. Dit gebeurt pas via Bereken met de afspraaklocatie. Die toestemming geldt voor dat adres; een volgende afspraak op een ander adres vraagt opnieuw een keuze. Titels, notities en de rest van de agenda blijven buiten deze zoekaanvraag. Bij een ontbrekende of niet vindbare locatie blijft de tijdscontrole onzeker.

Privélabels blijven buiten Apple Kaarten-links; de bestemmingcoördinaten worden bij navigeren uiteraard met de gekozen dienst gedeeld. Kaarttegels en adreszoeking blijven externe geografische diensten; alleen de eigen berekeningen zijn lokaal. Privéplekken staan onder je bestaande accounttoegang, niet in een nieuwe openbare tabel of tweede backend.

## Eén bron en bestaande regels

- `web/src` is de bron; de twee bundelmappen zijn gegenereerde distributies van dezelfde interface.
- De bestaande `bijwerken`-functie blijft de enige route voor deze accountgegevens, met account- en versiecontrole.
- De kaart wijzigt geen agenda, taak, boeking, reservering of betaalstatus.
- Oudere zelfstandige Python-prototypes worden niet als parallelle app of extra actie-/betaalmotor aangesloten. De actuele Azure-adapter, uitvoeringsgrenzen en Stripe-administratie blijven leidend; eerdere voorstellen blijven als geschiedenis behouden.
- Externe dienstconfiguratie en de servermigraties voor eerdere functies blijven afzonderlijk te verifiëren; een merge bewijst geen productie-uitrol.

## Controle

270 webtests in 58 bestanden en negen releasebewijscontroles slagen. Eén van de webtests vergelijkt bovendien 1000 reproduceerbare wereldwijde stopplannen; dit zijn scenario’s, geen extra unit-testfuncties of gevonden fouten. TypeScript en beide productiebuilds slagen. De npm-audit meldt nul bekende kwetsbaarheden. Bronhashes en seed staan in `controle/kaartkompas.json`. Dit is geen bewijs van actuele verkeersinformatie of productie-E2E.
