# Azure GPT-5-mini — serverconfiguratie

De bestaande AI Edge Function (`supabase/functions/ai/index.ts`) accepteert
`model: "azure-gpt-5-mini"`. De browser krijgt nooit een Azure API-sleutel.
De andere providers en hun modelnamen blijven ongewijzigd.

Configureer uitsluitend **Supabase Edge Function secrets** (niet Vite,
GitHub Pages of de client):

- `AZURE_OPENAI_ENDPOINT`: de Azure OpenAI resource base URL,
  bijvoorbeeld `https://<resource>.openai.azure.com` (geen API-key).
- `AZURE_OPENAI_DEPLOYMENT`: `gpt-5-mini`.
- `AZURE_OPENAI_API_KEY`: de sleutel van de bijbehorende Azure-resource.
- `AZURE_INPUT_EUR_PER_MILLION`: overeengekomen inputkosten in EUR per miljoen tokens.
- `AZURE_OUTPUT_EUR_PER_MILLION`: overeengekomen outputkosten in EUR per miljoen tokens.

De laatste twee waarden zijn expliciet verplicht: gebruik geen verzonnen
tarieven in de bestaande maandbudgetadministratie. Stel ze pas in na
controle van Azure-prijzen en valuta. De huidige route ondersteunt API-key
authenticatie; de losse Python-adapter ondersteunt daarnaast Entra ID, maar
is **niet** de productieroute van de webapp.

De Azure-route is fail-closed: zonder volledige configuratie volgt HTTP 503,
zonder automatische overschakeling die dubbel gebruik of dubbel afrekenen
kan veroorzaken. Een succesvolle Playground-test bevestigt de deployment,
niet de servercredentials. Voer na configuratie een geauthenticeerde
end-to-end test uit met de bestaande app-gebruikerssessie. Controleer
gebruik, foutafhandeling en logs voordat je de modelkeuze publiek maakt.

Geen sleutels committen. Deploy alleen na geslaagde CI en gecontroleerde
configuratie. 
