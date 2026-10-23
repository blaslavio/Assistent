"""Inzamelen: potten voor een cadeau, een spaardoel of donaties. Ook gebruikt bij een verjaardag in Plannen, bij
een huishouden (samen sparen) en bij een community."""

from datetime import date, timedelta

import streamlit as st

import kort
import pot
import samen


def _fout(functie, *args, **kwargs):
    try:
        return functie(*args, **kwargs)
    except samen.Fout as fout:
        st.error(str(fout))
        return None


def pagina() -> None:
    if not samen.beschikbaar():
        st.info("Inzamelen werkt alleen in de online versie.")
        return
    if m := st.session_state.pop("pot_melding", None):
        st.toast(m)
    if (c := st.session_state.pop("pot_community", None)) is not None:
        st.session_state.pot_voor_community = c
    community = st.session_state.get("pot_voor_community")
    potten = pot.mijn()
    if community:
        with st.container(horizontal=True, vertical_alignment="center"):
            st.markdown("**Voor je community**", width="stretch")
            if st.button("", icon=":material/close:", type="tertiary", help="Alle potten"):
                st.session_state.pop("pot_voor_community", None)
                st.rerun()
        potten = [p for p in potten if p.get("community") == community]
    with st.popover("Nieuwe pot", icon=":material/add:"):
        maken_formulier("pagina", community=community)
    if not potten:
        st.caption("Nog geen potten.")
    for p in potten:
        kaart(p)


def maken_formulier(key: str, soort: str = "", titel: str = "", community: int | None = None,
                    gezin: int | None = None, afspraak: str = "", leden: list[str] | None = None,
                    einddatum: date | None = None) -> None:
    """Een pot maken. Alles behalve de naam is optioneel."""
    with st.form(f"pot_maken_{key}", border=False):
        if not soort:
            soort = st.segmented_control("Soort", list(pot.SOORTEN), default="spaardoel" if community else "cadeau",
                                         format_func=pot.SOORTEN.get,
                                         label_visibility="collapsed", key=f"pot_soort_{key}") or "cadeau"
        naam = st.text_input("Naam", value=titel, placeholder="Bijv. Cadeau voor Sanne", max_chars=80)
        doel = st.number_input("Doelbedrag (optioneel)", min_value=0.0, step=5.0, value=None, format="%.2f")
        iban = st.text_input("Rekeningnummer", placeholder="Bijv. NL00 BANK 0123 4567 89")
        tnv = st.text_input("Ten name van", placeholder="Optioneel")
        link = st.text_input("Betaalverzoek-link", placeholder="Optioneel, bijv. Tikkie",
                             help="Een link van je bank of Tikkie. De app zelf int geen geld.")
        if gezin is None and community is None:
            mensen = st.text_input("Wie doen mee?", value=", ".join(leden or []), placeholder="Gebruikersnamen")
        else:
            mensen = ""
        eind = st.date_input("Tot", value=einddatum, min_value=date.today(), format="DD-MM-YYYY")
        openbaar = st.toggle("Iedereen met de link kan doneren", value=soort == "donatie")
        if st.form_submit_button("Pot maken", type="primary", width="stretch"):
            nieuw = _fout(pot.maken, naam.strip(), soort, doel or None, "", iban, tnv, link, eind,
                          [m.strip() for m in mensen.replace(";", ",").split(",")], community, gezin, afspraak,
                          openbaar)
            if nieuw:
                st.session_state.pot_melding = "Pot gemaakt. Wie meedoet, krijgt een seintje."
                st.rerun()


def kaart(p: dict, key: str = "") -> None:
    """Eén pot: stand, meedoen, betalen en (voor de maker) ontvangen afvinken."""
    k = f"{key}{p['id']}"
    with st.container(border=True):
        with st.container(horizontal=True, vertical_alignment="center"):
            st.markdown(f"**{p['titel']}**" + (" · :gray[gesloten]" if p["gesloten"] else ""), width="stretch")
            if p["van_mij"]:
                with st.popover("", icon=":material/more_horiz:"):
                    beheer(p, k)
        if p.get("doel"):
            st.progress(min(1.0, float(p["toegezegd"]) / float(p["doel"])))
        st.caption(pot.stand(p) + (f" · tot {date.fromisoformat(str(p['einddatum'])):%d-%m}" if p.get("einddatum") else ""))
        mijn = [b for b in p["bijdragen"] if b["van_mij"]]
        with st.container(horizontal=True):
            if not p["gesloten"]:
                with st.popover("Meedoen", icon=":material/volunteer_activism:", type="primary"):
                    with st.form(f"pot_mee_{k}", border=False):
                        bedrag = st.number_input("Bedrag", min_value=0.5, step=1.0, value=10.0, format="%.2f")
                        bericht = st.text_input("Bericht", placeholder="Optioneel", max_chars=300)
                        anoniem = st.checkbox("Anoniem voor de anderen")
                        if st.form_submit_button("Meedoen", type="primary"):
                            if _fout(pot.bijdragen, p["id"], bedrag, bericht.strip(), anoniem) is not None:
                                st.session_state.pot_melding = "Genoteerd. Maak het bedrag over en tik op Betaald."
                                st.rerun()
            if p["iban"] or p["betaallink"]:
                with st.popover("Betalen", icon=":material/payments:"):
                    if p["betaallink"]:
                        st.link_button("Betaalverzoek openen", p["betaallink"], width="stretch")
                    if p["iban"]:
                        st.code(p["iban"], language=None)
                        st.caption(f"t.n.v. {p['tenaamstelling'] or p['maker']} · o.v.v. {p['titel']}")
        for b in mijn:
            if b["status"] == "ontvangen":
                continue
            with st.container(horizontal=True, vertical_alignment="center"):
                st.caption(f"Jij: {samen.euro(b['bedrag'])} · {b['status']}", width="stretch")
                if b["status"] == "toegezegd" and st.button("Betaald", key=f"pot_bet_{b['id']}", type="tertiary"):
                    _fout(pot.status, b["id"], "betaald")
                    st.rerun()
        if p["bijdragen"]:
            with st.expander(f"Wie doen mee ({len(p['bijdragen'])})"):
                for b in p["bijdragen"]:
                    with st.container(horizontal=True, vertical_alignment="center"):
                        st.markdown(f"{b['naam']} · {samen.euro(b['bedrag'])}"
                                    + (f"  \n:gray[{b['bericht']}]" if b["bericht"] else ""), width="stretch")
                        st.caption({"toegezegd": "toegezegd", "betaald": "betaald",
                                    "ontvangen": ":green[ontvangen]"}[b["status"]])
                        if p["van_mij"] and b["status"] != "ontvangen" and st.button(
                                "", key=f"pot_ont_{b['id']}", icon=":material/check:", help="Ontvangen"):
                            _fout(pot.status, b["id"], "ontvangen")
                            st.rerun()


def beheer(p: dict, k: str) -> None:
    if p["openbaar"]:
        st.caption("Link om te doneren")
        st.code(f"{kort.basis()}/?pot={p['code']}", language=None)
    with st.form(f"pot_leden_{k}", border=False):
        mensen = st.text_input("Mensen toevoegen", placeholder="Gebruikersnamen")
        if st.form_submit_button("Toevoegen") and mensen.strip():
            if (n := _fout(pot.leden_toevoegen, p["id"], [m.strip() for m in mensen.split(",")])) is not None:
                st.session_state.pot_melding = f"{n} toegevoegd."
                st.rerun()
    if st.toggle("Iedereen met de link kan doneren", value=p["openbaar"], key=f"pot_open_{k}") != p["openbaar"]:
        _fout(pot.bijwerken, p, openbaar=not p["openbaar"])
        st.rerun()
    if st.button("Openen" if p["gesloten"] else "Sluiten", key=f"pot_dicht_{k}", width="stretch"):
        _fout(pot.bijwerken, p, gesloten=not p["gesloten"])
        st.rerun()
    if st.button("Weghalen", key=f"pot_weg_{k}", width="stretch"):
        _fout(pot.weg, p["id"])
        st.rerun()


def openbare_pagina(code: str) -> None:
    """?pot=code: doneren zonder account."""
    try:
        p = pot.openbaar(code)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    st.title(p["titel"])
    if p.get("omschrijving"):
        st.write(p["omschrijving"])
    if p.get("doel"):
        st.progress(min(1.0, float(p["toegezegd"]) / float(p["doel"])))
    st.caption(pot.stand(p) + f" · door {p['maker']}")
    if p["gesloten"]:
        st.info("Deze pot is gesloten.")
        return
    if p["betaallink"]:
        st.link_button("Doneren via betaalverzoek", p["betaallink"], type="primary", width="stretch")
    if p["iban"]:
        st.markdown(f"Of maak over naar **{p['iban']}** t.n.v. {p['tenaamstelling'] or p['maker']}.")
    with st.form("pot_doneren"):
        st.markdown("**Laat weten dat je meedoet**")
        naam = st.text_input("Je naam", max_chars=60)
        bedrag = st.number_input("Bedrag", min_value=0.5, step=1.0, value=10.0, format="%.2f")
        bericht = st.text_input("Bericht", placeholder="Optioneel", max_chars=300)
        anoniem = st.checkbox("Anoniem")
        if st.form_submit_button("Versturen", type="primary"):
            if _fout(pot.doneren, code, naam.strip(), bedrag, bericht.strip(), anoniem) is not None:
                st.success("Dank je wel!")
    for b in p.get("bijdragen", [])[:10]:
        st.caption(f"{b['naam']} · {samen.euro(b['bedrag'])}" + (f" · {b['bericht']}" if b["bericht"] else ""))


def eind_standaard(dag: date | None) -> date:
    return dag or date.today() + timedelta(days=14)
