"""Pagina Documenten: een lijst van je documenten en de editor om erin te werken.

Alles wordt vanzelf bewaard, kort nadat je stopt met typen. Staat hetzelfde document open op een ander apparaat,
dan haalt dat scherm de nieuwe tekst vanzelf op. Hebben twee apparaten tegelijk iets veranderd, dan kies je zelf
welke versie je houdt.
"""

from datetime import datetime, timedelta

import streamlit as st

import avatar
import documenten
import editor
import opslag
import zoekveld

TYPES = ["docx", "pdf", "txt", "md", "html"]


def apparaat() -> str:
    tekst = st.context.headers.get("User-Agent", "") if st.context.headers else ""
    return next((n for k, n in (("iPad", "iPad"), ("iPhone", "iPhone"), ("Android", "Android"), ("Macintosh", "Mac"),
                                ("Windows", "Windows"), ("Linux", "Linux")) if k in tekst), "")


def wanneer(moment: str) -> str:
    try:
        tijd = datetime.fromisoformat(moment).astimezone()
    except (TypeError, ValueError):
        return ""
    vandaag = datetime.now().astimezone().date()
    if tijd.date() == vandaag:
        return f"vandaag {tijd:%H:%M}"
    if tijd.date() == vandaag - timedelta(days=1):
        return f"gisteren {tijd:%H:%M}"
    maanden = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
    return f"{tijd.day} {maanden[tijd.month - 1]}" + (f" {tijd.year}" if tijd.year != vandaag.year else "")


def vraag_assistent(vraag: str, label: str) -> None:
    st.session_state.vooraf_vraag = vraag
    st.session_state.vooraf_label = label
    st.session_state.ga_naar = "assistent"
    st.rerun(scope="app")


def _account() -> None:
    """Knoppen en stukjes die zichzelf bijwerken draaien buiten de gewone run: eerst het account kiezen."""
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))


def openen(document_id: int) -> None:
    """Haalt de nieuwste versie op en zet hem klaar voor de editor."""
    _account()
    doc = documenten.lezen(document_id)
    vorig = st.session_state.get("_doc") or {}
    st.session_state._doc = {**doc, "laad": vorig.get("laad", 0) + 1, "bewaard_om": None}
    st.session_state.open_document = document_id
    st.session_state.pop("_doc_conflict", None)


def sluiten() -> None:
    st.session_state.pop("open_document", None)
    st.session_state.pop("_doc", None)
    st.session_state.pop("_doc_conflict", None)


def pagina() -> None:
    document_id = st.session_state.get("open_document")
    if document_id:
        try:
            bewerken(document_id)
            return
        except documenten.Fout as fout:
            st.warning(str(fout))
            sluiten()
    overzicht()


# --- Overzicht ------------------------------------------------------------------------------------------------------

def overzicht() -> None:
    with st.container(horizontal=True, gap="small", vertical_alignment="center"):
        if st.button("Nieuw document", icon=":material/add:", type="primary"):
            doc = documenten.maken("Naamloos document", "", apparaat())
            openen(doc["id"])
            st.rerun()
        with st.popover("Importeren", icon=":material/upload_file:"):
            bestand = st.file_uploader("Word, PDF of tekst", type=TYPES, key="doc_import")
            if bestand is not None and st.button("Openen als document", type="primary", width="stretch"):
                try:
                    titel, inhoud = documenten.importeren(bestand.name, bestand.getvalue())
                    doc = documenten.maken(titel, inhoud, apparaat())
                except documenten.Fout as fout:
                    st.error(str(fout))
                except Exception:
                    st.error("Dit bestand kon ik niet lezen. Probeer het als Word-bestand (.docx) of PDF.")
                else:
                    openen(doc["id"])
                    st.rerun()
        alle = documenten.lijst("")
        with st.container(width=240):
            zoek = zoekveld.zoekveld("doc_zoek", "Zoeken", [
                zoekveld.suggestie(d["titel"] or "Naamloos", (d.get("gewijzigd") or "")[:10], "📄") for d in alle[:200]])

    lijst = documenten.lijst(zoek) if zoek else alle
    if not lijst:
        st.caption("Geen documenten gevonden." if zoek else
                   "Nog geen documenten. Tik op Nieuw document. Wat je hier schrijft, staat meteen ook op je "
                   "andere apparaten: open de app in Safari, Chrome of Edge op je iPhone, Mac of Windows-computer.")
    for doc in lijst:
        with st.container(border=True, gap=None):
            st.button(doc["titel"] or "Naamloos document", key=f"doc_open_{doc['id']}", type="tertiary",
                      icon=":material/description:", on_click=openen, args=(doc["id"],))
            details = [wanneer(doc["gewijzigd"]), doc.get("apparaat") or "",
                       f"{doc['woorden']} {'woord' if doc['woorden'] == 1 else 'woorden'}"]
            st.caption(" · ".join(d for d in details if d) + (f"  \n{doc['fragment']}" if doc["fragment"] else ""))

    weg = documenten.lijst("", prullenbak=True)
    if weg:
        with st.expander(f"Prullenbak ({len(weg)})", icon=":material/delete:"):
            for doc in weg:
                kol1, kol2, kol3 = st.columns([4, 2, 2], vertical_alignment="center")
                kol1.markdown(f"{doc['titel'] or 'Naamloos document'}  \n:gray[{wanneer(doc['gewijzigd'])}]")
                if kol2.button("Terugzetten", key=f"doc_terug_{doc['id']}", width="stretch"):
                    documenten.weg(doc["id"], False)
                    st.rerun()
                with kol3.popover("Verwijderen", width="stretch"):
                    st.caption("Het document en alle eerdere versies zijn daarna echt weg.")
                    if st.button("Definitief verwijderen", key=f"doc_wis_{doc['id']}", type="primary"):
                        documenten.wissen(doc["id"])
                        st.rerun()


# --- Bewerken -------------------------------------------------------------------------------------------------------

def bewerken(document_id: int) -> None:
    doc = st.session_state.get("_doc")
    if not doc or doc.get("id") != document_id:
        openen(document_id)
    elif not st.session_state.get("_doc_conflict"):
        # Elders gewijzigd sinds dit scherm de tekst ophaalde (bijvoorbeeld op je iPad, of door de assistent)?
        if documenten.stand(document_id)["versie"] > doc["versie"]:
            openen(document_id)

    with st.container(horizontal=True, vertical_alignment="center"):
        if st.button("Documenten", icon=":material/arrow_back:", type="tertiary"):
            sluiten()
            st.rerun()
        st.space("stretch")
        meer_menu(document_id)

    if st.session_state.pop("_doc_versies", False) or st.session_state.get("_doc_versies_open"):
        eerdere_versies(document_id)
    schrijven()
    meekijken()


def meer_menu(document_id: int) -> None:
    doc = st.session_state._doc
    with st.popover("Meer", icon=":material/more_horiz:"):
        titel = doc["titel"] or "document"
        st.download_button("Word (.docx)", lambda: documenten.naar_word(titel, st.session_state._doc.get("html", "")),
                           file_name=documenten.bestandsnaam(titel, "docx"), icon=":material/download:",
                           mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                           width="stretch", on_click="ignore")
        st.download_button("PDF", lambda: documenten.naar_pdf(titel, st.session_state._doc.get("html", "")),
                           file_name=documenten.bestandsnaam(titel, "pdf"), mime="application/pdf",
                           icon=":material/download:", width="stretch", on_click="ignore")
        st.download_button("Tekst (.txt)", lambda: documenten.naar_tekst(st.session_state._doc.get("html", "")),
                           file_name=documenten.bestandsnaam(titel, "txt"), mime="text/plain",
                           icon=":material/download:", width="stretch", on_click="ignore")
        st.divider()
        naam = avatar.aanspreken(avatar.instellingen(opslag.instellingen()))
        if st.button(f"Vraag {naam}", icon=":material/chat_bubble:", width="stretch"):
            vraag_assistent(f"Ik werk aan mijn document \"{titel}\" (document {document_id}). Lees het met "
                            "document_lezen en vraag wat ik wil: verbeteren, samenvatten, aanvullen of iets anders. "
                            "Verander niets in het document zonder dat ik dat vraag.",
                            f"Help me met \"{titel}\"")
        if st.button("Eerdere versies", icon=":material/history:", width="stretch"):
            st.session_state._doc_versies_open = True
            st.rerun()
        if st.button("Naar prullenbak", icon=":material/delete:", width="stretch"):
            documenten.weg(document_id)
            sluiten()
            st.rerun()


def eerdere_versies(document_id: int) -> None:
    with st.container(border=True):
        kol1, kol2 = st.columns([5, 1], vertical_alignment="center")
        kol1.markdown("**Eerdere versies**")
        if kol2.button("Sluiten", key="doc_versies_dicht", type="tertiary"):
            st.session_state._doc_versies_open = False
            st.rerun()
        lijst = documenten.versies(document_id)
        if not lijst:
            st.caption("Nog geen eerdere versies.")
        for v in lijst:
            kol1, kol2 = st.columns([4, 1], vertical_alignment="center")
            kol1.markdown(f"{wanneer(v['bewaard'])}" + (f" · {v['apparaat']}" if v["apparaat"] else "")
                          + f"  \n:gray[{v['fragment'] or v['titel']}]")
            if kol2.button("Terugzetten", key=f"doc_v_{v['id']}", width="stretch"):
                documenten.terugzetten(v["id"], apparaat())
                st.session_state._doc_versies_open = False
                openen(document_id)
                st.toast("Versie teruggezet. Je vorige tekst staat nu bij de eerdere versies.")
                st.rerun()


def _bewaar(**velden) -> None:
    """Slaat de titel of de tekst op en houdt het versienummer bij; een botsing wordt een keuze voor de gebruiker."""
    doc = st.session_state._doc
    try:
        nieuw = documenten.opslaan(doc["id"], versie=doc["versie"], apparaat=apparaat(), **velden)
    except documenten.Conflict as conflict:
        st.session_state._doc_conflict = {"anders": conflict.document, **velden}
        return
    doc["versie"] = nieuw["versie"]
    doc["bewaard_om"] = datetime.now()
    if "titel" in velden:
        doc["titel"] = nieuw["titel"]
    if "html_tekst" in velden:
        doc["html"] = velden["html_tekst"]
        doc["inhoud"] = velden.get("inhoud")
        doc["woorden"] = len(documenten.naar_tekst(velden["html_tekst"]).split())


@st.fragment
def schrijven() -> None:
    _account()
    doc = st.session_state._doc
    sleutel = f"{doc['id']}_{doc['laad']}"

    def titel_gewijzigd() -> None:
        _account()
        nieuw = (st.session_state.get(f"doc_titel_{sleutel}") or "").strip()
        if nieuw and nieuw != doc["titel"]:
            _bewaar(titel=nieuw)

    def tekst_gewijzigd() -> None:
        st.session_state._doc_eigen = True

    st.text_input("Titel", value=doc["titel"], key=f"doc_titel_{sleutel}", label_visibility="collapsed",
                  placeholder="Titel", on_change=titel_gewijzigd)
    conflict()
    eigen = st.session_state.pop("_doc_eigen", False)
    wijziging = editor.editor(f"doc_editor_{doc['id']}", sleutel, doc.get("inhoud"), doc.get("html") or "",
                              stuur_inhoud=not eigen, bij_wijziging=tekst_gewijzigd)
    if wijziging and wijziging.get("geladen") == sleutel and wijziging.get("n") != doc.get("n"):
        doc["n"] = wijziging["n"]
        if botsing := st.session_state.get("_doc_conflict"):
            # Nog geen keuze gemaakt: onthoud de nieuwste eigen tekst voor "Die van mij".
            botsing |= {"inhoud": wijziging.get("delta"), "html_tekst": wijziging.get("html") or ""}
        else:
            _bewaar(inhoud=wijziging.get("delta"), html_tekst=wijziging.get("html") or "")
            if st.session_state.get("_doc_conflict"):
                st.rerun(scope="fragment")  # de keuze bovenaan tonen
    if doc.get("bewaard_om"):
        status = f"Bewaard om {doc['bewaard_om']:%H:%M}"
    else:
        status = "Wijzigingen worden vanzelf bewaard"
    st.caption(f"{status} · {doc.get('woorden', 0)} {'woord' if doc.get('woorden') == 1 else 'woorden'}")


def conflict() -> None:
    botsing = st.session_state.get("_doc_conflict")
    if not botsing:
        return
    anders = botsing["anders"]
    st.warning(f"Dit document is intussen gewijzigd ({wanneer(anders['gewijzigd'])}"
               + (f" op {anders['apparaat']}" if anders.get("apparaat") else "") + "). Welke versie wil je houden?",
               icon=":material/sync_problem:")
    doc = st.session_state._doc
    with st.container(horizontal=True, gap="small"):
        if st.button("De nieuwste", key="doc_c_nieuw"):
            openen(doc["id"])
            st.rerun()
        if st.button("Die van mij", key="doc_c_mijn"):
            st.session_state.pop("_doc_conflict")
            velden = {k: v for k, v in botsing.items() if k != "anders"}
            nieuw = documenten.opslaan(doc["id"], versie=None, apparaat=apparaat(), **velden)
            doc["versie"] = nieuw["versie"]
            doc["bewaard_om"] = datetime.now()
            st.rerun(scope="fragment")
        if st.button("Allebei (als kopie)", key="doc_c_kopie"):
            velden = {k: v for k, v in botsing.items() if k != "anders"}
            html_tekst = velden.get("html_tekst", doc.get("html") or "")
            documenten.maken(f"{doc['titel']} (kopie)", html_tekst, apparaat())
            openen(doc["id"])
            st.toast("Jouw versie staat als kopie bij je documenten.")
            st.rerun()


@st.fragment(run_every=15)
def meekijken() -> None:
    """Kijkt af en toe of het document ergens anders is gewijzigd, en haalt dan de nieuwe tekst op."""
    _account()
    doc = st.session_state.get("_doc")
    if not doc or st.session_state.get("_doc_conflict"):
        return
    bewaard = doc.get("bewaard_om")
    if bewaard and datetime.now() - bewaard < timedelta(seconds=20):
        return  # je bent hier zelf aan het typen
    try:
        stand = documenten.stand(doc["id"])
    except documenten.Fout:
        return
    if stand["versie"] > doc["versie"]:
        openen(doc["id"])
        st.toast("Nieuwe tekst opgehaald" + (f" van {stand['apparaat']}." if stand.get("apparaat") else "."))
        st.rerun(scope="app")
