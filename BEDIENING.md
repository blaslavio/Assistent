# Rustige bediening van de ontwikkelversie

## Drie vaste ingangen

- **Mijn dag** combineert Vandaag en Agenda. Vandaag toont eerst de volgende afspraak; taken en vooruitkijken blijven uitklapbaar. De agenda heeft dag-, week- en maandweergave, taken en de bestaande extra planningsopties. De hoofdknop onthoudt of je het laatst bij Vandaag of Agenda was.
- **Chat** is voor gesprekken met mensen, groepen en bellen. Een zoekveld vindt personen, groepen en lokaal geladen berichtvoorbeelden. Updates van contacten staan ingeklapt en worden pas bij openen opgehaald. Samenwerken en betaalverzoeken blijven onder **＋ Meer in dit gesprek**. Een projectlink opent de werkruimte bij het juiste gesprek. Ongelezentellingen gebruiken het geladen gespreks- en communityoverzicht; dit is geen pushdienst.
- **Werkruimte** bundelt projecten en persoonlijke apps. Notities en documenten staan direct in beeld; overige persoonlijke apps en zakelijke opties zijn ingeklapt en via zoeken vindbaar. Kaart en winkel hebben een ingang. Een project opent de bestaande werkruimte bij het geaccepteerde gesprek. De projectenlijst toont gesprekmetadata, geen verzonnen overzicht van alle projectinhoud.

De **AI-assistent** heeft een herkenbare knop bovenin, los van menselijke Chat. **Profiel en instellingen** staan rechtsboven. De dubbele vraagbalk onderin vervalt; de drie hoofdplekken blijven ook vanuit een gesprek bereikbaar (het bestaande toetsenbordgedrag op mobiel blijft van toepassing). De hoofdplekken zijn vast; oude opgeslagen dokvoorkeuren worden niet overschreven, maar kunnen Chat of de gecombineerde dagweergave niet meer verbergen.

Bezochte hoofdschermen bewaren invoer, keuze en scrollpositie zolang dit account in de app open blijft. Een chatconcept blijft ook na teruggaan naar de gesprekkenlijst in geheugen bewaard. Het wordt niet daarvoor naar een server of lokale permanente opslag gestuurd. Uitloggen of een ander account maakt de schermen en concepten leeg. Dit belooft geen herstel na sluiten of herladen van het tabblad.

Verborgen chatgesprekken stoppen met berichten ophalen en bevestigen late antwoorden niet als gelezen. Bij terugkeren hervatten ze vanaf de eerdere berichtpositie. Het overzicht mag op de achtergrond blijven bijwerken voor ongelezentellingen. Bestaande agenda-, kaart-, winkel-, bestel- en appverwijzingen blijven werken nadat een hoofdscherm al is bezocht. Appverwijzingen vanuit instellingen openen de centrale Werkruimte. Terug naar Bestellingen vanuit de assistent voert geen betaalhandeling uit.

## Van bericht naar taak en verdergaan

Bij een tekstbericht kun je via **Acties bij bericht** een persoonlijke taak voorbereiden, titel en datum controleren en de opslag bevestigen. In Vandaag en Taken brengt **Naar bronbericht** je terug bij de precieze bron. Werkruimte begint met **Verdergaan waar je was**: recente persoonlijke apps en projecten waarvoor je nog toegang hebt. De rest blijft daaronder bereikbaar. De opslag-, privacy- en controlegrenzen staan in [BERICHT_NAAR_TAAK.md](BERICHT_NAAR_TAAK.md).

## Eén volgende stap

De projectwerkruimte heet in de bediening **Samen aan het werk**. Direct zichtbaar zijn **Overzicht**, **Stappen** en **Toevoegen**. Onder het doorzoekbare **Meer** staan Aanpak, Planning, Voorwaarden, Werkdruk, Wijzigingen, Oefenen, Overdracht, Privacy en Assistent. Dit zijn andere labels voor dezelfde functies; de onderliggende projectberichten zijn niet gewijzigd.

Het projectkompas toont eerst maximaal drie doelen en per doel één hoofdactie. Die past bij de bevestigde situatie: aanpak maken, aanpakken bespreken, volgende stap bekijken, aanpak bijstellen of resultaat bekijken. Alternatieven staan onder **Meer bij dit doel**. De keuze is een navigatiehulp, geen uitvoering of AI-besluit.

Notities/besluiten/acties, werkstand en beschikbaarheid zijn bewust uitklapbaar. Een leeg project biedt **Begin met een doel**. Bij het openen van een projectvoorstel krijgt het controlepaneel toetsenbordfocus. Dit helpt voorkomen dat iemand een gedeeld voorstel over het hoofd ziet.

## Privacy en zekerheid

AI-pauze en **Wie mag wat?** blijven direct bereikbaar. Deelnemersaantal en deelcontext blijven zichtbaar. Betalen, delen, verwijderen en afspraakwijzigingen behouden hun bestaande bevestigingen. Het rustige menu omzeilt geen rol-, bron- of toestemmingscontrole.

De Projecten-lijst toont geen vertraagd resultaat van een vorige sessie. Bij sessiewisseling worden getoonde werkruimtes gewist. Een fout of nog niet geauthenticeerde sessie krijgt een herstelactie in plaats van verzonnen projecten.

## Controle

De webtests controleren de drie hoofdplekken, oude verwijzingen, zoeken, invoerbehoud, scrollherstel, teruggaan, accountwisseling, pauzeren van verborgen gesprekken en herhaalde winkel-/bestelopdrachten. De project-, betaal- en deelcontroles blijven onderdeel van de volledige testsuite.

De volledige app is daarnaast met Chromium op 390 × 844 bekeken met onderschepte, uitsluitend lokale voorbeeldantwoorden: geen horizontale overloop; hoofdmenu bereikbaar vanuit een gesprek; chatconcept, zoekopdracht en agendaweek blijven behouden bij wisselen. Er zijn geen echte berichten verstuurd of betalingen uitgevoerd. Dit is geen productiecontrole met echte accounts of mobiele apparaten. Actuele aantallen en bronhashes staan in `controle/hoofdnavigatie.json`.
