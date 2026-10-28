# Twintig uitgewerkte verbeterpunten

Alle wijzigingen zijn code en lokale controles. Geen productie-uitrol of live wijziging.

| Nr. | Verbeterpunt | Uitwerking en controle |
| --- | --- | --- |
| 1 | Bronnen bij taken | Accountgebonden verwijzingen naar een bestaande taak; ongeldige doelen worden geweigerd. |
| 2 | Bronnen bij afspraken | Dezelfde werkwijze voor afspraken, met afzonderlijke doelvalidatie. |
| 3 | Resultaatnotities | Begrensde notities en samenvattingen van maximaal 5000 tekens, weergegeven als tekst. |
| 4 | CSV-resultaten bewaren bij werk | Expliciete keuze; alleen samenvatting en maximaal tien kolomstatistieken, zonder ruwe rijen. |
| 5 | Veilige webverwijzingen | Alleen volledige HTTPS-links zonder ingebedde inloggegevens, actieve schema’s of controletekens; geen serverfetch. |
| 6 | Eigen clouddocumenten koppelen | Zoeken binnen het account, toegang controleren bij koppelen én openen. Cloudverkeer is in tests gemockt. |
| 7 | Eigen cloudbestanden koppelen | Alleen ID opslaan; downloadverwijzingen worden na nieuwe toegangscontrole gegenereerd en niet blijvend opgeslagen. |
| 8 | Dubbele bronkoppelingen voorkomen | Identieke inhoud wordt samengevoegd; dezelfde opdracht blijft herhaalbaar na een verloren antwoord. |
| 9 | Koppelingen veilig verwijderen | Expliciete bevestiging, versiecontrole, behoud van oorspronkelijke bron en bescherming tegen herleving door late retries. |
| 10 | Verwijderde taken en afspraken herkennen | Bronnen blijven zichtbaar met een melding dat hun doel ontbreekt. |
| 11 | Afgebakende planningexport | Taken, opgeslagen afspraken en sjablonen; een expliciete lijst toegestane velden sluit accountconfiguratie uit. |
| 12 | Versieerbaar back-upformaat | Formaatnaam, versie 1 en een tijdstip met tijdzone; onbekende versies worden geweigerd. |
| 13 | Integriteitscontrole | SHA-256 over inhoud en metadata; aantasting leidt tot weigering. Dit is geen afzenderauthenticatie. |
| 14 | Begrensde importvalidatie | 5 MB, 10.000 records, 100 sjablonen, beperkte nesting; controle op dubbele JSON-velden, IDs, tijden en taakcycli. |
| 15 | Herstelvoorbeeld vóór schrijven | Aantallen per onderdeel, uitleg over toevoegen en mogelijke duplicaten, plus een bevestigingsvak. |
| 16 | Verwijzingen behouden bij herstel | Nieuwe IDs met vertaling van taakafhankelijkheden en taakverwijzingen bij focusblokken. |
| 17 | Bestaande gegevens behouden | Toevoegen in één opslagactie; geen vervanging van de huidige planning of automatische herplanning. |
| 18 | Herstel beschermen tegen races en retries | Een verouderd voorbeeld wordt geweigerd; dezelfde opdracht voegt na een verloren antwoord niets dubbel toe. |
| 19 | Bediening en sessieprivacy verbeteren | Zichtbare tekstlabels, Taakopties in plaats van een lege menuknop, zoekfilters, paginering, lege toestanden en opschonen bij accountwisseling. |
| 20 | De volledige gebruikersstroom controleren | Streamlit-test van opdracht → bevestigen → bron → back-up → herstel → undo; aanvullende PostgreSQL-tests voor concurrentie en accountscheiding. |

## Vindplaatsen

- Instellingen → Leren en werk → Bronnen bij werk.
- Bestandsgereedschap → CSV analyseren → Koppel deze analyse aan een taak of afspraak.
- Instellingen → Thuis en handig → Planningback-up en herstel.

## Grenzen

De export is geen volledige accountback-up en niet versleuteld. Titels en notities kunnen persoonlijke gegevens bevatten. Bronkoppelingen, cloudinhoud, herhaalregels, gesprekken en betaalgegevens worden niet hersteld. Herstel kan overlappende of dubbele afspraken toevoegen; het voorbeeld vermeldt dit. Een nieuwe herstelopdracht met dezelfde back-up geldt als een nieuwe toevoeging.

De nieuwe schermen zijn met Streamlit getest. Een volledige handmatige audit met schermlezer, toetsenbord en mobiele browsers is niet uitgevoerd. Echte cloudtoegang en de bestaande Supabase-login vallen buiten de lokale tests.

## Controles uitvoeren

Gebruik `.venv/bin/python tools/planning_controle.py`. Gerichte onderdelen: `backup`, `bronnen` en `gebruikersstroom`. Geef voor databasecontroles een expliciete lokale PostgreSQL-testcontainer op met `--database-container NAAM`. Het script meldt overgeslagen tests afzonderlijk.

Laatste lokale controle: 161 tests geslaagd, 0 overgeslagen, inclusief 21 PostgreSQL-integratietests. Syntax van 26 bronbestanden en `git diff --check` zijn gecontroleerd. De tijdelijke testcontainer is na afloop verwijderd.
