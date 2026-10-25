"""Agenda › Plannen: activiteiten plannen met wie, waar en extra's. In de buurt, Datum prikken en Boekingen hebben
elk een eigen pagina."""

import time as klok
from datetime import date, datetime, time, timedelta
from urllib.parse import quote, urlsplit

import streamlit as st

import boekpagina
import kort
import ics
import opslag
import planning
import prikker
import reserveren as R
import reizen
import samen
import zoekveld

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

# Per activiteit: wat je erbij kunt zetten. De rest (titel, wanneer, waar, wie) is voor alles gelijk.
EXTRAS = {"Verjaardag": ["cadeau"], "Uitje": ["pot", "reserveren"], "Etentje": ["reserveren", "pot"],
          "Date": ["reserveren"], "Speelafspraak": [], "Afspraak": []}
EXTRA_TEKST = {"cadeau": "Geld inzamelen voor een cadeau", "pot": "Kosten samen inzamelen",
               "reserveren": "Plek zoeken in de buurt"}
TITELS = {"Verjaardag": "Verjaardag ", "Etentje": "Etentje", "Date": "Date", "Uitje": "Uitje",
          "Speelafspraak": "Speelafspraak", "Afspraak": ""}


def _soort(gelegenheid: str) -> str:
    return "verjaardag" if gelegenheid == "Verjaardag" else R.GELEGENHEDEN.get(gelegenheid, R.GELEGENHEDEN["Afspraak"])[0]


def _open_tool(naam: str, route: str, gekozen: str | None) -> None:
    """Callback vóór de widget-render, zodat agenda_deel veilig kan wijzigen."""
    if naam == "Taken":
        st.session_state.agenda_deel = "Taken"
    elif naam == "Agenda":
        st.session_state.agenda_deel = "Agenda"
    if naam == "Locaties zoeken":
        st.session_state.buurt_gelegenheid = gekozen or "Uitje"
    st.session_state.ga_naar = route


def pagina() -> None:
    """Overzichtelijke activiteitenplanner met iconen en directe toegang tot tools."""
    _melding_tonen()
    online = samen.beschikbaar()
    st.markdown("### Activiteit plannen")
    st.caption("Kies een activiteit. Daarna kun je datum, locatie en deelnemers instellen.")

    keuzes = [
        ("Afspraak", ":material/event:"),
        ("Date", ":material/favorite:"),
        ("Speelafspraak", ":material/toys:"),
        ("Uitje", ":material/explore:"),
        ("Etentje", ":material/restaurant:"),
        ("Verjaardag", ":material/cake:"),
    ]
    gekozen = st.session_state.get("plannen_gelegenheid")
    for begin in range(0, len(keuzes), 2):
        links, rechts = st.columns(2, gap="small")
        for kolom, (naam, icoon) in zip((links, rechts), keuzes[begin:begin + 2]):
            with kolom:
                if st.button(naam, icon=icoon, key=f"plan_soort_{naam}",
                             type="primary" if gekozen == naam else "secondary",
                             width="stretch"):
                    st.session_state.plannen_gelegenheid = None if gekozen == naam else naam
                    st.rerun()
    if gekozen:
        st.markdown("#### " + gekozen + " organiseren")
        with st.container(border=True):
            activiteit_formulier(gekozen, online)

    st.markdown("#### Handige tools")
    tools = [
        ("Agenda", "agenda", ":material/calendar_month:"),
        ("Datum prikken", "prikken", ":material/event_available:"),
        ("Boekingen", "boekingen", ":material/event_note:"),
        ("Locaties", "buurt", ":material/place:"),
        ("Taken", "agenda", ":material/checklist:"),
        ("Uitnodigen", "communicatie", ":material/group_add:"),
    ]
    for begin in range(0, len(tools), 2):
        links, rechts = st.columns(2, gap="small")
        for kolom, (naam, route, icoon) in zip((links, rechts), tools[begin:begin + 2]):
            with kolom:
                st.button(
                    naam, icon=icoon, key=f"plan_tool_{begin}_{route}_{naam}",
                    width="stretch", on_click=_open_tool,
                    args=(naam, route, gekozen),
                )

    st.markdown("#### Mijn activiteiten")
    gepland(online)

    if online:
        with st.expander("Reserveringen en uitnodigingen", expanded=False,
                         icon=":material/inbox:"):
            mijn_reserveringen()
            mijn_aanvragen()


def naar_buurt(gelegenheid: str) -> None:
    st.session_state.buurt_gelegenheid = gelegenheid
    st.session_state.ga_naar = "buurt"
    st.rerun(scope="app")


def activiteit_formulier(gelegenheid: str, online: bool) -> None:
    extras = EXTRAS.get(gelegenheid, [])
    k = f"act_{gelegenheid}"
    titel = st.text_input("Wat", value=TITELS.get(gelegenheid, ""), key=f"{k}_titel",
                          placeholder="Bijv. verjaardag Sanne" if gelegenheid == "Verjaardag" else "Bijv. etentje")
    with st.container(horizontal=True, gap="small"):
        dag = st.date_input("Dag", value=date.today() + timedelta(days=7), min_value=date.today(),
                            format="DD-MM-YYYY", key=f"{k}_dag", width=150)
        om = st.time_input("Tijd", value=time(19, 0) if gelegenheid in ("Etentje", "Date") else time(15, 0),
                           step=900, key=f"{k}_tijd", width=110)
        uren = st.number_input("Uren", min_value=0.5, max_value=24.0, value=2.0 if gelegenheid != "Uitje" else 4.0,
                               step=0.5, key=f"{k}_uren", width=90)
    waar = zoekveld.plek_kiezen("Waar", key=f"{k}_waar")
    wie = st.text_input("Wie vraag je mee?", placeholder="Gebruikersnamen", key=f"{k}_wie",
                        help="Zij krijgen een uitnodiging en antwoorden met ja, nee of misschien.") if online else ""
    gekozen_extras = st.pills("Extra", extras, selection_mode="multi",
                              format_func=EXTRA_TEKST.get, key=f"{k}_extra", label_visibility="collapsed") if extras \
        else []
    doel = iban = None
    if {"cadeau", "pot"} & set(gekozen_extras):
        with st.container(horizontal=True, gap="small"):
            doel = st.number_input("Doel", min_value=0.0, step=5.0, value=None, format="%.0f", key=f"{k}_doel",
                                   placeholder="Optioneel", width=130)
            iban = st.text_input("Rekeningnummer", placeholder="Bijv. NL00 BANK 0123…", key=f"{k}_iban")
    with st.container(horizontal=True):
        if st.button("Plannen", type="primary", key=f"{k}_ok"):
            activiteit_opslaan(gelegenheid, titel.strip() or gelegenheid, datetime.combine(dag, om), uren, waar.strip(),
                               [n.strip().lstrip("@") for n in wie.replace(";", ",").split(",") if n.strip()],
                               gekozen_extras, doel, iban or "")
        if "reserveren" in gekozen_extras and st.button("Plek zoeken", icon=":material/near_me:", key=f"{k}_buurt"):
            naar_buurt(gelegenheid)


def activiteit_opslaan(gelegenheid: str, titel: str, start: datetime, uren: float, waar: str, wie: list[str],
                       extras: list[str], doel: float | None, iban: str) -> None:
    a = opslag.afspraak_toevoegen(titel, start.strftime("%Y-%m-%dT%H:%M"),
                                  (start + timedelta(hours=uren)).strftime("%Y-%m-%dT%H:%M"), "", waar,
                                  soort=_soort(gelegenheid))
    opslag.afspraak_bijwerken(a["id"], activiteit=gelegenheid)
    meldingen, fouten = [f"{titel} staat in je agenda."], []
    gelukt = []
    for naam in wie[:30]:
        try:
            samen.uitnodigen(a["id"], naam)
            gelukt.append(naam)
        except samen.Fout as fout:
            fouten.append(f"{naam}: {fout}")
    if gelukt:
        meldingen.append(f"{len(gelukt)} uitgenodigd.")
    if {"cadeau", "pot"} & set(extras):
        import pot
        try:
            pot.maken(f"Cadeau: {titel}" if "cadeau" in extras else f"Kosten: {titel}",
                      "cadeau" if "cadeau" in extras else "spaardoel", doel or None, iban=iban, einddatum=start.date(),
                      leden=gelukt, afspraak=str(a["id"]))
            meldingen.append("De pot staat klaar.")
        except samen.Fout as fout:
            fouten.append(str(fout))
    for k in [k for k in st.session_state if str(k).startswith(f"act_{gelegenheid}")]:
        st.session_state.pop(k, None)
    st.session_state.pop("plannen_gelegenheid", None)
    st.session_state.plannen_melding = " ".join(meldingen) + (" Niet gelukt: " + "; ".join(fouten) if fouten else "")
    st.rerun()


def gepland(online: bool) -> None:
    """Wat je de komende weken gepland hebt (je eigen activiteiten), met wie er komt en de pot."""
    nu = datetime.now()
    lijst = [a for a in opslag.afspraken_tussen(nu.date().isoformat(), (nu.date() + timedelta(days=60)).isoformat(),
                                                extern=False)
             if a.get("activiteit") and str(a.get("start", "")) >= nu.strftime("%Y-%m-%dT%H:%M")][:12]
    if not lijst:
        return
    st.markdown("**Gepland**")
    gasten = samen.gasten([a["id"] for a in lijst]) if online else {}
    potten = []
    if online:
        import pot
        try:
            potten = pot.mijn()
        except samen.Fout:
            potten = []
    for a in lijst:
        mensen = gasten.get(str(a["id"]), [])
        p = next((x for x in potten if x["afspraak"] == str(a["id"])), None)
        ja = sum(1 for g in mensen if g["antwoord"] == "ja")
        with st.expander(f"{a['titel']} · {_wanneer(a['start'])}" + (f" · {ja}/{len(mensen)} komen" if mensen else "")):
            if a.get("locatie"):
                st.caption(a["locatie"])
            if mensen:
                st.caption(samen.gasten_tekst(mensen))
            if online:
                with st.form(f"act_extra_{a['id']}", border=False, clear_on_submit=True):
                    with st.container(horizontal=True, vertical_alignment="bottom"):
                        naam = st.text_input("Meer mensen vragen", placeholder="Gebruikersnaam")
                        if st.form_submit_button("Vragen") and naam.strip():
                            try:
                                samen.uitnodigen(a["id"], naam)
                                if p:
                                    import pot
                                    pot.leden_toevoegen(p["id"], [naam])
                                st.session_state.plannen_melding = "Uitgenodigd."
                            except samen.Fout as fout:
                                st.session_state.plannen_melding = str(fout)
                            st.rerun()
            if p:
                import pot_scherm
                pot_scherm.kaart(p, key="act")
            elif online and st.button("Geld inzamelen", key=f"act_pot_{a['id']}", icon=":material/savings:",
                                      type="tertiary"):
                import pot
                try:
                    pot.maken(f"Cadeau: {a['titel']}" if a.get("activiteit") == "Verjaardag" else f"Kosten: {a['titel']}",
                              "cadeau" if a.get("activiteit") == "Verjaardag" else "spaardoel",
                              einddatum=date.fromisoformat(a["start"][:10]),
                              leden=[g["gebruikersnaam"] for g in mensen if g.get("gebruikersnaam")],
                              afspraak=str(a["id"]))
                except samen.Fout as fout:
                    st.error(str(fout))
                else:
                    st.rerun()


def buurt_pagina() -> None:
    """In de buurt: zaken in de app en plekken om je heen, per soort activiteit. Laadt pas als je hier bent."""
    _melding_tonen()
    online = samen.beschikbaar()
    standaard = st.session_state.pop("buurt_gelegenheid", None)
    if standaard:
        st.session_state.buurt_keuze = standaard
    gekozen = st.pills("Waarvoor?", [g for g in R.GELEGENHEDEN if g != "Afspraak"], key="buurt_keuze",
                       label_visibility="collapsed")
    zoeken(gekozen or "Uitje", online, True)


def prikken_pagina() -> None:
    """Datum prikken: een eigen pagina, los van uitgaan en boekingen."""
    _melding_tonen()
    if st.button("Nieuwe stemronde", icon=":material/add:", key="prik_nieuw"):
        st.session_state.pop("prik_klaar", None)
        st.session_state.prik_opties = []
        prik_maken_dialoog("Afspraak")
    if not stemrondes():
        st.caption("Nog geen stemrondes.")


def boekingen_pagina() -> None:
    """Boekingen met transparante betaalstatus en bestaande boekingsinstellingen."""
    _melding_tonen()
    st.markdown("### Boekingen & betalingen")
    if st.button("Boekingspagina instellen", icon=":material/tune:", key="boek_instellen"):
        boek_dialoog()
    try:
        gegevens = boekpagina.mijn()
    except opslag.GeenToegang:
        raise
    except Exception:
        st.warning("Boekingen en betaalstatus konden niet worden geladen.")
        return
    boekingen = gegevens.get("boekingen", [])
    if not boekingen:
        st.caption("Nog geen boekingen.")
        return
    met_betaling = [b for b in boekingen if b.get("geld")]
    betaald = sum(str(b.get("geld")).lower() == "betaald" for b in met_betaling)
    openstaand = sum(str(b.get("geld")).lower() == "open" for b in met_betaling)
    c1, c2, c3 = st.columns(3, gap="small")
    c1.metric("Boekingen", len(boekingen))
    c2.metric("Betaald", betaald)
    c3.metric("Openstaand", openstaand)
    st.caption("Aantallen boekingen, geen eurobedragen. De betaalstatus komt uit de boekingsadministratie.")
    for b in sorted(boekingen, key=lambda item: item.get("start", ""), reverse=True):
        with st.container(border=True):
            st.markdown(f"**{b.get('soort') or 'Afspraak'} · {b.get('naam') or 'Klant'}**")
            st.caption(f"{_wanneer(b['start'])} · {boekpagina.STATUS.get(b.get('status'), b.get('status', 'Onbekend'))}")
            st.caption(_boeking_betaalstatus(b))
            if b.get("status") in ("aangevraagd", "bevestigd"):
                with st.popover("Boeking beheren", icon=":material/more_horiz:"):
                    if b["status"] == "aangevraagd":
                        if st.button("Bevestigen", key=f"boek_ja_{b['id']}", type="primary"):
                            _boek_actie(b, "bevestigen", "Bevestigd en in je agenda gezet.")
                        if st.button("Afwijzen", key=f"boek_nee_{b['id']}"):
                            _boek_actie(b, "afwijzen", "Afgewezen.")
                    else:
                        if st.button("Annuleren", key=f"boek_weg_{b['id']}"):
                            _boek_actie(b, "annuleren", "Geannuleerd.")


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


def _zaken_in_app() -> list[dict]:
    """Zaken in de app waar je kunt reserveren (een minuut bewaard, zodat zoeken bij elke letter snel is)."""
    bewaard = st.session_state.get("plannen_zaken")
    if bewaard and klok.time() - bewaard[0] < 60:
        return bewaard[1]
    try:
        zaken = [z for z in R.zaken("") if not z["van_mij"]]
    except opslag.GeenToegang:
        raise
    except Exception:
        zaken = []
    st.session_state.plannen_zaken = (klok.time(), zaken)
    return zaken


@st.fragment
def zoeken(gelegenheid: str, online: bool, gekozen: bool = False) -> None:
    """Zoeken in zaken in de app en plekken in de buurt. Resultaten pas na typen of na een keuze bij Waarvoor."""
    zoekveld.context()
    zaken = _zaken_in_app() if online else []
    try:
        alles = R.ideeen(gelegenheid, alles=True, wachten=False)
        fout = None
    except reizen.AdresNietGevonden:
        alles, fout = [], "adres"
    suggesties = [zoekveld.suggestie(z["naam"], "Reserveren in de app",
                                     zoek=" ".join([z["winkeladres"], z["omschrijving"]])) for z in zaken[:30]]
    suggesties += [zoekveld.suggestie(p["naam"], f"{p['soort']} · {str(p['afstand_km']).replace('.', ',')} km",
                                      zoek=p.get("adres", "")) for p in (alles or [])[:200]]
    soorten = dict.fromkeys(p["soort"].split(",")[0] for p in alles or [])
    suggesties += [zoekveld.suggestie(naam, "Alles in de buurt") for naam in soorten]
    zoek = zoekveld.zoekveld("plannen_zoek", "Zoek een restaurant, uitje of zaak", suggesties)
    woorden = R.zoek_woorden(zoek)
    if not woorden and not gekozen:  # pas na typen of een keuze, zodat de pagina rustig blijft
        return
    if woorden:
        zaken = [z for z in zaken if all(w in R._plat(" ".join([z["naam"], z["winkeladres"], z["omschrijving"]]))
                                         for w in woorden)]
    if zaken:
        st.markdown("**Direct reserveren**")
        for z in zaken[:20]:
            with st.container(horizontal=True, vertical_alignment="center", key=f"zaak_{z['adres']}"):
                with st.container(gap=None):
                    st.markdown(f"**{z['naam']}**")
                    st.caption(" · ".join(filter(None, [z["winkeladres"], z["omschrijving"][:60]])))
                if st.button("Reserveren", key=f"res_{z['adres']}", width=110):
                    reserveer_dialoog(z, gelegenheid)
    st.markdown("**In de buurt**")
    if fout == "adres":
        st.caption("Je thuisadres is niet gevonden. Pas het aan bij Instellingen.")
        return
    plekken = None if alles is None else R.ideeen(gelegenheid, zoek=zoek, wachten=False)
    if plekken is None:  # wordt nog opgehaald; de rest van de pagina is al te gebruiken
        st.caption("Plekken in de buurt zoeken...")
        _wachten_op_buurt(gelegenheid)
        return
    in_de_buurt(gelegenheid, plekken, zoek, met_zaken=bool(zaken))


@st.fragment(run_every=1.5)
def _wachten_op_buurt(gelegenheid: str) -> None:
    """Kijkt op de achtergrond of de plekken binnen zijn en ververst dan de pagina."""
    zoekveld.context()
    try:
        klaar = R.ideeen(gelegenheid, alles=True, wachten=False) is not None
    except Exception:
        klaar = True
    if not klaar:
        st.session_state._buurt_ververst = False
    elif not st.session_state.get("_buurt_ververst"):
        st.session_state._buurt_ververst = True
        st.rerun()


def in_de_buurt(gelegenheid: str, plekken: list[dict], zoek: str = "", met_zaken: bool = False) -> None:
    if not plekken:
        if zoek:
            st.caption("Niets in de buurt gevonden." if not met_zaken else "Verder niets in de buurt gevonden.")
        elif not opslag.instellingen().get("thuisadres"):
            st.caption("Vul je thuisadres in bij Instellingen, dan zie je wat er bij jou in de buurt is.")
        else:
            st.caption("Plekken in de buurt laden lukt nu even niet. Probeer het straks opnieuw.")
        return
    toon = st.session_state.get("plannen_meer", 8)
    for i, p in enumerate(plekken[:toon]):
        with st.container(gap=None, key=f"plek_{i}"):
            st.markdown(f"**{p['naam']}**")
            soort = p["soort"] if len(p["soort"]) <= 40 else p["soort"][:40].rsplit(",", 1)[0]
            st.caption(" · ".join(filter(None, [soort, p.get("adres"),
                                                f"{str(p['afstand_km']).replace('.', ',')} km"])))
            with st.container(horizontal=True, gap="small"):
                if p.get("website"):
                    st.link_button("Website", p["website"], icon=":material/open_in_new:", type="tertiary")
                if st.button("Plannen", key=f"plan_{i}", icon=":material/event:", type="tertiary"):
                    plan_dialoog(p, gelegenheid, "Alleen in agenda")
                if p.get("reserveren") and st.button("Reserveren", key=f"reserveer_{i}",
                                                     icon=":material/restaurant:", type="tertiary"):
                    plan_dialoog(p, gelegenheid, "Reservering aanvragen")
    if len(plekken) > toon and st.button("Meer laten zien", type="tertiary"):
        st.session_state.plannen_meer = toon + 8
        st.rerun(scope="fragment")


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
    opmerking = st.text_input("Opmerking", placeholder="Bijv. allergieën", max_chars=500)
    uitnodigen = st.text_input("Uitnodigen", placeholder="Gebruikersnamen (optioneel)")
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
def plan_dialoog(p: dict, gelegenheid: str, hoe: str = "") -> None:
    """Een plek buiten de app: een reservering aanvragen (mail, bellen, website) of alleen in je agenda zetten."""
    _account()
    st.markdown(f"**{p['naam']}**")
    st.caption(" · ".join(filter(None, [p["soort"], p.get("adres"), p.get("telefoon")])))
    klaar = st.session_state.get("aanvraag_klaar")
    if klaar and klaar["plek"]["naam"] == p["naam"]:
        aanvraag_versturen_stap(klaar)
        return
    st.session_state.pop("aanvraag_klaar", None)
    hoe = st.segmented_control("Hoe", ["Reservering aanvragen", "Alleen in agenda"],
                               default=hoe or ("Reservering aanvragen" if p.get("reserveren") else "Alleen in agenda"),
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
        opmerking = st.text_input("Opmerking", placeholder="Bijv. allergieën", max_chars=500)
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
    uitnodigen = st.text_input("Uitnodigen", placeholder="Gebruikersnamen (optioneel)")
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
        st.caption("Geen mailadres bekend.")
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


def stemrondes() -> bool:
    try:
        lijst = prikker.mijn()
    except opslag.GeenToegang:
        raise
    except Exception:
        return False
    if not lijst:
        return False
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
    return True


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
                          placeholder="Bijv. etentje")
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
                             format_func=mensen.get, placeholder="Kies personen")
        if wie and st.button("Vrije tijden zoeken", icon=":material/search:"):
            try:
                gevonden = planning.vrije_momenten(wie, timedelta(minutes=duur), dagen=14, aantal=5)
            except samen.Fout as fout:
                st.error(str(fout))
            else:
                opties.extend(m for m in gevonden if m not in opties)
                opties.sort()
                st.rerun(scope="fragment")
    genodigden = st.text_input("Uitnodigen in de app", placeholder="Gebruikersnamen (optioneel)")
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


# --- Boekingspagina ---------------------------------------------------------------------------------------------------

MINUTEN = [15, 20, 30, 45, 60, 90, 120]


def _duur(m: int) -> str:
    return f"{m // 60} uur" if m % 60 == 0 else (f"{m // 60} uur {m % 60} min" if m > 60 else f"{m} min")


def _boeking_betaalstatus(boeking: dict) -> str:
    """Toon uitsluitend de door de backend bevestigde betaalstatus."""
    status = str(boeking.get("geld") or "").lower()
    labels = {
        "betaald": "Betaling ontvangen",
        "open": "Betaling openstaand",
        "terugbetaald": "Terugbetaald",
        "terugbetaling": "Terugbetaling in behandeling",
        "mislukt": "Betaling mislukt",
    }
    if status in labels:
        return labels[status]
    if status:
        return "Betaalstatus: " + status.replace("_", " ")
    return "Geen online betaling geregistreerd"


def geboekt_bij_mij() -> bool:
    """Afspraken die anderen via je boekingspagina maakten."""
    if not opslag.instellingen().get("boekpagina"):
        return False
    try:
        m = boekpagina.mijn()
        if any(not b["verwerkt"] for b in m["boekingen"]):
            boekpagina.verwerken(m)
            m = boekpagina.mijn()
    except opslag.GeenToegang:
        raise
    except Exception:
        return False
    lijst = [b for b in m["boekingen"] if b["status"] in ("aangevraagd", "bevestigd")
             and datetime.fromisoformat(b["start"]) > datetime.now().astimezone() - timedelta(hours=2)]
    if not lijst:
        return False
    for b in lijst:
        with st.container(horizontal=True, vertical_alignment="center", key=f"boeking_{b['id']}"):
            with st.container(gap=None):
                st.markdown(f"**{_wanneer(b['start'])}** · {b['naam']}")
                st.caption(_boeking_betaalstatus(b))
                st.caption(" · ".join(filter(None, [b["soort"], boekpagina.STATUS[b["status"]],
                                                    b["notitie"][:60]])))
            with st.popover("", icon=":material/more_horiz:"):
                st.caption(" · ".join(filter(None, [b["email"], b["telefoon"]])))
                if b["status"] == "aangevraagd":
                    if st.button("Bevestigen", key=f"boek_ja_{b['id']}", type="primary", width="stretch"):
                        _boek_actie(b, "bevestigen", "Bevestigd en in je agenda gezet.")
                    if st.button("Afwijzen", key=f"boek_nee_{b['id']}", width="stretch"):
                        _boek_actie(b, "afwijzen", "Afgewezen. Laat het de ander even weten.")
                elif st.button("Annuleren", key=f"boek_weg_{b['id']}", width="stretch",
                               help="De klant krijgt het betaalde bedrag terug." if b.get("geld") else None):
                    _boek_actie(b, "annuleren", "Geannuleerd en uit je agenda gehaald. Laat het de ander even weten.")
                if b["email"]:
                    onderwerp = quote(f"{b['soort']} {_wanneer(b['start'])}")
                    st.link_button("Mail sturen", f"mailto:{b['email']}?subject={onderwerp}", width="stretch")
                if b["telefoon"]:
                    st.link_button("Bellen", f"tel:{b['telefoon']}", width="stretch")
    return True


def _boek_actie(b: dict, actie: str, melding: str) -> None:
    try:
        boekpagina.afhandelen(b["id"], actie)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    if b.get("geld") == "betaald" and actie != "bevestigen":
        boekpagina.terugbetalen()
    st.session_state.plannen_melding = melding
    st.rerun()


@st.dialog("Je boekingspagina")
def boek_dialoog() -> None:
    _account()
    p = boekpagina.mijn()["pagina"] or dict(boekpagina.STANDAARD, adres=boekpagina.voorstel_adres())
    if p.get("adres") and p.get("aan") and opslag.instellingen().get("boekpagina"):
        st.caption("Anderen kiezen via deze link een vrij moment. Ze zien alleen vrije tijden, nooit je afspraken.")
        kort.deel_blok("boek", p["adres"], "Plan een afspraak met mij", "boek")
    else:
        st.caption("Maak een link waarmee anderen zelf een afspraak met je inplannen, op momenten dat je vrij bent. "
                   "Ze zien alleen vrije tijden, nooit je afspraken.")
    aan = st.toggle("Pagina staat aan", value=p["aan"])
    titel = st.text_input("Titel van je boekingspagina", value=p["titel"], placeholder="Plan een afspraak met mij", max_chars=80, help="Deze titel zien klanten bovenaan je boekingspagina.")
    soorten = []
    st.markdown("**Soort afspraak**")
    st.caption("Open alleen de dienst die je wilt instellen.")
    for i in range(3):
        oud = p["soorten"][i] if i < len(p["soorten"]) else {"naam": "", "minuten": 30}
        standaard = ["Kennismaking / intake", "Personal training", "Andere dienst of pakket"]
        kop = oud.get("naam", "").strip() or standaard[i]
        with st.expander(kop, expanded=False):
            naam = st.text_input("Dienst", value=oud["naam"], key=f"boeksoort_naam_{i}",
                                 placeholder=standaard[i])
            k1, k2 = st.columns(2)
            eigen_duur = k1.toggle("Tijd zelf instellen", value=oud["minuten"] not in MINUTEN,
                                    key=f"boeksoort_eigen_duur_{i}")
            if eigen_duur:
                minuten = k1.number_input("Duur in minuten", min_value=1, max_value=480,
                                          value=max(1, min(480, int(oud["minuten"]))),
                                          step=1, key=f"boeksoort_min_handmatig_{i}")
            else:
                minuten = k1.selectbox("Duur", MINUTEN, key=f"boeksoort_min_{i}",
                                       index=MINUTEN.index(oud["minuten"]) if oud["minuten"] in MINUTEN else 2,
                                       format_func=_duur)
            prijs = k2.number_input("Prijs (€)", min_value=0.0, max_value=10000.0, step=0.01,
                                    format="%.2f", value=(oud.get("prijs") or 0) / 100,
                                    key=f"boeksoort_prijs_{i}", help="0 = gratis.")
        if naam.strip():
            soorten.append({"naam": naam.strip(), "minuten": minuten, "prijs": round(prijs * 100)})
    dagen_nu = [int(d) for d, blokken in p["uren"].items() if blokken]
    eerste = next((blokken[0] for blokken in p["uren"].values() if blokken), ["09:00", "17:00"])
    dagen = st.pills("Op welke dagen?", range(1, 8), selection_mode="multi", default=sorted(dagen_nu),
                     format_func=lambda d: DAGEN[d - 1])
    with st.container(horizontal=True, gap="small"):
        van = st.time_input("Beschikbaar vanaf", value=time.fromisoformat(eerste[0].zfill(5)), step=60)
        tot = st.time_input("Beschikbaar tot", value=time.fromisoformat(eerste[1].zfill(5)), step=300)
    locatie = st.text_input("Waar", value=p["locatie"], placeholder="Adres of videobellen")
    with st.expander("Meer"):
        intro = st.text_area("Uitleg voor de bezoeker", value=p["intro"], max_chars=400, height=80)
        bevestigen = st.toggle("Eerst zelf goedkeuren", value=p["bevestigen"],
                               help="Uit: een boeking staat meteen in je agenda.")
        k1, k2 = st.columns(2)
        buffer = k1.number_input("Pauze ertussen (min)", min_value=0, max_value=120,
                                 value=int(p["buffer"]), step=1)
        max_per_dag = k2.number_input("Hoogstens per dag", min_value=1, max_value=20,
                                      value=int(p["max_per_dag"]), step=1)
        min_vooraf = k1.number_input("Minstens vooraf (uur)", min_value=1, max_value=168,
                                     value=int(p["min_vooraf"]), step=1)
        vooruit = k2.number_input("Vooruit boeken (dagen)", min_value=1, max_value=365,
                                  value=int(p["vooruit"]), step=1)
        adres = st.text_input("Linknaam", value=p["adres"], max_chars=40, help="Letters, cijfers en streepjes.")
    with st.expander("Betalen en annuleren"):
        regel = p.get("annuleren") or {"uren": 24, "procent": 50}
        app_betalen = st.toggle("Klanten betalen vooraf via de app", value=bool(p.get("app_betalen")),
                                disabled=not p.get("kan_app_betalen") and not p.get("app_betalen"),
                                help="De betaling bevestigt de boeking. Het geld komt na de afspraak naar je toe, "
                                     "min 5% commissie (minimaal € 0,35).")
        if not p.get("kan_app_betalen"):
            st.caption("Hiervoor meld je je eerst aan bij Instellingen › Account › Betalen via de app.")
        k1, k2 = st.columns(2)
        uren = k1.number_input("Gratis annuleren tot (uur)", min_value=0, max_value=720,
                                value=max(0, int(regel.get("uren", 24))), step=1,
                                help="0 betekent altijd gratis annuleren.")
        procent = k2.number_input("Daarna krijg jij (%)", min_value=0, max_value=100,
                                   value=max(0, min(100, int(regel.get("procent", 50)))), step=1,
                                   disabled=uren == 0,
                                   help="Vul zelf een percentage van 0 tot 100 in.")
        st.caption("Annuleer of weiger jij, dan krijgt de klant altijd alles terug.")
        st.markdown("**Zelf betaling regelen**")
        st.caption("Zonder betalen via de app ziet de klant deze gegevens.")
        betalen = p.get("betalen") or {}
        iban = st.text_input("Jouw IBAN", value=betalen.get("iban", ""), placeholder="NL00 BANK 0123 4567 89")
        rekeningnaam = st.text_input("Naam op je rekening", value=betalen.get("naam", ""), max_chars=70)
        betaallink = st.text_input("Betaallink (optioneel)", value=betalen.get("link", ""),
                                   placeholder="Betaallink")
    if st.button("Opslaan", type="primary", width="stretch", disabled=not soorten or not dagen or van >= tot):
        try:
            boekpagina.instellen({"aan": aan, "adres": adres.strip().lower(), "titel": titel.strip(), "intro": intro.strip(),
                                  "soorten": soorten, "locatie": locatie.strip(), "bevestigen": bevestigen,
                                  "uren": {str(d): [[van.strftime("%H:%M"), tot.strftime("%H:%M")]] for d in dagen},
                                  "buffer": buffer, "min_vooraf": min_vooraf, "vooruit": vooruit,
                                  "max_per_dag": int(max_per_dag),
                                  "betalen": {"iban": iban.strip(), "naam": rekeningnaam.strip(), "link": betaallink.strip()},
                                  "app_betalen": app_betalen, "annuleren": {"uren": uren, "procent": procent}})
        except samen.Fout as fout:
            st.error(str(fout))
            return
        st.rerun(scope="fragment")


def boek_pagina(adres: str) -> None:
    """De boekingspagina voor bezoekers, zonder account."""
    if klaar := st.session_state.get("boek_klaar"):
        _boek_bevestiging(klaar)
        return
    keuze = st.session_state.get("boek_soort", 0)
    try:
        p = boekpagina.bekijken(adres, keuze)
    except samen.Fout as fout:
        st.info(str(fout))
        return
    st.subheader(p["titel"] or f"Plan een afspraak met {p['naam']}")
    st.caption(" · ".join(filter(None, [p["naam"] if p["titel"] else "", p["locatie"]])))
    if p["intro"]:
        st.markdown(p["intro"])
    if len(p["soorten"]) > 1:
        gekozen = st.pills("Soort", range(len(p["soorten"])), default=keuze, label_visibility="collapsed",
                           format_func=lambda i: f"{p['soorten'][i]['naam']} · {_duur(p['soorten'][i]['minuten'])}")
        if gekozen is not None and gekozen != keuze:
            st.session_state.boek_soort = gekozen
            st.rerun()
    else:
        st.caption(f"{p['soorten'][0]['naam']} · {_duur(p['soorten'][0]['minuten'])}")
    if not p["dagen"]:
        st.info("Er zijn op dit moment geen vrije momenten. Probeer het later nog eens.")
        return
    dagen = [date.fromisoformat(d) for d in p["dagen"][:12]]
    dag = st.pills("Dag", dagen, default=dagen[0], key=f"boek_dag_{keuze}",
                   format_func=lambda d: f"{DAGEN[d.weekday()]} {d.day} {MAANDEN[d.month - 1]}") or dagen[0]
    tijden = boekpagina.tijden(adres, keuze, dag)
    if not tijden:
        st.caption("Op deze dag is niets meer vrij.")
        return
    om = st.pills("Tijd", tijden, key=f"boek_tijd_{keuze}_{dag}", format_func=lambda t: t.strftime("%H:%M"))
    if om is None:
        return
    # Remt geautomatiseerde herhaalde inzendingen binnen één browsersessie.
    # Een server-side limiet in de boekingen-RPC blijft nodig tegen nieuwe sessies/IP's.
    import time as _booking_time
    wachttijd = max(0, 20 - (_booking_time.monotonic() - st.session_state.get("_boek_laatste_poging", -1e9)))
    if wachttijd > 0:
        st.caption("Je kunt over enkele seconden opnieuw een afspraak aanvragen.")
    st.html("""<style>
    .st-key-boek_website {position:absolute!important;left:-10000px!important;
      width:1px!important;height:1px!important;overflow:hidden!important}
    </style>""")
    with st.form("boek_form"):
        naam = st.text_input("Je naam", max_chars=60)
        email = st.text_input("E-mail", max_chars=120)
        telefoon = st.text_input("Telefoon (optioneel)", max_chars=30)
        notitie = st.text_area("Waarover? (optioneel)", max_chars=500, height=80)
        website = st.text_input("Website (leeg laten)", key="boek_website", autocomplete="off", label_visibility="collapsed")
        if st.form_submit_button("Bevestig afspraak" if not p["bevestigen"] else "Aanvragen", type="primary",
                                 width="stretch"):
            if website.strip():
                st.error("De aanvraag kon niet worden verwerkt.")
                return
            if wachttijd > 0:
                st.warning("Wacht even voordat je opnieuw een afspraak aanvraagt.")
                return
            st.session_state["_boek_laatste_poging"] = _booking_time.monotonic()
            try:
                b = boekpagina.boeken(adres, keuze, om, naam, email, telefoon, notitie)
            except samen.Fout as fout:
                st.error(str(fout))
                return
            st.session_state.boek_klaar = b
            st.rerun()
    st.caption("Je gegevens gaan alleen naar " + p["naam"] + ".")


def _boek_bevestiging(b: dict) -> None:
    start = datetime.fromisoformat(b["start"]).astimezone()
    if b["status"] == "bevestigd":
        st.success(f"Staat genoteerd: {_wanneer(b['start'])}, {b['soort'].lower()} met {b['naam']}.")
    else:
        st.success(f"Aangevraagd: {_wanneer(b['start'])}. {b['naam']} bevestigt het nog.")
    st.download_button("In mijn agenda zetten", ics.bestand([{
        "id": f"boeking-{b['code'][:10]}", "titel": f"{b['soort']} met {b['naam']}",
        "start": start.strftime("%Y-%m-%dT%H:%M"),
        "einde": (start + timedelta(minutes=b["minuten"])).strftime("%Y-%m-%dT%H:%M"), "locatie": b["locatie"]}]),
        file_name="afspraak.ics", mime="text/calendar", icon=":material/calendar_add_on:", width="stretch")
    st.caption("Bewaar deze link. Daarmee zie je of het bevestigd is, en kun je annuleren:")
    st.code(f"{_basis()}/?boeking={b['code']}", language=None)


def boeking_pagina(code: str) -> None:
    """Je eigen boeking bekijken of annuleren, via de link."""
    if melding := st.session_state.pop("boeking_melding", None):
        st.success(melding)
    try:
        b = boekpagina.boeking_bekijken(code)
    except samen.Fout as fout:
        st.info(str(fout))
        return
    st.subheader(f"{b['soort']} met {b['naam']}")
    st.markdown(f"**{_wanneer(b['start'])}** · {_duur(b['minuten'])}" + (f" · {b['locatie']}" if b["locatie"] else ""))
    st.caption(boekpagina.STATUS[b["status"]].replace("Wacht op jou", f"Wacht op bevestiging van {b['naam']}"))
    if b["status"] in ("aangevraagd", "bevestigd") and datetime.fromisoformat(b["start"]) > datetime.now().astimezone():
        if st.button("Annuleren", icon=":material/event_busy:"):
            try:
                boekpagina.annuleren(code)
            except samen.Fout as fout:
                st.error(str(fout))
            else:
                st.session_state.boeking_melding = "Geannuleerd."
                st.rerun()
    if b.get("adres") and b["status"] in ("afgewezen", "geannuleerd"):
        st.link_button("Nieuw moment kiezen", f"{_basis()}/?boek={b['adres']}")


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
                               placeholder="Bijv. ik ben later")
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
