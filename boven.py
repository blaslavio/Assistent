"""Elke pagina opent bovenaan.

Door het invoerveld onderaan houdt Streamlit de pagina 'vast aan de onderkant' (handig in een gesprek). Op gewone
pagina's betekent dat: je komt binnen en staat meteen onderaan. Dit kleine onderdeel zonder knoppen zet de pagina bij
het openen weer bovenaan; daarna scrol je zelf, rustig. Zodra je zelf scrolt of tikt, blijft het eraf.
"""

import streamlit as st

JS = """
export default function (component) {
  const { data } = component;
  if (!data.sleutel || window.__bovenSleutel === data.sleutel) return;
  window.__bovenSleutel = data.sleutel;
  let zelf = false;
  // Alleen echte gebaren tellen: de veeg hieronder (omhoog) is zelf ook een wheel-gebeurtenis.
  const soorten = ["wheel", "touchstart", "keydown", "mousedown"];
  const stop = (e) => {
    if (!e.isTrusted) return;
    zelf = true;
    soorten.forEach((s) => window.removeEventListener(s, stop));
  };
  soorten.forEach((s) => window.addEventListener(s, stop, { passive: true }));
  const omhoog = () => {
    if (zelf) return;
    // Ook het venster zelf (bijv. na inloggen, als je op het inlogscherm naar beneden scrolde).
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
    const vak = document.querySelector('[data-testid="stAppScrollToBottomContainer"]')
      || document.querySelector('[data-testid="stMain"]');
    if (!vak) return;
    // Zoals een veeg omhoog: dan laat Streamlit de pagina los van de onderkant en springt hij niet meer terug.
    vak.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    if (vak.scrollTop > 0) vak.scrollTo({ top: 0 });
  };
  [0, 80, 250, 600, 1200, 2000].forEach((ms) => setTimeout(omhoog, ms));
}
"""


def bovenaan(sleutel: str | None) -> None:
    """Zet de pagina bovenaan zodra `sleutel` verandert (bijv. een andere pagina). None = niets doen (gesprekken)."""
    with st.container(key="boven_houder"):
        st.components.v2.component("boven", html="<span></span>", js=JS)(key="boven", data={"sleutel": sleutel or ""})
    # Altijd iets hoger dan het scherm: anders 'plakt' de pagina na een korte tussenstap weer aan de onderkant
    # en springt hij bij elke klik naar beneden. Niet in gesprekken, daar is dat juist handig.
    st.html("<style>.st-key-boven_houder{display:none}"
            + ('[data-testid="stMainBlockContainer"]{min-height:calc(100dvh + 4px)}' if sleutel else "")
            + "</style>")
