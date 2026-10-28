# Communicatiecentrum en assistent

Open **Instellingen → Thuis en handig → Communicatie**. Ook bij Instellingen → Assistent en Account staat een ingang.

In het assistentgesprek werken deze lokale opdrachten zonder AI-aanvraag:

```text
communicatie
communicatieprivacy
privacyinstellingen
profielinstellingen
schrijf bericht: Kunnen we deze week een overleg plannen?
```

De laatste opdracht opent de tekst als bewerkbaar concept. Ze bewaart of verstuurt niets. Een openstaand taak-/agendavoorstel of onzekere communicatieopslag moet eerst worden afgerond.

## Wat werkt

- Privéconcepten voor bericht, e-mail en chat, met ontvangerlabel, onderwerp, tekst en optionele ondertekening.
- Privéaanspreeknaam, schrijfstijl en aanspreekvorm. Deze wijzigen geen openbaar profiel of bestaand accountadres.
- Expliciete opslag, downloaden van berichttekst en verwijderen met bevestiging.
- Export van uitsluitend de communicatievoorkeuren en concepten; geen API-sleutels, andere accountgegevens of interne ontvangstbewijzen.
- Opruimen van concepten ouder dan 7, 30 of 90 dagen, uitsluitend op expliciete opdracht. Dit is geen automatische bewaartermijn en verwijdert geen bestaande externe back-ups.
- Accountgebonden opslag via de bestaande opslaglaag, versiecontrole tegen overschrijven en inhoudgebonden ontvangstbewijzen voor veilige retries na een verloren antwoord.
- Een verouderd formulier wordt geblokkeerd zodra communicatiegegevens elders wijzigen; eerst herladen voorkomt het terugzetten van oude privacyvoorkeuren.
- Maximaal 100 concepten en 2000 ontvangstbewijzen per account. Bij het maximum wordt een nieuwe handeling geweigerd; ontvangstbewijzen worden niet stilzwijgend weggegooid.
- Tijdelijke formulieren en AI-resultaten worden gewist bij accountwisseling.

## Schrijfhulp en privacy

Externe schrijfhulp staat standaard uit. Schakel die desgewenst in bij **Communicatie → Privacy en profiel**. Gebruik vervolgens **Maak gecontroleerd AI-voorbeeld**, controleer het voorbeeld, vink toestemming aan en kies **Laat assistent dit concept herschrijven**.

Alleen de voorbeeldtekst, schrijfstijl en aanspreekvorm gaan naar de bestaande Claude-provider via `toegang`. De schrijfhulp gebruikt hetzelfde model als de overige vaste AI-klussen (`slim.MODEL`), een afzonderlijk verzoek zonder hulpmiddelen en zonder accountcontext, geheugen of gesprekshistorie. Ontvanger, ondertekening en privéaanspreeknaam worden niet automatisch meegestuurd. Wie persoonsgegevens zelf in Berichttekst zet, moet ook die in het voorbeeld controleren.

De standaardmaskering vervangt herkenbare e-mailadressen en nummerpatronen. Dit is geen volledige anonimisering: namen, adressen of afwijkend geschreven gegevens kunnen blijven staan. Het voorbeeld toont precies de berichttekst die wordt aangeboden. De provider verwerkt deze tekst; de module doet geen eigen toezegging over diens bewaarbeleid.

De schrijfhulp slaat het resultaat niet automatisch op en verstuurt geen bericht. Een onvolledig AI-antwoord wordt geweigerd. Bij een fout blijft het oorspronkelijke concept behouden; opnieuw proberen kan opnieuw AI-verbruik kosten. Om een goedgekeurde herschrijving te bewaren, kopieer je deze naar Berichttekst en kies je Bewaar als privéconcept.

Deze privacykeuzes gelden uitsluitend voor het communicatiecentrum. Bestaande mail-, chat-, geheugen- en openbare profielinstellingen blijven afzonderlijk. De bestaande algemene privacy- en beveiligingspagina blijft beschikbaar. De module voegt geen end-to-end-encryptie, universele verzendblokkade of wijziging van providerbeleid toe.

## Code en controle

- `communicatie.py`: validatie, privéopslag, versiecontrole, maskering, export en geïsoleerd AI-verzoek.
- `communicatie_scherm.py`: formulieren, privacyvoorbeeld, toestemming en assistentnavigatie.
- `universal_os.py`: lokale communicatieopdrachten via de bestaande router voor typen, microfoon en Siri.
- `test_communicatie.py`: invoergrenzen, veilige standaard, verloren antwoord, verouderde opslag, opruimen, export, accountwisseling en echte Streamlit-scherminteractie met nagebootste AI.
- `test_veilige_opslag.py`: extra PostgreSQL-controle voor accountisolatie en idempotente communicatieopslag.

```sh
.venv/bin/python tools/planning_controle.py --onderdeel communicatie
```

Er zijn bij de ontwikkeling geen echte berichten verstuurd of externe AI-verzoeken uitgevoerd. De AI-interface is getest met een nagebootste client; echte providerbereikbaarheid en rechten moeten later met een passend testaccount worden gecontroleerd. Niets is live gezet.

Laatste lokale verificatie: **1248 tests geslaagd, nul overgeslagen**, inclusief 15 communicatietests en 25 PostgreSQL-tests. De 1000 navigatieconfiguraties en zes Chromium-scenario’s slaagden, inclusief de mobiele concept- en profiel-/privacyschermen. `controle/testresultaten.json` en `controle/interface/browsercontrole.json` bevatten de bijbehorende bronhashes. De bestaande tien externe/handmatige auditpunten blijven open.
