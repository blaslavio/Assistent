"""Agenda › Thuis: een huishouden (gezin, studentenhuis, samenwonen, vrienden) met agenda, boodschappen, kosten
delen, klussenrooster, samen sparen en budget."""

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
        st.toast(melding)
    gezinnen = gezinnen if gezinnen is not None else gezin.mijn()
    for g in [g for g in gezinnen if g["status"] == "uitgenodigd"]:
        with st.container(border=True, horizontal=True, vertical_alignment="center", key=f"gezin_uitn_{g['id']}"):
            st.markdown(f"**{g['door']}** nodigt je uit voor **{g['naam']}**.", width="stretch")
            if st.button("Meedoen", key=f"gezin_ja_{g['id']}", type="primary"):
                _antwoord(g["id"], "ja", f"Je doet mee met {g['naam']}.")
            if st.button("Nee", key=f"gezin_nee_{g['id']}"):
                _antwoord(g["id"], "nee", "Uitnodiging afgeslagen.")
    leden = [g for g in gezinnen if g["status"] == "lid"]
    if not leden:
        st.caption("Samen plannen, boodschappen, kosten delen en klussen verdelen. Alleen wie meedoet ziet het.")
        maken_formulier()
        return
    with st.container(horizontal=True, vertical_alignment="center"):
        if len(leden) > 1:
            keuze = st.pills("Huishouden", [g["id"] for g in leden], default=leden[0]["id"], key="gezin_keuze",
                             format_func=lambda i: next(g["naam"] for g in leden if g["id"] == i),
                             label_visibility="collapsed") or leden[0]["id"]
            g = next(g for g in leden if g["id"] == keuze)
        else:
            g = leden[0]
            st.markdown(f"**{g['naam']}**", width="stretch")
        with st.popover("", icon=":material/settings:", help="Leden en instellingen"):
            leden_beheer(g)
            with st.popover("Nieuw huishouden of groep", icon=":material/add:"):
                maken_formulier("extra")
    ik = next((l["id"] for l in g["leden"] if l["ik"]), None)
    tools = [t for t in gezin.TOOLS if t in (g.get("tools") or ["agenda"])] or ["agenda"]
    deel = tools[0] if len(tools) == 1 else (st.segmented_control(
        "Onderdeel", tools, default=tools[0], key=f"huis_deel_{g['id']}", format_func=gezin.TOOLS.get,
        label_visibility="collapsed") or tools[0])
    {"agenda": agenda_deel, "boodschappen": boodschappen_deel, "kosten": kosten_deel, "klussen": klussen_deel,
     "sparen": sparen_deel, "budget": budget_deel}[deel](g, ik)


def agenda_deel(g: dict, ik: int | None) -> None:
    with st.container(horizontal=True, vertical_alignment="center"):
        vanaf = st.date_input("Vanaf", value=date.today(), format="DD-MM-YYYY", label_visibility="collapsed",
                              width=150, key="gezin_vanaf")
        with st.popover("Nieuw", icon=":material/add:"):
            item_formulier(g, ik)
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


def _doe(functie, *args, melding: str = "", **kwargs) -> None:
    try:
        functie(*args, **kwargs)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    if melding:
        st.session_state.gezin_melding = melding
    st.rerun()


def boodschappen_deel(g: dict, ik: int | None) -> None:
    with st.form(f"huis_lijst_{g['id']}", border=False, clear_on_submit=True):
        with st.container(horizontal=True, vertical_alignment="bottom"):
            tekst = st.text_input("Erbij", placeholder="Bijv. melk", label_visibility="collapsed")
            erbij = st.form_submit_button("", icon=":material/add:")
    if erbij and tekst.strip():
        for t in [x.strip() for x in tekst.split(",") if x.strip()]:
            gezin.lijst_bijwerken(g["id"], "erbij", tekst=t)
        st.rerun()
    items = gezin.lijst(g["id"])
    if not items:
        st.caption("De lijst is leeg.")
    for i in items:
        with st.container(horizontal=True, vertical_alignment="center", key=f"gezin_item_l{i['id']}"):
            if st.checkbox(f"~~{i['tekst']}~~" if i["klaar"] else i["tekst"], value=i["klaar"],
                           key=f"huis_l_{i['id']}") != i["klaar"]:
                _doe(gezin.lijst_bijwerken, g["id"], "open" if i["klaar"] else "klaar", i["id"])
            st.caption(i["door"])
    if any(i["klaar"] for i in items) and st.button("Afgevinkte weghalen", type="tertiary"):
        _doe(gezin.lijst_bijwerken, g["id"], "klaar_weg")


def _namen_leden(g: dict, ik: int | None) -> dict[int, str]:
    return {l["id"]: ("Ik" if l["id"] == ik else l["naam"]) for l in g["leden"] if l["status"] == "lid"}


def kosten_deel(g: dict, ik: int | None) -> None:
    k = gezin.kosten(g["id"])
    namen = _namen_leden(g, ik)
    with st.popover("Uitgave", icon=":material/add:"):
        with st.form(f"huis_kosten_{g['id']}", border=False):
            oms = st.text_input("Waarvoor", placeholder="Bijv. boodschappen")
            bedrag = st.number_input("Bedrag", min_value=0.0, step=1.0, value=None, format="%.2f")
            cat = st.selectbox("Categorie", gezin.CATEGORIEEN, accept_new_options=True, placeholder="Kies of typ")
            wie = st.selectbox("Betaald door", list(namen), format_func=namen.get,
                               index=list(namen).index(ik) if ik in namen else 0)
            over = st.multiselect("Verdelen over", list(namen), default=list(namen), format_func=namen.get)
            if st.form_submit_button("Toevoegen", type="primary"):
                if not bedrag:
                    st.error("Vul een bedrag in.")
                else:
                    _doe(gezin.kosten_toevoegen, g["id"], bedrag, oms.strip(), cat, None, wie,
                         [] if set(over) == set(namen) else over, melding="Toegevoegd.")
    stappen = gezin.verrekenen(k["saldo"])
    if not stappen:
        st.caption("Iedereen staat quitte.")
    for van, naar, bedrag in stappen:
        with st.container(border=True, horizontal=True, vertical_alignment="center"):
            st.markdown(f"**{namen.get(van['id'], van['naam'])}** betaalt **{namen.get(naar['id'], naar['naam'])}** "
                        f"{samen.euro(bedrag)}", width="stretch")
            if ik in (van["id"], naar["id"]) and st.button("Verrekend", key=f"huis_verr_{van['id']}_{naar['id']}",
                                                         type="tertiary"):
                _doe(gezin.kosten_toevoegen, g["id"], bedrag, "Terugbetaald", "", None, van["id"], [naar["id"]], True,
                     melding="Verrekend.")
    if k["kosten"]:
        with st.expander(f"Uitgaven ({len(k['kosten'])})"):
            for x in k["kosten"][:60]:
                with st.container(horizontal=True, vertical_alignment="center"):
                    st.markdown(f"{x['omschrijving']} · {samen.euro(x['bedrag'])}  \n"
                                f":gray[{namen.get(x['betaald_door'], x['betaald_naam'])} · "
                                f"{date.fromisoformat(x['datum']):%d-%m}]", width="stretch")
                    if (x["van_mij"] or x["betaald_door"] == ik) and st.button(
                            "", key=f"huis_kweg_{x['id']}", icon=":material/delete:", type="tertiary"):
                        _doe(gezin.kosten_weg, x["id"])


def klussen_deel(g: dict, ik: int | None) -> None:
    namen = _namen_leden(g, ik)
    with st.popover("Klus", icon=":material/add:"):
        with st.form(f"huis_klus_{g['id']}", border=False):
            titel = st.text_input("Klus", placeholder="Bijv. afwassen")
            elke = st.segmented_control("Wisselt", ["dag", "week"], default="week",
                                        format_func=lambda x: "Elke dag" if x == "dag" else "Elke week")
            wie = st.multiselect("Om de beurt", list(namen), default=list(namen), format_func=namen.get)
            if st.form_submit_button("Toevoegen", type="primary"):
                _doe(gezin.klus_bijwerken, g["id"], "maken", titel=titel.strip(), elke=elke or "week", volgorde=wie)
    lijst = gezin.klussen(g["id"])
    if not lijst:
        st.caption("Nog geen klussen.")
    for k in lijst:
        with st.container(horizontal=True, vertical_alignment="center", key=f"gezin_item_k{k['id']}"):
            label = f"{k['titel']} · {'jij' if k['wie'] == ik else k['wie_naam']}"
            if st.checkbox(label, value=k["klaar"], key=f"huis_k_{k['id']}") != k["klaar"]:
                _doe(gezin.klus_bijwerken, g["id"], "open" if k["klaar"] else "klaar", k["id"])
            st.caption(f"daarna {k['daarna']}")
            with st.popover("", icon=":material/more_horiz:"):
                if st.button("Van het rooster", key=f"huis_kweg2_{k['id']}"):
                    _doe(gezin.klus_bijwerken, g["id"], "weg", k["id"])


def sparen_deel(g: dict, ik: int | None) -> None:
    import pot
    import pot_scherm
    with st.popover("Spaardoel", icon=":material/add:"):
        pot_scherm.maken_formulier(f"huis{g['id']}", soort="spaardoel", gezin=g["id"])
    potten = [p for p in pot.mijn() if p.get("gezin") == g["id"]]
    if not potten:
        st.caption("Nog geen spaardoel.")
    for p in potten:
        pot_scherm.kaart(p, key="huis")


def budget_deel(g: dict, ik: int | None) -> None:
    budget = g.get("budget") or {}
    uitgaven = gezin.kosten(g["id"])["deze_maand"]
    if not budget and not uitgaven:
        st.caption("Stel een budget per maand in bij het tandwiel.")
    for cat in dict.fromkeys([*budget, *uitgaven]):
        uit, max_ = float(uitgaven.get(cat, 0)), float(budget.get(cat, 0))
        st.markdown(f"**{cat}** · {samen.euro(uit)}" + (f" van {samen.euro(max_)}" if max_ else ""))
        if max_:
            st.progress(min(1.0, uit / max_))
    st.caption("Deze maand, uit Kosten delen.")


def _antwoord(gezin_id: int, antwoord: str, melding: str) -> None:
    try:
        gezin.antwoorden(gezin_id, antwoord)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    st.session_state.gezin_melding = melding
    st.rerun()


def maken_formulier(key: str = "eerste") -> None:
    vorm = st.pills("Wat voor huishouden?", list(gezin.VORMEN), default="gezin", format_func=gezin.VORMEN.get,
                    key=f"huis_vorm_{key}") or "gezin"
    with st.form(f"gezin_maken_{key}", border=False):
        naam = st.text_input("Naam", placeholder="Bijv. Huis Oudegracht" if vorm == "studentenhuis" else "Bijv. Gezin Sanne")
        deelnemers = st.text_input("Deelnemers zonder account", placeholder="Optioneel",
                                   help="Bijv. kinderen of een huisgenoot zonder app. Met komma's.")
        tools = st.pills("Hulpmiddelen", list(gezin.TOOLS), selection_mode="multi",
                         default=gezin.STANDAARD_TOOLS[vorm], format_func=gezin.TOOLS.get, key=f"huis_tools_{key}_{vorm}")
        if st.form_submit_button("Maken", type="primary"):
            try:
                gezin.huishouden_maken(naam, vorm, _namen(deelnemers), tools)
            except samen.Fout as fout:
                st.error(str(fout))
                return
            st.session_state.gezin_melding = "Gemaakt. Nodig de anderen uit via het tandwiel."
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
                          placeholder="Bijv. zwemles" if soort in ("brengen", "halen") else "Tandarts",
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
                st.session_state.gezin_melding = "Uitgenodigd. Zodra diegene meedoet, ziet die alles."
                st.rerun()
    with st.form(f"gezin_instellen_{g['id']}", border=False):
        nieuwe_naam = st.text_input("Naam", value=g["naam"])
        vorm = st.selectbox("Soort", list(gezin.VORMEN), format_func=gezin.VORMEN.get,
                            index=list(gezin.VORMEN).index(g.get("vorm") or "gezin"))
        deelnemers = st.text_input("Deelnemers zonder account", value=", ".join(g["kinderen"]))
        tools = st.multiselect("Hulpmiddelen", list(gezin.TOOLS), default=g.get("tools") or ["agenda"],
                               format_func=gezin.TOOLS.get)
        budget = {}
        if "budget" in tools:
            st.caption("Budget per maand")
            for cat in gezin.CATEGORIEEN:
                budget[cat] = st.number_input(cat, min_value=0.0, step=10.0, format="%.0f",
                                              value=float((g.get("budget") or {}).get(cat, 0)))
        if st.form_submit_button("Opslaan"):
            _doe(gezin.instellen, g, nieuwe_naam, vorm, _namen(deelnemers), tools, budget, melding="Opgeslagen.")
    if st.button("Verlaten", key=f"gezin_verlaten_{g['id']}"):
        _antwoord(g["id"], "verlaten", "Je doet niet meer mee. Wat aan jou was toegewezen staat weer open.")
