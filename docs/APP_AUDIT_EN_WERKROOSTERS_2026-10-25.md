# Volledige functionele broncode-inventarisatie — 25 oktober 2026

**Reikwijdte:** repository `blaslavio/Assistent` op main, inclusief Python-modules, Streamlit-schermen, SQL, Edge Functions, tests en workflows. Dit is een **statische inventarisatie en gerichte code-inspectie**, geen bevestiging dat alle gebruikersstromen live werken. Per product staat de eerstvolgende verbetering; de lijst is geen bewijs van reeds voltooide functionaliteit.

## Ontwerpprincipe: hulpmiddelen per dienst

Maak afzonderlijke toolsets met minimale bevoegdheden. De persoonlijke assistent krijgt agenda/taken, de winkelmodule alleen catalogus/mandje, de betaalmodule alleen betalingsstatus via beveiligde server, de werkgever alleen zijn eigen groepsrooster, en de gezondheidsmodule alleen expliciet toegestane gezondheidsdata. Geen gedeelde universele toolset met onbeperkte toegang. Server-side rechten blijven verplicht, ook als knoppen verborgen zijn.

| Onderdeel | Codebasis | Verbetering / dienstspecifieke tools | Prioriteit |
|---|---|---|---|
| AI en gesprek | agent.py, ander_brein.py, spraak.py, onthouden.py | Toolrechten per context, veilige bevestiging voor mutaties, modelwissel met volledige geschiedenis | P0 |
| Accounts, apparaten, privacy | toegang.py, toegangssleutel.py, extern_inloggen.py, opslag.py, privacy_scherm.py | Sessie-/accountisolatie, apparaatbeheer, machtigingen en auditlog | P0 |
| Chat en communities | chat.py, chat_js.js, sql/chat*.sql | E2E-multidevice testen, groepsrollen, berichten zoeken, gedeelde acties | P0 |
| Betalen, orders, marktplaats | samen.py, sql/bestellingen.sql, sql/stripe.sql, supabase/functions/betalen | Webhook-idempotentie, escrow-claims juridisch verifiëren, terugbetalingen, bestelstatus | P0 |
| Agenda en dagplanning | agendas.py, planning.py, inplannen.py, tijd.py, ics.py | Conflicten, veilige import, tijdzones, privacy per gedeelde kalender | P1 |
| Werkroosters en werkgroepen | samen.py, sql/agenda_delen.sql, **nieuw: werkrooster.py** | Eigen werkruimte, teams, medewerkers, diensten, concept/publiceren, ruilen, verlof, beschikbaarheid | P0 |
| Zakelijke diensten en groepslessen | zaak.py, zaak_scherm.py, sql/zaak.sql | Aparte rollen trainer/klant, inschrijving, wachtlijst, capaciteit, lesrooster | P1 |
| Reserveringen | reserveren.py, sql/reserveren.sql | Transactievaste capaciteit, annulering, reminders, groepsreservering | P1 |
| Winkelen en mandjes | winkelen.py, winkelen_scherm.py, winkelkaart.py, sql/webshop.sql | Prijs/voorraad server-side bij checkout, bezorgopties, retouren | P1 |
| Boodschappen | boodschappen.py | Gezamenlijke lijsten, productvergelijking, winkelgebonden suggesties | P2 |
| Bank en budget | bank.py, budget.py, geld_scherm.py, sql/bank.sql | Read-only toestemming, dubbele transacties vermijden, financieel overzicht | P1 |
| Beleggen | beleggen.py | Heldere risicodisclaimers, bron/tijdstempel koersen, geen onbevestigde orders | P2 |
| Mail en meldingen | mail.py, mailtaken.py, meldingen.py | Toestemming per account, concept/goedkeuring voor verzending, notificatie-instellingen | P1 |
| Documenten, bestanden, editor | documenten.py, bestanden.py, editor.py, documenten_scherm.py | Versiegeschiedenis, delen/rechten, zoekindex, export en toegankelijke editor | P1 |
| Projecten, taken, werk | werk_scherm.py, plannen_scherm.py, overzicht.py, samen_scherm.py | Kanban, verantwoordelijken, deadlines, koppeling naar gedeeld werkrooster | P1 |
| Gezin en huishoudens | gezin.py, gezin_scherm.py, sql/huishouden.sql | Gezinsrollen, gedeelde taken en agenda, privacy voor minderjarigen | P1 |
| Gezondheid, sport, Strava | gezondheid.py, sport_scherm.py, strava.py | Herkomst/toestemming, importdeduplicatie, herstel- en trainingsplanning | P1 |
| Leren en cursussen | cursus.py, cursus_scherm.py, slim.py | Adaptieve leerpaden, voortgang, toetskwaliteit, certificaatstatus | P2 |
| Reizen, vervoer, weer | reizen.py, weer.py, wereld.py, activiteiten.py | Reistijd/conflicten, actuele bronnen, toestemming locatie | P2 |
| Wonen en vastgoed | woning.py | Projectbegroting, onderhoudsplanning, documenten en offertes | P2 |
| 3D/VR en ontwerpen | ruimte.py, ruimte_scherm.py, ontwerp.py, wereld_js.js | Uploadlimieten, mobiele prestaties, versiebeheer en toegankelijke fallback | P2 |
| Events en prikker | events.py, prikker.py, feestdagen.py | Polls, deelnemersrollen, tijdzones, RSVP en gedeelde agenda | P2 |
| Feedback en kwaliteitsbeheer | verbeteren.py, sql/verbeteren.sql, .github/workflows/* | Beheerderdashboard met echte CI-uitslagen, regressies en releasehistorie | P1 |
| Browser en externe koppelingen | browser.py, bestanden.py, supabase/functions/* | SSRF, tokens, rate limits, domeinrechten en logging | P0 |

## Werkroosters: functioneel ontwerp

**Scheiding:** een persoonlijk agenda-item is geen dienst; een groepsles is geen werknemersdienst. De werkroostermodule krijgt eigen tabellen, rechten en tools.

- **Werkruimte**: organisatie met één of meer werkgroepen (bijvoorbeeld winkelvloer, magazijn, trainers).
- **Rollen**: eigenaar, planner en medewerker; medewerkers kunnen geen roosters publiceren.
- **Diensten**: datum/tijd, locatie, functie, pauze, aantal plekken, toegewezen personen; concept of gepubliceerd.
- **Delen**: alleen leden zien het rooster; configureer zichtbaarheid van collega's en privébeschikbaarheid.
- **Aanvragen**: open diensten, ruilverzoek, verlof en beschikbaarheid; planner keurt goed.
- **Controle**: overlap, rusttijden, kwalificaties, maximaal uren, zomertijd en dubbele toewijzingen.
- **Synchronisatie**: gepubliceerde eigen diensten verschijnen in persoonlijke agenda; privéafspraken worden niet teruggekopieerd naar collega's.
- **Communicatie**: aparte werkgroepchat en gerichte pushmelding bij publicatie/wijziging.
- **AI-tools voor werk**: `rooster_bekijken`, `beschikbaarheid_doorgeven`, `ruilverzoek_maken`, `open_dienst_aanvragen`; `dienst_toewijzen` en `rooster_publiceren` alleen voor planner/eigenaar. Bij wijzigingen expliciete bevestiging.

**Nu gebouwd:** `werkrooster.py` met invoervalidatie, rolautorisatiematrix en overlapdetectie plus gesimuleerde tests. **Nog niet gebouwd:** database, gedeelde schermen, uitnodigingen, rechtencontrole op de server en synchronisatie. Dit is dus nog geen werkende groepsroosterdienst.

## Marktbenchmark

- **Microsoft Teams Shifts**: werkroosters per team, open diensten, publiceren, verlof, ruilen en goedkeuringen: https://support.microsoft.com/en-us/teams/shifts/create-a-team-schedule-in-shifts
- **Connecteam**: shiftgroepen, beschikbaarheid, urenregels en roosters met medewerkersrollen: https://developer.connecteam.com/docs/scheduler-overview
- **Notion Calendar**: koppelt projecten, taken en meerdere agenda's: https://www.notion.com/nl/help/guides/getting-started-with-notion-calendar

We nemen de beste gebruikersstromen als inspiratie en schrijven onze eigen code; geen overname van broncode of claims dat we al dezelfde functionaliteit hebben.

## Testplan en definitie van klaar

1. Unit-tests per module: geldige/ongeldige input, tijdzones, overlapping, rechten.
2. Integratietests in geïsoleerde Supabase-testomgeving: organisatie A ziet geen gegevens van B, planner vs medewerker, gelijktijdig claimen van één open dienst, intrekken van toegang.
3. UI-tests op mobiel en desktop: aanmaken, delen, wijzigen, push, agenda-sync.
4. Productiecontrole alleen na expliciete inrichting met testaccounts en testbetalingen. Geen echte klantdata of financiële transacties in simulaties.

**Status:** repository-breed geïnventariseerd; diepgaande beveiligingsreview en volledige end-to-end-uitvoering van ieder onderdeel staan open.
