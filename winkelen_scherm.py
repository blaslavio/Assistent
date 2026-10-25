"""Pagina Winkelen: winkels en producten in de buurt, je mandje en je bestellingen.

Kopers zien winkels, restaurants en producten en kopen ze. Verkopers en ondernemers krijgen er Inkopen
(groothandels) en hun eigen winkel bij.
"""

import streamlit as st

import opslag
import samen
import samen_scherm
import winkelen
from samen_scherm import _fout, ik

DELEN = {"buurt": "Ontdekken", "winkels": "Winkels", "eten": "Eten bestellen",
         "tweedehands": "Tweedehands", "producten": "Producten", "mandje": "Mandje",
         "bestellingen": "Bestellingen", "winkel": "Mijn winkel"}
FILTERS = {"": "Alles", "restaurant": "Eten bestellen", "winkel": "Winkels"}


def verkoper() -> bool:
    return ik().get("id") == 1 or ik().get("niveau") in ("verkoper", "ondernemer")


def _open_onderdeel(onderdeel: str) -> None:
    """Navigeer zonder de toestand van een reeds gemaakte Streamlit-widget te wijzigen."""
    st.session_state["_winkelen_volgende_deel"] = onderdeel


def pagina() -> None:
    if not samen.beschikbaar():
        st.info("Winkelen werkt alleen in de online versie.")
        return
    if adres := st.session_state.get("winkelen_winkel"):
        if st.button("Terug", icon=":material/arrow_back:", type="tertiary"):
            st.session_state.pop("winkelen_winkel", None)
            st.rerun()
        winkel_binnen(adres)
        return
    if betaald := st.session_state.pop("winkelen_besteld", None):
        st.success(f"Besteld: {samen.euro(betaald['bedrag'])}. Rond je betaling af.")
        if betaald.get("betaallink"):
            st.link_button("Nu betalen", betaald["betaallink"], type="primary", width="stretch")
    delen = list(DELEN) if verkoper() else [d for d in DELEN if d != "winkel"]
    volgend = st.session_state.pop("_winkelen_volgende_deel", None)
    if volgend in delen:
        st.session_state["winkelen_deel"] = volgend
    elif st.session_state.get("winkelen_deel") not in delen:
        st.session_state["winkelen_deel"] = "buurt"
    n = winkelen.aantal_in_mandje()
    deel = st.selectbox(
        "Winkelonderdeel", delen, key="winkelen_deel",
        format_func=lambda d: f"{DELEN[d]} ({n})" if d == "mandje" and n else DELEN[d],
        help="Kies je omgeving. Winkels, eten en tweedehands zijn afzonderlijke onderdelen."
    ) or "buurt"
    if deel in ("buurt", "winkels", "eten", "producten"):
        plek_kiezen()
    if deel == "buurt":
        ontdekken()
    elif deel == "winkels":
        in_de_buurt("winkel")
    elif deel == "eten":
        in_de_buurt("restaurant")
    elif deel == "tweedehands":
        st.subheader("Tweedehands en marktplaats")
        st.caption("Zoek tweedehands kleding en andere artikelen van particuliere verkopers.")
        samen_scherm.zoeken()
    elif deel == "producten":
        producten(False)
    elif deel == "mandje":
        mandje()
    elif deel == "bestellingen":
        samen_scherm.bestellingen()
    else:
        samen_scherm.mijn_webshop(inkopen=inkopen)



def ontdekken() -> None:
    """Een rustig, links uitgelijnd winkeloverzicht zonder externe widgets."""
    st.subheader("Ontdek")
    st.caption("Wat zoek je vandaag? Kies een onderdeel om direct verder te gaan.")
    opties = [
        ("Winkels", "winkels", ":material/storefront:",
         "Bekijk winkels en hun assortiment."),
        ("Eten bestellen", "eten", ":material/restaurant:",
         "Ontdek restaurants en bestel bij aangesloten aanbieders."),
        ("Tweedehands", "tweedehands", ":material/checkroom:",
         "Vind kleding en artikelen van particuliere verkopers."),
        ("Producten", "producten", ":material/shopping_bag:",
         "Vergelijk producten uit verschillende winkels."),
    ]
    st.html("""<style>
    .st-key-winkel_ontdekken button {
        justify-content: flex-start !important;
        text-align: left !important;
        min-height: 3.4rem;
    }
    .st-key-winkel_ontdekken button p {text-align: left !important;}
    </style>""")
    with st.container(key="winkel_ontdekken"):
        for naam, doel, icoon, uitleg in opties:
            with st.container(border=True):
                st.button(naam, icon=icoon, key=f"ontdek_{doel}",
                          width="stretch", help=uitleg,
                          on_click=_open_onderdeel, args=(doel,))
                st.caption(uitleg)
    st.divider()
    st.markdown("**Mijn aankopen**")
    st.button("Winkelmandje bekijken", icon=":material/shopping_cart:",
              key="ontdek_mandje", width="stretch",
              help="Bekijk je producten en reken af.",
              on_click=_open_onderdeel, args=("mandje",))
    st.button("Bestellingen bekijken", icon=":material/receipt_long:",
              key="ontdek_bestellingen", width="stretch",
              help="Bekijk eerdere aankopen en hun status.",
              on_click=_open_onderdeel, args=("bestellingen",))


def inkopen() -> None:
    """Inkopen bij groothandels: een eigen plek binnen Mijn winkel (en bij Dienstverlener)."""
    plek_kiezen()
    producten(True)


def plek_kiezen() -> None:
    """Eén regel: waar je zoekt, met een knop om het te wijzigen."""
    plek = winkelen.waar()
    with st.container(horizontal=True, vertical_alignment="center"):
        st.caption(f":material/location_on: {plek[2].split(',')[0] if plek else 'Locatie niet ingesteld'}")
        with st.popover("Wijzigen", type="tertiary"):
            with st.form("winkelen_plek", border=False):
                nieuw = st.text_input("Waar?", value=opslag.instellingen().get("winkelen_plek", ""),
                                      placeholder="Bijv. Utrecht centrum")
                if st.form_submit_button("Opslaan", type="primary"):
                    opslag.instellingen_bijwerken(winkelen_plek=nieuw.strip())
                    st.rerun()


def _waar() -> tuple[float | None, float | None]:
    plek = winkelen.waar()
    return (plek[0], plek[1]) if plek else (None, None)


def in_de_buurt(categorie: str = "") -> None:
    st.subheader("Restaurants" if categorie == "restaurant" else "Winkels")
    zoek = st.text_input("Zoeken", key="winkelen_zoek", placeholder="Zoek op naam of assortiment")
    soort = categorie
    lat, lon = _waar()
    winkels = _fout(samen.winkelen_winkels, zoek.strip(), lat, lon, soort) or []
    if soort == "restaurant":
        winkels = sorted(winkels, key=lambda w: not w.get("bezorgt_hier"))
    if not winkels:
        st.info("Stel je plaats in om aanbieders in de buurt te vinden."
                if not winkelen.waar()
                else "Er zijn hier nog geen aanbieders gevonden. Probeer een andere zoekterm.")
        return
    for w in winkels[:60]:
        winkel_regel(w)
    if st.button("Kaart met alle winkels", icon=":material/map:", type="tertiary"):
        st.session_state.ga_naar = "winkels"
        st.rerun(scope="app")


def winkel_regel(w: dict) -> None:
    """Eén rustige regel per winkel: naam en het belangrijkste, met een pijltje om binnen te gaan."""
    with st.container(border=True, horizontal=True, vertical_alignment="center"):
        soort = samen.WINKELSOORTEN.get(w.get("soort"), "Winkel")
        delen = [soort]
        if w.get("afstand_km") is not None:
            delen.append(samen_scherm._km(float(w["afstand_km"])))
        if w.get("bezorgt_hier"):
            delen.append(f"bezorgt in {w['bezorg_minuten']} min")
        if v := (w.get("vertrouwen") or {}).get("beoordelingen"):
            delen.append(f"★ {str(w['vertrouwen']['sterren']).replace('.', ',')} ({v})")
        st.markdown(f'<span style="color:{w["kleur"]}">●</span> **{w["naam"]}**  \n'
                    f'<span style="color:#6b7280;font-size:14px">{" · ".join(delen)}</span>',
                    unsafe_allow_html=True, width="stretch")
        if st.button("", key=f"wl_{w['adres']}", icon=":material/chevron_right:", type="tertiary", help="Bekijken"):
            st.session_state.winkelen_winkel = w["adres"]
            st.rerun()


def producten(inkopen: bool) -> None:
    zoek = st.text_input("Zoeken", key=f"winkelen_pzoek_{inkopen}", label_visibility="collapsed",
                         placeholder="Bijv. pizza" if not inkopen else "Bijv. verpakking")
    lat, lon = _waar()
    lijst = _fout(samen.winkelen_producten, zoek.strip(), lat, lon, inkopen) or []
    if not lijst:
        if not winkelen.waar():
            st.info("Stel je plaats in om aanbod in de buurt te ontdekken. "
                    "Je kunt dit hierboven bij Locatie wijzigen.")
        elif zoek.strip():
            st.info("Geen producten gevonden voor deze zoekopdracht. "
                    "Probeer een andere naam of een bredere zoekterm.")
        elif inkopen:
            st.info("Er zijn nog geen groothandels aangesloten.")
        else:
            st.info("Er zijn nog geen producten beschikbaar in deze omgeving.")
        return
    kolommen = st.columns(2)
    for i, p in enumerate(lijst[:60]):
        with kolommen[i % 2].container(border=True):
            st.markdown(f"**{p['titel']}**  \n{samen.euro(p['prijs'])}")
            delen = [p["winkelnaam"]]
            if p.get("afstand_km") is not None:
                delen.append(samen_scherm._km(float(p["afstand_km"])))
            if p.get("bezorgt_hier"):
                delen.append("bezorgt")
            st.caption(" · ".join(delen))
            mandje_knop(p["winkel"], p["winkelnaam"], p, f"pr_{p['id']}")


def mandje_knop(winkel: str, winkelnaam: str, p: dict, key: str) -> None:
    in_mand = (winkelen.mandje().get(winkel) or {"regels": {}})["regels"].get(str(p["id"]))
    if st.button(f"In mandje ({in_mand['aantal']})" if in_mand else "In mandje", key=key, width="stretch",
                 icon=":material/add_shopping_cart:"):
        if _fout(winkelen.in_mandje, winkel, winkelnaam, p) is not None:
            st.toast(f"{p['titel']} in je mandje")
            st.rerun()


def winkel_binnen(adres: str) -> None:
    """Een winkel of restaurant van binnen: de producten, met het mandje onderaan."""
    try:
        w = samen.winkel_bekijken(adres)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    st.markdown(f'<div style="border-top:6px solid {w["kleur"]};padding-top:6px"></div>', unsafe_allow_html=True)
    st.subheader(w["naam"])
    if w.get("actie"):
        st.info(w["actie"])
    delen = [samen.WINKELSOORTEN.get(w.get("soort"), "Winkel"), w.get("winkeladres") or "online",
             winkelen.bezorg_tekst(w)]
    st.caption(" · ".join(filter(None, delen)))
    if w["omschrijving"]:
        with st.expander("Over deze winkel"):
            st.write(w["omschrijving"])
            st.caption(samen.vertrouwen_tekst(w.get("vertrouwen")))
    if not w["kan_betalen"]:
        st.warning("Bestellen kan op dit moment even niet.")
    if not w["producten"]:
        st.caption("Er staat nog niets in deze winkel.")
    kolommen = st.columns(2)
    for i, p in enumerate(w["producten"]):
        with kolommen[i % 2].container(border=True):
            st.markdown(f"**{p['titel']}**  \n{samen.euro(p['prijs'])}")
            if p["omschrijving"]:
                st.caption(p["omschrijving"][:200] + ("..." if len(p["omschrijving"]) > 200 else ""))
            if p["uitverkocht"]:
                st.caption("Uitverkocht")
            elif w["kan_betalen"] and w.get("verkoper_id") != ik().get("id"):
                mandje_knop(adres, w["naam"], p, f"wb_{p['id']}")
    if (winkelen.mandje().get(adres) or {}).get("regels"):
        st.divider()
        mandje_winkel(adres, w)


def mandje() -> None:
    m = winkelen.mandje()
    if not m:
        st.caption("Je mandje is leeg.")
        return
    for adres in list(m):
        try:
            w = samen.winkel_bekijken(adres)
        except samen.Fout:
            w = None
        with st.container(border=True):
            mandje_winkel(adres, w)


def mandje_winkel(adres: str, w: dict | None) -> None:
    """Het mandje van één winkel: aantallen aanpassen en afrekenen."""
    m = winkelen.mandje()[adres]
    st.markdown(f"**{m['naam']}**")
    if w is None:
        st.caption("Deze winkel is gesloten.")
        if st.button("Weghalen", key=f"mw_{adres}"):
            winkelen.leegmaken(adres)
            st.rerun()
        return
    for pid, r in list(m["regels"].items()):
        with st.container(horizontal=True, vertical_alignment="center"):
            st.markdown(f"{r['titel']} · {samen.euro(r['prijs'] * r['aantal'])}", width="stretch")
            aantal = st.number_input("Aantal", 0, 99, r["aantal"], key=f"ma_{adres}_{pid}", width=120,
                                     label_visibility="collapsed")
        if aantal != r["aantal"]:
            winkelen.aantal_zetten(adres, pid, aantal)
            st.rerun()
    sub = winkelen.subtotaal(adres)
    opties = []
    if w.get("bezorgen"):
        opties.append("bezorgen")
    alle = [set(p["levering"]) for p in w["producten"] if str(p["id"]) in m["regels"]]
    for l in ("ophalen", "verzenden"):
        if alle and all(l in x for x in alle):
            opties.append(l)
    if not opties:
        st.caption("Deze producten kun je niet samen bestellen. Haal er een weg.")
        return
    with st.form(f"afrekenen_{adres}", border=False):
        levering = st.radio("Hoe?", opties, horizontal=True, format_func=lambda l: samen.LEVERING[l][2:],
                            label_visibility="collapsed")
        bezorgadres = st.text_input("Bezorgadres", value=opslag.instellingen().get("thuisadres", ""),
                                    placeholder="Bijv. Dorpsstraat 1, Ede")
        k1, k2 = st.columns(2)
        bericht = k1.text_input("Opmerking", placeholder="Optioneel")
        code = k2.text_input("Kortingscode", placeholder="Optioneel", max_chars=20)
        kosten = {"bezorgen": w.get("bezorgkosten") or 0,
                  "verzenden": 0 if w.get("gratis_vanaf") and sub >= w["gratis_vanaf"] else w["verzendkosten"]}
        st.caption(f"Producten {samen.euro(sub)}"
                   + (f" · bezorgen {samen.euro(kosten['bezorgen'])}" if "bezorgen" in opties else "")
                   + (f" · verzenden {samen.euro(kosten['verzenden'])}" if "verzenden" in opties else ""))
        if st.form_submit_button("Bestellen en betalen", type="primary", width="stretch"):
            if (b := _fout(winkelen.afrekenen, adres, levering, bezorgadres if levering == "bezorgen" else "",
                           bericht.strip(), code.strip())) is not None:
                st.session_state.winkelen_besteld = b
                st.session_state.pop("winkelen_winkel", None)
                st.rerun()
