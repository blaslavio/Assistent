"""Scherm 🥽 VR-ruimtes: ruimtes van anderen bekijken en je eigen project laten zien."""

from urllib.parse import quote, urlsplit

import streamlit as st

import ruimte
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
    if not r["dingen"]:
        st.info("Deze ruimte is nog leeg. Voeg foto's, teksten of een 3D-model toe bij Mijn ruimtes.")
        return
    st.iframe(ruimte.html(r), height=560)
    st.caption("Veeg om rond te kijken. Met ◀ ▶ loop je van ding naar ding; tik op iets voor uitleg. "
               "Met een VR-bril (zoals Meta Quest) open je de app in de browser van de bril en tik je op VR.")
    if r["omschrijving"]:
        with st.expander("Over deze ruimte"):
            st.write(r["omschrijving"])
    if r.get("openbaar"):
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
    """Pagina 🥽 VR-ruimtes."""
    if (open_id := st.session_state.get("open_ruimte")) is not None:
        if st.button("Alle ruimtes", icon=":material/arrow_back:", type="tertiary"):
            st.session_state.pop("open_ruimte", None)
            st.rerun()
        bekijken(open_id)
        return
    keuze = st.segmented_control("Ruimtes", ["Ontdekken", "Mijn ruimtes"], default="Ontdekken",
                                 key="ruimtes_keuze", label_visibility="collapsed") or "Ontdekken"
    if keuze == "Mijn ruimtes":
        mijn_ruimtes()
    else:
        ontdekken()


def ontdekken() -> None:
    alle = ruimte.zoeken("")
    zoek = zoekveld.zoekveld("ruimte_zoek", "Zoek een ruimte, project of expositie", [
        zoekveld.suggestie(r["titel"], r.get("maker") or "", "🖼️", zoek=r.get("omschrijving", "")) for r in alle[:200]])
    ruimtes = ruimte.zoeken(zoek) if zoek else alle
    if not ruimtes:
        st.caption("Geen ruimtes gevonden." if zoek else
                   "Nog geen openbare ruimtes. Maak de eerste bij Mijn ruimtes: laat je project, kunst, verbouwing "
                   "of schoolwerk zien in 3D.")
    kolommen = st.columns(2)
    for i, r in enumerate(ruimtes):
        with kolommen[i % 2].container(border=True):
            if r.get("omslag"):
                st.image(f"data:image/jpeg;base64,{r['omslag']}", width="stretch")
            st.markdown(f"**{r['titel']}**")
            st.caption(f"{ruimte.THEMAS.get(r['thema'], '')} · van {r['maker']} · {r['items']} dingen · "
                       f"{r['bezoeken']}× bezocht")
            if st.button("Binnenstappen", key=f"stap_{r['id']}", width="stretch"):
                st.session_state.open_ruimte = r["id"]
                st.rerun()


def ruimte_formulier(sleutel: str, r: dict | None = None) -> None:
    r = r or {}
    with st.form(sleutel, border=False):
        titel = st.text_input("Titel", value=r.get("titel", ""), max_chars=80,
                              placeholder="Bijv. Mijn verbouwing, Eindexamenwerk, Schilderijen 2026")
        omschrijving = st.text_area("Over je project", value=r.get("omschrijving", ""), height=90)
        thema = st.selectbox("Sfeer", list(ruimte.THEMAS), format_func=ruimte.THEMAS.get,
                             index=list(ruimte.THEMAS).index(r.get("thema", "galerie")))
        kleur = st.color_picker("Accentkleur", value=r.get("kleur", "#2563eb"))
        openbaar = st.toggle("Openbaar: iedereen kan binnenstappen", value=bool(r.get("openbaar")),
                             help="Uit: alleen jij ziet de ruimte. Aan: hij staat bij Ontdekken en je kunt de link delen.")
        if st.form_submit_button("Opslaan", type="primary"):
            if (nieuw := _fout(ruimte.opslaan, titel.strip(), omschrijving, thema, kleur, openbaar, r.get("id"))) is not None:
                st.session_state.bewerk_ruimte = nieuw
                st.rerun()


def mijn_ruimtes() -> None:
    with st.expander("Nieuwe ruimte"):
        st.caption("Laat een project zien in een 3D-ruimte: foto's aan de muur, teksten op borden en 3D-modellen "
                   "op een sokkel. Deel alleen wat je zelf hebt gemaakt, en geen herkenbare mensen zonder hun toestemming.")
        ruimte_formulier("nieuwe_ruimte")
    ruimtes = ruimte.mijn_ruimtes()
    if not ruimtes:
        st.caption("Je hebt nog geen ruimtes.")
    for r in ruimtes:
        status = "openbaar" if r["openbaar"] and not r["verborgen"] else "verborgen na meldingen" if r["verborgen"] else "alleen jij"
        with st.expander(f"{r['titel']} · {r['items']} dingen · {status}",
                         expanded=st.session_state.get("bewerk_ruimte") == r["id"]):
            ruimte_bewerken(r)


def ruimte_bewerken(r: dict) -> None:
    k1, k2 = st.columns(2)
    if k1.button("Binnenstappen", key=f"kijk_{r['id']}", width="stretch", type="primary"):
        st.session_state.open_ruimte = r["id"]
        st.rerun()
    with k2.popover("Verwijderen", width="stretch"):
        st.write("Deze ruimte en alles erin verwijderen?")
        if st.button("Ja, verwijderen", key=f"weg_{r['id']}", type="primary"):
            _fout(ruimte.weg, r["id"])
            st.rerun()
    with st.popover("Titel, sfeer en openbaar"):
        ruimte_formulier(f"wijzig_ruimte_{r['id']}", r)

    st.markdown("**Toevoegen**")
    soort = st.segmented_control("Wat wil je toevoegen?", ["Foto's", "Tekst", "3D-model"], default="Foto's",
                                 key=f"soort_{r['id']}", label_visibility="collapsed")
    if soort == "Foto's":
        with st.form(f"fotos_{r['id']}", clear_on_submit=True, border=False):
            fotos = st.file_uploader("Foto's (je kunt er meer tegelijk kiezen)", type=["jpg", "jpeg", "png", "heic", "webp"],
                                     accept_multiple_files=True)
            titel = st.text_input("Titel bij de foto (optioneel)")
            tekst = st.text_area("Uitleg (optioneel)", height=70)
            if st.form_submit_button("Ophangen", type="primary") and fotos:
                with st.spinner("Foto's ophangen..."):
                    for foto in fotos:
                        if _fout(ruimte.foto_toevoegen, r["id"], foto.getvalue(), titel.strip(), tekst.strip()) is None:
                            break
                st.session_state.bewerk_ruimte = r["id"]
                st.rerun()
    elif soort == "Tekst":
        with st.form(f"tekst_{r['id']}", clear_on_submit=True, border=False):
            titel = st.text_input("Titel")
            tekst = st.text_area("Tekst", height=110)
            if st.form_submit_button("Op een bord zetten", type="primary"):
                if _fout(ruimte.tekst_toevoegen, r["id"], titel.strip(), tekst.strip()) is not None:
                    st.session_state.bewerk_ruimte = r["id"]
                    st.rerun()
    elif soort == "3D-model":
        st.caption("Een 3D-model als .glb (tot 4 MB). Op de iPhone of iPad maak je dat bijvoorbeeld met een "
                   "3D-scan-app zoals Polycam of Scaniverse; exporteer dan als GLB.")
        with st.form(f"model_{r['id']}", clear_on_submit=True, border=False):
            model = st.file_uploader("3D-model (.glb)", type=["glb"])
            titel = st.text_input("Titel (optioneel)")
            tekst = st.text_area("Uitleg (optioneel)", height=70)
            if st.form_submit_button("Op de sokkel zetten", type="primary") and model:
                if _fout(ruimte.model_toevoegen, r["id"], model.getvalue(), titel.strip(), tekst.strip()) is not None:
                    st.session_state.bewerk_ruimte = r["id"]
                    st.rerun()

    dingen = ruimte.inhoud(r["id"])
    if dingen:
        st.markdown("**In de ruimte** (in deze volgorde loop je erlangs)")
    for i, d in enumerate(dingen):
        k1, k2, k3, k4 = st.columns([1, 4, 1, 1], vertical_alignment="center")
        if d["klein"]:
            k1.image(f"data:image/jpeg;base64,{d['klein']}", width=56)
        else:
            k1.markdown("🧊" if d["soort"] == "model" else "📝")
        k2.markdown(f"{d['titel'] or {'foto': 'Foto', 'tekst': 'Tekst', 'model': '3D-model'}[d['soort']]}"
                    + (f"  \n:gray[{d['tekst'][:60]}]" if d["tekst"] else ""))
        if k3.button("↑", key=f"op_{d['id']}", disabled=i == 0, help="Eerder in de ruimte"):
            _fout(ruimte.verplaatsen, d["id"], -1)
            st.session_state.bewerk_ruimte = r["id"]
            st.rerun()
        if k4.button("🗑️", key=f"dweg_{d['id']}", help="Weghalen"):
            _fout(ruimte.item_weg, d["id"])
            st.session_state.bewerk_ruimte = r["id"]
            st.rerun()
