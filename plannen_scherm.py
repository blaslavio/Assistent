"""Agenda › Plannen: samen iets plannen en reserveren. En voor zaken: reserveringen aannemen (Mijn webshop)."""

from datetime import date, datetime, time, timedelta
from urllib.parse import quote, urlsplit

import streamlit as st

import opslag
import planning
import prikker
import reserveren as R
import samen

DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]
MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]


def _wanneer(iso: str, met_dag: bool = True) -> str:
    t = datetime.fromisoformat(iso).astimezone()
    return (f"{DAGEN[t.weekday()]} {t.day} {MAANDEN[t.month - 1]} " if met_dag else "") + t.strftime("%H:%M")


def _namen(tekst: str) -> list[str]:
    return [n.strip().lstrip("@") for n in tekst.replace(";", ",").split(",") if n.strip()]


def _account() -> None:
    # Dialogen en knoppen met een callback draaien los van de rest van de app.
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))


def _melding_tonen() -> None:
    if melding := st.session_state.pop("plannen_melding", None):
        st.success(melding)


# --- Gast ------------------------------------------------------------------------------------------------------------

def pagina() -> None:
    """Kies waarvoor je plant, reserveer bij een zaak in de app of zet een plek uit de buurt in je agenda."""
    _melding_tonen()
    online = samen.beschikbaar()
    gelegenheid = st.pills("Waarvoor?", list(R.GELEGENHEDEN), default="Date", key="plannen_gelegenheid",
                           format_func=lambda g: f"{R.GELEGENHEDEN[g][1]} {g}", label_visibility="collapsed") or "Uitje"
    if online:
        if st.button("Samen een datum kiezen", icon=":material/how_to_vote:", key="prik_nieuw"):
            st.session_state.pop("prik_klaar", None)
            st.session_state.prik_opties = []
            prik_maken_dialoog(gelegenheid)
        stemrondes()
        mijn_reserveringen()
        mijn_aanvragen()
        zoek = st.text_input("Zoek", placeholder="Zoek een zaak in de app", label_visibility="collapsed",
                             key="plannen_zoek")
        try:
            zaken = [z for z in R.zaken(zoek) if not z["van_mij"]]
        except opslag.GeenToegang:
            raise
        except Exception:
            zaken = []
        if zaken:
            st.markdown("**Direct reserveren**")
            for z in zaken[:20]:
                with st.container(horizontal=True, vertical_alignment="center", key=f"zaak_{z['adres']}"):
                    with st.container(gap=None):
                        st.markdown(f"**{z['naam']}**")
                        st.caption(" · ".join(filter(None, [z["winkeladres"], z["omschrijving"][:60]])))
                    if st.button("Reserveren", key=f"res_{z['adres']}", width=110):
                        reserveer_dialoog(z, gelegenheid)
        elif zoek:
            st.caption("Geen zaak in de app gevonden.")
    in_de_buurt(gelegenheid)


def mijn_reserveringen() -> None:
    try:
        lijst = R.mijn()
    except opslag.GeenToegang:
        raise
    except Exception:
        return
    nu = datetime.now().astimezone()
    komend = [r for r in lijst if r["status"] in ("bevestigd", "wachtlijst")
              and datetime.fromisoformat(r["start"]) > nu]
    reviews = [r for r in lijst if r["review"]]
    afgezegd = [r for r in lijst if r["status"] == "geannuleerd" and r["door_zaak"]
                and datetime.fromisoformat(r["start"]) > nu]
    for r in afgezegd:
        st.warning(f"{r['zaak']} heeft je reservering van {_wanneer(r['start'])} geannuleerd. "
                   "Hij staat niet meer in je agenda.")
    if komend:
        st.markdown("**Mijn reserveringen**")
    for r in komend:
        with st.container(horizontal=True, vertical_alignment="center", key=f"mijnres_{r['id']}"):
            with st.container(gap=None):
                st.markdown(f"**{r['zaak']}** · {_wanneer(r['start'])}")
                st.caption(" · ".join(filter(None, [
                    f"{r['personen']} pers.", r["gelegenheid"],
                    "Er is plek!" if r["plek_vrij"] else R.STATUS[r["status"]]])))
            if r["plek_vrij"] and st.button("Bevestigen", key=f"bev_{r['id']}", type="primary"):
                try:
                    R.wachtlijst_bevestigen(r)
                    st.session_state.plannen_melding = "Bevestigd en in je agenda gezet."
                except samen.Fout as fout:
                    st.session_state.plannen_melding = str(fout)
                st.rerun()
            with st.popover("", icon=":material/close:", help="Annuleren"):
                laat = datetime.fromisoformat(r["annuleren_tot"]) < nu and r["status"] == "bevestigd"
                st.caption("Gratis annuleren kan niet meer; de zaak ziet dat je laat annuleert." if laat
                           else "Annuleren is gratis.")
                if st.button("Annuleren", key=f"ann_{r['id']}", type="primary"):
                    R.annuleren(r["id"])
                    st.session_state.plannen_melding = "Geannuleerd en uit je agenda gehaald."
                    st.rerun()
    if reviews:
        with st.expander(f"Review schrijven ({len(reviews)})"):
            for r in reviews:
                with st.form(f"resreview_{r['id']}", border=False):
                    st.markdown(f"Hoe was het bij **{r['zaak']}**? ({_wanneer(r['start'])})")
                    keuze = st.feedback("stars", key=f"ster_{r['id']}")
                    tekst = st.text_input("Toelichting (optioneel)", max_chars=500, key=f"rtekst_{r['id']}")
                    if st.form_submit_button("Plaatsen"):
                        if keuze is None:
                            st.error("Kies eerst het aantal sterren.")
                        else:
                            try:
                                R.beoordelen(r["id"], keuze + 1, tekst.strip())
                                st.session_state.plannen_melding = "Bedankt voor je review!"
                                st.rerun()
                            except samen.Fout as fout:
                                st.error(str(fout))


def in_de_buurt(gelegenheid: str) -> None:
    st.markdown("**In de buurt**")
    try:
        plekken = R.ideeen(gelegenheid)
    except Exception:
        st.caption("Plekken in de buurt laden lukt nu even niet. Probeer het straks opnieuw.")
        return
    if not plekken:
        st.caption("Niets gevonden. Vul je thuisadres in bij Instellingen.")
        return
    toon = st.session_state.get("plannen_meer", 8)
    for i, p in enumerate(plekken[:toon]):
        with st.container(horizontal=True, vertical_alignment="center", key=f"plek_{i}"):
            with st.container(gap=None):
                st.markdown(f"{p['icoon']} **{p['naam']}**")
                st.caption(f"{p['soort']} · {str(p['afstand_km']).replace('.', ',')} km")
            if p.get("website"):
                st.link_button("", p["website"], icon=":material/open_in_new:", help="Website")
            if st.button("Plannen", key=f"plan_{i}", width=96):
                plan_dialoog(p, gelegenheid)
    if len(plekken) > toon and st.button("Meer laten zien", type="tertiary"):
        st.session_state.plannen_meer = toon + 8
        st.rerun()


@st.dialog("Reserveren")
def reserveer_dialoog(z: dict, gelegenheid: str) -> None:
    _account()
    st.markdown(f"**{z['naam']}**")
    reviews = samen.reviews_bekijken(z["adres"])
    if reviews.get("aantal"):
        st.caption(f"★ {str(reviews['sterren']).replace('.', ',')} uit {reviews['aantal']} reviews")
    if z["bericht"]:
        st.caption(z["bericht"])
    k1, k2 = st.columns(2)
    dag = k1.date_input("Dag", value=date.today(), min_value=date.today(), format="DD-MM-YYYY")
    personen = 1
    if z["soort"] == "tafel":
        personen = int(k2.number_input("Personen", 1, z["max_groep"], min(2, z["max_groep"])))
    try:
        tijden = R.tijden(z["adres"], dag, personen)
    except samen.Fout as fout:
        st.info(str(fout))
        return
    if not tijden:
        st.caption("Op deze dag kun je hier niet reserveren.")
        return
    vrij = {t["start"]: t["vrij"] for t in tijden}
    keuze = st.pills("Tijd", list(vrij), format_func=lambda s: _wanneer(s, False) + ("" if vrij[s] else " vol"),
                     key="res_tijd")
    opmerking = st.text_input("Opmerking", placeholder="Allergieën, kinderstoel, iets te vieren?", max_chars=500)
    uitnodigen = st.text_input("Uitnodigen", placeholder="Gebruikersnamen, met komma's (optioneel)")
    wachtlijst = bool(keuze) and not vrij[keuze]
    if wachtlijst:
        st.caption("Deze tijd is vol. Op de wachtlijst zie je het meteen als er plek komt.")
    if st.button("Op de wachtlijst" if wachtlijst else "Reserveren", type="primary", disabled=not keuze,
                 width="stretch"):
        try:
            r = R.reserveren(z["adres"], keuze, personen, opmerking.strip(), gelegenheid, wachtlijst,
                             _namen(uitnodigen))
        except samen.Fout as fout:
            st.error(str(fout))
            return
        tekst = (f"Gereserveerd bij {r['zaak']} op {_wanneer(r['start'])}. Het staat in je agenda."
                 if r["status"] == "bevestigd" else f"Je staat op de wachtlijst bij {r['zaak']}.")
        if r["niet_uitgenodigd"]:
            tekst += f" Niet gevonden: {', '.join(r['niet_uitgenodigd'])}."
        st.session_state.plannen_melding = tekst
        st.rerun()


@st.dialog("Plannen")
def plan_dialoog(p: dict, gelegenheid: str) -> None:
    """Een plek buiten de app: een reservering aanvragen (mail, bellen, website) of alleen in je agenda zetten."""
    _account()
    st.markdown(f"{p['icoon']} **{p['naam']}**")
    st.caption(" · ".join(filter(None, [p["soort"], p.get("adres"), p.get("telefoon")])))
    klaar = st.session_state.get("aanvraag_klaar")
    if klaar and klaar["plek"]["naam"] == p["naam"]:
        aanvraag_versturen_stap(klaar)
        return
    st.session_state.pop("aanvraag_klaar", None)
    hoe = st.segmented_control("Hoe", ["Reservering aanvragen", "Alleen in agenda"],
                               default="Reservering aanvragen" if p.get("reserveren") else "Alleen in agenda",
                               label_visibility="collapsed") or "Alleen in agenda"
    k1, k2 = st.columns(2)
    dag = k1.date_input("Dag", value=date.today() + timedelta(days=1), min_value=date.today(), format="DD-MM-YYYY")
    standaard = time(14, 0) if gelegenheid in ("Speelafspraak", "Uitje") else time(19, 0)
    om = k2.time_input("Tijd", value=standaard, step=900)
    begin = datetime.combine(dag, om).isoformat(timespec="minutes")
    if hoe == "Reservering aanvragen":
        k1, k2 = st.columns(2)
        personen = int(k1.number_input("Personen", 1, 100, 2))
        email = k2.text_input("Mailadres van de zaak", value=p.get("email", ""), placeholder="Als je het weet")
        opmerking = st.text_input("Opmerking", placeholder="Allergieën, kinderstoel, iets te vieren?", max_chars=500)
        st.caption("Het restaurant bevestigt met één klik, zonder account. Het staat alvast in je agenda als aangevraagd.")
        if st.button("Aanvraag maken", type="primary", width="stretch"):
            plek = dict(p, email=email.strip())
            kanaal = "mail" if plek["email"] else "telefoon" if p.get("telefoon") else "website" if p.get("website") else "anders"
            try:
                a = R.aanvraag_maken(plek, begin, personen, opmerking.strip(), gelegenheid, kanaal)
            except samen.Fout as fout:
                st.error(str(fout))
                return
            st.session_state.aanvraag_klaar = {"aanvraag": a, "plek": plek, "start": begin, "personen": personen,
                                               "opmerking": opmerking.strip()}
            st.rerun(scope="fragment")
        return
    duur = st.segmented_control("Hoe lang", [60, 120, 180, 240], default=120,
                                format_func=lambda m: f"{m // 60} uur")
    uitnodigen = st.text_input("Uitnodigen", placeholder="Gebruikersnamen, met komma's (optioneel)")
    if st.button("In agenda", type="primary", width="stretch"):
        uit = R.als_plan(dict(p, reserveren=False), begin, duur or 120, gelegenheid, _namen(uitnodigen))
        tekst = f"{p['naam']} staat in je agenda."
        if uit["niet_uitgenodigd"]:
            tekst += f" Niet gevonden: {', '.join(uit['niet_uitgenodigd'])}."
        st.session_state.plannen_melding = tekst
        st.rerun()


def _basis() -> str:
    """Het webadres van de app, voor de link in de aanvraag."""
    deel = urlsplit(st.context.url or "")
    return f"{deel.scheme}://{deel.netloc}" if deel.netloc else samen.betalen_status().get("app_adres", "")


def aanvraag_versturen_stap(k: dict) -> None:
    """Na het maken: versturen via je eigen mail, of bellen of de website. Daarna kun je het venster sluiten."""
    import mail
    a, plek = k["aanvraag"], k["plek"]
    link = R.aanvraag_link(_basis(), a["code"])
    onderwerp, tekst = R.aanvraag_mail(plek, k["start"], k["personen"], k["opmerking"], a["gast"], link)
    st.success("Aanvraag staat klaar en in je agenda. Stuur hem nu naar de zaak:")
    if plek["email"] and mail.gekoppeld():
        if st.button("Versturen vanuit mijn mail", type="primary", width="stretch", icon=":material/send:"):
            try:
                R.aanvraag_versturen(a, plek, k["start"], k["personen"], k["opmerking"], link)
            except Exception:
                st.error("Versturen lukte niet. Probeer 'Open in Mail'.")
            else:
                st.session_state.pop("aanvraag_klaar", None)
                st.session_state.plannen_melding = f"Aanvraag verstuurd naar {plek['naam']}. Je ziet hier het antwoord."
                st.rerun()
    with st.container(horizontal=True, gap="small"):
        if plek["email"]:
            st.link_button("Open in Mail", f"mailto:{plek['email']}?subject={quote(onderwerp)}&body={quote(tekst)}",
                           icon=":material/mail:")
        if plek.get("telefoon"):
            st.link_button("Bellen", "tel:" + "".join(c for c in plek["telefoon"] if c.isdigit() or c == "+"),
                           icon=":material/call:")
        if plek.get("website"):
            st.link_button("Website", plek["website"], icon=":material/open_in_new:")
    if not plek["email"]:
        st.caption("Geen mailadres bekend. Bel of reserveer via de website en tik daarna bij Mijn reserveringen "
                   "op Geregeld.")
    if st.button("Klaar", width="stretch"):
        st.session_state.pop("aanvraag_klaar", None)
        st.session_state.plannen_melding = f"Aanvraag bij {plek['naam']} staat in je agenda."
        st.rerun()


def mijn_aanvragen() -> None:
    """Aanvragen bij plekken buiten de app, met het antwoord van het restaurant."""
    try:
        lijst = R.mijn_aanvragen()
    except opslag.GeenToegang:
        raise
    except Exception:
        return
    nu = datetime.now().astimezone()
    zichtbaar = [a for a in lijst if datetime.fromisoformat(a["start"]) > nu and (
        a["status"] in ("aangevraagd", "voorstel", "bevestigd")
        or (a["status"] == "afgewezen" and a["beantwoord"]
            and datetime.fromisoformat(a["beantwoord"]) > nu - timedelta(days=3)))]
    if zichtbaar:
        st.markdown("**Aanvragen**")
    for a in zichtbaar:
        with st.container(horizontal=True, vertical_alignment="center", key=f"aanvraag_{a['id']}"):
            with st.container(gap=None):
                st.markdown(f"**{a['plek']}** · {_wanneer(a['start'])}")
                regel = R.AANVRAAG_STATUS[a["status"]]
                if a["status"] == "voorstel" and a["voorstel"]:
                    regel = f"Voorstel: {_wanneer(a['voorstel'])}"
                elif a["status"] == "bevestigd" and not a["door_plek"]:
                    regel = "Zelf geregeld"
                st.caption(" · ".join(filter(None, [f"{a['personen']} pers.", regel, a["antwoord"]])))
            if a["status"] == "voorstel" and st.button("Aannemen", key=f"vaan_{a['id']}", type="primary"):
                R.aanvraag_bijwerken(a["id"], "voorstel_aannemen")
                st.session_state.plannen_melding = "Nieuw tijdstip staat in je agenda."
                st.rerun()
            if a["status"] == "aangevraagd" and st.button("Geregeld", key=f"zelf_{a['id']}",
                                                          help="Telefonisch of via de website gereserveerd"):
                R.aanvraag_bijwerken(a["id"], "bevestigd")
                st.rerun()
            if a["status"] != "afgewezen":
                with st.popover("", icon=":material/close:", help="Annuleren"):
                    st.caption("Laat het de zaak ook even weten als je al bevestiging had.")
                    if st.button("Annuleren", key=f"aann_{a['id']}", type="primary"):
                        R.aanvraag_bijwerken(a["id"], "geannuleerd")
                        st.session_state.plannen_melding = "Geannuleerd en uit je agenda gehaald."
                        st.rerun()


def aanvraag_pagina(code: str) -> None:
    """Voor het restaurant, zonder account: de aanvraag bevestigen, iets anders voorstellen of afzeggen."""
    st.subheader("Reserveringsaanvraag")
    try:
        a = R.aanvraag_bekijken(code)
    except samen.Fout as fout:
        st.info(str(fout))
        return
    if melding := st.session_state.pop("aanvraag_melding", None):
        st.success(melding)
    st.markdown(f"**{a['gast']}** wil graag reserveren bij **{a['plek']}**")
    st.markdown(f"{_wanneer(a['start']).capitalize()} · {a['personen']} "
                f"{'persoon' if a['personen'] == 1 else 'personen'}" + (f" · {a['gelegenheid']}" if a["gelegenheid"] else ""))
    if a["opmerking"]:
        st.caption(f"Opmerking: {a['opmerking']}")
    if a["status"] == "geannuleerd":
        st.info("De gast heeft deze aanvraag geannuleerd.")
        return
    if a["status"] != "aangevraagd":
        st.caption("Uw antwoord: " + {"bevestigd": "bevestigd", "afgewezen": "kan niet",
                                      "voorstel": f"ander tijdstip ({_wanneer(a['voorstel'])})"
                                      if a["voorstel"] else "ander tijdstip"}[a["status"]]
                   + ". U kunt het hieronder nog wijzigen.")
    tekst = st.text_input("Bericht aan de gast (optioneel)", max_chars=500, key="aanvraag_tekst")
    with st.container(horizontal=True, gap="small"):
        if st.button("Bevestigen", type="primary", icon=":material/check:"):
            _antwoord(code, "ja", None, tekst, "Bevestigd. De gast ziet het meteen in de agenda.")
        if st.button("Kan niet", icon=":material/close:"):
            _antwoord(code, "nee", None, tekst, "Doorgegeven aan de gast.")
    with st.expander("Ander tijdstip voorstellen"):
        oud = datetime.fromisoformat(a["start"]).astimezone()
        k1, k2 = st.columns(2)
        dag = k1.date_input("Dag", value=oud.date(), min_value=date.today(), format="DD-MM-YYYY", key="aanvraag_dag")
        om = k2.time_input("Tijd", value=oud.time().replace(tzinfo=None), step=900, key="aanvraag_om")
        if st.button("Voorstellen"):
            _antwoord(code, "voorstel", datetime.combine(dag, om).astimezone().isoformat(), tekst,
                      "Voorstel verstuurd. De gast kan het met één tik aannemen.")
    st.divider()
    if not a["interesse"] and not a["gestopt"]:
        st.markdown("**Reserveringen voortaan direct in uw agenda?**")
        st.caption("Sluit u gratis aan: gasten reserveren dan zelf op uw vrije tijden, met wachtlijst en reviews. "
                   "Geen abonnement en geen kosten per gast.")
        if st.button("Ja, neem contact met mij op"):
            R.aanvraag_interesse(code)
            st.session_state.aanvraag_melding = "Dank u! We nemen contact met u op."
            st.rerun()
    with st.expander("Geen aanvragen meer of misbruik melden"):
        if a["gestopt"]:
            st.caption("U ontvangt geen aanvragen meer via deze app.")
        elif st.button("Geen aanvragen meer via deze app"):
            R.aanvraag_stoppen(code)
            st.session_state.aanvraag_melding = "Afgemeld. Gasten zien voortaan dat ze u moeten bellen of mailen."
            st.rerun()
        reden = st.text_input("Iets niet in orde? Bijvoorbeeld een nepreservering", max_chars=500, key="aanvraag_reden")
        if st.button("Melden", disabled=not reden.strip()):
            R.aanvraag_melden(code, reden)
            st.session_state.aanvraag_melding = "Gemeld. We kijken ernaar."
            st.rerun()


def _antwoord(code: str, antwoord: str, voorstel: str | None, tekst: str, melding: str) -> None:
    try:
        R.aanvraag_beantwoorden(code, antwoord, voorstel, tekst.strip())
    except samen.Fout as fout:
        st.error(str(fout))
        return
    st.session_state.aanvraag_melding = melding
    st.rerun()


def beheer_aanvragen() -> None:
    """Beheerder: hoe aanvragen lopen, welke plekken we kunnen uitnodigen, en meldingen van restaurants."""
    b = R.beheer_aanvragen()
    if b.get("geen_toegang"):
        return
    s = b["per_status"]
    totaal = sum(s.values())
    st.markdown("**Reserveringsaanvragen**")
    st.caption(f"Laatste 30 dagen: {totaal} aanvragen, {s.get('bevestigd', 0)} bevestigd, "
               f"{s.get('afgewezen', 0)} kan niet, {s.get('aangevraagd', 0)} zonder antwoord. "
               f"{b['gestopt']} plekken afgemeld.")
    for m in b["meldingen"]:
        with st.container(border=True):
            st.markdown(f"Melding van **{m['plek']}** over {m['gast']} ({m['aanvragen_gast']} aanvragen)  \n{m['reden']}")
            k1, k2 = st.columns(2)
            if k1.button("Is in orde", key=f"aok_{m['id']}", width="stretch"):
                R.beheer_aanvraag_afhandelen(m["id"])
                st.rerun()
            if k2.button("Gast blokkeren", key=f"ablok_{m['id']}", width="stretch"):
                R.beheer_aanvraag_afhandelen(m["id"], True)
                st.rerun()
    if b["plekken"]:
        with st.expander("Veelgevraagde plekken (om uit te nodigen)"):
            for p in b["plekken"]:
                st.markdown(f"**{p['plek']}** · {p['aantal']}× gevraagd, {p['bevestigd']}× bevestigd"
                            + (" · wil aansluiten" if p["interesse"] else "") + (" · afgemeld" if p["gestopt"] else ""))
                st.caption(" · ".join(filter(None, [p["adres"], p["email"], p["telefoon"]])))


# --- Samen een datum kiezen (stemrondes) ----------------------------------------------------------------------

def _stand(o: dict) -> str:
    return f"{o['ja']}× ja" + (f", {o['misschien']}× misschien" if o["misschien"] else "")


def stemrondes() -> None:
    try:
        lijst = prikker.mijn()
    except opslag.GeenToegang:
        raise
    except Exception:
        return
    if not lijst:
        return
    st.markdown("**Stemrondes**")
    for p in lijst:
        with st.container(horizontal=True, vertical_alignment="center", key=f"prik_{p['id']}"):
            with st.container(gap=None):
                st.markdown(f"**{p['titel']}**" + ("" if p["van_mij"] else f" · van {p['maker']}"))
                if p["gekozen"]:
                    st.caption(f"Gekozen: {_wanneer(p['gekozen'])}")
                else:
                    beste = prikker.beste(p)
                    st.caption(f"{len(p['stemmen'])} gestemd" + (f" · beste: {_wanneer(beste['start'])}" if beste else ""))
            if st.button("Open" if p["open"] else "Bekijk", key=f"prik_open_{p['id']}", width=80):
                prik_dialoog(p)


@st.dialog("Samen een datum kiezen")
def prik_maken_dialoog(gelegenheid: str) -> None:
    _account()
    if klaar := st.session_state.get("prik_klaar"):
        _prik_delen(klaar["code"], klaar["titel"])
        if klaar.get("niet_gevonden"):
            st.caption(f"Niet gevonden in de app: {', '.join(klaar['niet_gevonden'])}. Stuur hen de link.")
        if st.button("Klaar", width="stretch"):
            st.session_state.pop("prik_klaar", None)
            st.rerun()
        return
    titel = st.text_input("Waarvoor?", value="" if gelegenheid == "Afspraak" else gelegenheid,
                          placeholder="Bijvoorbeeld: etentje met vrienden")
    k1, k2 = st.columns(2)
    plaats = k1.text_input("Waar (optioneel)")
    duur = k2.selectbox("Hoe lang", [30, 60, 90, 120, 180, 240, 480], index=3,
                        format_func=lambda m: f"{m // 60} uur" if m % 60 == 0 else f"{m} min")
    opties: list[datetime] = st.session_state.setdefault("prik_opties", [])
    st.markdown("**Momenten om uit te kiezen**")
    for i, o in enumerate(list(opties)):
        with st.container(horizontal=True, vertical_alignment="center", key=f"prik_optie_{i}"):
            st.markdown(_wanneer(o.astimezone().isoformat()))
            if st.button("", icon=":material/close:", key=f"prik_optie_weg_{i}", type="tertiary"):
                opties.pop(i)
                st.rerun(scope="fragment")
    with st.container(horizontal=True, vertical_alignment="bottom", gap="small"):
        dag = st.date_input("Dag", value=date.today() + timedelta(days=2), min_value=date.today(),
                            format="DD-MM-YYYY", width=150)
        om = st.time_input("Tijd", value=time(19, 0), step=900, width=110)
        if st.button("Toevoegen", icon=":material/add:"):
            moment = datetime.combine(dag, om)
            if moment > datetime.now() and moment not in opties and len(opties) < 12:
                opties.append(moment)
                opties.sort()
            st.rerun(scope="fragment")
    mensen = {d["id"]: d["naam"] for d in samen.agenda_deelsituatie().get("met_mij", [])}
    if mensen:
        wie = st.multiselect("Of laat de app tijden zoeken waarop iedereen vrij is", list(mensen),
                             format_func=mensen.get, placeholder="Kies wie hun agenda met je delen")
        if wie and st.button("Vrije tijden zoeken", icon=":material/search:"):
            try:
                gevonden = planning.vrije_momenten(wie, timedelta(minutes=duur), dagen=14, aantal=5)
            except samen.Fout as fout:
                st.error(str(fout))
            else:
                opties.extend(m for m in gevonden if m not in opties)
                opties.sort()
                st.rerun(scope="fragment")
    genodigden = st.text_input("Uitnodigen in de app", placeholder="Gebruikersnamen, met komma's (optioneel)")
    st.caption("Iedereen met de link kan ook stemmen, zonder account.")
    if st.button("Stemronde maken", type="primary", width="stretch", disabled=len(opties) < 2 or not titel.strip()):
        try:
            p = prikker.maken(titel.strip(), opties, plaats.strip(), "", duur, _namen(genodigden))
        except samen.Fout as fout:
            st.error(str(fout))
            return
        st.session_state.prik_opties = []
        st.session_state.prik_klaar = {"code": p["code"], "titel": titel.strip(), "niet_gevonden": p["niet_gevonden"]}
        st.rerun(scope="fragment")


def _prik_delen(code: str, titel: str) -> None:
    link = prikker.link(_basis(), code)
    st.success("Stemronde staat klaar. Deel de link:")
    st.code(link, language=None)
    st.link_button("Delen via WhatsApp", f"https://wa.me/?text={quote(f'Wanneer kun jij? {titel}: {link}')}",
                   icon=":material/share:", width="stretch")


@st.dialog("Stemronde")
def prik_dialoog(p: dict) -> None:
    _account()
    st.markdown(f"**{p['titel']}**" + (f" · {p['plaats']}" if p["plaats"] else ""))
    if p["gekozen"]:
        st.success(f"Gekozen: {_wanneer(p['gekozen'])}")
    eigen = next((s["stemmen"] for s in p["stemmen"] if s["ik"]), {})
    keuzes = {}
    for o in p["opties"]:
        st.markdown(f"{_wanneer(o['start'])} · " + _stand(o))
        namen = [s["naam"] for s in p["stemmen"] if s["stemmen"].get(str(o["id"])) == "ja"]
        if namen:
            st.caption("Ja: " + ", ".join(namen))
        if p["open"]:
            keuzes[o["id"]] = st.segmented_control("Jouw antwoord", list(prikker.ANTWOORDEN), key=f"prikstem_{o['id']}",
                                                   default=eigen.get(str(o["id"])), format_func=prikker.ANTWOORDEN.get,
                                                   label_visibility="collapsed")
    if p["open"] and st.button("Mijn stem opslaan", width="stretch"):
        try:
            prikker.stem_ik(p["id"], {k: v for k, v in keuzes.items() if v})
        except samen.Fout as fout:
            st.error(str(fout))
        else:
            st.session_state.plannen_melding = "Je stem is opgeslagen."
            st.rerun()
    if p["van_mij"] and p["open"]:
        st.divider()
        if code := prikker.code(p["id"]):
            _prik_delen(code, p["titel"])
        beste = prikker.beste(p)
        gekozen = st.selectbox("Moment kiezen", [o["id"] for o in p["opties"]],
                               index=[o["id"] for o in p["opties"]].index(beste["id"]) if beste else 0,
                               format_func=lambda i: next(_wanneer(o["start"]) + " · " + _stand(o)
                                                          for o in p["opties"] if o["id"] == i))
        if st.button("Dit wordt het", type="primary", width="stretch"):
            prikker.kiezen(p["id"], gekozen)
            st.session_state.plannen_melding = "Gekozen en in je agenda gezet. Wie meedeed in de app is uitgenodigd."
            st.rerun()
        if st.button("Stemronde verwijderen", type="tertiary"):
            prikker.weg(p["id"])
            st.rerun()


def prik_pagina(code: str) -> None:
    """Stemmen via de link, zonder account."""
    import secrets
    try:
        p = prikker.bekijken(code)
    except samen.Fout as fout:
        st.info(str(fout))
        return
    st.subheader(p["titel"])
    st.caption(" · ".join(filter(None, [f"Van {p['maker']}", p["plaats"]])))
    if melding := st.session_state.pop("prik_melding", None):
        st.success(melding)
    if p["gekozen"]:
        st.success(f"Het wordt {_wanneer(p['gekozen'])}.")
        return
    if not p["open"]:
        st.info("Deze stemronde is gesloten.")
        return
    sleutel = st.session_state.setdefault("prik_sleutel", secrets.token_hex(16))
    naam = st.text_input("Je naam", max_chars=40, key="prik_naam")
    keuzes = {}
    for o in p["opties"]:
        st.markdown(f"**{_wanneer(o['start'])}** · " + _stand(o))
        keuzes[o["id"]] = st.segmented_control("Kun je?", list(prikker.ANTWOORDEN), key=f"prikpub_{o['id']}",
                                               format_func=prikker.ANTWOORDEN.get, label_visibility="collapsed")
    if st.button("Opslaan", type="primary", disabled=not naam.strip()):
        try:
            prikker.stemmen(code, naam, sleutel, {k: v for k, v in keuzes.items() if v})
        except samen.Fout as fout:
            st.error(str(fout))
        else:
            st.session_state.prik_melding = "Dank je! Je stem is opgeslagen. Je kunt hem hier nog aanpassen."
            st.rerun()
    if p["stemmen"]:
        st.caption("Al gestemd: " + ", ".join(s["naam"] for s in p["stemmen"]))


# --- Zaak -------------------------------------------------------------------------------------------------------------

def zaak_beheer() -> None:
    """Mijn webshop › Reserveringen: aannemen, de lijst per dag, en instellen."""
    _melding_tonen()
    vanaf = st.date_input("Vanaf", value=date.today(), format="DD-MM-YYYY", label_visibility="collapsed",
                          key="zaak_dag", width=160)
    z = R.mijn_zaak(vanaf, vanaf + timedelta(days=6))
    if not z["winkel"]:
        st.info("Maak eerst je winkel aan (onderdeel Winkel).")
        return
    i = z["instellingen"]
    if not i["aan"]:
        st.caption("Reserveringen staan uit. Zet ze aan bij Instellen hieronder; gasten reserveren dan gratis "
                   "via de app en het staat meteen in hun agenda.")
    if not z["reserveringen"]:
        st.caption("Geen reserveringen deze week.")
    per_dag: dict[date, list] = {}
    for r in z["reserveringen"]:
        per_dag.setdefault(datetime.fromisoformat(r["start"]).astimezone().date(), []).append(r)
    for dag, lijst in per_dag.items():
        echt = [r for r in lijst if r["status"] not in ("geannuleerd", "wachtlijst")]
        st.markdown(f"**{DAGEN[dag.weekday()]} {dag.day} {MAANDEN[dag.month - 1]}** · "
                    f"{len(echt)} reserveringen, {sum(r['personen'] for r in echt)} gasten")
        for r in lijst:
            reservering_regel(r)
    with st.expander("Instellen", expanded=not i["aan"]):
        instellen(i)


def reservering_regel(r: dict) -> None:
    weg = r["status"] == "geannuleerd"
    with st.container(horizontal=True, vertical_alignment="center", key=f"zaakres_{r['id']}"):
        with st.container(gap=None):
            kop = f"**{_wanneer(r['start'], False)}** · " + (f"{r['personen']} pers. · " if r["personen"] > 1 else "") + r["gast"]
            st.markdown(f"~~{kop}~~" if weg else kop)
            st.caption(" · ".join(filter(None, [
                R.STATUS[r["status"]] + (" (laat)" if r["te_laat"] else "") + (" door jou" if r["door_zaak"] else ""),
                r["gelegenheid"], r["opmerking"],
                f"{r['niet_gekomen']}× niet gekomen" if r["niet_gekomen"] else ""])))
        if weg or r["status"] == "wachtlijst":
            return
        begonnen = datetime.fromisoformat(r["start"]) < datetime.now().astimezone() + timedelta(hours=1)
        if begonnen:
            for status, icoon, uitleg in (("gekomen", ":material/check:", "Gekomen"),
                                          ("niet_gekomen", ":material/person_off:", "Niet gekomen")):
                if st.button("", icon=icoon, help=uitleg, key=f"{status}_{r['id']}",
                             type="primary" if r["status"] == status else "secondary"):
                    R.status_zetten(r["id"], "bevestigd" if r["status"] == status else status)
                    st.rerun()
        if r["status"] == "bevestigd":
            with st.popover("", icon=":material/close:", help="Annuleren"):
                st.caption("De gast ziet dat je hebt geannuleerd. Stuur er gerust een bericht bij.")
                if st.button("Annuleren", key=f"zann_{r['id']}", type="primary"):
                    R.annuleren(r["id"])
                    st.rerun()


def instellen(i: dict) -> None:
    with st.form("reserveren_instellen", border=False):
        aan = st.toggle("Reserveringen aannemen", value=i["aan"])
        soort = st.segmented_control("Soort", ["tafel", "afspraak"], default=i["soort"],
                                     format_func={"tafel": "Tafels (groepen)", "afspraak": "Afspraken (1 persoon)"}.get)
        st.caption("Per dag de eerste en laatste aanvangstijd")
        uren = {}
        for d, naam in enumerate(["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"], 1):
            nu = (i["uren"].get(str(d)) or [[]])[0]
            with st.container(horizontal=True, vertical_alignment="center", gap="xsmall"):
                open_ = st.checkbox(naam[:2], value=bool(nu), key=f"uren_open_{d}", width=64)
                van = st.time_input("Van", value=time.fromisoformat(nu[0]) if nu else time(17, 0), step=900,
                                    key=f"uren_van_{d}", label_visibility="collapsed", width=110)
                tot = st.time_input("Tot", value=time.fromisoformat(nu[1]) if nu else time(21, 0), step=900,
                                    key=f"uren_tot_{d}", label_visibility="collapsed", width=110)
            if open_ and tot >= van:
                uren[str(d)] = [[van.strftime("%H:%M"), tot.strftime("%H:%M")]]
        k1, k2 = st.columns(2)
        stap = k1.selectbox("Om de", [15, 30, 60], index=[15, 30, 60].index(i["stap"]) if i["stap"] in (15, 30, 60)
                            else 1, format_func=lambda m: f"{m} minuten")
        duur = k2.number_input("Duur (minuten)", 10, 600, i["duur"], step=15)
        capaciteit = k1.number_input("Gasten tegelijk" if (soort or i["soort"]) == "tafel"
                                     else "Afspraken tegelijk", 1, 1000, i["capaciteit"])
        max_groep = k2.number_input("Grootste groep", 1, 100, i["max_groep"])
        vooruit = k1.number_input("Dagen vooruit", 1, 365, i["vooruit"])
        min_vooraf = k2.number_input("Uren van tevoren", 0, 168, i["min_vooraf"] // 60)
        annuleren_uren = k1.number_input("Gratis annuleren tot (uren)", 0, 336, i["annuleren_uren"])
        gesloten = k2.text_input("Gesloten op", value=", ".join(
            datetime.fromisoformat(d).strftime("%d-%m-%Y") for d in i["gesloten"]), placeholder="24-12-2026, 31-12-2026")
        bericht = st.text_area("Bericht voor gasten", value=i["bericht"], max_chars=500, height=70,
                               placeholder="Bijvoorbeeld: laat het weten als je later bent.")
        if st.form_submit_button("Opslaan", type="primary"):
            datums = []
            for stuk in gesloten.replace(";", ",").split(","):
                if stuk.strip():
                    try:
                        datums.append(datetime.strptime(stuk.strip(), "%d-%m-%Y").date().isoformat())
                    except ValueError:
                        st.error(f"Datum niet begrepen: {stuk.strip()} (gebruik dag-maand-jaar).")
                        return
            try:
                R.instellen({"aan": aan, "soort": soort or i["soort"], "uren": uren, "stap": stap, "duur": int(duur),
                             "capaciteit": int(capaciteit), "max_groep": int(max_groep), "vooruit": int(vooruit),
                             "min_vooraf": int(min_vooraf) * 60, "annuleren_uren": int(annuleren_uren),
                             "gesloten": datums, "bericht": bericht.strip()})
            except samen.Fout as fout:
                st.error(str(fout))
                return
            st.session_state.plannen_melding = "Opgeslagen."
            st.rerun()
