"""De web-app op je beginscherm (docs/ op GitHub Pages) om de app heen: eigen icoon en pushmeldingen.

De app draait daarin als venster. Om meldingen aan te zetten geeft de app alleen een eenmalige koppelcode door
aan dat laagje, en alleen aan het adres van de web-app zelf; je wachtwoord en sessie blijven in de app.
"""

import streamlit as st

ADRES = "https://blaslavio.github.io/Assistent/"
HERKOMST = "https://blaslavio.github.io"

JS = f"""
export default function (component) {{
  const {{ data, setTriggerValue }} = component;
  if (!window.__schilLuistert) {{
    window.__schilLuistert = true;
    window.addEventListener("message", (e) => {{
      if (e.origin === "{HERKOMST}" && e.data && e.data.soort === "push-klaar") window.__schilKlaar?.();
    }});
  }}
  window.__schilKlaar = () => setTriggerValue("klaar", Date.now());
  if (data.code && window.__schilCode !== data.code) {{
    window.__schilCode = data.code;
    try {{ window.top.postMessage({{ soort: "push-koppelen", code: data.code }}, "{HERKOMST}"); }} catch (e) {{}}
  }}
}}
"""

_onderdeel = st.components.v2.component("schil", html="<span></span>", js=JS)


def actief() -> bool:
    """Draait de app nu in de web-app op het beginscherm?"""
    if st.query_params.get("schil") == "1":
        st.session_state.in_schil = True
    return bool(st.session_state.get("in_schil"))


def koppelen(code: str | None, key: str = "schil_koppelen") -> bool:
    """Geeft de koppelcode door aan de web-app. True zodra die meldt dat het gelukt is."""
    r = _onderdeel(key=key, data={"code": code or ""}, on_klaar_change=lambda: None)
    klaar = getattr(r, "klaar", None) if r is not None else None
    if klaar and klaar != st.session_state.get("_schil_klaar"):
        st.session_state._schil_klaar = klaar
        return True
    return False
