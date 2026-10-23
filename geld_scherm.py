"""Schermen voor geld: Budget (uitgaven, budgetten, vaste lasten, spaardoelen) en Beleggen (alleen meekijken)."""

import html
from datetime import date, datetime, time as kloktijd, timedelta
from urllib.parse import urlparse

import pandas as pd
import streamlit as st

import bank
import beleggen
import budget
import opslag
import taal
from werk_scherm import vraag_assistent
import zoekveld

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


# Wordt door app.py gezet: toont de knop "Facturen uit mijn mail" en het voorstel van de assistent.
mail_hulp = None


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


def bank_instellen(plek: str) -> None:
    """Je bank koppelen (alleen lezen); daarna komen je uitgaven vanzelf binnen."""
    s = bank.status()
    if not s.get("aan"):
        if opslag._naam.get() == "" or samen_eigenaar():
            bank_platform_instellen(plek)
        else:
            st.caption("Rechtstreeks koppelen met je bank komt binnenkort. Lees zolang een afschrift in.")
        return
    for k in s["koppelingen"]:
        rekeningen = ", ".join(r["iban"][-4:].rjust(8, "•") for r in k["rekeningen"]) or "geen rekeningen"
        tekst = f"**{k['bank']}** · {rekeningen}"
        if k["status"] == "verlopen":
            tekst += "  \n:red[Toestemming verlopen]"
        elif k.get("laatst_opgehaald"):
            tekst += f"  \n:gray[bijgewerkt {datetime.fromisoformat(k['laatst_opgehaald']).astimezone():%d-%m %H:%M}]"
        rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
        rij.markdown(tekst, width="content")
        knoppen = rij.container(horizontal=True, width="content", gap="small")
        if k["status"] == "actief" and knoppen.button("", icon=":material/refresh:", key=f"{plek}_bank_ververs_{k['id']}",
                                                      help="Nu bijwerken", type="tertiary"):
            with st.spinner("Ophalen bij je bank..."):
                try:
                    r = bank.ophalen(k["id"])
                except bank.Fout as fout:
                    st.error(str(fout))
                else:
                    st.toast(f"{r['nieuw']} nieuwe regels.", icon=":material/check:")
                    st.rerun()
        if knoppen.button("", icon=":material/link_off:", key=f"{plek}_bank_weg_{k['id']}", help="Ontkoppelen",
                          type="tertiary"):
            bank.ontkoppelen(k["id"])
            st.rerun()
    try:
        lijst = bank.banken()
    except bank.Fout as fout:
        st.caption(str(fout))
        return
    keuze = st.selectbox("Bank koppelen" if not s["koppelingen"] else "Nog een bank", [b["naam"] for b in lijst],
                         index=None, placeholder="Kies je bank", key=f"{plek}_bank_keuze")
    if keuze:
        if st.button("Inloggen bij je bank", key=f"{plek}_bank_koppel", type="primary", width="stretch"):
            try:
                st.session_state[f"{plek}_bank_url"] = bank.koppelen(keuze)
            except bank.Fout as fout:
                st.error(str(fout))
        if url := st.session_state.get(f"{plek}_bank_url"):
            st.link_button(f"Naar {keuze}", url, icon=":material/open_in_new:", width="stretch")
        st.caption("Alleen meelezen; overmaken kan niet.")


def _app_adres() -> str:
    """Het adres van deze app (zonder pad), bijvoorbeeld https://naam.streamlit.app."""
    try:
        url = urlparse(st.context.url)
        return f"{url.scheme}://{url.netloc}"
    except Exception:
        return ""


def samen_eigenaar() -> bool:
    return (st.session_state.get("ik") or {}).get("id") == 1


def bank_platform_instellen(plek: str) -> None:
    """Alleen de eigenaar: de sleutel van Enable Banking. Gaat naar de database, nooit in de code of de chat."""
    adres = _app_adres()
    st.caption("1. Maak een gratis account bij Enable Banking en registreer een applicatie. Vul als "
               "*redirect URL* dit adres in:")
    st.code(adres + "/", language=None)
    st.link_button("Enable Banking", "https://enablebanking.com/cp/applications", icon=":material/open_in_new:")
    st.caption("2. Vul hier het application ID in en kies de .pem-sleutel die je browser downloadde.")
    with st.form(f"{plek}_eb", border=False):
        app_id = st.text_input("Application ID")
        pem = st.file_uploader("Sleutel (.pem)", type=["pem"])
        if st.form_submit_button("Opslaan", type="primary") and (app_id or pem):
            try:
                bank.instellen(app_id, pem.getvalue().decode() if pem else "", adres)
            except bank.Fout as fout:
                st.error(str(fout))
            else:
                st.rerun()


def los_toevoegen() -> None:
    soort = st.segmented_control("Soort", ["Uitgave", "Inkomsten"], default="Uitgave", label_visibility="collapsed",
                                 key="budget_los_soort") or "Uitgave"
    with st.form("budget_los", clear_on_submit=True, border=False):
        bedrag = st.number_input("Bedrag in euro", min_value=0.0, step=1.0, format="%.2f")
        omschrijving = st.text_input("Waarvoor?", placeholder="Bijv. lunch"
                                     if soort == "Uitgave" else "Bijvoorbeeld salaris, toeslag of verkocht op Vinted")
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
        if mail_hulp:
            mail_hulp()
        return

    maanden = _maanden()
    if st.session_state.get("budget_maand") not in maanden:
        st.session_state.budget_maand = maanden[0]
    with st.container(horizontal=True, vertical_alignment="center"):
        maand = st.selectbox("Maand", maanden, key="budget_maand", format_func=maandnaam, label_visibility="collapsed",
                             width=190)
        with st.popover("Toevoegen", icon=":material/add:"):
            los_toevoegen()
        with st.popover("Bank", icon=":material/account_balance:", help="Je bank koppelen of een afschrift inlezen"):
            bank_instellen("budget")
            with st.expander("Afschrift inlezen"):
                afschrift_inlezen()

    o = budget.overzicht(maand)
    if "over" in o:
        st.metric("Vrij te besteden", euro(o["over"]), f"{euro(o['per_dag'])} per dag", delta_color="off",
                  delta_arrow="off", help="Wat er binnenkwam, min je uitgaven en de vaste lasten die deze maand nog "
                                          "komen. Zonder inkomsten: wat er over is van je budgetten.")
    st.caption(f"Uit {euro(o['uitgegeven'])} · in {euro(o['inkomsten'])}"
               + (f" · gespaard {euro(o['gespaard'])}" if o["gespaard"] else "")
               + (f" · komt nog {euro(o['nog_vast'])}" if o["nog_vast"] else ""))

    for c in o["per_categorie"]:
        if c["budget"]:
            deel = min(1.0, c["uitgegeven"] / c["budget"])
            tekst = f"{budget.CATEGORIEEN[c['categorie']][0]} {c['categorie']}: {euro(c['uitgegeven'])} van {euro(c['budget'])}"
            tekst += f" · :red[{euro(-c['over'])} te veel]" if c["over"] < 0 else f" · nog {euro(c['over'])}"
            st.progress(deel, text=tekst)
    if zonder := [c for c in o["per_categorie"] if not c["budget"]]:
        st.caption("Zonder budget: " + " · ".join(f"{c['categorie'].lower()} {euro(c['uitgegeven'])}" for c in zonder))

    st.write("")
    open_ = budget.facturen(alleen_open=True)
    deel = st.segmented_control("Onderdeel", ["Uitgaven", "Facturen", "Verwacht", "Plannen"],
                                default="Uitgaven", key="budget_deel", label_visibility="collapsed",
                                format_func=lambda d: f"Facturen ({len(open_)})" if d == "Facturen" and open_ else d) \
        or "Uitgaven"
    if deel == "Uitgaven":
        regels_bewerken(maand)
        with st.expander("Afgelopen maanden"):
            verloop()
    elif deel == "Facturen":
        facturen_overzicht()
    elif deel == "Verwacht":
        verwacht_overzicht()
    else:
        with st.expander("Budget per categorie"):
            budgetten_instellen()
        with st.expander("Vaste lasten en inkomsten"):
            st.markdown("**Inkomsten**")
            vaste_inkomsten()
            st.markdown("**Lasten**")
            vaste_lasten()
        with st.expander("Saldo nu"):
            saldo_instellen()
        with st.expander("Spaardoelen"):
            spaardoelen()
    if st.button("Tips van de assistent", icon=":material/chat_bubble:", type="tertiary"):
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
    st.caption("Categorie aanpassen? De app onthoudt het voor die naam.")
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


def facturen_overzicht() -> None:
    """Facturen uit je mail of met de hand: wat nog betaald moet worden en wat je nog krijgt."""
    if mail_hulp:
        mail_hulp()
    if n := budget.afstemmen():
        st.toast(f"{n} {'factuur' if n == 1 else 'facturen'} op betaald gezet (gevonden op je afschrift).",
                 icon=":material/check:")
    alle = budget.facturen()
    vandaag = date.today().isoformat()
    open_ = [f for f in alle if f["status"] == "open"]
    if not alle:
        st.caption("Nog geen facturen.")
    for f in open_:
        factuur_rij(f, vandaag)
    with st.popover("Toevoegen", icon=":material/add:"):
        with st.form("factuur_nieuw", clear_on_submit=True, border=False):
            soort = st.segmented_control("Soort", ["Betalen", "Krijgen"], default="Betalen",
                                         label_visibility="collapsed")
            van = st.text_input("Van wie?")
            bedrag = st.number_input("Bedrag", min_value=0.0, step=1.0, format="%.2f")
            vervaldatum = st.date_input("Uiterlijk op", value=None, format="DD-MM-YYYY")
            automatisch = st.toggle("Automatische incasso")
            if st.form_submit_button("Toevoegen", type="primary") and van.strip() and bedrag > 0:
                budget.factuur_toevoegen(van, bedrag, vervaldatum.isoformat() if vervaldatum else None, "",
                                         "inkomst" if soort == "Krijgen" else "uitgave", automatisch)
                st.rerun()
    betaald = [f for f in alle if f["status"] != "open"]
    if betaald:
        with st.expander(f"Betaald ({len(betaald)})"):
            for f in sorted(betaald, key=lambda f: f.get("betaald_op") or "", reverse=True)[:50]:
                rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
                rij.markdown(f"{f['van']} · {euro(f['bedrag'])}", width="content")
                if rij.button("", icon=":material/undo:", key=f"fact_open_{f['id']}", type="tertiary",
                              help="Toch nog niet betaald"):
                    budget.factuur_bijwerken(f["id"], status="open")
                    st.rerun()


def factuur_rij(f: dict, vandaag: str) -> None:
    """Eén regel per factuur; alles wat je ermee kunt, zit achter één knop."""
    uitgave = f["soort"] == "uitgave"
    if f.get("vervaldatum") and f["vervaldatum"] < vandaag:
        wanneer = ":red[te laat]"
    elif f.get("vervaldatum"):
        wanneer = f"{date.fromisoformat(f['vervaldatum']):%d-%m}"
    else:
        wanneer = ""
    if f["automatisch"]:
        wanneer = (wanneer + " · " if wanneer else "") + "incasso"
    if h := f.get("herinnering"):
        wanneer = (wanneer + " · " if wanneer else "") + f"herinnering {datetime.fromisoformat(h['wanneer']):%d-%m}"
    rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
    bedrag = euro(f["bedrag"]) if uitgave else f":green[+{euro(f['bedrag'])}]"
    rij.markdown(f"**{f['van']}** {bedrag}" + (f"  \n:gray[{wanneer}]" if wanneer else ""), width="content")
    if uitgave and not f["automatisch"]:
        with rij.popover("Betalen", width="content"):
            betalen(f)
    else:
        with rij.popover("", icon=":material/more_horiz:", width="content"):
            if st.button("Ontvangen" if not uitgave else "Afgeschreven", key=f"fact_betaald_{f['id']}",
                         icon=":material/check:", width="stretch"):
                budget.factuur_bijwerken(f["id"], status="betaald")
                st.rerun()
            if st.button("Weghalen", key=f"fact_weg_{f['id']}", type="tertiary", icon=":material/delete:"):
                budget.factuur_weg(f["id"])
                st.rerun()


def betalen(f: dict) -> None:
    """Betalen doe je zelf, in je eigen bank-app; de app geeft je wat je nodig hebt."""
    if f.get("betaallink"):
        host = urlparse(f["betaallink"]).hostname or ""
        st.link_button(f"Betalen via {host}", f["betaallink"], icon=":material/open_in_new:", width="stretch")
        st.caption("Link uit de mail. Verwacht je deze rekening niet? Niet klikken.")
    if f.get("iban"):
        st.code(f["iban"], language=None)
        st.code(f"{f['bedrag']:.2f}".replace(".", ","), language=None)
        if f.get("kenmerk"):
            st.code(f["kenmerk"], language=None)
        st.caption("Rekening, bedrag" + (" en kenmerk" if f.get("kenmerk") else "") + ". Tik om te kopiëren.")
    elif not f.get("betaallink"):
        with st.form(f"fact_iban_{f['id']}", border=False):
            iban = st.text_input("Rekeningnummer (IBAN)")
            kenmerk = st.text_input("Kenmerk (optioneel)")
            if st.form_submit_button("Bewaren") and iban.strip():
                budget.factuur_bijwerken(f["id"], iban=iban.replace(" ", "").upper(), kenmerk=kenmerk.strip())
                st.rerun()
    if st.button("Ik heb betaald", key=f"fact_betaald_{f['id']}", icon=":material/check:", type="primary",
                 width="stretch"):
        budget.factuur_bijwerken(f["id"], status="betaald")
        st.rerun()
    if st.toggle("Later herinneren", key=f"herinner_aan_{f['id']}"):
        later_herinneren(f)
    if st.button("Weghalen", key=f"fact_weg_{f['id']}", type="tertiary", icon=":material/delete:"):
        budget.factuur_weg(f["id"])
        st.rerun()


def later_herinneren(f: dict) -> None:
    vandaag = date.today()
    keuzes = {"Morgen": vandaag + timedelta(days=1), "Over 3 dagen": vandaag + timedelta(days=3),
              "Volgende week": vandaag + timedelta(days=7)}
    if f.get("vervaldatum") and f["vervaldatum"] > (vandaag + timedelta(days=2)).isoformat():
        keuzes["2 dagen ervoor"] = date.fromisoformat(f["vervaldatum"]) - timedelta(days=2)
    keuze = st.pills("Wanneer", list(keuzes), default="Morgen", key=f"herinner_keuze_{f['id']}",
                     label_visibility="collapsed") or "Morgen"
    tijd = st.time_input("Hoe laat", value=kloktijd(9, 0), key=f"herinner_tijd_{f['id']}", step=900)
    if st.button("Herinner me", key=f"herinner_{f['id']}", width="stretch"):
        dag = keuzes[keuze]
        budget.herinneren(f["id"], datetime.combine(dag, tijd).isoformat(timespec="minutes"))
        st.toast(f"Herinnering op {dag:%d-%m} om {tijd:%H:%M}.", icon=":material/alarm:")
        st.rerun()


def verwacht_overzicht() -> None:
    """Wat er de komende tijd binnenkomt en afgaat, en (als je je saldo invult) hoe je saldo verloopt."""
    dagen = st.segmented_control("Periode", [14, 30, 60, 90], default=30, key="verwacht_dagen",
                                 format_func=lambda d: f"{d} dagen", label_visibility="collapsed") or 30
    v = budget.verwacht(dagen)
    st.caption(f"In :green[+{euro(v['in'])}] · uit {euro(-v['uit']) if v['uit'] else euro(0)}")
    if "saldo" in v:
        s_ = v["saldo"]
        if s_["laagste"] < 0:
            st.warning(f"Rond {date.fromisoformat(s_['laagste_op']):%d-%m} sta je rood ({euro(s_['laagste'])}).",
                       icon=":material/warning:")
        if len(v["posten"]) > 1:
            punten = [{"Datum": pd.Timestamp(v["van"]), "Saldo": s_["start"]}] + \
                     [{"Datum": pd.Timestamp(p["datum"]), "Saldo": p["saldo"]} for p in v["posten"]]
            st.line_chart(pd.DataFrame(punten).groupby("Datum", as_index=False).last(), x="Datum", y="Saldo",
                          height=160, color="#4f46e5", x_label="", y_label="")
    elif v["posten"]:
        st.caption("Vul bij Plannen je saldo in, dan zie je hoe het verloopt.")
    if not v["posten"]:
        st.caption("Nog niets verwacht.")
    regels = []
    for p in v["posten"]:
        bedrag = f":green[+{euro(p['bedrag'])}]" if p["bedrag"] > 0 else euro(p["bedrag"])
        dag = ":red[te laat]" if p["te_laat"] else f"{date.fromisoformat(p['datum']):%d-%m}"
        regels.append(f"{dag} · {p['naam']} {bedrag}")
    if regels:
        st.markdown("  \n".join(regels))


def saldo_instellen() -> None:
    saldo = budget.instellingen()["saldo"]
    with st.container(horizontal=True, vertical_alignment="bottom"):
        nieuw = st.number_input("Op je rekening", value=saldo["bedrag"] if saldo else None, step=10.0, format="%.2f",
                                placeholder="Optioneel")
        if st.button("Opslaan", key="saldo_opslaan"):
            budget.saldo_instellen(nieuw)
            st.rerun()
    if saldo:
        st.caption(f"Ingevuld op {date.fromisoformat(saldo['datum']):%d-%m}; ingelezen afschriften tellen erbij op.")


def vaste_inkomsten() -> None:
    inkomsten = budget.instellingen()["inkomsten"]
    for i in sorted(inkomsten, key=lambda i: i["dag"]):
        rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
        rij.markdown(f"{i['naam']} · {euro(i['bedrag'])} · rond de {i['dag']}e", width="content")
        if rij.button("", icon=":material/close:", key=f"ink_weg_{i['id']}", help="Weghalen", type="tertiary"):
            budget.inkomst_weg(i["id"])
            st.rerun()
    with st.form("vaste_inkomst", clear_on_submit=True, border=False):
        naam = st.text_input("Naam", placeholder="Bijv. salaris")
        kol1, kol2 = st.columns(2)
        bedrag = kol1.number_input("Bedrag per maand", min_value=0.0, step=10.0, format="%.2f")
        dag = kol2.number_input("Rond welke dag?", min_value=1, max_value=28, value=25)
        if st.form_submit_button("Toevoegen") and naam.strip() and bedrag > 0:
            budget.inkomst_toevoegen(naam, bedrag, dag)
            st.rerun()


def vaste_lasten() -> None:
    lasten = budget.instellingen()["vaste_lasten"]
    for v in sorted(lasten, key=lambda v: v["dag"]):
        rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
        rij.markdown(f"**{v['naam']}** · {euro(v['bedrag'])} · rond de {v['dag']}e · {v['categorie'].lower()}",
                     width="content")
        if rij.button("", icon=":material/close:", key=f"last_weg_{v['id']}", help="Weghalen", type="tertiary"):
            budget.vaste_last_weg(v["id"])
            st.rerun()
    if lasten:
        st.caption(f"Samen {euro(sum(v['bedrag'] for v in lasten))} per maand.")
    with st.form("vaste_last", clear_on_submit=True, border=False):
        naam = st.text_input("Naam", placeholder="Bijv. huur")
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
        naam = st.text_input("Waarvoor?", placeholder="Bijv. vakantie")
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
    bekend = [zoekveld.suggestie(naam, symbool, "📈", waarde=symbool) for naam, symbool in beleggen.MARKT.items()
              if not symbool.startswith("^") and "=" not in symbool]
    bekend += [zoekveld.suggestie(v["naam"], v["symbool"], "⭐", waarde=v["symbool"]) for v in beleggen.instellingen()["volglijst"]]
    zoek = zoekveld.zoekveld(f"{sleutel}_zoek", "Zoek op naam of ticker, bijvoorbeeld Vanguard All-World", bekend)
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
    with st.container(horizontal=True, vertical_alignment="center"):
        st.subheader("Beleggen", width="content")
        st.space("stretch")
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
        st.caption("Voeg je beleggingen toe om te zien wat ze waard zijn en hoe je spreiding is. Of volg alleen "
                   "koersen.")

    koersen_live()
    st.caption(beleggen.WAARSCHUWING)


KOERS_CSS = """<style>
.mk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:4px 0 6px}
.mk{border:1px solid rgba(128,128,128,.22);border-radius:12px;padding:10px 12px;line-height:1.25}
.mk-n{font-size:13px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mk-p{font-size:19px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.mk-o{display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:12px}
.mk-o span:last-child{opacity:.55}
.mk-c{font-weight:600;font-variant-numeric:tabular-nums}
.mk-c.op{color:#15803d}.mk-c.af{color:#dc2626}
@media (prefers-color-scheme:dark){.mk-c.op{color:#4ade80}.mk-c.af{color:#f87171}}
</style>"""


def _getal(waarde: float) -> str:
    decimalen = 4 if abs(waarde) < 10 else 2
    return f"{waarde:,.{decimalen}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _tijdstip(epoch: int | None) -> str:
    """Wanneer de laatste koers was: alleen de tijd als het vandaag was, anders de datum."""
    if not epoch:
        return ""
    t = datetime.fromtimestamp(epoch).astimezone()
    if t.date() == datetime.now().astimezone().date():
        return t.strftime("%H:%M")
    return f"{t.day} {MAANDEN_KORT[t.month - 1]}"


MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]


def koers_tegels(regels: list[dict]) -> None:
    """Koersen als nette tegels: naam, prijs, verandering vandaag en het tijdstip van de laatste koers."""
    tegels = []
    for r in regels:
        pct = r.get("vandaag_pct")
        kleur = "" if pct is None else ("op" if pct >= 0 else "af")
        prijs = _getal(r["prijs"]) if r.get("prijs") else "–"
        valuta = "" if r.get("symbool", "").startswith("^") or "=" in r.get("symbool", "") else r.get("valuta", "")
        valuta = {"EUR": "€ ", "USD": "$ ", "GBP": "£ "}.get(valuta, f"{valuta} " if valuta else "")
        tegels.append(f'<div class="mk"><div class="mk-n">{html.escape(taal.t(r["naam"]))}</div>'
                      f'<div class="mk-p">{valuta}{prijs}</div><div class="mk-o">'
                      f'<span class="mk-c {kleur}">{"" if pct is None else ("▲ " if pct >= 0 else "▼ ") + _pct(pct)}</span>'
                      f'<span>{_tijdstip(r.get("tijd"))}</span></div></div>')
    st.html(KOERS_CSS + '<div class="mk-grid">' + "".join(tegels) + "</div>")


@st.fragment(run_every=30)
def koersen_live() -> None:
    """Markten en volglijst; ververst zichzelf elke halve minuut zolang de pagina open is."""
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    with st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute"):
        st.markdown("**Markten**", width="content")
        with st.popover("Markten kiezen", icon=":material/tune:", type="tertiary"):
            gekozen = []
            huidig = beleggen.instellingen()["markten"]
            for groep, markten in beleggen.MARKTEN.items():
                gekozen += st.pills(groep, list(markten), selection_mode="multi", key=f"markten_{groep}",
                                    default=[m for m in markten if m in huidig]) or []
            if st.button("Bewaren", type="primary", key="markten_bewaar"):
                beleggen.markten_kiezen(gekozen)
                st.rerun()
    koers_tegels(beleggen.markt())

    volg = beleggen.volglijst()
    if volg:
        st.markdown("**Volglijst**")
        koers_tegels(volg)
        with st.popover("Volglijst aanpassen", icon=":material/edit:", type="tertiary"):
            for v in volg:
                if st.button(v["naam"], icon=":material/close:", key=f"volg_weg_{v['symbool']}", type="tertiary",
                             help="Niet meer volgen"):
                    beleggen.niet_volgen(v["symbool"])
                    st.rerun()
    st.caption(f"Bijgewerkt om {datetime.now().astimezone().strftime('%H:%M:%S')}, elke 30 seconden opnieuw. "
               "Bron: Yahoo Finance. Euronext geeft gratis koersen met 15 minuten vertraging.")


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
