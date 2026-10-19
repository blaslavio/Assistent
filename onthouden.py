"""Een sleutel in Safari bewaren, zodat je op je eigen iPhone of iPad ingelogd blijft (ook als Siri de app opent).

Een klein onderdeel zonder knoppen: het leest bij het openen de bewaarde sleutel uit de browser (localStorage)
en geeft hem door, en kan een nieuwe sleutel bewaren of hem weer wissen.
"""

import streamlit as st

SLEUTEL = "mijn-assistent-apparaat"

JS = f"""
export default function (component) {{
  const {{ data, setTriggerValue }} = component;
  let opslag = null;
  try {{ opslag = window.localStorage; }} catch (e) {{}}
  if (!opslag) {{
    if (data.lees && !window.__apparaatGelezen) {{ window.__apparaatGelezen = true; setTriggerValue("sleutel", "-"); }}
    return;
  }}
  if (data.bewaar) {{
    try {{ opslag.setItem("{SLEUTEL}", data.bewaar); }} catch (e) {{}}
  }} else if (data.wis) {{
    try {{ opslag.removeItem("{SLEUTEL}"); }} catch (e) {{}}
  }} else if (data.lees && !window.__apparaatGelezen) {{
    window.__apparaatGelezen = true;
    let waarde = "";
    try {{ waarde = opslag.getItem("{SLEUTEL}") || ""; }} catch (e) {{}}
    setTriggerValue("sleutel", waarde || "-");
  }}
}}
"""

_onderdeel = st.components.v2.component("onthouden", html="<span></span>", js=JS)


def lezen(key: str = "onthouden_lees") -> str | None:
    """De bewaarde sleutel ("" als er geen is), of None zolang de browser nog niet geantwoord heeft."""
    resultaat = _onderdeel(key=key, data={"lees": True}, on_sleutel_change=lambda: None)
    waarde = getattr(resultaat, "sleutel", None) if resultaat is not None else None
    return None if waarde is None else ("" if waarde == "-" else waarde)


def bewaren(token: str, key: str = "onthouden_bewaar") -> None:
    _onderdeel(key=key, data={"bewaar": token})


def wissen(key: str = "onthouden_wis") -> None:
    _onderdeel(key=key, data={"wis": True})
