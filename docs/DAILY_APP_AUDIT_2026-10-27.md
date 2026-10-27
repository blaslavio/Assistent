# Dagelijkse appcontrole — 27 oktober 2026

**Repository:** [blaslavio/Assistent](https://github.com/blaslavio/Assistent)  
**Controle:** 2026-10-27 09:14–09:25 Europe/Amsterdam (gebaseerd op GitHub API-gegevens)  
**Basis:** `main` @ [d7ac3038b190](https://github.com/blaslavio/Assistent/commit/d7ac3038b190c01d72f4698172f36b9f577e7aef)  
**Methode:** GitHub commits/PR's, mergeability, vergelijkingen met `main`, workflow runs/jobs/logs en statische inspectie. **Geen merge, deploy, e-mail of wijziging aan productcode.**

## Samenvatting

- **17 open PR's** gevonden; waaronder PR #70 (nieuwste mobiele layout), #62 (draft), #61 (boeking/betaling/OAuth/mail), #57–54 (gestapelde functionaliteit), #45 (oude winkel- en navigatieaanpassingen).
- **Laatste `main`-commit:** #69, 27-10-2026 05:15 UTC. De drie zichtbare push-workflows voor dit exacte commit zijn geslaagd: [Regression checks](https://github.com/blaslavio/Assistent/actions/runs/40454263245), [Veiligheid en regressietests](https://github.com/blaslavio/Assistent/actions/runs/40454263147) en [AI regressietests](https://github.com/blaslavio/Assistent/actions/runs/40454263042).
- **PR #70** @ `5a7b7ef86f` staat 1 commit vóór en 0 achter `main`, is mergeable volgens GitHub en heeft vijf geslaagde Actions-workflows op dit exacte head-commit: [regressie](https://github.com/blaslavio/Assistent/actions/runs/40455168877), [security](https://github.com/blaslavio/Assistent/actions/runs/40455168956), [AI](https://github.com/blaslavio/Assistent/actions/runs/40455169015), [workspace](https://github.com/blaslavio/Assistent/actions/runs/40455169006), [SuperApp CI](https://github.com/blaslavio/Assistent/actions/runs/40455169001). De SuperApp-joblog rapporteert **124 passed + 21 subtests**, AI/security-jobs elk **84 tests**, workspace **5 passed**, en het beperkte regression.yml-pakket **19 tests**. Dit zijn overlappende suites; aantallen niet optellen als unieke tests.
- **Geen bevestigde nieuwe geautomatiseerde regressie op het actuele PR #70-head**. Dit bewijst geen productie- of visuele correctheid.

## Belangrijke risico's en openstaande verificaties

### Hoog — PR #45 kan niet veilig worden gemerged

[PR #45](https://github.com/blaslavio/Assistent/pull/45) geeft `mergeable=false`; vergelijking met huidig `main`: **68 commits ahead, 139 behind**, met 14 gewijzigde bestanden waaronder `app.py`, `zaak_scherm.py`, `plannen_scherm.py`, `samen_scherm.py` en `winkelen_scherm.py`. Er is overlap met PR #43/#42/#39/#37. Eerst rebase/cherry-pick in een nieuwe branch, conflicten per bestand oplossen en actuele CI draaien; geen directe merge. Op PR #45 staat een verzoek om afstemming met Claude/Gemini, maar **geen ontvangen Claude-review of conflictbevestiging** in de geraadpleegde discussie/reviews. Een daadwerkelijke Claude-beoordeling kon niet via deze verbinding worden uitgevoerd.

### Middel — oudere PR's lopen achter op `main`

- [PR #61](https://github.com/blaslavio/Assistent/pull/61): 2 ahead / 12 behind; boeking, betalingen, OAuth en mail; oude CI op head groen, maar integratie met nieuwste `main` en echte providers niet bewezen.
- [PR #62](https://github.com/blaslavio/Assistent/pull/62): 4 ahead / 7 behind; draft, mobiele chat; visuele QA ontbreekt.
- [PR #57](https://github.com/blaslavio/Assistent/pull/57): 31 ahead / 18 behind t.o.v. `main`; gestapeld op #56 → #55 → #54, dus mergevolgorde en actuele regressies opnieuw controleren.

### Middel — Rive native export nog niet bevestigd

`.github/workflows/rive-cli-build.yml` is **alleen handmatig** (`workflow_dispatch`) en vereist `rive-project/scene.rml`. De directory `rive-project` kon op `main` niet worden gevonden (GitHub 404). Daarmee is er geen bewijs van een gebouwde en geïntegreerde native `.riv`-asset; SVG-fallbacktests zijn niet gelijk aan een werkende Rive-export.

### Procesrisico — `main`-beveiliging

GitHub `branches/main` rapporteert `protected: false`. Het aparte branch-protection-endpoint gaf 403 voor deze integratie; eventuele repository rulesets zijn niet bevestigd. Aanbevolen: beheerder controleert of verplichte PR-review en CI-checks op `main` zijn afgedwongen. `main` is tijdens deze controle niet gewijzigd.

## Wat daadwerkelijk getest/gecontroleerd is

- GitHub Actions-runs en joblogs van de laatste `main`-commit en PR #70 zijn gelezen; alle vijf PR #70-workflows waren groen.
- Head-to-main-vergelijkingen voor PR #70, #45, #61, #62 en #57 zijn uitgevoerd; PR #45 is niet mergeable.
- Codeverschil van PR #70 statisch bekeken: wijzigingen aan CSS/Streamlit mobiele header, compacte menu-popover en responsive sectiekeuze. **Geen browser/screenshot-test uitgevoerd.**
- Geen extra lokale volledige testuitvoering: deze runtime kan GitHub niet clonen (DNS/netwerk niet beschikbaar). Bestaande CI is wel recent en exact aan de genoemde commit-SHA's gekoppeld.

## Niet live getest — niet als werkend bevestigen

1. De gedeployde Streamlit-app, echte mobiele weergave, profielavatar, dagagenda, scrollgedrag, iconen en Figma 07-pariteit. De eerder gebruikte URL `https://eisreyyrtvlgtjpqiyhpm2.streamlit.app/agenda` kon niet via de beschikbare webinspectie worden geopend.
2. Microsoft Entra/Azure OAuth-aanmelding, Supabase-authenticatie, sessies, rollen en RLS/tenantisolatie.
3. Echte boekingen, Pay-in-Chat-betalingen, refunds, agenda-/Outlook-/Google-synchronisatie en verzenden/ontvangen van mail.
4. Native Rive-animatie, `.riv`-export en karakterinteracties op echte apparaten.
5. Live AI-aanroepen, Azure AI Search/Speech, providerlimieten en gebruikersafhankelijke foutpaden.

## Aanbevolen vervolg (zonder `main` te wijzigen)

1. **Niet mergen:** PR #45; eerst conflictoplossing, bevestigde Claude-review en nieuwe CI.
2. **Visuele QA op echt mobiel toestel:** PR #70; verifieer screenshots en navigatie vóór review/merge.
3. **Rebase & her-test:** PR #61/#62 en gestapelde #54–#57 tegen huidig `main`, met bijzondere aandacht voor `app.py`.
4. **Voeg E2E smoke tests toe** voor authenticatie, agenda, boekingen, betalingen en Streamlit UI met testaccounts/fake providers; echte transacties alleen in sandbox.
5. **Rive:** maak een echte RML-scene, draai de handmatige build, controleer `.riv`-artifact en test in browser.
6. **Controleer branchregels** voor `main` en eis review/CI vóór merges.

**Conclusie:** de recente CI is groen; er is geen bewezen nieuwe unit-testregressie op het huidige hoofdpad. Er zijn wel mergeblokkades, achterlopende PR's en wezenlijke live-/visuele testgaten. Geen productie- of veiligheidsclaim op basis van uitsluitend CI.
