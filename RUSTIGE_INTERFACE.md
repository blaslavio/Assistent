# Rustiger aanmelden en navigeren

Deze update past de bestaande interface aan. Er komen geen extra aanmeld-, chat- of agendasystemen bij.

## Aanmelden

Het beginscherm toont de eigen appnaam, het veld voor **Gebruikersnaam of mailadres**, het veld voor **Wachtwoord** en **Inloggen**. Daaronder staan **Doorgaan met Google** en **Doorgaan met Apple**, met lokaal opgeslagen SVG-logo’s. Er worden geen externe logo-afbeeldingen opgehaald. Microsoft staat onder **Andere aanmeldmethoden**. Beide invoervelden zijn direct zichtbaar; aanmelden met een wachtwoord heeft geen extra tussenstap. Tweestapsverificatie en de bestaande servercontrole blijven actief.

Account maken, wachtwoordherstel wanneer beschikbaar, voorwaarden en privacy blijven bereikbaar. Het aanmeldscherm heeft een eigen scrollgebied, zodat de onderste bediening ook bij minder schermhoogte bereikbaar blijft. Een mislukte controle van de mailvoorziening blokkeert de wachtwoordaanmelding niet.

De bestaande controle op providerinstellingen én de veilige backend bepaalt of een externe knop actief is. Een logo activeert geen OAuth-provider. Inactieve opties worden zichtbaar uitgelegd en voor schermlezers aan die uitleg gekoppeld. Er is nog productieconfiguratie nodig wanneer Google of Apple niet is ingeschakeld.

## Bellen

In de kop staat één tandwieltje: **Belinstellingen**. Daaronder zijn toestelvoorkeuren en de ingang naar **Privacy en beveiliging van mijn account** bereikbaar. Ook zonder belondersteuning in de browser blijven deze instellingen bereikbaar.

Contacten, gemiste oproepen en terugbellen blijven de primaire inhoud. **Planning en beloverzicht** bundelt belafspraken, stille uren en beltijd. Zonder contacten is er één ingang om iemand te zoeken; een leeg filterveld wordt dan niet getoond. Vanuit de gebundelde belplanning kun je eerst iemand zoeken wanneer er nog geen contact is. Het openen van het overzicht verandert geen belvoorkeuren.

## Agenda

De zeven afzonderlijke ingangen zijn gebundeld tot **Agenda**, **Taken** en **Meer**. Meer bevat een zoekfunctie en twee kopjes:

- **Plannen en organiseren**: datum prikken, evenementen, vakantie en verblijf.
- **Berichten en herinneringen**: mail en herinneringen.

Zoekwoorden zoals huren, verhuren en reserveren vinden ook Vakantie en verblijf. De bestaande deeplinks en voorkeur voor het laatst geopende onderdeel blijven werken. Aantallen open taken en meldingen blijven zichtbaar. Na een keuze sluit Meer. Escape sluit het menu en geeft toetsenbordfocus terug aan de knop. Het zoekveld opent niet vanzelf het mobiele toetsenbord.

## Controle en publicatie

De webtests controleren onder meer de veilige aanmeldstappen, tweestapsverificatie, ontbrekende providers, het enkele tandwieltje en het bereiken van gegroepeerde functies. Een lokale browserfixture controleert lichte/donkere aanmelding, inactieve aanbieders, bellen en het agendamenu op 390 px breedte. Ook is het bereiken van de footer bij 400 px schermhoogte gecontroleerd. Deze fixture gebruikt uitsluitend fictieve gegevens; actieve OAuth-knoppen daarin bewijzen geen productie-instelling.

Zie `controle/rustige_interface.json` voor de controles en bronversies. Beide distributies worden uit `web/src` gebouwd. Dit is geen bevestigde livepublicatie of uitgevoerde productiemigratie.

De correctie waarbij gebruikersnaam en wachtwoord direct zichtbaar blijven en de externe aanbieders eronder staan, is afzonderlijk gecontroleerd in `controle/aanmeldvolgorde.json`.
