"""Scherm VR-ruimtes: werelden en spellen van anderen spelen, en je eigen wereld of spel bouwen."""

from urllib.parse import quote, urlsplit

import streamlit as st

import kort
import ruimte
import wereld
import zoekveld


def _fout(functie, *args, **kwargs):
    try:
        return functie(*args, **kwargs)
    except ruimte.Fout as fout:
        st.error(str(fout))
    return None


def link(ruimte_id: int) -> str:
    deel = urlsplit(st.context.url or "")
    basis = f"{deel.scheme}://{deel.netloc}" if deel.netloc else ""
    return f"{basis}/?ruimte={ruimte_id}"


def bekijken(ruimte_id: int, ingelogd: bool = True) -> None:
    """Eén ruimte in 3D, met uitleg, delen en melden."""
    try:
        r = ruimte.bekijken(ruimte_id)
    except ruimte.Fout as fout:
        st.error(str(fout))
        return
    st.markdown(f"**{r['titel']}** · van {r['maker']}")
    if r.get("bouw"):
        breed()
        st.iframe(wereld.html(r, "spelen", hoogte=600, met_sessie=ingelogd), height=600)
        st.caption("Links slepen om te lopen, rechts vegen om rond te kijken. Met een VR-bril (zoals Meta Quest) "
                   "open je de app in de browser van de bril en tik je op VR.")
    elif not r["dingen"]:
        st.info("Deze ruimte is nog leeg." + (" Tik op Bouwen om te beginnen." if r.get("van_mij") else ""))
    else:
        st.iframe(ruimte.html(r), height=560)
        st.caption("Veeg om rond te kijken. Met ◀ ▶ loop je van ding naar ding; tik op iets voor uitleg. "
                   "Met een VR-bril (zoals Meta Quest) open je de app in de browser van de bril en tik je op VR.")
    if r.get("van_mij"):
        if st.button("Bouwen", icon=":material/construction:", key=f"naar_bouwen_{r['id']}"):
            st.session_state.pop("open_ruimte", None)
            st.session_state.bouw_ruimte = r["id"]
            st.rerun()
    elif ingelogd and r.get("bouw"):
        if st.button("Kopie maken om zelf verder te bouwen", icon=":material/content_copy:", key=f"kopie_{r['id']}"):
            if (nieuw := _fout(ruimte.kopie, r["id"])) is not None:
                st.session_state.pop("open_ruimte", None)
                st.session_state.bouw_ruimte = nieuw
                st.rerun()
    if r["omschrijving"]:
        with st.expander("Over deze ruimte"):
            st.write(r["omschrijving"])
    if r.get("openbaar") and r.get("van_mij"):
        kort.deel_blok("ruimte", str(r["id"]), r["titel"], f"ruimte_{r['id']}")
    elif r.get("openbaar"):
        adres = link(r["id"])
        k1, k2 = st.columns(2)
        k1.link_button("Delen via WhatsApp", f"https://wa.me/?text={quote(r['titel'] + ': ' + adres)}",
                       width="stretch")
        with k2.popover("Link", width="stretch"):
            st.code(adres, language=None)
    if ingelogd and not r.get("van_mij"):
        with st.popover("Melden"):
            with st.form(f"meld_ruimte_{r['id']}", clear_on_submit=True, border=False):
                reden = st.text_area("Wat klopt er niet?", height=80)
                if st.form_submit_button("Melden") and reden.strip():
                    if _fout(ruimte.melden, r["id"], reden.strip()) is not None:
                        st.success("Bedankt, de beheerder kijkt ernaar.")


def pagina() -> None:
    """Pagina VR-ruimtes."""
    if (bouw_id := st.session_state.get("bouw_ruimte")) is not None:
        bouwer(bouw_id)
        return
    if (open_id := st.session_state.get("open_ruimte")) is not None:
        if st.button("Alle werelden", icon=":material/arrow_back:", type="tertiary"):
            st.session_state.pop("open_ruimte", None)
            st.rerun()
        bekijken(open_id)
        return
    keuze = st.segmented_control("Ruimtes", ["Ontdekken", "Mijn werelden"], default="Ontdekken",
                                 key="ruimtes_keuze", label_visibility="collapsed") or "Ontdekken"
    if keuze == "Mijn werelden":
        mijn_ruimtes()
    else:
        ontdekken()


def ontdekken() -> None:
    alle = ruimte.zoeken("")
    zoek = zoekveld.zoekveld("ruimte_zoek", "Zoek een wereld, spel of expositie", [
        zoekveld.suggestie(r["titel"], r.get("maker") or "", "🖼️", zoek=r.get("omschrijving", "")) for r in alle[:200]])
    ruimtes = ruimte.zoeken(zoek) if zoek else alle
    if not ruimtes:
        st.caption("Niets gevonden." if zoek else
                   "Nog geen openbare werelden. Bouw de eerste bij Mijn werelden: een spel, een parcours, een quiz "
                   "of een expositie van je werk.")
    kolommen = st.columns(2)
    for i, r in enumerate(ruimtes):
        with kolommen[i % 2].container(border=True):
            if r.get("omslag"):
                st.image(f"data:image/jpeg;base64,{r['omslag']}", width="stretch")
            st.markdown(f"**{r['titel']}**")
            st.caption(f"{soort_tekst(r)} · van {r['maker']} · {r['bezoeken']}× bezocht")
            if st.button("Spelen" if r.get("spel") else "Binnenstappen", key=f"stap_{r['id']}", width="stretch"):
                st.session_state.open_ruimte = r["id"]
                st.rerun()


def soort_tekst(r: dict) -> str:
    if r.get("spel"):
        return "Spel"
    return "Wereld" if r.get("gebouwd") else "Expositie"


def ruimte_formulier(sleutel: str, r: dict | None = None) -> None:
    r = r or {}
    with st.form(sleutel, border=False):
        titel = st.text_input("Naam", value=r.get("titel", ""), max_chars=80, placeholder="Bijv. Het grote parcours")
        omschrijving = st.text_area("Over je wereld (optioneel)", value=r.get("omschrijving", ""), height=80)
        openbaar = st.toggle("Openbaar: iedereen kan hem spelen", value=bool(r.get("openbaar")),
                             help="Uit: alleen jij ziet hem. Aan: hij staat bij Ontdekken en je kunt de link delen.")
        if st.form_submit_button("Opslaan" if r else "Maken en gaan bouwen", type="primary"):
            if (nieuw := _fout(ruimte.opslaan, titel.strip(), omschrijving, r.get("thema", "galerie"),
                               r.get("kleur", "#4f46e5"), openbaar, r.get("id"))) is not None:
                if not r:
                    st.session_state.bouw_ruimte = nieuw
                st.rerun()


def mijn_ruimtes() -> None:
    with st.popover("Nieuwe wereld", icon=":material/add:", type="primary"):
        st.caption("Bouw een eigen wereld of spel: begin met een park, parcours, doolhof, quiz of expositie, "
                   "of met een leeg veld. Deel alleen wat je zelf hebt gemaakt.")
        ruimte_formulier("nieuwe_ruimte")
    ruimtes = ruimte.mijn_ruimtes()
    if not ruimtes:
        st.caption("Je hebt nog geen werelden.")
    kolommen = st.columns(2)
    for i, r in enumerate(ruimtes):
        status = ("verborgen na meldingen" if r["verborgen"] else "openbaar" if r["openbaar"] else "alleen jij")
        with kolommen[i % 2].container(border=True):
            if r.get("omslag"):
                st.image(f"data:image/jpeg;base64,{r['omslag']}", width="stretch")
            st.markdown(f"**{r['titel']}**")
            st.caption(f"{soort_tekst(r)} · {status} · {r['bezoeken']}× bezocht")
            if st.button("Bouwen", key=f"bouw_{r['id']}", width="stretch", type="primary"):
                st.session_state.bouw_ruimte = r["id"]
                st.rerun()
            k1, k2 = st.columns(2)
            if k1.button("Spelen", key=f"kijk_{r['id']}", width="stretch"):
                st.session_state.open_ruimte = r["id"]
                st.rerun()
            with k2.popover("Meer", width="stretch"):
                ruimte_formulier(f"wijzig_ruimte_{r['id']}", r)
                st.divider()
                if st.toggle("Verwijderen", key=f"weg_vraag_{r['id']}"):
                    if st.button("Ja, deze wereld verwijderen", key=f"weg_{r['id']}", type="primary"):
                        _fout(ruimte.weg, r["id"])
                        st.rerun()


def breed() -> None:
    """Een wereld mag de hele breedte van het scherm gebruiken (op een iPad of computer)."""
    # Geen invoerbalk van de assistent eroverheen: die zou de knoppen onderin de wereld bedekken.
    st.html("<style>[data-testid=stMainBlockContainer]{max-width:min(1400px,100%);padding-bottom:24px}"
            "[data-testid=stBottom]{display:none}</style>")


def bouwer(ruimte_id: int) -> None:
    """De bouwer: de wereld groot in beeld, foto's en 3D-modellen eronder."""
    try:
        r = ruimte.bekijken(ruimte_id)
    except ruimte.Fout as fout:
        st.error(str(fout))
        st.session_state.pop("bouw_ruimte", None)
        return
    k1, k2 = st.columns([1, 1], vertical_alignment="center")
    if k1.button("Mijn werelden", icon=":material/arrow_back:", type="tertiary"):
        st.session_state.pop("bouw_ruimte", None)
        st.rerun()
    if k2.button("Spelen zoals bezoekers", icon=":material/sports_esports:", type="tertiary"):
        st.session_state.pop("bouw_ruimte", None)
        st.session_state.open_ruimte = ruimte_id
        st.rerun()
    if not r.get("van_mij"):
        st.error("Je kunt alleen je eigen werelden bouwen.")
        return
    breed()
    st.iframe(wereld.html(r, "bouwen", hoogte=640), height=640)
    st.caption("Tik op + Toevoegen en kies iets. Tik op een ding om het te verplaatsen, draaien, kleuren of weg te halen; "
               "sleep het met je vinger. Eén vinger draait het beeld, twee vingers zoomen en schuiven. "
               "Alles wordt vanzelf bewaard.")
    with st.expander("Foto's en 3D-modellen"):
        foto_en_modellen(r)


def foto_en_modellen(r: dict) -> None:
    st.caption("Wat je hier toevoegt, vind je in de bouwer bij + Toevoegen › Mijn foto's.")
    soort = st.segmented_control("Wat wil je toevoegen?", ["Foto's", "3D-model"], default="Foto's",
                                 key=f"soort_{r['id']}", label_visibility="collapsed")
    if soort == "Foto's":
        with st.form(f"fotos_{r['id']}", clear_on_submit=True, border=False):
            fotos = st.file_uploader("Foto's (je kunt er meer tegelijk kiezen)", type=["jpg", "jpeg", "png", "heic", "webp"],
                                     accept_multiple_files=True)
            titel = st.text_input("Titel (optioneel)")
            tekst = st.text_area("Uitleg (optioneel)", height=70)
            if st.form_submit_button("Toevoegen", type="primary") and fotos:
                with st.spinner("Foto's toevoegen..."):
                    for foto in fotos:
                        if _fout(ruimte.foto_toevoegen, r["id"], foto.getvalue(), titel.strip(), tekst.strip()) is None:
                            break
                st.rerun()
    else:
        st.caption("Een .glb-bestand tot 4 MB, bijvoorbeeld uit Reality Composer, Polycam of Blender.")
        with st.form(f"model_{r['id']}", clear_on_submit=True, border=False):
            model = st.file_uploader("3D-model (.glb)", type=["glb"])
            titel = st.text_input("Titel (optioneel)")
            tekst = st.text_area("Uitleg (optioneel)", height=70)
            if st.form_submit_button("Toevoegen", type="primary") and model:
                if _fout(ruimte.model_toevoegen, r["id"], model.getvalue(), titel.strip(), tekst.strip()) is not None:
                    st.rerun()
    for d in ruimte.inhoud(r["id"]):
        if d["soort"] == "tekst":
            continue
        k1, k2, k3 = st.columns([1, 5, 1], vertical_alignment="center")
        if d["klein"]:
            k1.image(f"data:image/jpeg;base64,{d['klein']}", width=56)
        else:
            k1.markdown(":material/view_in_ar:")
        k2.markdown(d["titel"] or ("Foto" if d["soort"] == "foto" else "3D-model"))
        if k3.button("", icon=":material/delete:", key=f"dweg_{d['id']}", help="Weghalen"):
            _fout(ruimte.item_weg, d["id"])
            st.rerun()
