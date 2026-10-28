"""Cursussen: online cursussen volgen, en voor de eigenaar van een community cursussen en abonnementen verkopen.
Cursussen horen bij een community in de chat (zie cursus.py)."""

from datetime import datetime

import streamlit as st

import cursus
import documenten
import samen
import samen_scherm
import slim
import werk_scherm


def _fout(functie, *args, **kwargs):
    try:
        return functie(*args, **kwargs)
    except samen.Fout as fout:
        st.error(str(fout))
        return None


def _gelukt(functie, *args, **kwargs) -> bool:
    try:
        functie(*args, **kwargs)
        return True
    except samen.Fout as fout:
        st.error(str(fout))
        return False


def _datum(tekst: str | None) -> str:
    try:
        return datetime.fromisoformat(str(tekst)).strftime("%d-%m-%Y")
    except ValueError:
        return ""


def _voortgang(c: dict) -> None:
    if c.get("lessen"):
        st.progress(min(1.0, c["klaar"] / c["lessen"]), text=f"{c['klaar']} van {c['lessen']} lessen klaar")


def _over(c: dict) -> str:
    delen = [f"{c['lessen']} lessen" if c.get("lessen") != 1 else "1 les"]
    if c.get("minuten"):
        delen.append(f"{c['minuten']} min")
    if c.get("community_naam"):
        delen.append(c["community_naam"])
    return " · ".join(delen)


def _label(c: dict) -> str:
    s = cursus.soort(c)
    if c.get("gekocht"):
        return "Gekocht"
    if s == "koop":
        return cursus.prijs(c["prijs_cent"])
    return cursus.SOORTEN[s]


def pagina() -> None:
    if not samen.beschikbaar():
        st.info("Cursussen werken alleen in de online versie.")
        return
    if m := st.session_state.pop("cursus_melding", None):
        st.toast(m, icon=":material/check:")
    if (c := st.session_state.pop("cursus_community", None)) is not None:
        st.session_state.cursus_bij = int(c)
        st.session_state.pop("cursus_open", None)
    if st.session_state.get("cursus_open"):
        bekijken(int(st.session_state.cursus_open))
    elif st.session_state.get("cursus_bij"):
        community(int(st.session_state.cursus_bij))
    else:
        tab_cursussen, tab_documenten = st.tabs(["Cursussen", "Documenten"])
        with tab_cursussen:
            overzicht()
        with tab_documenten:
            documenten_hub()


def documenten_hub() -> None:
    """Toon bestaande centrale documenten; geen fictieve synchronisatie of client-side adminrechten."""
    st.subheader("Academie & documenten")
    st.caption("Documenten worden rechtstreeks uit je bestaande accountopslag geladen. "
               "Wijzigingen en versieconflicten worden afgehandeld in de documentenmodule.")
    zoek = st.text_input("Document zoeken", key="academie_doc_zoek")
    if st.button("Vernieuwen", key="academie_doc_vernieuw"):
        st.rerun()
    try:
        items = documenten.lijst(zoek=zoek)
    except Exception:
        st.error("Documenten konden niet worden geladen. Probeer het opnieuw.")
        return
    if not items:
        st.info("Geen documenten gevonden.")
        return
    for doc in items:
        with st.container(border=True):
            st.markdown(f"**{doc.get('titel') or 'Naamloos document'}**")
            st.caption(f"Versie {doc.get('versie', 'onbekend')}")
            if st.button("Openen in Documenten", key=f"academie_doc_{doc['id']}"):
                st.session_state.open_document = int(doc["id"])
                st.session_state.ga_naar = "documenten"
                st.rerun()


def _openen(cursus_id: int) -> None:
    st.session_state.cursus_open = cursus_id
    st.rerun()


def _kaart(c: dict, key: str) -> None:
    with st.container(border=True):
        with st.container(horizontal=True, vertical_alignment="center"):
            st.markdown(f"**{c['titel']}**", width="stretch")
            st.caption(_label(c) if c.get("gepubliceerd", True) else "Verborgen", width="content")
        st.caption(_over(c))
        if c.get("toegang") and c.get("klaar"):
            _voortgang(c)
        if c.get("kopers") is not None:
            st.caption(f"{c['kopers']} keer verkocht")
        tekst = ("Verder" if c.get("klaar") else "Beginnen") if c.get("toegang") else "Bekijken"
        if st.button(tekst, key=f"open_{key}_{c['id']}", width="stretch",
                     type="primary" if c.get("toegang") else "secondary"):
            _openen(c["id"])


def overzicht() -> None:
    m = _fout(cursus.mijn)
    if m is None:
        return
    gezien = set()
    if m["bezig"]:
        st.markdown("**Verder leren**")
        for c in m["bezig"]:
            gezien.add(c["id"])
            _kaart(c, "bezig")
    if nieuw := [c for c in m["gekocht"] if c["id"] not in gezien]:
        st.markdown("**Gekocht**")
        for c in nieuw:
            _kaart(c, "gekocht")
    st.markdown("**Je community's**")
    if not m["communities"]:
        st.caption("Cursussen horen bij een community. Maak er een of word lid via de Chat.")
    for c in m["communities"]:
        with st.container(border=True, horizontal=True, vertical_alignment="center"):
            delen = [f"{c['cursussen']} cursus" + ("sen" if c["cursussen"] != 1 else "")]
            if c["plannen"]:
                delen.append("abonnement")
            if c["beheer"]:
                delen.append("jij bent eigenaar")
            st.markdown(f"**{c['naam']}**  \n:gray[{' · '.join(delen)}]", width="stretch")
            if st.button("Openen", key=f"comm_{c['id']}"):
                st.session_state.cursus_bij = c["id"]
                st.rerun()
    if m["abonnementen"]:
        st.markdown("**Je abonnementen**")
        for a in m["abonnementen"]:
            _abonnement_regel(a, f"ov_{a['plan']}")


def _abonnement_regel(a: dict, key: str) -> None:
    """Je abonnement op een community: tot wanneer, en opzeggen (of toch doorgaan)."""
    with st.container(border=True):
        naam = f"{a.get('community_naam', '')}: {a['naam']}" if a.get("community_naam") else a["naam"]
        prijs = f" · {cursus.prijs(a['prijs_cent'])} per maand" if a.get("prijs_cent") else ""
        st.markdown(f"**{naam}**{prijs}")
        if a["status"] == "past_due":
            st.warning("De laatste betaling is niet gelukt. Stripe probeert het nog een paar keer.")
        if a.get("opzeggen"):
            st.caption(f"Opgezegd. Je hebt toegang tot {_datum(a.get('tot'))}.")
            if st.button("Toch doorgaan", key=f"door_{key}"):
                if _gelukt(cursus.opzeggen, a["plan"], terug=True):
                    st.rerun()
        else:
            st.caption(f"Loopt elke maand door. Volgende betaling {_datum(a.get('tot'))}." if a.get("tot")
                       else "Loopt elke maand door.")
            with st.popover("Opzeggen"):
                st.caption("Je houdt toegang tot het eind van de maand die je al betaalde.")
                if st.button("Ja, opzeggen", key=f"zeg_{key}", type="primary"):
                    if _gelukt(cursus.opzeggen, a["plan"]):
                        st.rerun()


# --- Een community: aanbod, abonnement en (voor de eigenaar) beheer ------------------------------

def community(community_id: int) -> None:
    a = _fout(cursus.aanbod, community_id)
    with st.container(horizontal=True, vertical_alignment="center"):
        if st.button("", icon=":material/arrow_back:", type="tertiary", help="Terug", key="comm_terug"):
            st.session_state.pop("cursus_bij", None)
            st.rerun()
        st.markdown(f"#### {a['naam']}" if a else "#### Community", width="stretch")
    if not a:
        return
    if not a["beheer"]:
        st.caption(f"Van {a['eigenaar']}" + (" · Zakelijk" if a["zakelijk"] else ""))
    if a["beheer"]:
        _beheer_bovenaan(a)
    plannen = a["plannen"]
    if plannen or a["beheer"]:
        st.markdown("**Abonnement**")
        if a["abonnement"]:
            _abonnement_regel(a["abonnement"], f"c_{community_id}")
        elif not plannen:
            st.caption("Nog geen abonnement. Met een abonnement betalen leden per maand en krijgen ze de cursussen "
                       "die je 'Bij abonnement' maakt.")
        for p in plannen if a["beheer"] or not a["abonnement"] else []:
            _plan(a, p)
    st.markdown("**Cursussen**")
    if not a["cursussen"]:
        st.caption("Nog geen cursussen." if not a["beheer"] else "Nog geen cursussen. Maak je eerste cursus hierboven.")
    for c in a["cursussen"]:
        _kaart(c, f"c{community_id}")


def _beheer_bovenaan(a: dict) -> None:
    if not a["kan_ontvangen"]:
        status = _fout(samen.betalen_status) or {}
        if status.get("aan"):
            st.caption("Gratis cursussen kun je meteen maken. Om cursussen of abonnementen te verkopen, meld je je "
                       "eerst aan om betalingen te ontvangen.")
            samen_scherm.verkoper_aanmelden(status)
        else:
            st.caption("Gratis cursussen kun je meteen maken. Betalen via de app staat nog niet aan.")
    with st.container(horizontal=True):
        with st.popover("Nieuwe cursus", icon=":material/add:"):
            _cursus_formulier(a, None)
        if len([p for p in a["plannen"] if p["actief"]]) < 3:
            with st.popover("Nieuw abonnement", icon=":material/autorenew:"):
                _plan_formulier(a, None)


def _plan(a: dict, p: dict) -> None:
    with st.container(border=True):
        with st.container(horizontal=True, vertical_alignment="center"):
            st.markdown(f"**{p['naam']}**", width="stretch")
            st.markdown(f"{cursus.prijs(p['prijs_cent'])} per maand", width="content")
        if p["voordelen"]:
            st.markdown(p["voordelen"])
        if a["beheer"]:
            st.caption(("" if p["actief"] else "Gestopt voor nieuwe leden · ") + f"{p['abonnees']} abonnees")
            with st.popover("Aanpassen", icon=":material/edit:"):
                _plan_formulier(a, p)
        elif not a["abonnement"]:
            if not a["kan_ontvangen"]:
                st.caption("Abonneren kan even niet: de eigenaar kan op dit moment geen betalingen ontvangen.")
            elif url := st.session_state.get(f"abo_url_{p['id']}"):
                st.link_button("Verder naar betalen", url, width="stretch", type="primary")
                st.caption("Je betaalt veilig via Stripe. Opzeggen kan elke maand, hier in de app.")
            elif st.button("Abonneren", key=f"abo_{p['id']}", type="primary", width="stretch"):
                if url := _fout(cursus.abonneren, p["id"]):
                    st.session_state[f"abo_url_{p['id']}"] = url
                    st.rerun()


def _plan_formulier(a: dict, p: dict | None) -> None:
    with st.form(f"plan_{p['id'] if p else 'nieuw'}", border=False):
        naam = st.text_input("Naam", value=p["naam"] if p else "", placeholder="Bijv. Lid plus", max_chars=60)
        prijs = st.number_input("Prijs per maand (€)", min_value=1.0, max_value=500.0, step=0.5, format="%.2f",
                                value=(p["prijs_cent"] / 100) if p else 5.0)
        voordelen = st.text_area("Wat krijgen abonnees?", value=p["voordelen"] if p else "", max_chars=1000,
                                 placeholder="Bijv. alle cursussen, elke maand een nieuwe les")
        actief = st.toggle("Nieuwe leden kunnen dit afsluiten", value=p["actief"] if p else True) if p else True
        st.caption("Van elke betaling gaat 5% commissie af, inclusief betaalkosten. "
                   "Een nieuwe prijs geldt voor nieuwe abonnees.")
        if st.form_submit_button("Opslaan", type="primary", width="stretch"):
            if _fout(cursus.plan_opslaan, None if p else a["id"], p["id"] if p else None, naam, prijs, voordelen,
                     actief) is not None:
                st.session_state.cursus_melding = "Abonnement opgeslagen."
                st.rerun()


def _cursus_formulier(a: dict | None, c: dict | None) -> None:
    """Een cursus maken of aanpassen: titel, omschrijving, gratis, te koop of bij abonnement, en zichtbaar of niet."""
    with st.form(f"cursus_{c['id'] if c else 'nieuw'}", border=False):
        titel = st.text_input("Titel", value=c["titel"] if c else "", max_chars=100, placeholder="Bijv. Brood bakken")
        omschrijving = st.text_area("Omschrijving", value=c["omschrijving"] if c else "", max_chars=2000,
                                    placeholder="Wat leer je, en voor wie is het?")
        soort = st.segmented_control("Voor wie", list(cursus.SOORTEN), format_func=cursus.SOORTEN.get, required=True,
                                     default=cursus.soort(c) if c else "gratis")
        prijs = st.number_input("Prijs (€, alleen bij Te koop)", min_value=1.0, max_value=1000.0, step=1.0,
                                format="%.2f", value=(c["prijs_cent"] / 100) if c and c["prijs_cent"] else 25.0)
        zichtbaar = st.toggle("Zichtbaar voor leden", value=c["gepubliceerd"] if c else False,
                              help="Zet dit aan als de lessen klaar zijn.")
        if st.form_submit_button("Opslaan", type="primary", width="stretch"):
            nieuw = _fout(cursus.opslaan, a["id"] if a and not c else None, c["id"] if c else None, titel,
                          omschrijving, soort, prijs, zichtbaar)
            if nieuw is not None:
                st.session_state.cursus_melding = "Cursus opgeslagen."
                if not c:
                    st.session_state.cursus_open = nieuw
                st.rerun()


# --- Een cursus volgen ----------------------------------------------------------------------------

def bekijken(cursus_id: int) -> None:
    c = _fout(cursus.lezen, cursus_id)
    with st.container(horizontal=True, vertical_alignment="center"):
        if st.button("", icon=":material/arrow_back:", type="tertiary", help="Terug", key="cursus_terug"):
            st.session_state.pop("cursus_open", None)
            if c:
                st.session_state.cursus_bij = c["community"]
            st.rerun()
        st.markdown(f"#### {c['titel']}" if c else "#### Cursus", width="stretch")
    if not c:
        return
    st.caption(_over(c))
    if c["beheer"]:
        _beheer_cursus(c)
        return
    if c["omschrijving"] and not c["klaar"]:
        st.markdown(c["omschrijving"])
    if not c["toegang"]:
        _toegang_krijgen(c)
        return
    _voortgang(c)
    lessen = c["les_lijst"]
    if not lessen:
        st.caption("Er staan nog geen lessen in deze cursus.")
        return
    les_volgen(c, lessen)


def _toegang_krijgen(c: dict) -> None:
    with st.container(border=True):
        if cursus.soort(c) == "abonnement":
            st.markdown("Deze cursus hoort bij het abonnement op de community.")
            if st.button("Bekijk het abonnement", type="primary", width="stretch"):
                st.session_state.pop("cursus_open", None)
                st.session_state.cursus_bij = c["community"]
                st.rerun()
        elif cursus.soort(c) == "koop":
            st.markdown(f"**{cursus.prijs(c['prijs_cent'])}**, eenmalig. Daarna heb je altijd toegang.")
            akkoord = st.checkbox("Ik wil meteen beginnen en weet dat ik daardoor geen bedenktijd van 14 dagen heb.",
                                  key=f"akkoord_{c['id']}")
            if url := st.session_state.get(f"koop_url_{c['id']}"):
                st.link_button("Verder naar betalen", url, width="stretch", type="primary")
            elif st.button("Kopen", type="primary", width="stretch", disabled=not akkoord):
                if url := _fout(cursus.kopen, c["id"]):
                    st.session_state[f"koop_url_{c['id']}"] = url
                    st.rerun()
            st.caption("Je betaalt veilig via Stripe (iDEAL, Apple Pay of kaart).")
    if c["les_lijst"]:
        st.markdown("**Lessen**")
        st.markdown("\n".join(f"{i}. {les['titel']}" + (f" :gray[({les['minuten']} min)]" if les["minuten"] else "")
                              for i, les in enumerate(c["les_lijst"], 1)))


def les_volgen(c: dict, lessen: list[dict]) -> None:
    sleutel = f"les_nr_{c['id']}"
    if sleutel not in st.session_state:
        st.session_state[sleutel] = next((i for i, les in enumerate(lessen) if not les["klaar"]), 0)
    nr = min(st.session_state[sleutel], len(lessen) - 1)
    keuze = st.selectbox("Les", range(len(lessen)), index=nr, label_visibility="collapsed",
                         format_func=lambda i: f"{'✓ ' if lessen[i]['klaar'] else ''}Les {i + 1}: {lessen[i]['titel']}")
    if keuze != nr:
        st.session_state[sleutel] = nr = keuze
        st.session_state.pop(f"overhoor_{c['id']}", None)
    les = lessen[nr]
    st.markdown(f"**{les['titel']}**")
    if les["minuten"]:
        st.caption(f"{les['minuten']} minuten")
    if les.get("video"):
        if cursus.video_soort(les["video"]) == "speler":
            st.video(les["video"])
        else:
            st.link_button("Video bekijken", les["video"], icon=":material/play_circle:")
    if les.get("inhoud"):
        st.markdown(les["inhoud"])
    with st.container(horizontal=True):
        if nr > 0 and st.button("Vorige", icon=":material/arrow_back:", key="les_vorige"):
            st.session_state[sleutel] = nr - 1
            st.session_state.pop(f"overhoor_{c['id']}", None)
            st.rerun()
        laatste = nr == len(lessen) - 1
        if not les["klaar"]:
            if st.button("Klaar" if laatste else "Klaar, volgende les", type="primary", key="les_klaar"):
                if _gelukt(cursus.les_klaar, les["id"]):
                    if laatste and sum(x["klaar"] for x in lessen) + 1 >= len(lessen):
                        st.session_state.cursus_melding = "Cursus afgerond. Goed gedaan!"
                    st.session_state[sleutel] = min(nr + 1, len(lessen) - 1)
                    st.session_state.pop(f"overhoor_{c['id']}", None)
                    st.rerun()
        elif not laatste and st.button("Volgende", icon=":material/arrow_forward:", key="les_volgende"):
            st.session_state[sleutel] = nr + 1
            st.session_state.pop(f"overhoor_{c['id']}", None)
            st.rerun()
        if len(les.get("inhoud") or "") >= 200 and st.button("Overhoor me", icon=":material/quiz:", key="les_toets"):
            vragen = werk_scherm.met_claude("Vragen maken...", slim.les_vragen, les["titel"], les["inhoud"])
            if vragen:
                st.session_state[f"overhoor_{c['id']}"] = {"les": les["id"], "vragen": vragen}
    if (o := st.session_state.get(f"overhoor_{c['id']}")) and o["les"] == les["id"]:
        _overhoren(o)


def _overhoren(o: dict) -> None:
    vragen = o["vragen"]
    if "keuzes" not in o:
        with st.form("les_overhoren"):
            keuzes = [st.radio(f"**{i + 1}.** {v['vraag']}", range(len(v["opties"])), index=None,
                               format_func=lambda k, v=v: v["opties"][k], key=f"lesvraag_{i}")
                      for i, v in enumerate(vragen)]
            if st.form_submit_button("Nakijken", type="primary"):
                if None in keuzes:
                    st.warning("Beantwoord eerst alle vragen.")
                else:
                    o["keuzes"] = keuzes
                    st.rerun()
        return
    goed = sum(k == v["juist"] for v, k in zip(vragen, o["keuzes"]))
    st.progress(goed / len(vragen), text=f"{goed} van {len(vragen)} goed")
    for i, (v, k) in enumerate(zip(vragen, o["keuzes"])):
        juist = k == v["juist"]
        st.markdown(f"{':material/check_circle:' if juist else ':material/cancel:'} **{i + 1}.** {v['vraag']}  \n"
                    + ("" if juist else f"Goed: **{v['opties'][v['juist']]}**  \n") + f":gray[{v['uitleg']}]")


# --- Voor de eigenaar: cursus en lessen beheren ------------------------------------------------------

def _beheer_cursus(c: dict) -> None:
    st.caption(f"{_label(c)} · " + ("zichtbaar voor leden" if c["gepubliceerd"] else "verborgen (concept)")
               + (f" · {c['kopers']} keer verkocht" if c.get("kopers") else ""))
    with st.container(horizontal=True):
        with st.popover("Cursus aanpassen", icon=":material/edit:"):
            _cursus_formulier(None, c)
        with st.popover("Les toevoegen", icon=":material/add:"):
            _les_formulier(c, None)
        with st.popover("Weghalen", icon=":material/delete:"):
            st.caption("Is de cursus al gekocht, dan kun je hem alleen verbergen. Kopers houden dan hun toegang.")
            if st.button("Cursus weghalen", type="primary", key="cursus_weg"):
                if _gelukt(cursus.weg, c["id"]):
                    st.session_state.pop("cursus_open", None)
                    st.session_state.cursus_bij = c["community"]
                    st.session_state.cursus_melding = "Cursus weggehaald."
                    st.rerun()
    lessen = c["les_lijst"]
    if not lessen:
        st.caption("Nog geen lessen. Een les is tekst, eventueel met een video (YouTube, Vimeo of een link).")
    for i, les in enumerate(lessen):
        with st.container(border=True):
            with st.container(horizontal=True, vertical_alignment="center"):
                st.markdown(f"**{i + 1}. {les['titel']}**" + (f"  \n:gray[{les['minuten']} min]" if les["minuten"] else ""),
                            width="stretch")
                if i > 0 and st.button("", icon=":material/arrow_upward:", key=f"op_{les['id']}", help="Eerder"):
                    if _gelukt(cursus.les_wijzigen, les["id"], "op"):
                        st.rerun()
                if i < len(lessen) - 1 and st.button("", icon=":material/arrow_downward:", key=f"neer_{les['id']}",
                                                     help="Later"):
                    if _gelukt(cursus.les_wijzigen, les["id"], "neer"):
                        st.rerun()
                with st.popover("", icon=":material/edit:", help="Aanpassen"):
                    _les_formulier(c, les)
                    if st.button("Les weghalen", key=f"lesweg_{les['id']}"):
                        if _gelukt(cursus.les_wijzigen, les["id"], "weg"):
                            st.rerun()
    if lessen:
        with st.expander("Bekijken zoals een lid"):
            les_volgen(c, lessen)


def _les_formulier(c: dict, les: dict | None) -> None:
    with st.form(f"les_{les['id'] if les else 'nieuw'}", border=False):
        titel = st.text_input("Titel", value=les["titel"] if les else "", max_chars=120)
        inhoud = st.text_area("Tekst", value=les["inhoud"] if les else "", height=220, max_chars=30000,
                              help="Opmaak kan met Markdown, bijvoorbeeld **vet** en - een lijstje.")
        video = st.text_input("Video (optioneel)", value=les["video"] if les else "",
                              placeholder="https://youtu.be/...")
        minuten = st.number_input("Duur in minuten", min_value=0, max_value=600, step=5,
                                  value=les["minuten"] if les else 10)
        if st.form_submit_button("Opslaan", type="primary", width="stretch"):
            if _fout(cursus.les_opslaan, c["id"], les["id"] if les else None, titel, inhoud, video,
                     minuten) is not None:
                st.session_state.cursus_melding = "Les opgeslagen."
                st.rerun()
