# Instellingen, aanmelden, evenementen, winkel en kaart

## Wat is samengebracht

- Instellingen heeft vijf groepen en doorzoekt alle onderliggende keuzes. Profiel, hulp en uitloggen blijven direct bereikbaar. Snelknoppen in de assistent, agenda en chat openen dezelfde instellingenpagina.
- Het beginscherm toont Google en Apple, met Microsoft bij andere aanmeldmethoden. E-mail/gebruikersnaam en wachtwoord blijven werken als providers niet beschikbaar zijn. Een externe aanmelding gebruikt de officiële Supabase Auth-client met PKCE en tijdelijke sessieopslag. Alleen de server koppelt een bevestigde identiteit aan een appaccount. Tweestapsverificatie wordt niet overgeslagen.
- Agenda heeft een ingang Evenementen. Een evenement hoort bij een groep, heeft een begin en een eindtijd (ook over meerdere dagen) en een eigen deelbare pagina. Alleen groepsleden krijgen inhoud. De maker/beheerder kan na bevestigen verwijderen; bij een fout blijft de pagina open. Een verwijderde pagina geeft geen details terug. Dit is geen openbare ticket- of betaalpagina.
- Bij de winkel staan Betalen en contact, plus contactkeuzes tijdens het aanmaken. De eigenaar kiest app-chat, e-mail, telefoon, WhatsApp en website. Alleen expliciet ingevulde kanalen worden op de open winkel gepubliceerd. Gegevens staan los van de vormgeving, zodat opnieuw ontwerpen ze niet overschrijft. Accountverwijdering ruimt deze contactgegevens op.
- Online webshopbetalingen blijven in de bestaande Stripe-checkout. Een directe knop opent de betaalinstellingen. De winkel kan daarnaast aangeven dat contant betalen, overmaken of een betaalverzoek na contact bespreekbaar is. Dat zijn afspraken buiten de checkout, zonder kopersbescherming van de app; de code presenteert ze niet als betaalde bestellingen.
- Kaart en routes is bereikbaar vanuit Agenda, de winkel en de zoekfunctie in Instellingen. De kaart gebruikt MapLibre met OpenFreeMap-vectorkaarten, lichte/donkere stijl, vloeiend bewegen, mobiel knijpen en toetsenbordbediening. Wereldwijd een bestemming zoeken en openen in Google Maps, Apple Kaarten of Waze; vervoermiddel kiezen waar de navigatiedienst dit ondersteunt. De lijst toont hemelsbrede afstand, de externe navigatie-app berekent route en reistijd.

## Nodig voor de serverkoppelingen

De broncode en builds alleen activeren geen externe diensten. Voer deze bestanden in de beheeromgeving uit na de reeds aanwezige basismigraties, met een vooraf gecontroleerde back-up:

1. `sql/extern_inloggen.sql`: geharde identiteitkoppeling en `externe_aanmelding_status`. De browser activeert de providerknoppen alleen als deze serverversie beschikbaar is.
2. `sql/evenementpagina.sql`: na `sql/community_agenda.sql`; voegt de beveiligde evenementpagina toe en actualiseert de bestaande activiteitenschrijver met verplichte eindtijd voor evenementen. Bestaande evenementen worden niet automatisch verwijderd of aangepast.
3. `sql/winkel_contact.sql`: na de winkeltabellen; voegt de aparte contactopslag, toegangsfuncties en opruimtrigger toe.

Activeer de gewenste providers in Supabase Auth en voer hun clientconfiguratie via de beveiligde beheeromgeving in. Voeg exacte terugkeeradressen toe aan de redirect-allowlist, bijvoorbeeld `https://blaslavio.github.io/Assistent/app/?aanmelding=extern` voor die publicatie, of het werkelijk gebruikte Streamlit-adres met `?aanmelding=extern`. Gebruik geen brede wildcard. Voor Google/Apple/Microsoft gelden daarnaast hun eigen appregistratie- en callbackinstellingen. Er zijn geen providersleutels in Git gezet.

Tijdens deze uitvoering rapporteerde de publieke aanmeldservice Google, Apple en Microsoft alle drie als uitgeschakeld. Er waren geen productiebeheercredentials beschikbaar. Daarom zijn de migraties en providerconfiguratie niet als uitgevoerd aangemerkt. De knoppen tonen hun beschikbaarheid; de bestaande wachtwoordaanmelding blijft bruikbaar.

De vectorkaart vraagt openbare gegevens op bij OpenFreeMap; adreszoeken en omliggende winkels gebruiken de bestaande OpenStreetMap-diensten. Locatie delen gebeurt via een expliciete knop. Navigatie wordt geopend na een eigen keuze; er worden geen achtergrondritten gevolgd. Zie ook de bijgewerkte privacytekst. De CARTO-tegels zijn na een visuele controle afgewezen omdat zij een sleutelmethode toonden ondanks HTTP 200.

## Validatie en praktische grenzen

Zie `controle/nieuwe_functies.json` voor de uitslagen en bronhashes. De nieuwe tests controleren onder meer OAuth-callbacks, verlopen pogingen, verkeerde providers, servergereedheid, toestemmingsstappen, instellingen zoeken, mislukte evenementverwijdering, evenementrechten en -tijden, besloten winkelcontact en accountverwijdering. SQL draait op een eigen tijdelijke PostgreSQL-database met testidentiteiten; echte providerlogin en productiebetalingen zijn niet uitgevoerd.

De mobiele visuele controle gebruikt voorbeeldgegevens, geen ingelogd productieaccount. In deze cloudbrowser worden kaartverzoeken voor die controle via een lokale proxy met de normale systeem-CA uitgevoerd; dat is geen productiecomponent. De tijdelijke previewbestanden en proxy worden niet meegeleverd. De kaartwerker wordt tijdens installeren/bouwen met esbuild tot één zelfstandig script gebundeld en als Blob gestart; daardoor hebben zowel de losse webbuild als het Streamlit-venster geen externe code-CDN of los workerbestand nodig. De dependency-audit controleert ook de kaartbibliotheek.

Lokale uitslag: 251 webtests in 56 bestanden, 25 geïsoleerde PostgreSQL-tests en negen releasebewijscontroles geslaagd. TypeScript, beide productiebuilds en herbouw zonder verschillen geslaagd. De volledige npm-audit rapporteert nul bekende kwetsbaarheden.
