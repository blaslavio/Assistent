# Azure-diensten

De bestaande Streamlit-hosting en Supabase-opslag blijven in gebruik. De Dockerfile bereidt optionele Azure-containerhosting voor; er is geen verhuizing of betaalde hosting uitgevoerd.

## Serverconfiguratie

Gebruik serveromgevingsvariabelen of top-level Streamlit Secrets. Commit nooit sleutels. De app biedt geen browserveld voor de gedeelde Azure-sleutels en maakt ze niet onderdeel van accountinstellingen of gegevensexports.

| Variabele | Waarde |
| --- | --- |
| `AZURE_OPENAI_BASE_URL` | `https://blaslavio-7458-resource.openai.azure.com/openai/v1/` |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-5-mini` |
| `AZURE_OPENAI_API_KEY` | Bestaande Azure-resourcekey, uitsluitend in servergeheimen |
| `AZURE_SEARCH_ENDPOINT` | `https://<zoekservice>.search.windows.net` |
| `AZURE_SEARCH_INDEX` | `assistent-private-documents` |
| `AZURE_SEARCH_API_KEY` | Servergeheim; voor indexeren is schrijftoegang nodig |
| `AZURE_SPEECH_REGION` | Regio van de Speech-resource |
| `AZURE_SPEECH_KEY` | Servergeheim van de Speech-resource |

De OpenAI-resource en deployment zijn op 26 oktober 2026 via Azure CLI aangetroffen (`Succeeded`). Een echte aanroep vanuit Cloud Shell met de bestaande Entra-aanmelding gaf `OK` terug. Dat bewijst geen succesvolle AI-aanroep vanuit de productieapp. Search- en Speech-resources, secrets en runtime-aanroepen moeten apart worden gecontroleerd.

## Gebruik

Open Instellingen > Assistent > Azure-diensten voor testknoppen en per-accounttoestemming. Kies Azure OpenAI bij Brein. Alle bestaande AI-tools blijven beschikbaar. De gebruikerskeuze verandert niet automatisch voor bestaande accounts.

Voor documentzoeken moet een Azure AI Search-service met het indexschema in `infra/azure-search-index.json` aanwezig zijn. Provisioning is niet automatisch: controleer beschikbaarheid, regio en tarieven voordat een dienst wordt aangemaakt. Selecteer vervolgens maximaal tien eigen documenten en geef toestemming voor indexeren. De app maakt tekstfragmenten en zoekt met accountfilter. De backend bepaalt de account-ID. Elk zoekresultaat wordt bovendien opnieuw tegen de originele documenttoegang en inhoudshash gecontroleerd. Gewijzigde documenten moeten opnieuw worden geïndexeerd. Zakelijke en community-indexen zijn niet aangesloten; de rolkiezer verleent geen extra toegang. Verwijderen uit de index kan via documentnummers, ook nadat het origineel is verwijderd.

Azure-documentzoeken is trefwoordzoeken met bronfragmenten, geen automatische webzoekfunctie of reeds geconfigureerde vector/semantische zoekdienst. De assistent ontvangt de fragmenten via het bestaande documentenhulpmiddel en moet titel en documentnummer noemen. Een bronverwijzing bewijst op zichzelf geen feitelijke juistheid.

Azure Speech kan antwoorden voorlezen en korte Nederlandse/Vlaamse PCM-WAV-opnamen omzetten naar tekst. Alleen een expliciete klik verstuurt een opname; herkende tekst wordt eerst ter controle getoond. Opnamen: mono, 16 kHz, 16-bit en maximaal 60 seconden. Zonder Azure Speech blijft de bestaande apparaatstem beschikbaar. In productie worden beide spraakrichtingen apart getest.

## Optionele hosting

Het containerimage start Streamlit op poort 8000 als gebruiker zonder rootrechten, met healthcheck. Geheime bestanden, lokale data en gitgegevens worden niet in het image meegenomen. Voor Azure App Service/Container Apps zijn daarna resources, servergeheimen, WebSocket-ondersteuning, de juiste publieke URL en toegestane Supabase OAuth-terugkeeradressen nodig. Geen automatische provisioning of publicatie vanuit deze wijziging. De huidige gebruikerssessies/OAuth-verifiers zijn nog in procesgeheugen; meerdere instanties vereisen gedeelde sessieopslag of passende sessieroutering.

## Verificatie

`python -m pytest -q` controleert onder meer sleutelafscherming, endpointvalidatie, WAV-limieten, SSML-escaping, accountfilters, toestemming, verwijderde/toegang-geweigerde documenten en gedeeltelijk mislukte indexering. HTTP-tests gebruiken mocks. Een groene test claimt geen live cloudverbinding. Het containerimage moet voor publicatie nog worden gebouwd en met echte serverconfiguratie getest.

API-documentatie:

- https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle
- https://learn.microsoft.com/rest/api/searchservice/documents/search-post?view=rest-searchservice-2025-09-01
- https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
- https://learn.microsoft.com/azure/ai-services/speech-service/rest-speech-to-text-short
