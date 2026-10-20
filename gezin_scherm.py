"""Agenda › Gezin: samen bijhouden wie haalt, wie brengt en wie waar heen gaat."""

from datetime import date, datetime, time, timedelta

import streamlit as st

import gezin
import opslag
import samen

DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]
MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]


def _account() -> None:
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))


def _namen(tekst: str) -> list[str]:
    return [n.strip() for n in tekst.replace(";", ",").split(",") if n.strip()]


def pagina(gezinnen: list[dict] | None = None) -> None:
    if melding := st.session_state.pop("gezin_melding", None):
        st.success(melding)
    gezinnen = gezinnen if gezinnen is not None else gezin.mijn()
    for g in [g for g in gezinnen if g["status"] == "uitgenodigd"]:
        with st.container(border=True, horizontal=True, vertical_alignment="center", key=f"gezin_uitn_{g['id']}"):
            st.markdown(f"**{g['door']}** nodigt je uit voor de gezinsagenda **{g['naam']}**.")
            if st.button("Meedoen", key=f"gezin_ja_{g['id']}", type="primary"):
                _antwoord(g["id"], "ja", f"Je doet mee met {g['naam']}.")
            if st.button("Nee", key=f"gezin_nee_{g['id']}"):
                _antwoord(g["id"], "nee", "Uitnodiging afgeslagen.")
    leden = [g for g in gezinnen if g["status"] == "lid"]
    if not leden:
        st.caption("Zet in één agenda wie de kinderen haalt en brengt, en wie waar heen gaat. Alleen wie je uitnodigt "
                   "en meedoet, ziet hem.")
        maken_formulier()
        return
    if len(leden) > 1:
        keuze = st.pills("Gezin", [g["id"] for g in leden], default=leden[0]["id"], key="gezin_keuze",
                         format_func=lambda i: next(g["naam"] for g in leden if g["id"] == i),
                         label_visibility="collapsed") or leden[0]["id"]
        g = next(g for g in leden if g["id"] == keuze)
    else:
        g = leden[0]
    ik = next((l["id"] for l in g["leden"] if l["ik"]), None)
    with st.container(horizontal=True, vertical_alignment="center"):
        vanaf = st.date_input("Vanaf", value=date.today(), format="DD-MM-YYYY", label_visibility="collapsed",
                              width=150, key="gezin_vanaf")
        with st.popover("Nieuw", icon=":material/add:"):
            item_formulier(g, ik)
        with st.popover("", icon=":material/group:", help="Leden"):
            leden_beheer(g)
    tot = vanaf + timedelta(days=6)
    items = gezin.agenda(g["id"], vanaf, tot)
    if not items:
        st.caption("Niets gepland deze week.")
    per_dag: dict[date, list] = {}
    for i in items:
        per_dag.setdefault(datetime.fromisoformat(i["start"]).astimezone().date(), []).append(i)
    for dag, lijst in per_dag.items():
        st.markdown(f"**{'Vandaag' if dag == date.today() else DAGEN[dag.weekday()] + f' {dag.day} {MAANDEN[dag.month - 1]}'}**")
        for i in lijst:
            item_regel(g, i, ik)


def _antwoord(gezin_id: int, antwoord: str, melding: str) -> None:
    try:
        gezin.antwoorden(gezin_id, antwoord)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    st.session_state.gezin_melding = melding
    st.rerun()


def maken_formulier() -> None:
    with st.form("gezin_maken", border=False):
        naam = st.text_input("Naam", placeholder="Bijvoorbeeld: Gezin André")
        kinderen = st.text_input("Kinderen (optioneel)", placeholder="Namen, met komma's")
        if st.form_submit_button("Gezinsagenda maken", type="primary"):
            try:
                gezin.maken(naam, _namen(kinderen))
            except samen.Fout as fout:
                st.error(str(fout))
                return
            st.session_state.gezin_melding = "Gezinsagenda gemaakt. Nodig nu je partner of oppas uit (bij Leden)."
            st.rerun()


def item_regel(g: dict, i: dict, ik: int | None) -> None:
    start = datetime.fromisoformat(i["start"]).astimezone()
    with st.container(horizontal=True, vertical_alignment="center", key=f"gezin_item_{i['id']}"):
        with st.container(gap=None):
            st.markdown(f"**{start:%H:%M}** · {gezin.omschrijving(i)}")
            wie = (":orange[Wie kan?]" if i["wie"] is None else ("Jij" if i["wie"] == ik else i["wie_naam"]))
            st.caption(" · ".join(filter(None, [wie, i["locatie"], i["notitie"][:60]])))
        if i["wie"] is None and st.button("Ik doe het", key=f"gezin_ik_{i['id']}"):
            _oppakken(i["id"], True, "Staat nu in je agenda.")
        with st.popover("", icon=":material/more_horiz:"):
            andere = {l["id"]: l["naam"] for l in g["leden"] if l["status"] == "lid"}
            nieuw = st.selectbox("Wie", [None, *andere], index=[None, *andere].index(i["wie"]) if i["wie"] in andere else 0,
                                 format_func=lambda x: "Nog open" if x is None else ("Ik" if x == ik else andere[x]),
                                 key=f"gezin_wie_{i['id']}")
            if nieuw != i["wie"] and st.button("Opslaan", key=f"gezin_wie_ok_{i['id']}", type="primary"):
                try:
                    gezin.opslaan(g["id"], i["titel"], i["soort"], start, i["minuten"], i["locatie"], i["voor"], nieuw,
                                  i["notitie"], item_id=i["id"])
                except samen.Fout as fout:
                    st.error(str(fout))
                else:
                    st.rerun()
            if i["wie"] == ik and st.button("Kan toch niet", key=f"gezin_niet_{i['id']}", width="stretch"):
                _oppakken(i["id"], False, "Teruggegeven. De anderen zien dat het weer open staat.")
            if st.button("Verwijderen", key=f"gezin_weg_{i['id']}", width="stretch"):
                gezin.weg(i["id"])
                st.rerun()


def _oppakken(item_id: int, ik: bool, melding: str) -> None:
    try:
        gezin.oppakken(item_id, ik)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    st.session_state.gezin_melding = melding
    st.rerun()


def item_formulier(g: dict, ik: int | None) -> None:
    soort = st.segmented_control("Wat", list(gezin.SOORTEN), default="brengen", key="gezin_n_soort",
                                 format_func=gezin.SOORTEN.get, label_visibility="collapsed") or "brengen"
    if g["kinderen"]:
        voor = st.pills("Voor", g["kinderen"], key="gezin_n_voor") or ""
    else:
        voor = st.text_input("Voor wie (optioneel)", key="gezin_n_voor_tekst")
    titel = st.text_input("Waarheen" if soort in ("brengen", "halen") else "Wat",
                          placeholder="School, zwemles, opa en oma..." if soort in ("brengen", "halen") else "Tandarts",
                          key="gezin_n_titel")
    with st.container(horizontal=True, gap="small"):
        dag = st.date_input("Dag", value=date.today() + timedelta(days=1), min_value=date.today(), format="DD-MM-YYYY",
                            key="gezin_n_dag", width=150)
        om = st.time_input("Tijd", value=time(8, 15) if soort == "brengen" else time(15, 0), step=300,
                           key=f"gezin_n_tijd_{soort}", width=110)
    locatie = st.text_input("Adres (optioneel)", key="gezin_n_locatie")
    leden = {l["id"]: l["naam"] for l in g["leden"] if l["status"] == "lid"}
    wie = st.selectbox("Wie doet het?", [None, *leden], key="gezin_n_wie",
                       format_func=lambda x: "Nog open: wie kan?" if x is None else ("Ik" if x == ik else leden[x]))
    if st.button("Toevoegen", type="primary", width="stretch", key="gezin_n_ok"):
        try:
            gezin.opslaan(g["id"], titel.strip(), soort, datetime.combine(dag, om), 30 if soort != "afspraak" else 60,
                          locatie.strip(), voor.strip(), wie)
        except samen.Fout as fout:
            st.error(str(fout))
            return
        for k in ("gezin_n_titel", "gezin_n_locatie", "gezin_n_voor", "gezin_n_voor_tekst"):
            st.session_state.pop(k, None)
        st.session_state.gezin_melding = "Toegevoegd." + (" De anderen krijgen een seintje." if wie is None else "")
        st.rerun()


def leden_beheer(g: dict) -> None:
    for l in g["leden"]:
        st.markdown(f"{l['naam']}" + (" (jij)" if l["ik"] else "") + (" · :gray[uitgenodigd]" if l["status"] == "uitgenodigd" else ""))
    with st.form(f"gezin_uitnodigen_{g['id']}", border=False):
        naam = st.text_input("Uitnodigen", placeholder="Gebruikersnaam")
        if st.form_submit_button("Uitnodigen"):
            try:
                gezin.uitnodigen(g["id"], naam)
            except samen.Fout as fout:
                st.error(str(fout))
            else:
                st.session_state.gezin_melding = "Uitgenodigd. Zodra diegene meedoet, ziet die de gezinsagenda."
                st.rerun()
    with st.form(f"gezin_kinderen_{g['id']}", border=False):
        nieuwe_naam = st.text_input("Naam van de gezinsagenda", value=g["naam"])
        kinderen = st.text_input("Kinderen", value=", ".join(g["kinderen"]))
        if st.form_submit_button("Opslaan"):
            gezin.bijwerken(g["id"], nieuwe_naam, _namen(kinderen))
            st.rerun()
    if st.button("Gezinsagenda verlaten", key=f"gezin_verlaten_{g['id']}"):
        _antwoord(g["id"], "verlaten", "Je bent uit de gezinsagenda. Wat aan jou was toegewezen staat weer open.")
