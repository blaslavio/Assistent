# Technische audit — 25 oktober 2026

Status: **statische codecontrole**, geen runtime-/penetratietest. Bron: `main` op commit `2fb91c98d5aee55e2f4955806dfe61395a90f3fc`.

## Prioriteit 1 — agenda-URL's en netwerktoegang
`agendas.py`: `koppel_link` accepteert willekeurige http(s)-URL's en `_ophalen_link` gebruikt `httpx.get(..., follow_redirects=True)`. Er is geen zichtbare blokkering van loopback, privé-IP's, link-local, interne hostnamen of redirectbestemmingen. Dit creëert mogelijk SSRF wanneer de app op een server draait. Ook `koppel_apple(..., url=...)` verdient beoordeling.
**Aanpak:** HTTPS waar mogelijk verplichten; DNS-/IP- en redirectbestemmingen valideren, redirects begrenzen; bescherm tegen DNS rebinding via netwerk-egressbeleid; maximale downloadgrootte instellen. Test localhost, 127.0.0.1, 169.254.169.254, private IPv4/IPv6 en redirects.

## Prioriteit 2 — AI-gespreksgeschiedenis
`ander_brein.py`: bij reconstructie van eerdere beurten worden via `_tekst` alleen tekstblokken bewaard. Toolaanroepen en resultaten verdwijnen, terwijl ze binnen dezelfde `antwoord`-aanroep wel tijdelijk in `gesprek` zitten. Vervolgvragen kunnen daardoor context missen.
**Aanpak:** canonieke toolhistorie per beurt opslaan of veilige, gestructureerde samenvattingen bewaren. Test vervolgvragen over eerder uitgevoerde acties.

## Prioriteit 2 — foutafhandeling AI
`ander_brein.py`: na `MAX_RONDES` wordt bij afwezige tekst `"Klaar."` teruggegeven, ook wanneer het model alleen tools blijft aanroepen. Onbekende toolnamen en ongeldige argumenten worden als toolresultaat teruggegeven, maar zonder duidelijke eindstatus.
**Aanpak:** expliciete foutmelding na limiet; test malformed responses, 429, timeouts en tools met fouten.

## Prioriteit 2 — CI en tests
In de GitHub-boom zijn geen `tests/` of `.github/workflows/` gevonden. De app omvat Python, browser-JavaScript, SQL en Supabase Edge Functions.
**Aanpak:** Python unittest/pytest, JS-lint/syntax, SQL-migratiecontroles, Edge Function-tests en GitHub Actions toevoegen. Gebruik mocks voor betaal- en AI-provider-API's.

## Prioriteit 3 — streaming facturatie
`supabase/functions/ai/index.ts` gebruikt een gesplitste response-stream en `EdgeRuntime.waitUntil` om kosten te registreren. Onderzoek wat er gebeurt bij vroegtijdige disconnect, incomplete stream, mislukte registratie en herhaalde requests.
**Aanpak:** streaming- en kostenregistratietests, monitoring en idempotente afrekening.

## Nog niet bewezen
- Geen bevestiging dat de live-app start of dat alle functionaliteit werkt.
- Geen end-to-end-bevestiging van chatversleuteling, betalingen of autorisatie.
- Geen live-test met echte API-sleutels of gebruikersdata uitgevoerd.

## Aanbevolen werkvolgorde
1. SSRF-beveiliging agenda + regressietests.
2. AI-toolverleden en foutafhandeling + regressietests.
3. CI op iedere pull request.
4. Auth/chat/betalingen security review.
5. E2E smoke-tests op staging.

**Samenwerking:** Claude en ChatGPT werken op aparte branches; merge naar `main` uitsluitend na tests en review.
