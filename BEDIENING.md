# Rustige bediening van de ontwikkelversie

## Drie vaste ingangen

- **Vandaag** toont de drie eerstvolgende open taken, in de bestaande deadlinevolgorde. ‘Bekijk alle taken’ toont de volledige lijst; eerdere versies beperkten die tot vijf. Afspraken en waarschuwingen blijven beschikbaar. Een taak wijzigen blijft een gecontroleerde opdracht.
- **Chat** houdt gesprekken centraal. Samenwerken en betaalverzoeken staan onder **＋ Meer in dit gesprek**. Een projectlink of een projectvoorstel uit een chatbericht opent die ingang automatisch. Ongelezen berichten, belbediening en de eigen chatnavigatie blijven behouden.
- **Projecten** biedt een korte route naar de werkruimtes in geaccepteerde gesprekken. Dit is een lijst van beschikbare gesprekswerkruimtes, geen automatisch overzicht van alle opgeslagen projectinhoud. Het haalt alleen gesprekmetadata op, zonder berichten/bestanden te lezen en zonder de ontvangststatus bij te werken. Zoeken werkt over de gehele lijst; standaard staan maximaal zes werkruimtes in beeld. Verzoeken worden niet als geaccepteerde projecten getoond.

**Agenda**, **Assistent** en **Instellingen** blijven bereikbaar via **Meer** in het hoofdmenu. Op een diep chat- of projectscherm gebruik je de bestaande terugknop naar de vorige ingang. Terug naar Bestellingen vanuit de assistent behoudt geen oude projectselectie.

## Eén volgende stap

De projectwerkruimte heet in de bediening **Samen aan het werk**. Direct zichtbaar zijn **Overzicht**, **Stappen** en **Toevoegen**. Onder het doorzoekbare **Meer** staan Aanpak, Planning, Voorwaarden, Werkdruk, Wijzigingen, Oefenen, Overdracht, Privacy en Assistent. Dit zijn andere labels voor dezelfde functies; de onderliggende projectberichten zijn niet gewijzigd.

Het projectkompas toont eerst maximaal drie doelen en per doel één hoofdactie. Die past bij de bevestigde situatie: aanpak maken, aanpakken bespreken, volgende stap bekijken, aanpak bijstellen of resultaat bekijken. Alternatieven staan onder **Meer bij dit doel**. De keuze is een navigatiehulp, geen uitvoering of AI-besluit.

Notities/besluiten/acties, werkstand en beschikbaarheid zijn bewust uitklapbaar. Een leeg project biedt **Begin met een doel**. Bij het openen van een projectvoorstel krijgt het controlepaneel toetsenbordfocus. Dit helpt voorkomen dat iemand een gedeeld voorstel over het hoofd ziet.

## Privacy en zekerheid

AI-pauze en **Wie mag wat?** blijven direct bereikbaar. Deelnemersaantal en deelcontext blijven zichtbaar. Betalen, delen, verwijderen en afspraakwijzigingen behouden hun bestaande bevestigingen. Het rustige menu omzeilt geen rol-, bron- of toestemmingscontrole.

De Projecten-lijst toont geen vertraagd resultaat van een vorige sessie. Bij sessiewisseling worden getoonde werkruimtes gewist. Een fout of nog niet geauthenticeerde sessie krijgt een herstelactie in plaats van verzonnen projecten.

## Controle

170 webtests en beide TypeScript/Vite-builds slagen lokaal. De aanvullende tests controleren primaire/extra navigatie, zoeken, Escape en focus, alle taken/doelen terugvinden, lege toestanden, herstellen na een fout en afscherming bij accountwisseling.

De projectweergave is daarnaast met Chromium op 390 pixels breed bekeken met synthetische voorbeeldgegevens: geen horizontale overloop, de vier projectmenuknoppen passen op één rij en Meer opent met zoeken. Dit is een lokale interfacecontrole; het vervangt geen praktijktest met echte accounts of mobiele apparaten.
