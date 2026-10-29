# Brede testcontrole en concrete correcties

Deze controle gebruikt synthetische gegevens en een afgeschermde PostgreSQL-testcontainer. De aantallen hieronder zijn uitgevoerde tests/scenario’s, geen aantallen gevonden verbeterpunten. De bronhashes en uitslagen staan in `controle/brede_audit.json`.

## Resultaten

| Controle | Uitkomst | Praktische betekenis |
| --- | --- | --- |
| Bestaande synthetische integratiereeks | 100.000 geslaagd, twintig families | Geldberekeningen, invoer, tijdzones, overlap, taakgrafen, back-ups, CSV, bronnen, capaciteit en werkstromen |
| Nieuwe plannerreeks | 5.000 scenario’s geslaagd | Geen overlap of verkeerde duur; grenzen, klokwissels, zuivere simulatie en herhaalde opslag gecontroleerd |
| Nieuwe toestemming/voorwaardenreeks | 5.000 scenario’s geslaagd | Geen toestemming bij ontbrekende, verlopen of vervalste bewijzen; expliciet onderscheid tussen voldaan, niet voldaan en onbekend |
| Python-applicatietests | 1.269 geslaagd; nul skips | Inclusief negen nieuwe opslagtests, elf echte PostgreSQL-archieftests en 25 veilige-opslagtests |
| Aanvullende pytest-reeks | 358 tests en 21 subtests geslaagd | Onder meer bestaande integratie-, beveiligings- en releasecontroles |
| Webtests | 177 geslaagd | De twee nieuwe scenarioreeksen zijn hierin opgenomen; tel die niet als extra unit-testfuncties |
| TypeScript en beide webbuilds | Geslaagd | Zowel de losse webinterface als de Streamlit-bundel bouwt |
| Python-dependencycontrole | Negentig pakketten compatibel; geen overgeslagen pakketten of bekende kwetsbaarheden in de audit | Momentopname van de onderzochte ontwikkelomgeving |
| Node-dependencycontrole | Geen bekende kwetsbaarheden, inclusief ontwikkelafhankelijkheden | Momentopname van de huidige dependencyboom |
| Bandit | Geen middelhoge/hoge signalen; 88 lage signalen blijven zichtbaar | Hieronder apart toegelicht; niet gelijk aan nul beveiligingsrisico’s |

De 100.000-reeks is een heruitvoering van de bestaande Python-regressiereeks, geen nieuwe volledige dekking van de React-app. De twee nieuwe webreeksen richten zich specifiek op de projectmotor. De vaste seeds maken herhalen mogelijk.

## Zeven concrete verbeteringen

1. **Minutenopslag behoudt tijdgrenzen.** Beschikbaarheid en afspraken met seconden konden een voorstel opleveren dat bij opslag werd afgekapt. Daardoor kon een afspraak te vroeg starten of te kort worden. De planner rondt beschikbare begintijden nu vooruit af en controleert de volledige duur opnieuw.
2. **Dubbele kloktijden worden niet opgeslagen.** Tijdens het terugzetten van de klok kon de planner een tijd voorstellen die later niet eenduidig uit de bestaande Nederlandse agendaopslag kon worden gelezen. De planner zoekt nu een tijdvak waarvan beide eindpunten exact terug te lezen zijn. Er wordt geen eigen tijdzoneformaat geïntroduceerd.
3. **Ook bekende gedeelde overlap telt mee.** Twee overlappende opgegeven projecttijden van dezelfde andere uitvoerder werden niet als conflict gemeld. Beide krijgen nu een hercontrolemelding en zijn geen bevestigde basis voor opvolgers. Hiervoor wordt de privéagenda van die ander niet gelezen.
4. **Meer herkenbare geheimen worden tegengehouden.** Naast de bestaande patronen worden onder meer herkenbare OpenAI-, GitHub- en AWS-sleutels en gelabelde bearer/access/refresh-tokens geblokkeerd vóór project-AI. Dit blijft patroonherkenning; het is geen volledige anonimisering of garantie tegen alle geheime gegevens.
5. **Een retour-URL bewijst geen betaling.** Een `betaald`-queryparameter kon een succesmelding tonen zonder betaaldienstbewijs. De melding vraagt nu de actuele bestellingstatus te controleren. De echte betaalstatus en verdere handelingen blijven bij de bestaande dienst.
6. **Opslaggrenzen blijven actief met Python-optimalisatie.** Lijstnamen en namens-voorkeuren werden met `assert` bewaakt. Zulke controles verdwijnen bij `python -O`. Ze zijn vervangen door expliciete validatie vóór lezen of schrijven. De nieuwe tests draaien ook werkelijk een geoptimaliseerde interpreter.
7. **Een lijstitem wordt in één opslaghandeling verplaatst.** Eerder werd het bronitem eerst verwijderd en daarna aan de doellijst toegevoegd. Een fout of ongeldige bestemming kon verlies veroorzaken. Beide lijsten worden nu vooraf gecontroleerd, de wijziging gebeurt op een kopie en er volgt één opslaghandeling met behoud van de account- en versievoorwaarde. Een mislukte opslag wijzigt de bronkopie niet.

De vier nieuwe frontend-grensproeven en de eerste opslagproeven mislukten onder de eerdere code. Na de correcties slagen ze. De extra opslagtests blijven via de ontwikkel-CI actief.

## Lage statische signalen blijven zichtbaar

De resterende 88 signalen zijn niet stilzwijgend onderdrukt:

- 42 betreffen het opvangen en doorgaan na uitzonderingen, veelal rond optionele diensten. Dit vraagt per gebruikersstroom beoordeling en betere foutobservatie waar nodig.
- 35 betreffen subprocess-imports, procesaanroepen en commandopaden, onder meer in controlegereedschappen en mediaverwerking.
- Vier betreffen interne assertions of deterministische test-RNG; de vijf assertions op opslaggrenzen zijn wel verwijderd.
- Zes betreffen sleutelachtige testwaarden of het leegmaken van een feed-token.
- Eén betreft de XML-module waaruit alleen de escape-functie wordt geïmporteerd.

De bestaande vijf gerichte code-suppressies blijven apart geregistreerd. Dit zijn geen overgeslagen unit-tests. Niet elk laag signaal is volledig functioneel onderzocht; de metadata per locatie staat in het auditrapport.

## Niet door deze uitvoering bewezen

Er zijn geen echte productiebetalingen, boekingen, reserveringen of gebruikersberichten uitgevoerd. Aanmelding met echte accounts, multi-device-encryptie, camera/microfoon, mobiele apparaten en externe diensten vereisen nog praktijktests met de juiste toegang. De openbare publicatie wordt niet door deze testuitslagen als voltooid aangemerkt; de eerdere Pages/Supabase-uitrolvoorwaarden blijven gelden.

## Herhalen

```sh
npm --prefix web test
npm --prefix web run build
.venv/bin/python -m pytest -q tests
.venv/bin/python tools/integratie_controle.py
.venv/bin/python tools/planning_controle.py --database-container EIGEN_GEISOLEERDE_TESTCONTAINER --rapport-json controle/testresultaten.json
```

Gebruik uitsluitend een eigen, geïsoleerde testdatabase. De gebruikte tijdelijke auditcontainer wordt na de controle gestopt.
