# Verbeteringen aan de nieuwe interface

Deze wijzigingsronde behandelt de navigatieschil en de zeven mappen van de app.
Er zijn 1000 concrete configuratiescenario’s toegevoegd, niet 1000 willekeurige
codewijzigingen of 1000 aangetoonde fouten. De externe inhoud van iedere bestaande
pagina is hiermee niet automatisch geverifieerd.

| Verbetering | Nieuw gedrag | Bewijs |
| --- | --- | --- |
| Centrale toolcatalogus | 35 hoofdgereedschappen met map, callback, zichtbaarheid en beschikbaarheidsredenen op één plek. | `gereedschappen.py`, matrix en callbackcontrole |
| Nieuwe tools als favoriet | Zoekfunctie, back-up, bronnen, capaciteit en tooloverzicht staan nu ook bij de indelingskeuzes. | `InterfaceDetailsTest`, `InterfaceSchermTest` |
| Alle zeven mappen zichtbaar | Lege mappen verdwijnen niet; de gebruiker ziet waarom de eigen tools ontbreken. | Matrix, Streamlit-schermtest, Chromium |
| Gedeelde hulpmiddelen | Lege mappen bieden passende beschikbare helpers, zonder online diensten te simuleren. | Mapdekking per scenario |
| Gereedschappen zoeken | Zoekveld met accentnormalisatie, mapfilter, beschikbaarheidsfilter en lege-resultaatmelding. | Toolfinder-schermtest |
| Uitleg bij ontbrekende tools | Online vereiste, uitgezette modules en accounttype worden zichtbaar vermeld. | Cataloguscontrole en browserpreview |
| Download van tooldekking | JSON met mapdekking, toolnamen en beschikbaarheid; geen accountgeheimen. | `gereedschappen_scherm.py` |
| Veilige voorkeuren | Dubbele, onbekende en ongeldige voorkeurwaarden worden gefilterd; limieten blijven gelden. | 1000 scenario’s |
| Voorkeurwidgets per account | Een accountwisseling wist de eerdere bovenbalk- en favorietselectie. | `indeling_instellingen()` |
| Correcte cursusinstelling | Cursussen volgen Leren en verdwijnen niet doordat Chat uitstaat. | Onafhankelijke verwachte routes in de matrix |
| Instellingen met tekstlabel | De bovenbalk bevat een zichtbare naam in plaats van een lege labeltekst. | Chromium: geen onbenoemde bovenbalklinks |
| Grotere klikdoelen | Zichtbare bovenbalklinks zijn minimaal 44 CSS-pixels hoog. | Chromiummetingen desktop en mobiel |
| Mobiele bovenbalk | Korte labels en terugloop naar een volgende regel houden alle links bereikbaar. | Mobiele screenshot en controle op pagina-overloop |
| Leesbaardere tegels | Icoon en titel staan onder elkaar; lange woorden passen beter in een smalle tegel. | Mobiele screenshot |
| Duidelijke korte namen | Tools, Zoeken, Back-up en Bestandtools zijn herkenbare bovenbalknamen; Bestanden blijft de cloudmap. | Aliasregressietest |
| Geïsoleerde interfacepreview | De echte navigatiefuncties en lokale schermen zijn testbaar met aparte gegevens onder `/tmp`. | `tools/interface_lokaal.py` |
| Browsercontrolegereedschap | Chromium maakt screenshots en controleert fouten, pagina-overloop, mapnamen en bovenbalklinks. | `tools/interface_browser_controle.py` |
| Herhaalbare 1000-scenariorapportage | Rapport noemt elke concrete combinatie met test-ID en uitkomst; verouderd bewijs krijgt geen groene status. | `tools/interface_controle.py` en rapporttests |

## Reikwijdte van de 1000 scenario’s

2 modi × 4 accounttypen × 25 modulecombinaties × 5 voorkeurvarianten.
Per combinatie wordt de echte `paginas()`-functie uit `app.py` uitgevoerd met
afgeschermde pagina-callbacks. Dat controleert onder meer routes, rolgrenzen,
uitgeschakelde modules, duplicaten, bekende paginanamen, voorkeurvolgorde, badges
en hulpmiddelen per map. Het bewijst niet dat een externe dienst werkt.

## Browsercontrole

De preview gebruikt de echte navigatiefuncties, tegels, bovenbalk en nieuwe lokale
tools. Echte login, externe pagina-inhoud en achtergrondtaken worden niet uitgevoerd.
Alle browseraanvragen buiten de lokale preview worden geblokkeerd tijdens de controle.
De productieaanmelding is niet omzeild of gewijzigd.

- Desktopinstellingen: 1440×1000.
- Mobiele instellingen: 390×844.
- Mobiel gereedschappenoverzicht: 390×844.
- Screenshots en metingen: `controle/interface/`.

De controles vervangen geen volledige schermlezer-, Safari- of Android-audit.
De bestaande open punten voor externe diensten staan in `AUDIT_100.md`.
