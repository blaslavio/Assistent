"""Zakelijk: vandaag afvinken, lesrooster, klanten met saldo en boekhouding.
Aan te zetten bij Instellingen › Weergave › In het menu. Zie zaak.py."""

from datetime import date, datetime, time, timedelta

import streamlit as st

import beroep
import boekpagina
import opslag
import plannen_scherm
import samen
import toegang
import winkelen_scherm
import zaak

_wanneer = plannen_scherm._wanneer
DAGEN = plannen_scherm.DAGEN
MAANDEN = plannen_scherm.MAANDEN


def _melding() -> None:
    if m := st.session_state.pop("zaak_melding", None):
        st.toast(m)


def _klaar(tekst: str) -> None:
    st.session_state.zaak_melding = tekst
    st.rerun()


def _fout(functie, *args, **kwargs):
    try:
        return functie(*args, **kwargs)
    except samen.Fout as fout:
        st.error(str(fout))
        return None


def pagina() -> None:
    _melding()
    z = zaak.instellingen()
    with st.container(horizontal=True, vertical_alignment="center"):
        st.subheader(z["naam"] or zaak.SOORTEN_ZAAK.get(z["soort"], "Zakelijk"))
        with st.popover("", icon=":material/settings:", help="Instellen"):
            zaak_instellen(z)
    delen = ["Vandaag"] + (["Rooster"] if z["groepslessen"] else []) + (["Afspraken"] if z["afspraken"] else []) \
        + ["Klanten", "Boekhouding"] + (["Inkopen"] if samen.beschikbaar() and winkelen_scherm.verkoper() else [])
    deel = st.segmented_control("Deel", delen, default=delen[0], key="zaak_deel",
                                label_visibility="collapsed") or delen[0]
    if deel == "Vandaag":
        vandaag_deel(z)
    elif deel == "Rooster":
        rooster_deel()
    elif deel == "Afspraken":
        afspraken_deel()
    elif deel == "Klanten":
        klanten_deel()
    elif deel == "Inkopen":
        winkelen_scherm.inkopen()
    else:
        boekhouding_deel()


# --- Beroep (Instellingen › Werk) --------------------------------------------------------------------------------------

# Waar een hulpmiddel opent: (pagina, sleutel van het onderdeel op die pagina, welk onderdeel).
_OPENEN = {"lessen": ("zaak_deel", "Rooster"), "klanten": ("zaak_deel", "Klanten"),
           "boekhouding": ("zaak_deel", "Boekhouding"), "webshop": ("webshop_deel", "Winkel"),
           "marketing": ("webshop_deel", "Marketing"), "reviews": ("webshop_deel", "Reviews")}


def _openen(url: str, tool: str) -> None:
    if tool in _OPENEN:
        st.session_state[_OPENEN[tool][0]] = _OPENEN[tool][1]
    st.session_state.ga_naar = url


def beroep_instellingen() -> None:
    """Kies je beroep; daaronder je zakelijke hulpmiddelen, elk met één tik open."""
    _melding()
    b = beroep.huidig()
    # Kies uit de lijst of typ zelf je beroep; staat het er niet tussen, dan doet de assistent een voorstel.
    namen = [beroep.naam_van(k) for k in beroep.BEROEPEN]
    nu = (b["naam"] or beroep.naam_van(b["soort"])) if b["soort"] else None
    keuze = st.selectbox("Wat doe je?", namen if nu in namen or not nu else [*namen, nu],
                         index=None if not nu else (namen.index(nu) if nu in namen else len(namen)),
                         placeholder="Kies of typ je beroep", accept_new_options=True, key="beroep_keuze")
    if keuze and keuze != nu:
        sleutel = next((k for k in beroep.BEROEPEN if beroep.naam_van(k) == keuze), None) or beroep.zoek(keuze)
        if sleutel:
            st.caption(f"Dit lijkt op: {beroep.naam_van(sleutel)}.")
        elif toegang.sleutel():
            st.caption("Staat er niet tussen. De assistent kiest bij Opslaan de tools en diensten die erbij passen.")
        if st.button("Opslaan", type="primary", key="beroep_opslaan"):
            diensten = None
            if not sleutel and toegang.sleutel():
                import anthropic

                import slim
                with st.spinner("De assistent kijkt wat bij je beroep past..."):
                    try:
                        voorstel = slim.beroep_voorstel(toegang.claude(toegang.sleutel()), keuze,
                                                        {k: v[0] for k, v in beroep.BEROEPEN.items()})
                        sleutel = voorstel["soort"] if voorstel["soort"] in beroep.BEROEPEN else None
                        diensten = voorstel["diensten"] or None
                    except (slim.Mislukt, anthropic.APIError):
                        pass
            aangezet = beroep.instellen(sleutel or beroep.ANDERS, keuze if keuze not in namen else "", diensten)
            _klaar("Opgeslagen." + (f" Aangezet: {', '.join(aangezet)}." if aangezet else ""))
    if not b["soort"]:
        return
    try:
        winkel = samen.mijn_winkel()
        pagina = boekpagina.mijn().get("pagina")
    except samen.Fout:
        winkel, pagina = {}, None
    st.markdown("**Jouw zakelijke tools**")
    for t in beroep.tools():
        naam, url, _ = beroep.TOOLS[t]
        with st.container(horizontal=True, vertical_alignment="center", key=f"tool_{t}"):
            st.markdown(naam, width="stretch")
            if t == "boekingen" and not pagina:
                if st.button("Maken", key=f"tool_maak_{t}", type="tertiary"):
                    if _fout(beroep.boekingspagina_maken) is not None:
                        _klaar("Boekingspagina gemaakt met de diensten van je beroep. Zet hem aan als hij klaar is.")
            elif url == "webshop" and winkel.get("niveau") not in ("verkoper", "ondernemer"):
                if st.button("Aanzetten", key=f"tool_maak_{t}", type="tertiary"):
                    if _fout(samen.niveau_instellen, "verkoper") is not None:
                        st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""),
                                                              st.session_state.wachtwoord) or {}
                        _klaar("Je webshop staat klaar bij Mijn webshop.")
            else:
                st.button("Openen", key=f"tool_open_{t}", type="tertiary", on_click=_openen, args=(url, t))
    klantvragen()
    if st.button("Geen beroep", type="tertiary", icon=":material/close:", key="beroep_wissen"):
        beroep.wissen()
        st.session_state.pop("beroep_keuze", None)
        _klaar("Beroep weggehaald. Je onderdelen blijven aan.")


KLANT_STANDEN = {"uit": "Uit", "voorstel": "Voorstellen", "zelf": "Zelf beantwoorden"}


def klantvragen() -> None:
    """De assistent helpt klanten en kopers in de chat: met jouw aanbod, prijzen en diensten."""
    k = dict(opslag.instellingen().get("klantenchat") or {})
    with st.expander("Klantvragen in de chat", icon=":material/support_agent:"):
        stand = st.segmented_control("Hoe helpt de assistent?", list(KLANT_STANDEN), format_func=KLANT_STANDEN.get,
                                     default=k.get("stand", "uit"), required=True, key="klant_stand") or "uit"
        st.caption({"uit": "De assistent doet niets in je klantgesprekken.",
                    "voorstel": "Bij een nieuwe vraag staan er antwoorden klaar. Jij kiest, past aan en verstuurt.",
                    "zelf": "De assistent antwoordt zelf, na een korte pauze, zolang de app open staat op Chat. "
                            "Zo'n bericht krijgt een klein label 'met hulp van de assistent'; dat is wettelijk "
                            "verplicht. Weet hij iets niet, dan zegt hij dat je erop terugkomt en krijg jij een seintje."
                    }[stand])
        verzoeken = st.toggle("Nieuwe klanten (chatverzoeken) ook beantwoorden", value=k.get("verzoeken", True),
                              disabled=stand != "zelf", key="klant_verzoeken")
        notities = st.text_area("Wat moet de assistent nog weten?", value=k.get("notities", ""), max_chars=2000,
                                placeholder="Bijv. openingstijden, bezorgen binnen 2 dagen, ruilen binnen 14 dagen, "
                                            "je tutoyeert klanten.", key="klant_notities")
        st.caption("De assistent kent je aanbod, prijzen, webshop en diensten uit de app, en verzint niets. "
                   "Bij de info van een gesprek zet je het als klantgesprek aan of uit.")
        if st.button("Opslaan", key="klant_opslaan", type="primary"):
            opslag.instellingen_bijwerken(klantenchat=k | {"stand": stand, "verzoeken": verzoeken,
                                                           "notities": notities.strip()})
            _klaar("Opgeslagen.")


def zaak_instellen(z: dict) -> None:
    naam = st.text_input("Naam van je zaak", value=z["naam"], max_chars=60, placeholder="Bijv. Sportschool Fit")
    soort = st.pills("Soort", list(zaak.SOORTEN_ZAAK), default=z["soort"], format_func=zaak.SOORTEN_ZAAK.get) or z["soort"]
    lessen = st.toggle("Groepslessen", value=z["groepslessen"])
    afspraken = st.toggle("Personal training of afspraken", value=z["afspraken"])
    btw = st.selectbox("Btw op je diensten", zaak.BTW, index=zaak.BTW.index(zaak.btw()), format_func=lambda b: f"{b}%",
                       help="Prijzen zijn inclusief btw. Sport- en beweegdiensten vallen vaak onder 9%; "
                            "vraag het je boekhouder als je twijfelt.")
    if st.button("Opslaan", type="primary", width="stretch"):
        opslag.instellingen_bijwerken(zaak={"naam": naam.strip(), "soort": soort, "groepslessen": lessen,
                                            "afspraken": afspraken, "btw": btw})
        _klaar("Opgeslagen.")


# --- Vandaag ----------------------------------------------------------------------------------------------------------

def vandaag_deel(z: dict) -> None:
    vandaag = date.today()
    if z["groepslessen"]:
        try:
            lijst = zaak.lessen(vandaag, vandaag)
        except samen.Fout:
            lijst = []
        if lijst:
            st.markdown("**Lessen vandaag**")
            for les in lijst:
                les_kaart(les, open_=datetime.fromisoformat(les["start"]) < datetime.now().astimezone() + timedelta(hours=1))
    afvink_lijst(kort=False)


def afvink_lijst(kort: bool = True) -> bool:
    """Afspraken die voorbij zijn: gekomen of niet? Geeft True als er iets te doen was."""
    try:
        o = zaak.overzicht(date.today(), date.today())
    except Exception:
        return False
    lijst = zaak.nog_afvinken(o)
    if not lijst:
        if not kort:
            st.caption("Niets meer af te vinken.")
        return False
    st.markdown("**Afvinken**")
    for b in lijst[: 5 if kort else 30]:
        with st.container(horizontal=True, vertical_alignment="center", key=f"afvink_{b['id']}"):
            with st.container(gap=None):
                st.markdown(f"**{b['soort']}** · {b['naam']}")
                st.caption(" · ".join(filter(None, [_wanneer(b["start"]), zaak.bedrag(b["prijs"]) if b["prijs"] else ""])))
            if st.button("", icon=":material/check:", key=f"af_ja_{b['id']}", help="Gekomen"):
                _account()
                if _fout(zaak.afvinken, b["id"], "gekomen") is not None:
                    _klaar("Afgevinkt" + (f" en {zaak.bedrag(b['prijs'])} op de rekening gezet." if b["prijs"] else "."))
            with st.popover("", icon=":material/more_horiz:"):
                if st.button("Niet gekomen", key=f"af_nee_{b['id']}", width="stretch"):
                    _account()
                    if _fout(zaak.afvinken, b["id"], "niet_gekomen") is not None:
                        _klaar("Genoteerd: niet gekomen.")
                if b["prijs"] and st.button("Niet gekomen, wel rekenen", key=f"af_reken_{b['id']}", width="stretch"):
                    _account()
                    if _fout(zaak.afvinken, b["id"], "niet_gekomen", True) is not None:
                        _klaar("Genoteerd en op de rekening gezet.")
    return True


def _account() -> None:
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))


# --- Rooster (groepslessen) --------------------------------------------------------------------------------------------

def les_kaart(les: dict, open_: bool = False) -> None:
    vol = les["ingeschreven"] >= les["plekken"]
    kop = f"{_wanneer(les['start'])} · {les['naam']} · {les['ingeschreven']}/{les['plekken']}"
    if les["wachtlijst"]:
        kop += f" (+{les['wachtlijst']} wachtlijst)"
    with st.expander(kop, expanded=open_):
        st.caption(" · ".join(filter(None, [f"{les['minuten']} min", zaak.bedrag(les["prijs"]) if les["prijs"] else "",
                                            les["locatie"], "Vol" if vol else ""])))
        verleden = datetime.fromisoformat(les["start"]) < datetime.now().astimezone() + timedelta(hours=1)
        for d in les.get("deelnemers", []):
            with st.container(horizontal=True, vertical_alignment="center", key=f"dn_{d['id']}"):
                teken = {"gekomen": "✓ ", "niet_gekomen": "✗ "}.get(d["afgevinkt"] or "", "")
                st.markdown(f"{teken}{d['naam']}" + (" · *wachtlijst*" if d["status"] == "wachtlijst" else ""))
                if verleden and d["status"] == "ingeschreven":
                    if not d["afgevinkt"]:
                        if st.button("", icon=":material/check:", key=f"dn_ja_{d['id']}", help="Gekomen"):
                            _account()
                            if _fout(zaak.les_afvinken, d["id"], "gekomen") is not None:
                                _klaar(f"{d['naam']} afgevinkt.")
                        if st.button("", icon=":material/close:", key=f"dn_nee_{d['id']}", help="Niet gekomen"):
                            _account()
                            if _fout(zaak.les_afvinken, d["id"], "niet_gekomen") is not None:
                                _klaar("Genoteerd: niet gekomen.")
                    elif st.button("", icon=":material/undo:", key=f"dn_terug_{d['id']}", help="Terugdraaien"):
                        _account()
                        if _fout(zaak.les_afvinken, d["id"], "") is not None:
                            _klaar("Teruggedraaid.")
        if not les.get("deelnemers"):
            st.caption("Nog niemand ingeschreven.")
        with st.container(horizontal=True, vertical_alignment="bottom", gap="small", key=f"les_erbij_{les['id']}"):
            wie = st.text_input("Iemand toevoegen", key=f"les_wie_{les['id']}", placeholder="Naam",
                                label_visibility="collapsed")
            if st.button("Toevoegen", key=f"les_toe_{les['id']}") and wie.strip():
                _account()
                if _fout(zaak.deelnemer_erbij, les["id"], wie.strip()) is not None:
                    _klaar(f"{wie.strip()} staat op de lijst.")
        if not verleden:
            with st.popover("Les laten vervallen", icon=":material/event_busy:"):
                st.caption("Wie ingeschreven staat, krijgt een melding.")
                if st.button("Alleen deze les", key=f"les_weg_{les['id']}", width="stretch"):
                    _account()
                    if _fout(zaak.les_weg, les["id"]) is not None:
                        _klaar("De les vervalt.")
                if les["reeks"] and st.button("Deze en alle volgende", key=f"les_wegv_{les['id']}", width="stretch"):
                    _account()
                    if (n := _fout(zaak.les_weg, les["id"], True)) is not None:
                        _klaar(f"{n} lessen vervallen.")


def rooster_deel() -> None:
    with st.container(horizontal=True):
        week = st.session_state.get("zaak_week", 0)
        if st.button("", icon=":material/chevron_left:", key="zaak_week_terug", disabled=week <= -8):
            st.session_state.zaak_week = week - 1
            st.rerun()
        maandag = date.today() - timedelta(days=date.today().weekday()) + timedelta(weeks=week)
        st.markdown(f"**Week van {maandag.day} {MAANDEN[maandag.month - 1]}**")
        if st.button("", icon=":material/chevron_right:", key="zaak_week_verder", disabled=week >= 26):
            st.session_state.zaak_week = week + 1
            st.rerun()
        with st.popover("Les", icon=":material/add:"):
            les_formulier()
    try:
        lijst = zaak.lessen(maandag, maandag + timedelta(days=6))
    except samen.Fout as fout:
        st.error(str(fout))
        return
    if not lijst:
        st.caption("Geen lessen deze week.")
    for les in lijst:
        les_kaart(les)
    st.caption("Leden schrijven zich in via de chat: deel je lessen met het plusje en dan Mijn diensten.")


def les_formulier() -> None:
    with st.form("les_nieuw", border=False):
        naam = st.text_input("Naam", placeholder="Bijv. Spinning", max_chars=60)
        k1, k2 = st.columns(2)
        dag = k1.date_input("Dag", value=date.today() + timedelta(days=1), min_value=date.today(), format="DD-MM-YYYY")
        om = k2.time_input("Tijd", value=time(19, 0), step=900)
        minuten = k1.selectbox("Duur", [30, 45, 60, 75, 90, 120], index=2, format_func=lambda m: f"{m} min")
        plekken = k2.number_input("Plekken", 1, 500, 12)
        prijs = k1.number_input("Prijs (€)", 0.0, 10000.0, 0.0, step=1.0, format="%.2f", help="0 = inbegrepen of gratis")
        locatie = k2.text_input("Waar", max_chars=200)
        herhaal = st.toggle("Elke week", value=True)
        aantal = st.slider("Hoeveel weken", 2, 26, 12) if herhaal else 1
        if st.form_submit_button("Maken", type="primary", width="stretch"):
            if not naam.strip():
                st.error("Geef de les een naam.")
                return
            _account()
            try:
                zaak.zorg_voor_profiel()
                n = zaak.les_maken(naam.strip(), datetime.combine(dag, om), minuten, int(plekken), round(prijs * 100),
                                   locatie.strip(), herhaal, aantal)
            except samen.Fout as fout:
                st.error(str(fout))
                return
            _klaar(f"{n} {'les' if n == 1 else 'lessen'} in je rooster gezet.")


# --- Afspraken (personal training) -------------------------------------------------------------------------------------

def afspraken_deel() -> None:
    st.caption("Klanten boeken een vrij moment via de chat of je boekingslink. Prijs, tijden en betaalgegevens "
               "stel je in bij je diensten.")
    if st.button("Diensten en tijden", icon=":material/tune:"):
        plannen_scherm.boek_dialoog()
    plannen_scherm.geboekt_bij_mij()


# --- Klanten --------------------------------------------------------------------------------------------------------

def klanten_deel() -> None:
    try:
        o = zaak.overzicht(date.today() - timedelta(days=60), date.today())
    except samen.Fout as fout:
        st.error(str(fout))
        return
    gemeld = o["betaald_gemeld"]
    if gemeld:
        st.markdown("**Klant zegt: betaald**")
        gezien = set()
        for b in gemeld:
            sleutel = b.get("reeks") or b["id"]
            if sleutel in gezien:
                continue
            gezien.add(sleutel)
            ids = [x["id"] for x in gemeld if (x.get("reeks") or x["id"]) == sleutel]
            totaal = sum(x["prijs"] for x in gemeld if x["id"] in ids)
            with st.container(horizontal=True, vertical_alignment="center", key=f"gemeld_{b['id']}"):
                st.markdown(f"**{b['naam']}** · {b['soort']} · {zaak.bedrag(totaal)}")
                if st.button("Ontvangen", key=f"ontv_{b['id']}", help="Het geld staat op je rekening"):
                    _account()
                    if _fout(zaak.betaling_ontvangen, ids, totaal or None) is not None:
                        _klaar("Betaling geboekt.")
    with st.popover("Betaling", icon=":material/add:"):
        betaling_formulier(o["saldi"])
    saldi = o["saldi"]
    if not saldi:
        st.caption("Nog geen klanten.")
        return
    open_ = sum(-s["saldo"] for s in saldi if s["saldo"] < 0)
    if open_:
        st.metric("Nog te ontvangen", zaak.bedrag(open_))
    for s in saldi:
        tekst = ("Nog te betalen " + zaak.bedrag(-s["saldo"]) if s["saldo"] < 0
                 else "Tegoed " + zaak.bedrag(s["saldo"]) if s["saldo"] > 0 else "Alles betaald")
        st.markdown(f"**{s['klant'] or 'Zonder naam'}** · {tekst}")


def betaling_formulier(saldi: list[dict]) -> None:
    namen = {s["sleutel"]: s for s in saldi}
    with st.form("betaling_nieuw", border=False):
        keuze = st.selectbox("Klant", ["", *namen], format_func=lambda k: namen[k]["klant"] if k else "Nieuwe klant",
                             key="bet_klant")
        nieuw = st.text_input("Naam (nieuwe klant)", max_chars=80)
        bedrag = st.text_input("Bedrag", placeholder="50,00")
        oms = st.text_input("Waarvoor", placeholder="Bijv. rittenkaart", max_chars=200)
        st.caption("Vooruit betaald? Dan staat het als tegoed bij de klant.")
        if st.form_submit_button("Boeken", type="primary", width="stretch"):
            k = namen.get(keuze)
            if not k and not nieuw.strip():
                st.error("Kies of vul een klant in.")
                return
            _account()
            try:
                bedrag_cent = zaak.centen(bedrag)
            except ValueError as fout:
                st.error(str(fout))
                return
            if _fout(zaak.post, "betaling", bedrag_cent, oms.strip(), (k or {}).get("klant") or nieuw.strip(),
                     (k or {}).get("klant_id")) is not None:
                _klaar("Betaling geboekt.")


# --- Boekhouding ------------------------------------------------------------------------------------------------------

def boekhouding_deel() -> None:
    with st.container(horizontal=True, vertical_alignment="center"):
        soort = st.segmented_control("Periode", ["Maand", "Kwartaal", "Jaar"], default="Maand", key="zaak_periode",
                                     label_visibility="collapsed") or "Maand"
        with st.popover("Kosten", icon=":material/add:"):
            kosten_formulier()
    van, tot = zaak.periode(soort)
    try:
        o = zaak.overzicht(van, tot)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    c = zaak.cijfers(o["posten"])
    # Drie cijfers naast elkaar, ook op een telefoon.
    with st.container(horizontal=True, gap="small"):
        for label, waarde in (("Omzet", c["omzet"]), ("Kosten", c["kosten"]), ("Winst", c["winst"])):
            with st.container(border=True, gap=None):
                st.caption(label)
                st.markdown(f"**{zaak.bedrag(waarde)}**")
    st.caption(f"Ontvangen {zaak.bedrag(c['ontvangen'])} · btw af te dragen {zaak.bedrag(c['btw_af'])}"
               f" · voorbelasting {zaak.bedrag(c['btw_voor'])} · te betalen {zaak.bedrag(c['btw_saldo'])}")
    if not o["posten"]:
        st.caption("Nog niets in deze periode.")
        return
    st.download_button("Exporteren (CSV)", zaak.csv_bestand(o["posten"]), f"boekhouding-{van}-{tot}.csv", "text/csv",
                       icon=":material/download:")
    for p in o["posten"][:200]:
        with st.container(horizontal=True, vertical_alignment="center", key=f"post_{p['id']}"):
            with st.container(gap=None):
                teken = "- " if p["soort"] == "kosten" else ""
                st.markdown(f"**{teken}{zaak.bedrag(p['bedrag'])}** · {p['omschrijving'] or zaak.SOORT_NAAM[p['soort']]}")
                d = date.fromisoformat(p["datum"])
                st.caption(" · ".join(filter(None, [f"{d.day} {MAANDEN[d.month - 1]}", zaak.SOORT_NAAM[p["soort"]],
                                                    p["klant"], p["categorie"], f"{p['btw']}% btw" if p["btw"] else ""])))
            if st.button("", icon=":material/delete:", key=f"post_weg_{p['id']}", help="Weghalen"):
                _account()
                if _fout(zaak.post_weg, p["id"]) is not None:
                    _klaar("Weggehaald.")


def kosten_formulier() -> None:
    with st.form("kosten_nieuw", border=False):
        bedrag = st.text_input("Bedrag (incl. btw)", placeholder="25,00")
        oms = st.text_input("Waarvoor", max_chars=200)
        k1, k2 = st.columns(2)
        categorie = k1.selectbox("Soort", zaak.KOSTEN)
        btw = k2.selectbox("Btw", zaak.BTW, index=2, format_func=lambda b: f"{b}%")
        datum = st.date_input("Datum", value=date.today(), format="DD-MM-YYYY")
        if st.form_submit_button("Opslaan", type="primary", width="stretch"):
            _account()
            try:
                bedrag_cent = zaak.centen(bedrag)
            except ValueError as fout:
                st.error(str(fout))
                return
            if _fout(zaak.post, "kosten", bedrag_cent, oms.strip(), btw_pct=btw, categorie=categorie,
                     datum=datum) is not None:
                _klaar("Kosten opgeslagen.")
