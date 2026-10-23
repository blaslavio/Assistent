"""Korte deellinks (app/?k=code) voor je winkel, boekingspagina, VR-ruimte en profielkaart, met deelknoppen voor
WhatsApp, Instagram, Facebook en de rest. Zie sql/kort_profiel.sql.
"""

from urllib.parse import quote, urlsplit

import streamlit as st

import opslag
import samen


def basis() -> str:
    """Het webadres van de app."""
    deel = urlsplit(st.context.url or "")
    return f"{deel.scheme}://{deel.netloc}" if deel.netloc else samen.betalen_status().get("app_adres", "").rstrip("/")


def link(code: str) -> str:
    return f"{basis()}/?k={code}"


def maken(soort: str, sleutel: str = "", code: str = "") -> str:
    """De korte code voor iets van jou (bestaat hij al, dan dezelfde). Met code kies je zelf een naam."""
    bewaard = st.session_state.setdefault("_kort", {})
    if not code and (soort, sleutel) in bewaard:
        return bewaard[(soort, sleutel)]
    nieuw = samen._ok(opslag._rpc_ik("kort_maken", p_soort=soort, p_sleutel=str(sleutel), p_code=code))["code"]
    bewaard[(soort, sleutel)] = nieuw
    return nieuw


def openen(code: str) -> dict:
    return samen._ok(opslag._rpc("kort_openen", p_code=code))


def mijn() -> list[dict]:
    return samen._ok(opslag._rpc_ik("mijn_korte_links"))["links"]


def weg(code: str) -> None:
    samen._ok(opslag._rpc_ik("kort_weg", p_code=code))
    st.session_state.pop("_kort", None)


def profiel(wie: int) -> dict:
    return samen._ok(opslag._rpc_ik("profiel_bekijken", p_wie=int(wie)))


def deel_adressen(url: str, tekst: str) -> dict[str, str]:
    """Deelknoppen per platform. Instagram en TikTok hebben geen deellink: daar kopieer je de link (of zet je hem in
    je bio)."""
    t, u = quote(tekst), quote(url)
    return {
        "WhatsApp": f"https://wa.me/?text={quote(tekst + ' ' + url)}",
        "Facebook": f"https://www.facebook.com/sharer/sharer.php?u={u}",
        "X": f"https://x.com/intent/post?text={t}&url={u}",
        "LinkedIn": f"https://www.linkedin.com/sharing/share-offsite/?url={u}",
        "Telegram": f"https://t.me/share/url?url={u}&text={t}",
        "Mail": f"mailto:?subject={t}&body={quote(tekst + chr(10) + url)}",
    }


def deel_blok(soort: str, sleutel: str, tekst: str, key: str) -> None:
    """Korte link met kopieerknop, deelknoppen, QR-code en een eigen naam voor de link."""
    try:
        code = maken(soort, sleutel)
    except samen.Fout as fout:
        st.caption(str(fout))
        return
    url = link(code)
    st.code(url, language=None)
    with st.container(horizontal=True):
        with st.popover("Delen", icon=":material/share:"):
            for naam, adres in deel_adressen(url, tekst).items():
                st.link_button(naam, adres, width="stretch")
            st.caption("Instagram of TikTok: kopieer de link en zet hem in je bio of verhaal.")
        with st.popover("QR-code", icon=":material/qr_code_2:"):
            from samen_scherm import _qr
            st.image(_qr(url), width=220)
        with st.popover("Eigen naam", icon=":material/edit:"):
            with st.form(f"kort_{key}", border=False):
                nieuw = st.text_input("Korte link", placeholder="Bijv. sanne-kapper", max_chars=30)
                if st.form_submit_button("Opslaan", type="primary") and nieuw.strip():
                    try:
                        maken(soort, sleutel, nieuw.strip().lower())
                    except samen.Fout as fout:
                        st.error(str(fout))
                    else:
                        st.rerun()
