# Rive-assistent — integratiefase 1

De goedgekeurde mascotte blijft behouden. Deze PR voegt uitsluitend een
optionele Streamlit-weergave en een expliciet inputcontract toe. Er is nog
**geen** definitieve `.riv` geleverd, dus geen nieuwe tekening of imitatie
ingevuld.

## Export in Rive

1. Importeer het goedgekeurde vector-karakter in de Rive-editor.
2. Maak een State Machine met de exacte naam `Assistant`.
3. Voeg een **Number**-input toe met naam `status`.
4. Richt de overgangen in: 0 idle, 1 listening, 2 thinking, 3 speaking,
   4 success, 5 error. Laat idle vloeiend loopen.
5. Exporteer als `assets/assistant.riv` (git commit pas na goedkeuring).

## Gebruik in Streamlit

```python
from rive_assistant import render_assistant_character
render_assistant_character(state="idle")
```

De renderer doet niets zolang `assets/assistant.riv` ontbreekt. Daardoor
blijven bestaande pagina's functioneel. Nadat het asset is toegevoegd, kan
de chatstatus aan `state` gekoppeld worden zonder modeloutput te simuleren.

## Grenzen

- Geen AI-verzoeken, accounts of instellingen aan de animatie gekoppeld.
- Het afspelen gebruikt een externe Rive-runtime via jsDelivr; controleer CSP
  en self-host de runtime indien offline werking vereist is.
- Streamlit reruns reconstrueren de iframe; een latere persistente component
  is nodig voor volledig vloeiende overgangen zonder herladen.
- De animatie respecteert `prefers-reduced-motion`.
