"""Conceptacties in het eigen account; openen controleert de geldigheid opnieuw."""

from datetime import datetime
from zoneinfo import ZoneInfo
import uuid

import streamlit as st

import actielinks
import opslag


def kaart(link: dict) -> None:
    st.subheader(link["titel"])
    st.write(actielinks.euro(link["prijs_cent"]))
    st.caption("Concept binnen je eigen account. Geen openbare aanbieding of betaalopdracht.")
    st.write("Vervalt op " + datetime.fromisoformat(link["vervalt"]).astimezone(ZoneInfo("Europe/Amsterdam")).isoformat(timespec="minutes"))
    st.code(actielinks.verwijzing(link["code"]), language=None)
    st.link_button("Open concept binnen dit account", actielinks.verwijzing(link["code"]))
    st.caption("Accountinterne verwijzing: voeg deze query toe aan het huidige appadres. Een ander account kan dit concept niet openen.")


def voorstel_paneel(bij_bericht) -> None:
    wachtend = st.session_state.get("_al_voorstel")
    if not wachtend:
        return
    r = wachtend.get("ingediend") or wachtend["gegevens"]
    vast = "ingediend" in wachtend
    if fout := st.session_state.pop("_al_fout", None):
        st.error(fout)
    st.caption("Controleer de conceptactie. De geldigheid gaat in bij de eerste geslaagde opslag.")
    with st.form("al_form_" + wachtend["id"]):
        titel = st.text_input("Titel van de actie", value=r["titel"], max_chars=160, disabled=vast, key="al_titel_" + wachtend["id"])
        prijs = st.text_input("Prijs in euro", value=(f"{r['prijs_cent'] // 100},{r['prijs_cent'] % 100:02d}" if r["prijs_cent"] is not None else ""),
                              disabled=vast, key="al_prijs_" + wachtend["id"])
        uren = st.number_input("Geldig gedurende (uren)", min_value=1, max_value=168, value=r["uren"], step=1, disabled=vast, key="al_uren_" + wachtend["id"])
        bevestig = st.form_submit_button("Opnieuw proberen" if vast else "Concept opslaan", key="al_bevestig", type="primary")
        annuleer = st.form_submit_button("Sluiten" if vast else "Annuleren", key="al_annuleer")
    if annuleer:
        st.session_state.pop("_al_voorstel", None)
        st.rerun()
    if bevestig:
        try:
            gewijzigd = r if vast else actielinks.valideer({"titel": titel, "prijs_cent": actielinks.prijs_cent(prijs), "uren": uren})
        except actielinks.Fout as fout:
            st.error(str(fout))
            return
        wachtend["ingediend"] = gewijzigd
        try:
            link = opslag.actielink_opslaan(wachtend["id"], gewijzigd)
        except opslag.GeenToegang:
            raise
        except (opslag.OpslagConflict, opslag.OpslagNietIngericht, OSError, opslag.httpx.HTTPError):
            st.session_state._al_fout = "Opslaan is niet bevestigd. Probeer dezelfde opdracht opnieuw; er wordt geen tweede concept gemaakt."
            st.rerun()
        else:
            st.session_state._al_resultaat = link["code"]
            st.session_state.pop("_al_voorstel", None)
            bij_bericht("assistant", "Conceptactielink opgeslagen. Je kunt deze binnen je eigen account bekijken; er is niets gepubliceerd of betaald.")
            st.rerun()
    if vast:
        st.caption("De ingediende gegevens blijven gelijk bij opnieuw proberen.")


def resultaat_paneel() -> None:
    if code := st.session_state.get("_al_resultaat"):
        try:
            kaart(opslag.actielink_openen(code))
        except actielinks.Fout as fout:
            st.info(str(fout))
        if st.button("Concept verbergen", key="al_verberg"):
            st.session_state.pop("_al_resultaat", None)
            st.rerun()


def pagina() -> None:
    import universal_os
    universal_os.bewaak_account()
    st.subheader("Actielinks · concepten")
    st.caption("Alleen je eigen account. Verlopen of ingetrokken concepten kunnen niet meer worden geopend.")
    if st.button("Nieuw concept", key="al_nieuw", disabled=any(st.session_state.get(k) for k in ("_al_voorstel", "_os_voorstel", "_os_dagplan"))):
        st.session_state._al_voorstel = {"id": uuid.uuid4().hex, "gegevens": {"titel": "", "prijs_cent": None, "uren": 24}}
    voorstel_paneel(lambda rol, tekst: None)
    code = st.session_state.pop("al_open", None)
    if code:
        st.session_state._al_resultaat = code
    resultaat_paneel()
    links = opslag.laden(vers=True).get("actielinks", {})
    for code, link in sorted(links.items(), key=lambda item: item[1]["aangemaakt"], reverse=True):
        with st.container(border=True):
            try:
                toestand = actielinks.status(link)
            except actielinks.Fout:
                toestand = "ongeldige gegevens"
            st.write(f"{link['titel']} · {actielinks.euro(link['prijs_cent'])} · {toestand}")
            if st.button("Bekijken", key="al_open_" + code, disabled=toestand != "actief concept"):
                st.session_state._al_resultaat = code
                st.rerun()
            if st.button("Intrekken", key="al_intrekken_" + code, disabled=bool(link.get("ingetrokken"))):
                try:
                    opslag.actielink_intrekken(code)
                except opslag.GeenToegang:
                    raise
                except (ValueError, OSError, opslag.OpslagConflict, opslag.httpx.HTTPError):
                    st.error("Intrekken is niet bevestigd. Probeer opnieuw.")
                else:
                    st.rerun()
