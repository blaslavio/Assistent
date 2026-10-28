# Samenhang tussen werk, bronnen en herstel

Deze lokale ontwikkelronde verbindt bestaande functies. Er is niets live gezet.

## Toegevoegd en gecorrigeerd

1. Een werkdossier toont de taak, afhankelijkheden, vervolgtaken, gekoppelde afspraken, bronnen en recente ontvangstbewijzen samen.
2. Zoekresultaten openen het dossier met een getypeerde recordverwijzing.
3. Taakkaarten en eigen afspraken bieden dezelfde dossieringang.
4. Een bron opent het bijbehorende werk; verwijderde doelen krijgen een duidelijke melding.
5. Vanuit het dossier kan een bronformulier met het juiste doel worden voorbereid.
6. Een verdwenen bronbestemming vereist een nieuwe keuze; het formulier kiest geen ander record vanzelf.
7. Een reeds voorbereide, nog onzekere bronopslag wordt niet overschreven door navigatie.
8. Vanuit het dossier kan een taak- of afspraaksjabloon worden voorbereid.
9. Sjabloonvoorbereiding bewaart de expliciete bevestigingsstap voordat werk wordt toegevoegd.
10. Een reeds voorbereide sjabloonopslag blijft beschermd tegen overschrijven.
11. Oudere afspraken zonder eindtijd gebruiken bij sjabloonvoorbereiding de bestaande standaardduur; hele-dagafspraken worden niet stilzwijgend omgezet.
12. Accountwisseling wist de tijdelijke dossier- en formuliercontext.
13. Dossierexports bevatten geselecteerde werkvelden, geen volledige accountconfiguratie.
14. Optionele planningback-up v2 neemt gekoppelde notities en HTTPS-links mee.
15. Cloudbestandsverwijzingen, accountinstellingen en geheimen worden niet als draagbare bronnen geëxporteerd.
16. Bestaande v1-back-ups blijven bruikbaar; standaardexport blijft v1 zolang bronnen niet worden aangezet.
17. Selectief herstel bewaart alleen bronnen waarvan het doel ook wordt hersteld.
18. De zuivere herstelbouwer maakt eerst de volledige toevoeging en remapt taak-, afspraak-, afhankelijkheids- en bronverwijzingen.
19. Opslag past die toevoeging atomair toe, met bestaande versiecontrole, controle van het voorbeeld en herhaalde-verzoekbeveiliging.
20. Bevestigd herstel verschijnt in het activiteitenoverzicht en betrokken dossiers, met aantallen en tijdstip. Dit ontvangstbewijs voert geen automatische verwijdering uit.

Het centrale gereedschapsoverzicht bevat nu 36 tools. Het dossier leest bij openen opnieuw uit de opslag; er wordt geen tweede werkdatabase opgebouwd.

## Controle en herhalen

```sh
.venv/bin/python tools/planning_controle.py --onderdeel integratie
.venv/bin/python tools/integratie_controle.py
.venv/bin/python tools/integratie_controle.py --familie herstel_samenhang --geval 17
```

De massatest omvat twintig families van ieder 5000 reproduceerbare synthetische gevallen. Vijftien families testen bestaande grenzen met een nieuwe seed; vijf families testen dossiers, draagbare bronnen, herstelverwijzingen, selectie en de keten zoeken–dossier–sjabloon. De uitvoering bewaart bronhashes, gevalhashes en uitkomsten in `controle/integratie_100000.json.gz`. De samenvatting staat in `INTEGRATIECONTROLE_100000.md`.

Deze 100.000 gevallen betekenen geen 100.000 gevonden of gerepareerde fouten. Echte PostgreSQL-concurrentie, scherminteractie en Chromium-weergave worden afzonderlijk getest. De browserpreview gebruikt uitsluitend fictieve lokale gegevens en blokkeert paginaverzoeken naar externe diensten.

Echte accountaanmelding, externe diensten, betalingswebhooks, actuele kwetsbaarheidsbronnen, echte mobiele apparaten en handmatige toegankelijkheidscontrole vallen buiten deze lokale bewijzen. De bestaande tien handmatige/externe auditpunten blijven open. De SQL-migratie is alleen in de tijdelijke testdatabase uitgevoerd.
