"""Schermen voor geld: Budget (uitgaven, budgetten, vaste lasten, spaardoelen) en Beleggen (alleen meekijken)."""

from datetime import date, timedelta

import pandas as pd
import streamlit as st

import beleggen
import budget
import opslag
from werk_scherm import vraag_assistent

MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober",
           "november", "december"]
BANKEN = {
    "ING": "Log in op ing.nl (niet in de app) › je betaalrekening › *Af- en bijschrijvingen downloaden* › "
           "kies de periode en **Kommagescheiden CSV**.",
    "Rabobank": "Log in op rabobank.nl › *Rekeningen* › *Transacties downloaden* › kies **CSV**.",
    "ABN AMRO": "Log in op abnamro.nl › *Rekeningoverzicht* › *Downloaden* › kies **TXT**.",
    "bunq": "In de bunq-app: je rekening › *Afschriften* › *Exporteren* › kies **CSV**.",
    "Andere bank": "Zoek in internetbankieren naar *Transacties downloaden* of *Exporteren* en kies **CSV**.",
}


def euro(bedrag: float | None) -> str:
    if bedrag is None:
        return "–"
    return f"-€ {budget.euro(-bedrag)}" if bedrag < 0 else f"€ {budget.euro(bedrag)}"


def maandnaam(maand: str) -> str:
    jaar, nr = maand.split("-")
    return f"{MAANDEN[int(nr) - 1]} {jaar}"


def _account() -> None:
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))


# --- Budget ------------------------------------------------------------------------------------------------------

def afschrift_inlezen(sleutel: str = "afschrift") -> None:
    st.markdown("**Bankafschrift inlezen**")
    bank = st.selectbox("Je bank", list(BANKEN), key=f"{sleutel}_bank")
    st.caption(BANKEN[bank] + " Op iPad of iPhone komt het bestand in *Bestanden*; kies het daar hieronder.")
    bestand = st.file_uploader("Afschrift (CSV of TXT)", type=["csv", "txt"], key=f"{sleutel}_bestand",
                               label_visibility="collapsed")
    if bestand and st.button("Inlezen", type="primary", key=f"{sleutel}_lees"):
        try:
            uitkomst = budget.importeren(bestand.name, bestand.getvalue())
        except budget.Fout as fout:
            st.error(str(fout))
            return
        van, tot = date.fromisoformat(uitkomst["van"]), date.fromisoformat(uitkomst["tot"])
        st.session_state.budget_maand = uitkomst["tot"][:7]
        st.toast(f"{uitkomst['nieuw']} nieuwe regels ingelezen ({van:%d-%m} tot {tot:%d-%m}). "
                 f"{uitkomst['gelezen'] - uitkomst['nieuw']} stonden er al.", icon="✅")
        st.rerun()


def los_toevoegen() -> None:
    with st.form("budget_los", clear_on_submit=True, border=False):
        soort = st.segmented_control("Soort", ["Uitgave", "Inkomsten"], default="Uitgave", label_visibility="collapsed")
        bedrag = st.number_input("Bedrag in euro", min_value=0.0, step=1.0, format="%.2f")
        omschrijving = st.text_input("Waarvoor?", placeholder="Bijvoorbeeld lunch, kapper of cadeau")
        categorie = st.selectbox("Categorie", ["Vanzelf herkennen"] + list(budget.CATEGORIEEN))
        datum = st.date_input("Datum", value=date.today(), format="DD-MM-YYYY")
        if st.form_submit_button("Toevoegen", type="primary") and bedrag > 0:
            budget.toevoegen(bedrag, omschrijving or ("Uitgave" if soort != "Inkomsten" else "Inkomsten"),
                             "" if categorie == "Vanzelf herkennen" else categorie, datum.isoformat(),
                             uitgave=soort != "Inkomsten")
            st.toast("Toegevoegd.", icon="✅")
            st.rerun()
    st.caption("Sneller: typ onderaan \"€12,50 lunch\".")


def _maanden() -> list[str]:
    d, uit = date.today().replace(day=1), []
    for _ in range(13):
        uit.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    return uit


def budget_pagina() -> None:
    st.subheader("Budget")
    if not budget.in_gebruik():
        st.write("Zie in één oogopslag waar je geld naartoe gaat en hoeveel je deze maand nog vrij kunt besteden.")
        st.caption("Lees een bankafschrift in (de app herkent zelf de supermarkt, huur, abonnementen en meer), "
                   "of houd uitgaven met de hand bij. Je bankgegevens blijven privé en alleen jij ziet ze.")
        links, rechts = st.columns(2)
        with links.container(border=True):
            afschrift_inlezen("eerste")
        with rechts.container(border=True):
            st.markdown("**Met de hand**")
            los_toevoegen()
        return

    maanden = _maanden()
    if st.session_state.get("budget_maand") not in maanden:
        st.session_state.budget_maand = maanden[0]
    with st.container(horizontal=True, vertical_alignment="center"):
        maand = st.selectbox("Maand", maanden, key="budget_maand", format_func=maandnaam, label_visibility="collapsed",
                             width=190)
        with st.popover("Toevoegen", icon=":material/add:"):
            los_toevoegen()
        with st.popover("Afschrift", icon=":material/upload_file:", help="Bankafschrift inlezen"):
            afschrift_inlezen()

    o = budget.overzicht(maand)
    if "over" in o:
        st.metric("Vrij te besteden", euro(o["over"]), f"{euro(o['per_dag'])} per dag", delta_color="off",
                  delta_arrow="off", help="Wat er binnenkwam, min je uitgaven en de vaste lasten die deze maand nog "
                                          "komen. Zonder inkomsten: wat er over is van je budgetten.")
    st.caption(f"Uitgegeven {euro(o['uitgegeven'])} · binnengekomen {euro(o['inkomsten'])}"
               + (f" · gespaard {euro(o['gespaard'])}" if o["gespaard"] else ""))
    if o["vaste_lasten_nog"]:
        st.caption("Komt nog: " + ", ".join(f"{v['naam']} {euro(v['bedrag'])}" for v in o["vaste_lasten_nog"]))

    for c in o["per_categorie"]:
        if c["budget"]:
            deel = min(1.0, c["uitgegeven"] / c["budget"])
            tekst = f"{budget.CATEGORIEEN[c['categorie']][0]} {c['categorie']}: {euro(c['uitgegeven'])} van {euro(c['budget'])}"
            tekst += f" · :red[{euro(-c['over'])} te veel]" if c["over"] < 0 else f" · nog {euro(c['over'])}"
            st.progress(deel, text=tekst)
    if zonder := [c for c in o["per_categorie"] if not c["budget"]]:
        st.caption("Zonder budget: " + " · ".join(f"{c['categorie'].lower()} {euro(c['uitgegeven'])}" for c in zonder))

    st.write("")
    deel = st.segmented_control("Onderdeel", ["Regels", "Budgetten", "Vaste lasten", "Sparen", "Verloop"],
                                default="Regels", key="budget_deel", label_visibility="collapsed") or "Regels"
    if deel == "Regels":
        regels_bewerken(maand)
    elif deel == "Budgetten":
        budgetten_instellen()
    elif deel == "Vaste lasten":
        vaste_lasten()
    elif deel == "Sparen":
        spaardoelen()
    else:
        verloop()
    st.write("")
    if st.button("Vraag de assistent om tips voor deze maand", icon=":material/chat_bubble:"):
        vraag_assistent(f"Bekijk mijn budget van {maandnaam(maand)} en geef me drie concrete tips om geld over te "
                        f"houden, zonder te betuttelen.", "Tips voor mijn budget")


def regels_bewerken(maand: str) -> None:
    begin, einde = budget.maandgrenzen(maand)
    regels = budget.lijst(begin.isoformat(), einde.isoformat())
    if not regels:
        st.caption("Nog niets deze maand.")
        return
    tabel = pd.DataFrame([{"id": r["id"], "Datum": date.fromisoformat(r["datum"]),
                           "Wie of wat": r["tegenpartij"] or r["omschrijving"], "Bedrag": euro(r["bedrag"]),
                           "Categorie": r["categorie"] or "Overig", "Omschrijving": r["omschrijving"]}
                          for r in regels]).set_index("id")
    st.caption("Klopt een categorie niet? Kies de goede: de app onthoudt het voor die winkel of naam. "
               "Een regel weghalen: vink hem links aan en druk op het prullenbakje.")
    nieuw = st.data_editor(
        tabel, key=f"budget_tabel_{maand}", hide_index=True, num_rows="delete", width="stretch",
        disabled=["Datum", "Wie of wat", "Bedrag", "Omschrijving"],
        column_config={"Datum": st.column_config.DateColumn(format="DD-MM", width="small"),
                       "Bedrag": st.column_config.TextColumn(width="small"),
                       "Categorie": st.column_config.SelectboxColumn(options=list(budget.CATEGORIEEN), required=True),
                       "Omschrijving": st.column_config.TextColumn(width="medium")})
    st.download_button("Dit jaar downloaden (CSV)", icon=":material/download:", on_click="ignore", type="tertiary",
                       file_name=f"budget-{maand[:4]}.csv", mime="text/csv", data=lambda: _csv(maand[:4]))
    veranderd = False
    for regel_id in tabel.index.difference(nieuw.index):
        budget.weg(int(regel_id))
        veranderd = True
    for regel_id in nieuw.index.intersection(tabel.index):
        oud, nu = tabel.at[regel_id, "Categorie"], nieuw.at[regel_id, "Categorie"]
        if nu != oud:
            r = next(r for r in regels if r["id"] == regel_id)
            if r["tegenpartij"]:
                aantal = budget.regel_onthouden(r["tegenpartij"], nu)
                st.toast(f"Voortaan valt {r['tegenpartij']} onder {nu.lower()} ({aantal} regels aangepast).", icon="✅")
            else:
                budget.bijwerken(int(regel_id), categorie=nu)
            veranderd = True
    if veranderd:
        st.session_state.pop(f"budget_tabel_{maand}", None)
        st.rerun()


def _csv(jaar: str) -> str:
    regels = budget.lijst(f"{jaar}-01-01", f"{jaar}-12-31")
    return pd.DataFrame([{k: r[k] for k in ("datum", "bedrag", "tegenpartij", "omschrijving", "categorie", "rekening")}
                         for r in regels]).to_csv(index=False, sep=";", decimal=",")


def budgetten_instellen() -> None:
    b = budget.instellingen()["budgetten"]
    st.caption("Een budget per maand per categorie. Laat 0 staan als je er geen wilt.")
    with st.form("budgetten", border=False):
        bedragen = {}
        kolommen = st.columns(2)
        for i, naam in enumerate(budget.UITGAVEN):
            bedragen[naam] = kolommen[i % 2].number_input(naam, min_value=0.0, step=10.0, value=float(b.get(naam, 0)),
                                                          format="%.0f", key=f"bud_{naam}")
        if st.form_submit_button("Opslaan", type="primary"):
            for naam, bedrag in bedragen.items():
                if bedrag != b.get(naam, 0):
                    budget.budget_instellen(naam, bedrag)
            st.toast("Budgetten opgeslagen.", icon="✅")
            st.rerun()


def vaste_lasten() -> None:
    lasten = budget.instellingen()["vaste_lasten"]
    st.caption("Wat elke maand van je rekening gaat. De app rekent ze mee bij wat je nog vrij kunt besteden, "
               "tot ze zijn afgeschreven.")
    for v in sorted(lasten, key=lambda v: v["dag"]):
        rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
        rij.markdown(f"**{v['naam']}** · {euro(v['bedrag'])} · rond de {v['dag']}e · {v['categorie'].lower()}",
                     width="content")
        if rij.button("", icon=":material/close:", key=f"last_weg_{v['id']}", help="Weghalen", type="tertiary"):
            budget.vaste_last_weg(v["id"])
            st.rerun()
    if lasten:
        st.caption(f"Samen {euro(sum(v['bedrag'] for v in lasten))} per maand.")
    with st.form("vaste_last", clear_on_submit=True, border=True):
        st.markdown("**Vaste last toevoegen**")
        naam = st.text_input("Naam", placeholder="Bijvoorbeeld Huur of Zorgverzekering")
        kol1, kol2 = st.columns(2)
        bedrag = kol1.number_input("Bedrag per maand", min_value=0.0, step=5.0, format="%.2f")
        dag = kol2.number_input("Rond welke dag?", min_value=1, max_value=28, value=1)
        categorie = st.selectbox("Categorie", budget.UITGAVEN, index=budget.UITGAVEN.index("Wonen"))
        if st.form_submit_button("Toevoegen") and naam.strip() and bedrag > 0:
            budget.vaste_last_toevoegen(naam, bedrag, dag, categorie)
            st.rerun()


def spaardoelen() -> None:
    doelen = budget.instellingen()["spaardoelen"]
    for s in doelen:
        with st.container(border=True):
            tekst = f"**{s['naam']}**: {euro(s['gespaard'])} van {euro(s['doel'])}"
            if s.get("datum"):
                d = date.fromisoformat(s["datum"])
                maanden = max(1, (d.year - date.today().year) * 12 + d.month - date.today().month)
                nodig = max(0.0, s["doel"] - s["gespaard"]) / maanden
                tekst += f"  \nVóór {d:%d-%m-%Y}: ongeveer {euro(nodig)} per maand opzij zetten."
            st.progress(min(1.0, s["gespaard"] / s["doel"]) if s["doel"] else 0.0, text=tekst)
            kol1, kol2, kol3 = st.columns([3, 2, 1], vertical_alignment="bottom")
            erbij = kol1.number_input("Bedrag", min_value=0.0, step=10.0, format="%.2f", key=f"spaar_{s['id']}",
                                      label_visibility="collapsed")
            if kol2.button("Erbij", key=f"spaar_bij_{s['id']}", width="stretch") and erbij:
                budget.spaardoel_bijwerken(s["id"], erbij)
                st.rerun()
            if kol3.button("", icon=":material/close:", key=f"spaar_weg_{s['id']}", help="Weghalen"):
                budget.spaardoel_bijwerken(s["id"], weg=True)
                st.rerun()
    with st.form("spaardoel", clear_on_submit=True, border=not doelen):
        st.markdown("**Nieuw spaardoel**")
        naam = st.text_input("Waarvoor?", placeholder="Bijvoorbeeld Vakantie of Buffer")
        kol1, kol2 = st.columns(2)
        doel = kol1.number_input("Doelbedrag", min_value=0.0, step=50.0, format="%.0f")
        datum = kol2.date_input("Vóór (optioneel)", value=None, format="DD-MM-YYYY")
        if st.form_submit_button("Toevoegen") and naam.strip() and doel > 0:
            budget.spaardoel_toevoegen(naam, doel, datum.isoformat() if datum else None)
            st.rerun()


def verloop() -> None:
    maanden = budget.vorige_maanden(6)
    if not any(m["uitgaven"] or m["inkomsten"] for m in maanden):
        st.caption("Nog te weinig gegevens. Lees een paar maanden bankafschrift in.")
        return
    tabel = pd.DataFrame([{"Maand": MAANDEN[int(m["maand"][5:]) - 1][:3], "Uitgaven": m["uitgaven"],
                           "Inkomsten": m["inkomsten"]} for m in maanden])
    st.bar_chart(tabel, x="Maand", y=["Inkomsten", "Uitgaven"], stack=False, color=["#16a34a", "#e11d48"],
                 height=260, sort=False)


# --- Beleggen ----------------------------------------------------------------------------------------------------

def _pct(waarde: float | None) -> str:
    return "–" if waarde is None else f"{waarde:+.2f}%".replace(".", ",")


def belegging_zoeken(sleutel: str, volg: bool = False) -> None:
    zoek = st.text_input("Zoek op naam of ticker", key=f"{sleutel}_zoek", placeholder="Bijvoorbeeld Vanguard All-World")
    gevonden = []
    if zoek.strip():
        try:
            gevonden = beleggen.zoeken(zoek)
        except beleggen.Fout as fout:
            st.caption(str(fout))
    keuzes = [f"{g['naam']} · {g['symbool']} · {g['beurs']}" for g in gevonden]
    if zoek.strip() and not gevonden:
        keuzes = [f"{zoek.strip().upper()} · {zoek.strip().upper()} · zelf ingevuld"]
        gevonden = [{"symbool": zoek.strip().upper(), "naam": zoek.strip().upper(), "soort": ""}]
    if not keuzes:
        return
    keuze = st.selectbox("Kies", keuzes, key=f"{sleutel}_keuze", label_visibility="collapsed")
    g = gevonden[keuzes.index(keuze)]
    if volg:
        if st.button("Volgen", type="primary", key=f"{sleutel}_volg"):
            beleggen.volgen(g["symbool"], g["naam"], g["soort"])
            st.rerun()
        return
    koers = beleggen.koersen([g["symbool"]]).get(g["symbool"])
    if koers:
        st.caption(f"Koers nu: {koers['prijs']:.2f} {koers['valuta']}".replace(".", ","))
    kol1, kol2 = st.columns(2)
    aantal = kol1.number_input("Aantal stuks", min_value=0.0, step=1.0, format="%.4f", key=f"{sleutel}_aantal")
    prijs = kol2.number_input("Aankoopprijs per stuk (€)", min_value=0.0, step=1.0, format="%.2f",
                              key=f"{sleutel}_prijs", help="Gemiddeld, in euro's. Weet je het niet? Vul de koers van nu in.")
    if st.button("Toevoegen", type="primary", key=f"{sleutel}_toe", disabled=not aantal):
        beleggen.positie_toevoegen(g["symbool"], g["naam"], aantal, prijs, g["soort"])
        st.rerun()


def beleggen_pagina() -> None:
    st.subheader("Beleggen")
    st.caption(beleggen.WAARSCHUWING)
    with st.container(horizontal=True, vertical_alignment="center"):
        with st.popover("Belegging toevoegen", icon=":material/add:"):
            belegging_zoeken("positie")
        with st.popover("Volgen", icon=":material/visibility:", help="Een koers volgen zonder dat je hem hebt"):
            belegging_zoeken("volg", volg=True)

    if beleggen.instellingen()["posities"]:
        with st.spinner("Koersen ophalen..."):
            p = beleggen.portefeuille()
        st.metric("Waarde", euro(p["waarde"]), f"{euro(p['resultaat'])} ({_pct(p['resultaat_pct'])})")
        st.caption(f"Ingelegd {euro(p['inleg'])} · sinds de vorige slotkoers {euro(p['vandaag'])}")
        tabel = pd.DataFrame([{"id": r["id"], "Belegging": r["naam"], "Aantal": r["aantal"],
                               "Waarde": euro(r.get("waarde")), "Resultaat": euro(r.get("resultaat")),
                               "%": _pct(r.get("resultaat_pct")), "Afgelopen maand": r["verloop"]}
                              for r in p["posities"]]).set_index("id")
        st.dataframe(tabel, hide_index=True, width="stretch", column_config={
            "Aantal": st.column_config.NumberColumn(format="%.4g"),
            "Afgelopen maand": st.column_config.LineChartColumn(width="small")})
        if p["spreiding"]:
            st.caption("Spreiding: " + ", ".join(f"{s.lower()} {w / p['waarde'] * 100:.0f}%"
                                                for s, w in sorted(p["spreiding"].items(), key=lambda x: -x[1])))
        for tekst in p["let_op"]:
            st.info(tekst, icon=":material/info:")
        if p["zonder_koers"]:
            st.warning(f"Geen koers gevonden voor {', '.join(p['zonder_koers'])}. Vul hieronder bij Bewerken zelf een "
                       f"koers in.")
        if st.toggle("Bewerken", key="beleg_bewerken"):
            posities_bewerken(p["posities"])
        if st.button("Vraag de assistent om uitleg over mijn beleggingen", icon=":material/chat_bubble:"):
            vraag_assistent("Bekijk mijn beleggingen. Leg in gewone taal uit hoe ze ervoor staan, hoe mijn spreiding "
                            "is en waar ik op kan letten. Geen koop- of verkoopadvies.", "Uitleg over mijn beleggingen")
    else:
        st.write("Voeg je beleggingen toe om te zien wat ze waard zijn en hoe je spreiding is. Je kunt ook alleen "
                 "koersen volgen.")

    volg = beleggen.volglijst()
    if volg:
        st.markdown("**Volglijst**")
        for v in volg:
            rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
            prijs = f"{v['prijs']:.2f} {v['valuta']}".replace(".", ",") if v.get("prijs") else "geen koers"
            rij.markdown(f"{v['naam']} · {prijs} · {_pct(v.get('vandaag_pct'))}", width="content",
                         help=f"Afgelopen maand {_pct(v.get('maand_pct'))}")
            if rij.button("", icon=":material/close:", key=f"volg_weg_{v['symbool']}", help="Niet meer volgen",
                          type="tertiary"):
                beleggen.niet_volgen(v["symbool"])
                st.rerun()

    with st.expander("Markt vandaag"):
        markt = beleggen.markt()
        kolommen = st.columns(3)
        for i, m in enumerate(markt):
            waarde = f"{m['prijs']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if m.get("prijs") else "–"
            kolommen[i % 3].metric(m["naam"], waarde, _pct(m.get("vandaag_pct")) if m.get("vandaag_pct") is not None else None)
        st.caption("Koersen van Yahoo Finance, kunnen tot 15 minuten achterlopen.")


def posities_bewerken(posities: list[dict]) -> None:
    tabel = pd.DataFrame([{"id": r["id"], "Belegging": r["naam"], "Aantal": r["aantal"],
                           "Aankoopprijs": r["aankoopprijs"], "Eigen koers": r.get("eigen_koers")}
                          for r in posities]).set_index("id")
    st.caption("Pas aantal of aankoopprijs aan. Eigen koers gebruikt de app alleen als er geen koers te krijgen is. "
               "Weghalen: vink links aan en druk op het prullenbakje.")
    nieuw = st.data_editor(tabel, key="beleg_tabel", hide_index=True, num_rows="delete", width="stretch",
                           disabled=["Belegging"],
                           column_config={"Aankoopprijs": st.column_config.NumberColumn("Aankoopprijs (€)", format="localized", min_value=0),
                                          "Eigen koers": st.column_config.NumberColumn("Eigen koers (€)", format="localized", min_value=0),
                                          "Aantal": st.column_config.NumberColumn(min_value=0)})
    veranderd = False
    for pid in tabel.index.difference(nieuw.index):
        beleggen.positie_weg(pid)
        veranderd = True
    for pid in nieuw.index.intersection(tabel.index):
        oud, nu = tabel.loc[pid], nieuw.loc[pid]
        velden = {}
        if nu["Aantal"] != oud["Aantal"]:
            velden["aantal"] = float(nu["Aantal"])
        if nu["Aankoopprijs"] != oud["Aankoopprijs"]:
            velden["aankoopprijs"] = float(nu["Aankoopprijs"])
        if not (pd.isna(nu["Eigen koers"]) and pd.isna(oud["Eigen koers"])) and nu["Eigen koers"] != oud["Eigen koers"]:
            velden["eigen_koers"] = None if pd.isna(nu["Eigen koers"]) else float(nu["Eigen koers"])
        if velden:
            beleggen.positie_bijwerken(pid, **velden)
            veranderd = True
    if veranderd:
        st.session_state.pop("beleg_tabel", None)
        st.rerun()
