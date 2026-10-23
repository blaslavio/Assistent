"""Pagina Bestanden: je eigen opslag in de app, met mappen, zoeken en een prullenbak.

Rustig gehouden: bovenaan hoeveel ruimte je gebruikt, dan de map waar je bent, en per bestand één knop met
de acties. Downloaden opent Safari (of je browser) met een link die 5 minuten werkt.
"""

import streamlit as st

import toegang
import bestanden
import documenten_scherm
import opslag


def _account() -> None:
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))


def _melding() -> None:
    if m := st.session_state.pop("bs_melding", None):
        (st.success if m[0] == "ok" else st.error)(m[1])


def _doe(functie, *args, ok: str = "", **kwargs) -> None:
    """Voor knoppen: actie uitvoeren en een korte melding klaarzetten."""
    _account()
    try:
        functie(*args, **kwargs)
        if ok:
            st.session_state.bs_melding = ("ok", ok)
    except bestanden.Fout as fout:
        st.session_state.bs_melding = ("fout", str(fout))


def _naar(map_: str) -> None:
    st.session_state.bs_map = map_
    st.session_state.pop("bs_zoek", None)


def ruimte_balk(gebruikt: int, totaal: int) -> None:
    """'1,2 GB van 2 GB' met een balk, en een knop naar meer ruimte."""
    deel = min(gebruikt / totaal, 1.0) if totaal else 0
    with st.container(horizontal=True, vertical_alignment="center"):
        st.caption(f"{toegang.leesbaar(gebruikt)} van {toegang.leesbaar(totaal)} gebruikt")
        if st.button("Meer ruimte", type="tertiary", icon=":material/add_circle:", key="bs_meer"):
            st.session_state.inst_na = "Opslag"
            st.session_state.ga_naar = "instellingen"
            st.rerun()
    st.progress(deel)
    if deel >= 0.9:
        st.warning("Je opslag is bijna vol. Gooi iets weg wat je niet meer nodig hebt, of kies meer ruimte.")


def pagina() -> None:
    _melding()
    bestanden.vanzelf_opruimen()
    deel = st.segmented_control("Bestanden", ["Bestanden", "Prullenbak"], default="Bestanden", key="bs_deel",
                                label_visibility="collapsed") or "Bestanden"
    if deel == "Prullenbak":
        prullenbak()
        return
    map_ = st.session_state.get("bs_map", "")
    try:
        gegevens = bestanden.lijst(map_)
    except bestanden.Fout:
        _naar("")
        st.rerun()
    ruimte_balk(gegevens["gebruikt"], gegevens["opslag"])

    zoek = st.text_input("Zoeken", placeholder="Zoek in al je bestanden", key="bs_zoek",
                         label_visibility="collapsed", icon=":material/search:")
    with st.container(horizontal=True, vertical_alignment="center", gap="small"):
        paden = map_.split("/") if map_ else []
        st.button("Bestanden", type="tertiary", key="bs_kruim_0", on_click=_naar, args=("",),
                  disabled=not paden and not zoek)
        for i, naam in enumerate(paden):
            st.markdown("›", width="content")
            st.button(naam, type="tertiary", key=f"bs_kruim_{i + 1}", on_click=_naar,
                      args=("/".join(paden[:i + 1]),), disabled=i == len(paden) - 1)
    if not zoek:
        toevoegen(map_)

    items = bestanden.zoeken(zoek) if zoek else gegevens["items"]
    if not items:
        st.caption("Niets gevonden." if zoek else "Deze map is nog leeg. Voeg een bestand of een map toe.")
    for item in items:
        regel(item, toon_map=bool(zoek))


def toevoegen(map_: str) -> None:
    with st.container(horizontal=True, gap="small"):
        with st.popover("Uploaden", icon=":material/upload:"):
            ronde = st.session_state.get("bs_ronde", 0)
            gekozen = st.file_uploader("Kies bestanden", accept_multiple_files=True, key=f"bs_upload_{ronde}",
                                       label_visibility="collapsed")
            if gekozen and st.button("Uploaden", type="primary", key="bs_upload_knop"):
                gelukt = 0
                with st.spinner("Uploaden..."):
                    for f in gekozen:
                        try:
                            bestanden.uploaden(map_, f.name, f.getvalue(), f.type or "")
                            gelukt += 1
                        except bestanden.Fout as fout:
                            st.session_state.bs_melding = ("fout", str(fout))
                            break
                if gelukt:
                    st.session_state.bs_melding = st.session_state.get("bs_melding") or (
                        "ok", f"{gelukt} bestand{'en' if gelukt != 1 else ''} toegevoegd.")
                st.session_state.bs_ronde = ronde + 1
                st.rerun()
        with st.popover("Nieuwe map", icon=":material/create_new_folder:"):
            with st.form("bs_map_form", border=False, clear_on_submit=True):
                naam = st.text_input("Naam van de map", placeholder="Bijv. Vakantie 2026")
                if st.form_submit_button("Maken", type="primary") and naam.strip():
                    _doe(bestanden.map_maken, map_, naam.strip())
                    st.rerun()


def regel(item: dict, toon_map: bool = False) -> None:
    """Eén map of bestand: naam en details op één regel, acties achter één knop."""
    is_map = item["soort"] == "map"
    soort = "map" if is_map else bestanden.soort(item["mime"], item["naam"])
    pad = f"{item['map']}/{item['naam']}" if item["map"] else item["naam"]
    with st.container(horizontal=True, vertical_alignment="center", gap="small"):
        if is_map:
            st.button(item["naam"], icon=bestanden.ICONEN["map"], type="tertiary", key=f"bs_open_{item['id']}",
                      on_click=_naar, args=(pad,))
        else:
            detail = f"{toegang.leesbaar(item['grootte'])} · {documenten_scherm.wanneer(item['gewijzigd'])}"
            if toon_map and item["map"]:
                detail += f" · {item['map']}"
            st.markdown(f"{bestanden.ICONEN[soort]} {item['naam']}  \n:gray[{detail}]")
        with st.popover("", icon=":material/more_horiz:", key=f"bs_meer_{item['id']}"):
            acties(item, soort)


def acties(item: dict, soort: str) -> None:
    i = item["id"]
    if item["soort"] == "bestand":
        if st.button("Bekijken", icon=":material/visibility:", key=f"bs_bekijk_{i}", type="tertiary"):
            st.session_state.bs_voorbeeld = i
        if st.session_state.get("bs_voorbeeld") == i:
            voorbeeld(item, soort)
        if st.button("Downloaden", icon=":material/download:", key=f"bs_down_{i}", type="tertiary"):
            st.session_state[f"bs_link_{i}"] = bestanden.link(i, opslaan=True)
        if url := st.session_state.get(f"bs_link_{i}"):
            with st.container(key=f"buiten_bs_{i}"):
                st.link_button("Opslaan op je apparaat", url, icon=":material/save_alt:")
            st.caption("De link werkt 5 minuten.")
    with st.form(f"bs_naam_{i}", border=False):
        nieuw = st.text_input("Naam", value=item["naam"], key=f"bs_naamveld_{i}")
        if st.form_submit_button("Naam wijzigen") and nieuw.strip() and nieuw.strip() != item["naam"]:
            _doe(bestanden.wijzigen, i, naam=nieuw.strip())
            st.rerun()
    if st.toggle("Verplaatsen", key=f"bs_verplaats_{i}"):
        eigen = f"{item['map']}/{item['naam']}" if item["map"] else item["naam"]
        keuzes = [""] + [m for m in bestanden.mappen()
                         if item["soort"] == "bestand" or (m != eigen and not m.startswith(eigen + "/"))]
        doel = st.selectbox("Naar", keuzes, format_func=lambda m: m or "Bestanden (bovenaan)",
                            index=keuzes.index(item["map"]) if item["map"] in keuzes else 0, key=f"bs_doel_{i}")
        if st.button("Verplaatsen", key=f"bs_verplaats_knop_{i}") and doel != item["map"]:
            _doe(bestanden.wijzigen, i, map_=doel, ok="Verplaatst.")
            st.rerun()
    if st.button("Naar prullenbak", icon=":material/delete:", key=f"bs_weg_{i}", type="tertiary"):
        _doe(bestanden.prullenbak, i, ok="In de prullenbak. Daar blijft het 30 dagen staan.")
        st.rerun()


def voorbeeld(item: dict, soort: str) -> None:
    try:
        if soort == "foto":
            st.image(bestanden.link(item["id"]))
        elif soort == "video":
            st.video(bestanden.link(item["id"]))
        elif soort == "geluid":
            st.audio(bestanden.link(item["id"]))
        elif soort == "tekst" and item["grootte"] <= bestanden.VOORBEELD_MAX:
            st.code(bestanden.inhoud(item["id"]).decode("utf-8", "replace")[:20000], language=None, wrap_lines=True)
        else:
            st.caption("Hiervan is geen voorbeeld. Download het om het te openen.")
    except bestanden.Fout as fout:
        st.caption(str(fout))


def prullenbak() -> None:
    items = bestanden.lijst("", prullenbak=True)["items"]
    st.caption("Wat je weggooit, blijft hier 30 dagen staan en telt mee voor je opslag. Daarna is het echt weg.")
    if not items:
        st.caption("De prullenbak is leeg.")
    for item in items:
        soort = "map" if item["soort"] == "map" else bestanden.soort(item["mime"], item["naam"])
        with st.container(horizontal=True, vertical_alignment="center", gap="small"):
            st.markdown(f"{bestanden.ICONEN[soort]} {item['naam']}  \n"
                        f":gray[{toegang.leesbaar(item['grootte']) + ' · ' if item['soort'] == 'bestand' else ''}"
                        f"weggegooid {documenten_scherm.wanneer(item['weg_op'])}]")
            with st.popover("", icon=":material/more_horiz:", key=f"bs_pb_{item['id']}"):
                if st.button("Terugzetten", icon=":material/restore_from_trash:", key=f"bs_terug_{item['id']}",
                             type="tertiary"):
                    _doe(bestanden.prullenbak, item["id"], weg=False, ok="Teruggezet.")
                    st.rerun()
                if st.toggle("Echt weggooien", key=f"bs_echt_{item['id']}"):
                    st.caption("Dit kan niet ongedaan worden gemaakt.")
                    if st.button("Weggooien", type="primary", key=f"bs_definitief_{item['id']}"):
                        _doe(bestanden.definitief, item["id"], ok="Weggegooid.")
                        st.rerun()
