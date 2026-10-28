"""Doorzoekbaar tooloverzicht met eerlijke beschikbaarheid per map."""
import json
import streamlit as st
import gereedschappen


def pagina(paginas: dict, online: bool, uit=(), niveau="particulier") -> None:
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_gt_account") != account:
        for k in list(st.session_state):
            if k.startswith("gt_"):
                del st.session_state[k]
        st.session_state._gt_account = account
    st.subheader("Alle gereedschappen")
    st.caption("Alle zeven mappen, inclusief tools die uitstaan of een online account vereisen. Dit overzicht voert geen opdrachten uit en verandert geen rechten.")
    lijst = gereedschappen.catalogus(online, uit, niveau)
    dekking = gereedschappen.dekking(lijst, paginas)
    with st.expander("Tools per map", expanded=True):
        st.dataframe([{**r, "gedeeld": ", ".join(r["gedeeld"])} for r in dekking], hide_index=True)
    vraag = st.text_input("Zoek een gereedschap", max_chars=160, key="gt_zoek")
    groep = st.selectbox("Map", ["Alle mappen", *gereedschappen.GROEPEN], key="gt_map")
    alleen = st.checkbox("Alleen tools die ik nu kan openen", key="gt_beschikbaar")
    gevonden = gereedschappen.zoek(lijst, vraag, None if groep == "Alle mappen" else groep, alleen)
    st.caption(f"{len(gevonden)} van {len(lijst)} gereedschappen")
    if not gevonden:
        st.info("Geen passende tools. Verwijder een zoekwoord of kies Alle mappen.")
    for g in gereedschappen.GROEPEN:
        items = [t for t in gevonden if t["groep"] == g]
        if not items:
            continue
        st.markdown("**" + g + "**")
        for tool in items:
            with st.container(border=True):
                if tool["beschikbaar"] and tool["url"] in paginas:
                    st.page_link(paginas[tool["url"]], label=tool["titel"], icon=tool["icoon"])
                else:
                    st.text(tool["titel"])
                    st.caption(" ".join(tool["redenen"]) or "Deze pagina is in deze sessie niet geregistreerd.")
    st.download_button("Download tooloverzicht (JSON)", json.dumps({"dekking": dekking, "tools": [{k: t[k] for k in ("url", "titel", "groep", "beschikbaar", "redenen")} for t in lijst]}, ensure_ascii=False, indent=2),
                       file_name="gereedschappen.json", mime="application/json", on_click="ignore")
    st.caption("Uitzetten en voorkeuren aanpassen kan bij Instellingen → Weergave. Een zichtbare tegel vervangt geen toegangscontrole bij de dienst zelf.")
