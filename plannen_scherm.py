"""Agenda › Plannen: samen iets plannen en reserveren. En voor zaken: reserveringen aannemen (Mijn webshop)."""

from datetime import date, datetime, time, timedelta

import streamlit as st

import opslag
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
        mijn_reserveringen()
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


@st.dialog("In je agenda zetten")
def plan_dialoog(p: dict, gelegenheid: str) -> None:
    _account()
    st.markdown(f"{p['icoon']} **{p['naam']}**")
    st.caption(" · ".join(filter(None, [p["soort"], p.get("adres"), p.get("telefoon")])))
    k1, k2 = st.columns(2)
    dag = k1.date_input("Dag", value=date.today() + timedelta(days=1), min_value=date.today(), format="DD-MM-YYYY")
    standaard = time(14, 0) if gelegenheid in ("Speelafspraak", "Familie", "Uitje") else time(19, 0)
    om = k2.time_input("Tijd", value=standaard, step=900)
    duur = st.segmented_control("Hoe lang", [60, 120, 180, 240], default=120,
                                format_func=lambda m: f"{m // 60} uur")
    uitnodigen = st.text_input("Uitnodigen", placeholder="Gebruikersnamen, met komma's (optioneel)")
    taak = st.checkbox("Herinner me om te reserveren", value=bool(p.get("reserveren")))
    if st.button("In agenda", type="primary", width="stretch"):
        plek = dict(p, reserveren=taak)
        uit = R.als_plan(plek, datetime.combine(dag, om).isoformat(timespec="minutes"), duur or 120, gelegenheid,
                         _namen(uitnodigen))
        tekst = f"{p['naam']} staat in je agenda."
        if taak:
            tekst += " Je hebt een taak om te reserveren."
        if uit["niet_uitgenodigd"]:
            tekst += f" Niet gevonden: {', '.join(uit['niet_uitgenodigd'])}."
        st.session_state.plannen_melding = tekst
        st.rerun()


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
