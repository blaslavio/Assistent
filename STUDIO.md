# Studio: winkel en evenementen samen

Studio staat in Werkruimte onder één kopje. Vier ingangen openen Winkel bouwen, Evenement bouwen, Tickets scannen en Deellinks. Zestien doorzoekbare gereedschappen staan daarnaast in vijf ingeklapte groepen. Dit verkort de route naar concrete werkzaamheden zonder alle formulieren tegelijk te tonen. Persoonlijke apps blijven erboven staan. Lettertype, compacte tekst en iconen sluiten aan op de instellingen.

## Wat werkt

De winkelroute hergebruikt de bestaande eigen winkelbouwer, product- en voorraadbeheer, bestellingen, verzending, retourtekst, contact en betaalinstellingen. Studio voegt vindbare directe ingangen toe; het vervangt geen betaalverwerker en claimt geen volledige Shopify-pariteit.

Een evenement maak je in drie stappen: basis en type, tijd en plaats, controleren en bevestigen. Teruggaan bewaart de invoer. Alleen bevestigen schrijft naar de server. Het type wordt daadwerkelijk opgeslagen: bijeenkomst, workshop/training, festival, concert, sportevenement, markt/beurs, feest, online evenement, open dag of anders. Bestaande evenementen krijgen het neutrale type anders. Een herhaalde opslag met dezelfde opdracht maakt geen tweede evenement.

Deellinks bundelt de winkelpagina, evenementpagina en ticketinschrijving. Naast de links staat of een winkel gesloten is en voor wie tickets toegankelijk zijn. Links behouden het app-pad en verwijderen overige queryparameters. Een ticketpagina verwijst naar het evenement; een persoonlijke QR-code is een afzonderlijk toegangsbewijs en staat niet in die deellink. Bij een uitnodiging kan aanmelden nodig zijn. Toegang blijft op de server gecontroleerd.

## Eigen ticketbeheer

Deze versie ondersteunt één gratis ticket per account per evenement. Organisatoren en groepsbeheerders stellen capaciteit en inschrijving in. Zij kiezen groepsleden of iedereen met een account als doelgroep en kunnen huidige groepsleden scanrechten geven of ontnemen. Het bezoekersoverzicht toont maximaal vijftig zoekresultaten; de evenementkiezer maximaal tweehonderd evenementen vanaf twee dagen geleden, inclusief latere toekomstige data.

De server beheert uitgifte, capaciteit, rollen, intrekken en toegang. Gelijktijdige aanvragen kunnen de capaciteit niet overschrijden. Persoonlijke codes zijn willekeurig en alleen voor de eigenaar zichtbaar. Een scan controleert eerst; pas Toegang bevestigen registreert binnenkomst. Twee scanners kunnen hetzelfde ticket niet allebei toelaten. Een herhaalde bevestiging van dezelfde opdracht blijft veilig herhaalbaar. Het log bewaart handelingen zonder de ruwe QR-code.

Camera en handmatige code-invoer zijn beschikbaar. QR-weergave gebruikt qrcode, uitlezen gebruikt @zxing/browser; dit zijn open standaardbibliotheken, geen zelf uitgevonden QR-formaat. De eigen techniek zit in de app, toegangsrechten, uitgifte en transactiecontrole. Camera start alleen op verzoek en stopt bij verlaten van het scherm. Toegang vereist verbinding met de server en is beschikbaar vanaf twaalf uur voor aanvang tot twee uur na afloop. Een ticket geldt voor één binnenkomst.

## Installatie en grenzen

**De productiebackend is vanuit deze werkomgeving niet gewijzigd.** Pas na toepassing van [sql/studio_tickets.sql](sql/studio_tickets.sql), na de bestaande community_agenda- en evenementpagina-migraties, werken de nieuwe evenementbouwer en ticketfuncties op die server. Er zijn hier geen productiecredentials beschikbaar. De migratie voegt afgeschermde tabellen, gecontroleerde RPC-functies en een schemaherlaadsignaal toe. Bij ontbrekende functies meldt de app dat Studio nog niet beschikbaar is; bestaande winkel en agenda blijven bereikbaar.

Betaalde tickets, meerdere prijscategorieën, terugbetalingen, anonieme gasttickets, offline toegang en herhaalde binnenkomst zijn niet gebouwd. Ook volledige productvarianten, kortingscampagnes en een uitgebreide publieke winkelcheckout vallen buiten deze wijziging. Vervolgwerk moet betaalbevestiging op de server en terugbetalingen regelen voordat betaalde toegang wordt aangeboden. De ambitie is een gezamenlijke eigen bouwomgeving; deze versie is daarvoor een concrete basis, geen bewezen vervanging van Shopify of alle evenementenplatforms.

## Controle

Webtests controleren navigatie, typekeuze en teruggaan, delen, sessiegrenzen, QR-interpretatie, expliciete toegangsbevestiging en camerastop. Isolatietests op PostgreSQL controleren autorisatie, capaciteit, gelijktijdige scans, herhaling, versiecontrole, intrekken en besloten groepen.

Chromium met een lokale testdatabase controleerde de volledige nieuwe route op 390 × 844: evenement bouwen, type opslaan, gratis inschrijving openen, ticket uitgeven, QR genereren én teruglezen, scannen en expliciet toelaten, dubbele scan weigeren en de gedeelde ticketpagina opnieuw openen. Ook 320 en 1024 pixels hadden geen horizontale overloop. Bootstrap en bestaande winkelgegevens waren lokale fixtures; de nieuwe ticket-RPC’s draaiden echt op de lokale database. Geen productieaccounts, berichten of betalingen zijn gebruikt. Fysieke camera’s en verschillende telefoons zijn niet getest. Bronhashes en resultaten staan in controle/studio.json.
