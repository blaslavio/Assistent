"""Pagina Sport: je week, geplande trainingen (ook boekingen en lessen bij anderen), doelen en koppelingen met
sport- en gezondheidsapps. Rustig opgebouwd: één onderdeel tegelijk, details achter één knop."""

from datetime import date, datetime, time as kloktijd, timedelta

import streamlit as st

import gezondheid
import opslag
import samen
import tijd
import zoekveld

DAG = ["ma", "di", "wo", "do", "vr", "za", "zo"]


def _uren(minuten: int) -> str:
    return f"{minuten // 60}u{minuten % 60:02d}" if minuten >= 60 else f"{minuten} min"


def _wanneer(start: str) -> str:
    d = datetime.fromisoformat(start[:16])
    dag = "Vandaag" if d.date() == date.today() else "Morgen" if d.date() == date.today() + timedelta(days=1) \
        else f"{DAG[d.weekday()]} {d:%d-%m}"
    return dag + (f" · {d:%H:%M}" if "T" in start else "")


def zonder_resultaat(nu: datetime) -> list[dict]:
    """Sportafspraken van vandaag die voorbij zijn en nog geen resultaat hebben."""
    vandaag = nu.date().isoformat()
    return [a for a in opslag.afspraken_tussen(vandaag, vandaag)
            if a.get("sport") and not a.get("sport_resultaat")
            and ("weg" in a.get("tijden", {}) or (a.get("einde") or a["start"]) <= nu.isoformat(timespec="minutes"))]


def resultaat_vragen(nu: datetime) -> None:
    """"Hoe ging het?" per training, compact: invullen achter één knop."""
    for a in zonder_resultaat(nu):
        with st.container(border=True, horizontal=True, vertical_alignment="center"):
            st.markdown(f"{tijd.sport_icoon(a['sport'])} Hoe ging **{a['titel']}**?", width="stretch")
            with st.popover("Invullen"):
                with st.form(f"sport_{a['id']}", border=False):
                    minuten = st.number_input("Minuten", 0, 600, tijd.sportminuten(a), step=5)
                    km = st.number_input("Afstand in km", 0.0, 500.0, 0.0, step=0.5, help="0 als het niet telt")
                    gevoel = st.select_slider("Hoe voelde het?", options=[1, 2, 3, 4, 5], value=3,
                                              format_func=lambda g: ["Zwaar", "Pittig", "Goed", "Lekker", "Top"][g - 1])
                    if st.form_submit_button("Opslaan", type="primary"):
                        opslag.sport_vastleggen(a["id"], int(minuten), float(km), gevoel)
                        st.rerun()


def gepland(dagen: int = 14) -> list[dict]:
    """Komende trainingen: eigen sportafspraken, en boekingen en groepslessen bij anderen."""
    van = datetime.now() - timedelta(hours=1)
    tot = (date.today() + timedelta(days=dagen)).isoformat()
    uit = [{"start": a["start"], "titel": a["titel"], "sport": a.get("sport") or "", "minuten": tijd.sportminuten(a),
            "waar": a.get("locatie") or "", "soort": "eigen", "id": a["id"]}
           for a in opslag.afspraken_tussen(date.today().isoformat(), tot, extern=True)
           if (a.get("sport") or a.get("soort") == "sport") and not a.get("sport_resultaat")
           and a["start"] >= van.isoformat(timespec="minutes")]
    if samen.beschikbaar():
        try:
            m = opslag._rpc_ik("mijn_trainingen")
        except opslag.GeenToegang:
            raise
        except Exception:
            m = {}
        for b in m.get("boekingen", []):
            start = datetime.fromisoformat(b["start"]).astimezone(gezondheid.AMSTERDAM).strftime("%Y-%m-%dT%H:%M")
            if start <= tot + "T23:59":
                uit.append({"start": start, "titel": b["soort"], "sport": gezondheid.sport_nl(b["soort"]),
                            "minuten": b["minuten"], "waar": b["locatie"], "soort": "boeking", "bij": b["bij"],
                            "status": b["status"]})
        for l in m.get("lessen", []):
            start = datetime.fromisoformat(l["start"]).astimezone(gezondheid.AMSTERDAM).strftime("%Y-%m-%dT%H:%M")
            if start <= tot + "T23:59":
                uit.append({"start": start, "titel": l["naam"], "sport": gezondheid.sport_nl(l["naam"]),
                            "minuten": l["minuten"], "waar": l["locatie"], "soort": "les", "bij": l["bij"],
                            "status": l["status"]})
    # Een boeking die ook als afspraak in je agenda staat, maar één keer tonen.
    gezien, schoon = set(), []
    for t in sorted(uit, key=lambda t: (t["start"], t["soort"] == "eigen")):
        if (t["start"], t["titel"].lower()) not in gezien:
            gezien.add((t["start"], t["titel"].lower()))
            schoon.append(t)
    return schoon


def training_regel(t: dict) -> None:
    icoon = tijd.sport_icoon(t["sport"]) if t["sport"] else ":material/emoji_events:"
    extra = []
    if t.get("bij"):
        extra.append(("Les bij " if t["soort"] == "les" else "Bij ") + t["bij"])
    if t.get("status") in ("aangevraagd", "wachtlijst"):
        extra.append({"aangevraagd": "nog niet bevestigd", "wachtlijst": "op de wachtlijst"}[t["status"]])
    if t.get("waar"):
        extra.append(t["waar"])
    with st.container(border=True):
        st.markdown(f"{icoon} **{t['titel']}**  \n:gray[{_wanneer(t['start'])}"
                    + (f" · {_uren(t['minuten'])}" if t.get("minuten") else "") + "]"
                    + (f"  \n:gray[{' · '.join(extra)}]" if extra else ""))


def overzicht(nu: datetime) -> None:
    week = tijd.sportoverzicht((nu.date() - timedelta(days=6)).isoformat(), nu.date().isoformat())
    vorige = tijd.sportoverzicht((nu.date() - timedelta(days=13)).isoformat(), (nu.date() - timedelta(days=7)).isoformat())
    st.caption("Afgelopen 7 dagen")
    k1, k2, k3 = st.columns(3)
    k1.metric("Trainingen", week["aantal"], week["aantal"] - vorige["aantal"] or None)
    k2.metric("Tijd", _uren(week["minuten"]))
    k3.metric("Afstand", f"{week['afstand_km']:g} km")
    if d := gezondheid.dagen(7):
        stappen = [x["stappen"] for x in d if x.get("stappen")]
        slaap = next((x for x in d if x.get("slaap_min") or x.get("slaap_score")), None)
        k1, k2, k3 = st.columns(3)
        if stappen:
            k1.metric("Stappen (gem.)", f"{round(sum(stappen) / len(stappen)):,}".replace(",", "."))
        if slaap:
            k2.metric("Slaap", _uren(slaap["slaap_min"]) if slaap.get("slaap_min") else f"score {slaap['slaap_score']}")
        if rust := next((x["rusthartslag"] for x in d if x.get("rusthartslag")), None):
            k3.metric("Rusthartslag", f"{rust}")
    resultaat_vragen(nu)
    komend = gepland(7)
    st.markdown("**Komende trainingen**")
    if not komend:
        st.caption("Niets gepland deze week.")
    for t in komend[:3]:
        training_regel(t)
    if len(komend) > 3 and st.button(f"Alle {len(komend)} bekijken", type="tertiary"):
        st.session_state.sport_deel = "Training"
        st.rerun()


def trainingen(nu: datetime) -> None:
    with st.popover("Training plannen", icon=":material/add:"):
        plannen_formulier(nu)
    lijst = gepland(14)
    st.markdown("**Gepland**")
    if not lijst:
        st.caption("Nog niets gepland. Boekingen en lessen bij anderen komen hier vanzelf bij.")
    for t in lijst:
        training_regel(t)
    gedaan = [a for a in opslag.afspraken_tussen((nu.date() - timedelta(days=30)).isoformat(), nu.date().isoformat())
              if a.get("sport") and a.get("sport_resultaat")]
    if gedaan:
        with st.expander(f"Gedaan, afgelopen 30 dagen ({len(gedaan)})"):
            for a in sorted(gedaan, key=lambda a: a["start"], reverse=True)[:40]:
                r = a["sport_resultaat"]
                delen = [_uren(r["minuten"])] if r.get("minuten") else []
                if r.get("afstand_km"):
                    delen.append(f"{r['afstand_km']:g} km")
                if r.get("bron"):
                    delen.append(f"uit {r['bron']}" if r["bron"] != "strava" else "uit Strava")
                st.markdown(f"{tijd.sport_icoon(a['sport'])} {a['titel']}  \n:gray[{_wanneer(a['start'])}"
                            + (" · " + " · ".join(delen) if delen else "") + "]")


def plannen_formulier(nu: datetime) -> None:
    # Geen st.form: zo kun je meteen zelf een sport typen als hij niet in de lijst staat.
    r = st.session_state.get("sp_ronde", 0)
    sport = st.selectbox("Sport", tijd.SPORTEN, index=tijd.SPORTEN.index("hardlopen"), format_func=str.capitalize,
                         accept_new_options=True, placeholder="Kies of typ je sport", key=f"sp_sport_{r}") or ""
    k1, k2 = st.columns(2)
    dag = k1.date_input("Dag", value=nu.date() + timedelta(days=1), min_value=nu.date(), format="DD-MM-YYYY",
                        key=f"sp_dag_{r}")
    om = k2.time_input("Hoe laat", value=kloktijd(19, 0), step=900, key=f"sp_om_{r}")
    k1, k2 = st.columns(2)
    duur = k1.number_input("Minuten", 10, 600, 60, step=5, key=f"sp_duur_{r}")
    weken = k2.number_input("Elke week, aantal keer", 1, 26, 1, help="1 = alleen deze keer", key=f"sp_weken_{r}")
    waar = zoekveld.plek_kiezen("Waar", key=f"sp_waar_{r}")
    if st.button("Plannen", type="primary", key=f"sp_plan_{r}"):
        naam = sport.strip().lower()
        if not naam:
            st.error("Typ welke sport.")
            return
        for w in range(int(weken)):
            begin = datetime.combine(dag + timedelta(weeks=w), om)
            opslag.afspraak_toevoegen(naam.capitalize(), begin.isoformat(timespec="minutes"),
                                      (begin + timedelta(minutes=int(duur))).isoformat(timespec="minutes"),
                                      locatie=waar.strip(), sport=naam, soort="sport")
        st.session_state.sport_melding = "Gepland." if weken == 1 else f"{int(weken)} trainingen gepland."
        st.session_state.sp_ronde = r + 1
        st.rerun()


# --- Koppelen -----------------------------------------------------------------------------------------------------

def koppelen(app_adres: str) -> None:
    s = gezondheid.status()
    gekoppeld = {k["aanbieder"]: k for k in s["koppelingen"]}
    st.caption("Alleen lezen: trainingen, stappen en slaap. De app kan niets plaatsen of wijzigen, en je kunt altijd "
               "ontkoppelen.")
    zichtbaar = [a for a in gezondheid.AANBIEDERS if a in s["aan"] or a in gekoppeld]
    for a in zichtbaar:
        naam, wat, _ = gezondheid.AANBIEDERS[a]
        k = gekoppeld.get(a)
        with st.container(border=True, horizontal=True, vertical_alignment="center"):
            regel = f"**{naam}**  \n:gray[{wat}]"
            if k and k["status"] == "verlopen":
                regel = f"**{naam}**  \n:orange[Opnieuw verbinden nodig]"
            elif k:
                regel = f"**{naam}**" + (f" · {k['naam']}" if k["naam"] else "") + "  \n:green[Verbonden]"
            st.markdown(regel, width="stretch")
            if k and k["status"] == "actief":
                with st.popover("", icon=":material/more_horiz:"):
                    if st.button("Nu ophalen", key=f"gz_op_{a}", icon=":material/sync:", width="stretch"):
                        try:
                            n = gezondheid.ophalen(a, dagen=30)
                            st.session_state.sport_melding = f"{n} nieuwe training(en)." if n else "Alles is bij."
                        except gezondheid.Fout as fout:
                            st.session_state.sport_melding = str(fout)
                        st.rerun()
                    if st.button("Ontkoppelen", key=f"gz_weg_{a}", width="stretch"):
                        _ontkoppelen(a)
            elif url := st.session_state.get(f"gz_url_{a}"):
                # Inloggen gebeurt bij de app zelf (niet in de app-browser); daarna kom je vanzelf terug.
                with st.container(key=f"buiten_gz_{a}", width="content"):
                    st.link_button("Inloggen", url, type="primary", icon=":material/open_in_new:")
            elif st.button("Verbinden", key=f"gz_in_{a}", type="primary"):
                try:
                    st.session_state[f"gz_url_{a}"] = gezondheid.koppelen(a)
                except gezondheid.Fout as fout:
                    st.session_state.sport_melding = str(fout)
                st.rerun()
    _apple_gezondheid(s)
    with st.container(border=True):
        st.markdown("**Bestand uit een andere app**  \n:gray[Garmin, Suunto, COROS, Polar, Zwift, of je eigen lijst: "
                    "GPX, TCX, FIT of CSV.]")
        bestanden = st.file_uploader("Bestanden", type=["gpx", "tcx", "fit", "csv"], accept_multiple_files=True,
                                     label_visibility="collapsed", key="gz_bestanden")
        if bestanden and st.button("Toevoegen", type="primary"):
            nieuw, fouten = 0, []
            for b in bestanden:
                try:
                    nieuw += gezondheid.bestand_importeren(b.name, b.getvalue())
                except gezondheid.Fout as fout:
                    fouten.append(f"{b.name}: {fout}")
            for f in fouten:
                st.error(f)
            if not fouten:
                st.session_state.sport_melding = f"{nieuw} training(en) toegevoegd." if nieuw else "Deze stonden er al."
                st.session_state.pop("gz_bestanden", None)
                st.rerun()
    st.caption("Samsung Health, Google Health Connect of Garmin? Laat die app delen met Strava of Fitbit, of gebruik "
               "een bestand. Zij bieden zelf geen koppeling via internet.")
    if s.get("eigenaar"):
        _beheer(s, app_adres)


def _ontkoppelen(aanbieder: str) -> None:
    try:
        gezondheid.ontkoppelen(aanbieder)
        st.session_state.sport_melding = "Ontkoppeld. Er komt niets meer binnen."
    except gezondheid.Fout as fout:
        st.session_state.sport_melding = str(fout)
    st.rerun()


def _apple_gezondheid(s: dict) -> None:
    with st.container(border=True):
        st.markdown("**Apple Gezondheid**  \n:gray[Ook Apple Watch. Apple biedt geen koppeling via internet; de app "
                    "Health Auto Export stuurt je gegevens naar je eigen, geheime adres.]")
        if code := st.session_state.get("gz_inzendcode"):
            st.caption("Je adres (alleen nu te zien). Tik op het kopieer-icoon:")
            st.code(gezondheid.inzendadres(code), language=None, wrap_lines=True)
            st.markdown("1. Installeer **Health Auto Export** uit de App Store.  \n"
                        "2. Kies *Automations*, dan *New automation* en *REST API*.  \n"
                        "3. Plak het adres bij *URL*. Kies *JSON*, en zet *Workouts* en de gegevens *Stappen* en "
                        "*Slaap* aan.  \n"
                        "4. Klaar. Wat binnenkomt, staat binnen een paar uur bij Sport.")
            if st.button("Klaar", key="gz_code_klaar"):
                st.session_state.pop("gz_inzendcode", None)
                st.rerun()
            return
        with st.container(horizontal=True):
            if st.button("Nieuw adres maken" if s["inzendadres"] else "Instellen", key="gz_code",
                         type="secondary" if s["inzendadres"] else "primary"):
                try:
                    st.session_state.gz_inzendcode = gezondheid.inzendcode_maken()
                except gezondheid.Fout as fout:
                    st.error(str(fout))
                st.rerun()
            if s["inzendadres"] and st.button("Stoppen", key="gz_code_stop"):
                gezondheid.inzendcode_stoppen()
                st.session_state.sport_melding = "Gestopt. Het oude adres werkt niet meer."
                st.rerun()
        if s["inzendadres"]:
            st.caption(":green[Ingesteld.] Een nieuw adres maken stopt het oude meteen.")


def _beheer(s: dict, app_adres: str) -> None:
    with st.expander("Apps aanzetten (alleen jij als eigenaar)", icon=":material/admin_panel_settings:"):
        st.caption("Maak bij elke app één keer een ontwikkelaarsapp aan en vul hier de sleutels in. Daarna kan iedereen "
                   "met één tik verbinden. Als terugkeeradres (redirect URI) gebruik je:")
        st.code(app_adres.rstrip("/") + "/", language=None)
        for a, (naam, _, portaal) in gezondheid.AANBIEDERS.items():
            klaar = (s.get("ingesteld") or {}).get(a)
            with st.form(f"gz_app_{a}", border=True):
                st.markdown(f"**{naam}**" + (" · :green[aan]" if klaar else ""))
                st.caption(f"Sleutels maken: {portaal}")
                k1, k2 = st.columns(2)
                cid = k1.text_input("Client ID", key=f"gz_cid_{a}", placeholder="Ingesteld" if klaar else "")
                geheim = k2.text_input("Client secret", type="password", key=f"gz_sec_{a}",
                                       placeholder="Ingesteld" if klaar else "")
                if st.form_submit_button("Opslaan"):
                    try:
                        gezondheid.app_instellen(a, cid, geheim)
                        st.session_state.sport_melding = f"{naam} opgeslagen."
                        st.rerun()
                    except gezondheid.Fout as fout:
                        st.error(str(fout))
