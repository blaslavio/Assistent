# Lancering: controle en resterende voorwaarden

Controle van 30 oktober 2026. **Status: nog niet vrijgeven voor een publieke lancering.** De lokale code is verder verbeterd; echte ketentests, migratie- en herstelbewijs en bevestigde publicatie ontbreken. Een statische website die opent is geen bewijs van een werkende dienst.

## Deze ronde aangepast

- De nieuwe webclient verstuurt bij automatische foutmelding alleen vaste scherm- en foutcategorieën. Geen ruwe fouttekst, stack, componentstack of user-agent. Dit beperkt gegevensverzameling, maar geeft minder diagnostische details. Andere bestaande logging en oude clients vallen niet automatisch onder deze wijziging.
- Het herstelscherm toont geen ruwe foutinhoud en belooft niet dat een servermelding ontvangen is.
- De releasepoort kiest per kritieke werkstroom het nieuwste geldige productie-E2E-resultaat voor dezelfde commit. Een mislukking wint bij gelijke tijdstippen; een latere geslaagde hertest kan herstellen. Alleen de boolean `true` geldt als geslaagd.
- Releasepoort-regressies worden ook op `develop` via CI gecontroleerd.
- De viewport beperkt inzoomen niet meer. Zonder JavaScript verschijnt een begrijpelijke melding.

## Uitgevoerde controles

De nieuwe logprivacy- en hersteltests, de releasepoorttests, de bestaande webtests, TypeScript en beide productiebuilds zijn opnieuw uitgevoerd. Zie de actuele uitslagen hieronder. De eerdere 100.000 synthetische scenario's uit `UITGEBREIDE_TESTCONTROLE.md` zijn historische bewijzen, geen nieuwe uitvoering in deze ronde.

De lokale Chromium-controle opent de gebouwde aanmeldpagina op 390×844 en 1280×900 pixels. Beide renderen zonder horizontale overflow; de viewport laat zoom toe. Extern netwerkverkeer van de pagina is geblokkeerd. Dit is geen volledige toegankelijkheidsaudit of ingelogde gebruikerstest.

## Nog uitvoeren vóór vrijgave

| Onderdeel | Vereist bewijs / acceptatie |
| --- | --- |
| Aanmelden en accountgrenzen | Twee testaccounts, accountwissel, sessieverloop en intrekking; geen gegevens van het vorige account zichtbaar of opnieuw opgeslagen |
| Samenwerken | Twee echte apparaten bewerken hetzelfde bestand; offline wijzigingen, herverbinden en gelijktijdige invoer behouden inhoud; geweigerde deelnemers krijgen geen toegang |
| Privacy | Toestemming geven, verlopen en intrekken; gewijzigde deelnemers blokkeren AI; archiveren en verwijderen testen met werkelijke databasebeleidregels |
| Videobellen | Camera/microfoon toestaan én weigeren; gesprek starten, netwerkonderbreking, ophangen en verder bewerken op ondersteunde browsers |
| Agenda, boeken en reserveren | Tijdzone/klokwissel, dubbele aanvraag, gelijktijdige boeking, annuleren en actuele beschikbaarheid controleren via de echte integratie |
| Betalen | Betaaldienst-testmodus: succes, annulering, dubbele en vertraagde webhook, verkeerde ontvanger/bedrag; retour-URL alleen verandert geen betaalstatus |
| Mail | Verzenden en ontvangen tussen beheerde testadressen, foutafhandeling, herhaalde aanvraag en rechten na intrekking |
| Gebruiksgemak | Onafhankelijke gebruikers starten zonder uitleg een project en ronden het af; toetsenbord, schermlezer, 200% zoom, mobiel portret/landschap |
| Database en herstel | Migratievolgorde inclusief veilige opslag en projectarchief; back-up én daadwerkelijk herstel op geïsoleerde kopie; rollback bij nieuwe clients zonder oud schrijfpad te heropenen |
| Dienstbeheer | Verantwoordelijke voor incidenten/support, passende privacyinformatie, bewaartermijnen en verwijderverzoeken; capaciteit en hersteltijd meten met representatieve testbelasting |
| Publicatie | GitHub Pages activeren; workflow geslaagd, hoofdscript bereikbaar en `publicatie.json` met bedoelde commit. Volledige serveruitrol apart controleren |
| Definitieve vrijgave | Verse productie-E2E voor auth/chat/agenda/booking/payments/mail, exact dezelfde releasecommit, via `os_release_evidence.release_gate`; ontbrekend of nieuwer mislukt bewijs blokkeert |

Gebruik testaccounts en betaaldienst-testmodus voor voorbereidende ketentests. De bestaande productiepoort vraagt daarnaast expliciet vers productie-E2E-bewijs; testmodus of staging niet als productie registreren. Geen echte betaling of extern bericht zonder expliciete opdracht.

## Huidige externe blokkades

GitHub Pages gaf tijdens deze ronde HTTP 404 op de siteconfiguratie. De eerdere poging tot inschakelen kreeg HTTP 403 door ontbrekende integratierechten; zie `PUBLICEREN.md`. De runtime heeft geen productiebeheercredentials of gekoppelde identiteiten. Daardoor zijn productiemigraties, herstelproef en volledige ketentests hier niet bewezen. Deze voorwaarden zijn niet als geslaagd ingevuld.

## Uitslagen van deze ronde

- Brede Python-/PostgreSQL-reeks: **1.269 geslaagd, nul skips** (`controle/lanceer_testresultaten.json`).
- Aanvullende pytest-reeks: **362 tests en 21 subtests geslaagd**.
- Web: **180 tests in 36 bestanden geslaagd**, inclusief drie nieuwe privacy-/hersteltests.
- Releasepoort: negen tests geslaagd, waarvan vier nieuwe regressies (ook opgenomen in pytest).
- TypeScript en beide productiebuilds: geslaagd.
- Volledige npm-audit inclusief ontwikkelafhankelijkheden: nul bekende kwetsbaarheden. Python-dependencyaudit en Bandit uit de vorige ronde zijn niet opnieuw uitgevoerd.
- Twee lokale browserformaten: aanmeldpagina opent; geen horizontale overflow, zoom toegestaan. Geen ingelogde gebruikerstest.

Testreeksen kunnen overlappen; tel de aantallen niet op tot unieke productfuncties. Het JSON-rapport `controle/lancering.json` bevat de bronhashes voor deze ronde.
