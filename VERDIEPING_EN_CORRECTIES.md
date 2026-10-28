# Diepgaande beoordeling en concrete correcties

Deze ronde combineert bronbeoordeling, reproduceerbare invarianttests,
regressietests, PostgreSQL-integratietests en een lokale browsercontrole. De
30.000 gevallen zijn testinvoer, geen claim van 30.000 aangetoonde fouten of
30.000 nieuwe wijzigingen. De bestaande externe en handmatige open punten
blijven in `AUDIT_100.md` staan.

## Aangetoonde uitgangsproblemen

`controle/bevindingen_30000_vooraf.json` bevat negen gerichte controles van de
code vóór deze wijzigingen, met verwachte en werkelijk waargenomen uitkomsten.
Er zijn uitsluitend synthetische gegevens gebruikt. De verschillen betreffen:

- € 1,005 werd door binaire float-afronding € 1,00.
- Onleesbare zakelijke prijsinvoer werd stilzwijgend nul.
- Een te groot exponentieel bankbedrag werd `inf`.
- Beschadigde sjabloon-, bron-, concept- en opdrachtinvoer gaf technische fouten.
- Een boolean kon als taak-ID 1 worden behandeld.
- Een onleesbaar datumobject kwam ongewijzigd in een zoekexport terecht.

De gerichte regressies in `test_verdieping.py` controleren het nieuwe gedrag,
ook vóór RPC-aanroepen en in het zakelijke kostenformulier. Geen echte
boekingen, betalingen, publicaties of externe oproepen zijn uitgevoerd.

## Uitgevoerde correcties en toevoegingen

1. `geldwaarden.py` rekent met Decimal en gehele centen. Halve centen worden
   expliciet van nul af afgerond. Nederlandse decimale komma, correcte
   duizendtalscheiding, minteken en euroteken worden gecontroleerd.
2. Onleesbare, lege, boolean-, NaN- en oneindige bedragen worden geweigerd;
   een expliciete nul blijft geldig. Centbedragen worden begrensd op de
   ondersteunde signed-32-bit-range voor deze invoerhelpers.
3. Zakelijke bedragen en prijsweergave gebruiken gehele centen; cursus- en
   abonnementsprijzen en handmatige budgetinvoer gebruiken de exacte conversie.
   Bestaande historische gegevens zijn niet gemigreerd. Dit is geen herschrijving
   of volledige verificatie van de financiële administratie.
4. Zakelijke formulieren tonen een begrijpelijke fout en boeken geen onleesbare
   prijs. De cursus- en budgettests controleren dat ongeldige invoer geen RPC
   bereikt. Echte dienstautorisatie en betaalwebhooks vallen hier buiten.
5. Bron-, sjabloon-, concept- en opdrachtvalidatie weigert verkeerde invoervormen
   met een gecontroleerde ValueError in plaats van een ongewenste TypeError of
   AttributeError. Boolean-taak-IDs worden expliciet geweigerd.
6. `tekstcontrole.py` weigert onveilige controletekens en losse Unicode-surrogaten
   in de nieuwe invoergrenzen. Meertalige tekst, emoji en toegestane regeleinden
   in notities blijven behouden.
7. Conceptgeldigheid wordt berekend als verstreken UTC-uren; de zomer- en
   wintertijd veranderen een opgegeven duur van twee uur niet meer.
8. Opgeslagen naïeve klokwisseltijden die niet bestaan of dubbel voorkomen,
   worden niet stilzwijgend als één instant beschouwd. Een expliciete UTC-offset
   blijft geldig. Bij onleesbare afspraken worden geen vrije tijden geclaimd.
9. Niet-booleaanse weekendinstellingen en planuren met seconden worden niet
   gebruikt voor alternatieven. Een extreem lange afspraak levert geen
   kalender-overflow op; bij de maximale kalenderdatum stopt de suggestiehorizon.
10. Back-ups vereisen canonieke taakdeadlines (JJJJ-MM-DD), zodat sorteren en
    vergelijken niet afhankelijk wordt van verschillende ISO-schrijfwijzen.
11. De werkzoekfunctie is herschreven als begrensde selectie met `heapq.nsmallest`.
    Er worden maximaal de gekozen 25, 100, 500 of 1000 resultaten vastgehouden;
    alle overeenkomsten worden geteld. Er is geen gedeelde zoekcache.
12. Zoekexports gebruiken gecontroleerde tekst- en datumvelden; geneste
    onleesbare objecten en accountconfiguratie worden niet overgenomen. De
    gebruiker ziet dat gegevens zijn overgeslagen. De paginering reset bij
    een kleinere resultaatlimiet.
13. `tools/diepte_controle.py` voert 15 families van elk 2000 gevallen uit.
    Iedere casus krijgt een ID, seed, uitkomst en invoervingerafdruk; fouten
    krijgen geen ruwe invoer of tracebackinhoud in het JSON-rapport. Een enkel
    geval kan gericht opnieuw worden uitgevoerd.
14. `tools/bron_review.py` parseert alle Python-bronnen zonder de app uit te
    voeren en controleert JavaScript en inline HTML-scripts met Node in
    syntaxcontrolemodus. Signalen zoals brede uitzonderingen en grote
    functies zijn reviewkandidaten, geen automatisch bewezen fouten. Er
    worden geen bronregels of stringwaarden geëxporteerd.

## De 15 testfamilies

Exacte centconversie, halve-centafronding, invoervormen, tijdzone-instanten,
halfopen overlap, taakgrafen, back-uproundtrips, back-upintegriteit, selectief
herstel, CSV-statistieken, gzip en bestandsnamen, ongeldige CSV, bronverwijzingen,
capaciteit via intervalunie, en zoeklimieten/privacy.

Voor overlap, geld en capaciteit gebruikt de reeks afzonderlijke rekenregels
als vergelijking; voor herstel en compressie wordt terugleesbaarheid en behoud
van de inhoud gecontroleerd. De invoer is bewust klein en synthetisch; dit is
geen productieschaal- of gelijktijdigheidsbenchmark. Concurrentie wordt apart
met PostgreSQL gecontroleerd.

## Opnieuw uitvoeren

```sh
.venv/bin/python tools/diepte_controle.py
.venv/bin/python tools/diepte_controle.py --familie geld_halve_cent --geval 17
.venv/bin/python tools/planning_controle.py --onderdeel verdieping
.venv/bin/python tools/bron_review.py
```

De resultaten staan in `DIEPTECONTROLE_30000.md`, `controle/diepte_30000.json`
en `controle/bron_review.json`. De JSON met alle 30.000 gevallen is bewust
uitgebreider dan het leesbare samenvattingsrapport. Voor oude of gewijzigde
broncode mogen deze resultaten niet als actueel bewijs worden gebruikt.

Een volledige appgarantie, echte AI- en cloudinteracties, login van echte
accounts, betaalwebhooks, actuele CVE-advisories en een volledige handmatige
schermlezer-/apparatenaudit zijn niet uitgevoerd. Statische syntaxgeldigheid
bewijst geen correcte werking van alle JavaScript- of backendfuncties.
