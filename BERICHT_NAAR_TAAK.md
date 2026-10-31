# Van gesprek naar persoonlijke taak en terug

Bij een leesbaar tekstbericht staat **Acties bij bericht → Maak persoonlijke taak**. De gebruiker past de voorgestelde titel aan en kiest optioneel zelf een datum. **Taak controleren** toont eerst een voorbeeld; **Bevestig persoonlijke taak** voert de opslag uit. Teruggaan behoudt de invoer. Annuleren schrijft niets. Dit gebruikt geen AI en verstuurt geen bericht naar de gesprekspartners.

De persoonlijke taak bewaart de beoordeelde titel, datum en `chatbron: { gesprek, bericht }` in de bestaande accountgegevens. De volledige berichttekst wordt niet als notitie toegevoegd. Een opdrachtcode voorkomt een tweede taak na een verloren opslagantwoord. Een inmiddels aangepaste taak of gewijzigde takenlijst wordt niet stilzwijgend overschreven.

Voor de opslag leest de app het aangewezen bronbericht opnieuw via de bestaande, geauthenticeerde `chat_berichten`-functie, vanaf het berichtnummer. Het toestel ontsleutelt alleen de aangewezen tekst met de bestaande cryptografie. De app weigert ontbrekende, verwijderde, verlopen, onleesbare of gewijzigde bronnen, een veranderd account, onvoldoende gesprekstoegang en gesprekken met verdwijnende berichten. Broncontrole en accountopslag blijven twee afzonderlijke verzoeken; dit is geen nieuwe transactie die beide gegevensverzamelingen vergrendelt. Latere bronwijzigingen wissen een eerder bevestigde persoonlijke taak niet automatisch.

**Naar bronbericht** staat bij de persoonlijke taak in Vandaag en Taken. Ook de bestaande projectbron wordt in Taken herkend. De verwijzing opent het juiste gesprek en haalt het precieze bericht op, ook buiten de eerste geladen pagina. Het bericht krijgt een markering en focus. Een mislukte verse broncontrole verwijdert de oude broninhoud uit die weergave. Inkomende berichten trekken de gebruiker tijdens deze bronweergave niet automatisch naar het einde. Terug naar Mijn dag behoudt het eerdere scherm en de scrollpositie. Een bron lezen bevestigt op zichzelf niet de hele tussenliggende gespreksgeschiedenis als gelezen.

# Verdergaan in Werkruimte

Bovenaan Werkruimte staan maximaal vier bruikbare recente verwijzingen. De accountgeschiedenis bevat hoogstens zes unieke app- of projectidentifiers, zonder projectnamen, berichttekst, bestandsnamen of tijdstempels. Persoonlijke apps staan voorop; Zakelijk wordt niet naar dit persoonlijke overzicht gepromoveerd. De overige appcatalogus blijft eronder beschikbaar en inklapbaar.

Een recente projectnaam komt uitsluitend uit een vers gespreksoverzicht waarvoor de gebruiker nog lid is. Dit is een overzicht van recent geopende werkruimtes, geen verzonnen overzicht van actieve projectplannen. Het leest geen projectbestanden, ontsleutelt geen geschiedenis en werkt de ontvangststatus niet bij. Bij een fout verschijnt een herstelknop. Een sessiewissel wist de getoonde projectmetadata en negeert late antwoorden.

Recent bijwerken gebruikt de bestaande versiegecontroleerde accountopslag. Verzoeken worden na elkaar uitgevoerd en zijn aan het huidige account gebonden. De navigatie wacht er niet op. Bij een opslag- of verbindingsfout blijft de gekozen app bruikbaar, maar kan de recente verwijzing ontbreken. Deze functie voegt geen databasetabel of migratie toe.

# Controle

Unit- en componenttests controleren bevestiging, datumvalidatie, herhalen na een verloren antwoord, conflicten, accountwisseling, gerichte bronverwijzingen, verborgen oude broninhoud en toegangsfiltering van recente projecten. De volledige bestaande testsuite blijft leidend.

De Chromium-controle gebruikt de volledige app met uitsluitend lokaal onderschepte API-antwoorden en een lokaal met echte WebCrypto versleuteld en ondertekend voorbeeldbericht. De route bericht → gecontroleerde taak → bronbericht → recente app is bekeken op 390 × 844; ook 320 en 1024 pixels breed geven geen horizontale overloop. Verwijderde bronnen, gewijzigde toegang en verdwijnende gesprekken blokkeren de opslag. Er is geen echt bericht verstuurd, geen AI aangeroepen en geen productiedatabase gewijzigd. Dit vervangt geen controle van de live uitrol. Actuele aantallen en bronhashes staan in `controle/bericht_naar_taak.json`.
