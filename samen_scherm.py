"""Schermen voor samen: delen, projecten, de marktplaats, je account en beheer."""

import time
from datetime import date, datetime, timedelta

import streamlit as st

import opslag
import samen
import teksten


def ik() -> dict:
    return st.session_state.get("ik") or {}


def _fout(functie, *args, **kwargs):
    """Voert een actie uit en toont een nette melding als het niet lukt. Geeft het resultaat of None."""
    try:
        return functie(*args, **kwargs)
    except samen.Fout as fout:
        st.error(str(fout))
    return None


def nieuw_kort() -> dict:
    """Wat er nieuw is (gedeeld, berichten), hooguit elke twee minuten opgehaald."""
    if not samen.beschikbaar():
        return {}
    bewaard = st.session_state.get("_samen_nieuw")
    if not bewaard or time.time() - bewaard[0] > 120:
        try:
            bewaard = (time.time(), samen.nieuw())
        except opslag.GeenToegang:
            raise
        except Exception:
            bewaard = (time.time(), {})
        st.session_state._samen_nieuw = bewaard
    return bewaard[1]


def _vergeet_nieuw() -> None:
    st.session_state.pop("_samen_nieuw", None)


def gebruikersnaam_kiezen() -> None:
    """Voor de eigenaar, die de app als eerste instelde en nog geen gebruikersnaam heeft."""
    st.info("Kies eerst een gebruikersnaam. Daarmee kunnen anderen dingen met je delen en je aan een project toevoegen.")
    with st.form("naam_kiezen", border=False):
        kol1, kol2 = st.columns(2)
        naam = kol1.text_input("Gebruikersnaam", placeholder="bijvoorbeeld blaslavio")
        weergave = kol2.text_input("Je naam zoals anderen hem zien", placeholder="bijvoorbeeld Blaslavio")
        if st.form_submit_button("Opslaan") and naam.strip():
            if fout := opslag.profiel_bijwerken(nieuwe_naam=naam.strip().lower().lstrip("@"),
                                                weergavenaam=weergave.strip() or None):
                st.error(fout)
            else:
                st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""), st.session_state.wachtwoord)
                st.rerun()


# --- Samen -----------------------------------------------------------------------

def samen_tabblad() -> None:
    """Delen met anderen en samen aan projecten werken."""
    if not ik().get("naam"):
        gebruikersnaam_kiezen()
    else:
        st.caption(f"Jouw gebruikersnaam is **@{ik()['naam']}**. Geef die aan wie iets met je wil delen.")
    gedeeld = samen.gedeeld_met_mij()
    keuzes = ["📥 Voor jou", "📁 Projecten", "📤 Delen"]
    if st.session_state.get("samen_deel") not in keuzes:
        st.session_state.samen_deel = keuzes[0] if gedeeld else keuzes[1]
    keuze = st.segmented_control("Samen", keuzes, key="samen_deel", label_visibility="collapsed")
    if keuze == "📥 Voor jou":
        voor_jou(gedeeld)
    elif keuze == "📤 Delen":
        iets_delen()
    else:
        projecten()


def _gedeeld_tekst(item: dict) -> str:
    inhoud = item["inhoud"]
    if item["soort"] == "afspraak":
        start = inhoud.get("start", "")
        wanneer = f"{start[8:10]}-{start[5:7]} {start[11:16]}".strip() if start else ""
        return f"**{inhoud.get('titel', '')}** · {wanneer}" + (f" · 📍 {inhoud['locatie']}" if inhoud.get("locatie") else "")
    if item["soort"] == "boodschappen":
        return ", ".join(inhoud.get("items", []))
    if item["soort"] == "taak":
        return f"**{inhoud.get('titel', '')}**" + (f" · voor {inhoud['deadline']}" if inhoud.get("deadline") else "")
    return inhoud.get("tekst") or inhoud.get("titel", "")


def voor_jou(gedeeld: list[dict]) -> None:
    if not gedeeld:
        st.caption("Niemand heeft iets nieuws met je gedeeld.")
        return
    for item in gedeeld:
        with st.container(border=True):
            st.markdown(f"{samen.SOORTEN_DELEN[item['soort']]} van **{item['van']}**  \n{_gedeeld_tekst(item)}")
            kol1, kol2 = st.columns(2)
            if kol1.button("✅ Overnemen", key=f"neem_{item['id']}", type="primary", width="stretch"):
                plek = samen.gedeeld_aannemen(item)
                _vergeet_nieuw()
                st.toast(f"Staat nu in {plek}.", icon="✅")
                st.rerun()
            if kol2.button("✖️ Nee, bedankt", key=f"weiger_{item['id']}", width="stretch"):
                samen.gedeeld_afwijzen(item["id"])
                _vergeet_nieuw()
                st.rerun()


def iets_delen() -> None:
    soort = st.segmented_control("Wat wil je delen?", list(samen.SOORTEN_DELEN), default="afspraak",
                                 format_func=samen.SOORTEN_DELEN.get, key="deel_soort") or "afspraak"
    vandaag = date.today()
    with st.form("delen", clear_on_submit=True):
        inhoud = None
        if soort == "afspraak":
            afspraken = opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=90)).isoformat())
            if not afspraken:
                st.caption("Je hebt de komende drie maanden geen afspraken.")
            keuze = st.selectbox("Welke afspraak", afspraken, format_func=lambda a: f"{a['start'][8:10]}-{a['start'][5:7]} "
                                 f"{a['start'][11:16]} {a['titel']}", index=None, placeholder="Kies een afspraak")
            if keuze:
                inhoud = {k: keuze.get(k) for k in ("titel", "start", "einde", "locatie", "notitie", "soort", "sport")
                          if keuze.get(k)}
        elif soort == "taak":
            keuze = st.selectbox("Welke taak", opslag.open_taken(), format_func=lambda t: t["titel"], index=None,
                                 placeholder="Kies een taak")
            if keuze:
                inhoud = {"titel": keuze["titel"], "deadline": keuze.get("deadline")}
        elif soort == "boodschappen":
            nodig = [b["tekst"] for b in opslag.boodschappen() if not b["gekocht"]]
            st.caption(", ".join(nodig) if nodig else "Je boodschappenlijst is leeg.")
            inhoud = {"items": nodig} if nodig else None
        else:
            tekst = st.text_area("Notitie", height=100)
            inhoud = {"tekst": tekst.strip()} if tekst.strip() else None
        aan = st.text_input("Met wie (gebruikersnaam)", placeholder="@gebruikersnaam")
        if st.form_submit_button("📤 Delen", type="primary"):
            if not inhoud:
                st.error("Kies eerst wat je wilt delen.")
            elif not aan.strip():
                st.error("Vul de gebruikersnaam in van wie het moet krijgen.")
            elif ontvanger := _fout(samen.delen, aan, soort, inhoud):
                st.success(f"Gedeeld met {ontvanger}. Die ziet het bij Samen › Voor jou.")


def projecten() -> None:
    lijst = samen.projecten()
    with st.popover("➕ Nieuw project", width="stretch" if not lijst else "content"):
        with st.form("nieuw_project", clear_on_submit=True, border=False):
            titel = st.text_input("Naam van het project", placeholder="Bijv. verhuizing, scriptiegroep, teamuitje")
            omschrijving = st.text_area("Waar gaat het over? (optioneel)", height=68)
            if st.form_submit_button("Maken", type="primary") and titel.strip():
                if nieuw := _fout(samen.project_maken, titel.strip(), omschrijving.strip()):
                    st.session_state.project_keuze = nieuw
                    st.rerun()
    if not lijst:
        st.caption("Werk samen aan een verhuizing, een groepsopdracht, een training of een feest. Iedereen in het "
                   "project ziet dezelfde taken, notities en afspraken.")
        return
    ids = [p["id"] for p in lijst]
    if st.session_state.get("project_keuze") not in ids:
        st.session_state.project_keuze = ids[0]
    namen = {p["id"]: f"📁 {p['naam']}" + (f" · {p['open']} open" if p["open"] else "") for p in lijst}
    gekozen = st.selectbox("Project", ids, format_func=namen.get, key="project_keuze", label_visibility="collapsed")
    project_kaart(next(p for p in lijst if p["id"] == gekozen))


def project_kaart(project: dict) -> None:
    leden = project.get("leden") or []
    if project["omschrijving"]:
        st.caption(project["omschrijving"])
    st.caption("👥 " + ", ".join(lid["weergavenaam"] for lid in leden))
    items = samen.items(project["id"])
    for item in items:
        kol1, kol2 = st.columns([8, 1], vertical_alignment="center")
        extra = " · ".join(x for x in [item["datum"][:16].replace("T", " "),
                                       f"👤 {item['toegewezen_aan']}" if item["toegewezen_aan"] else ""] if x)
        if item["soort"] in ("taak", "afspraak"):
            label = f"{'📅 ' if item['soort'] == 'afspraak' else ''}{item['titel']}" + (f"  \n:gray[{extra}]" if extra else "")
            klaar = kol1.checkbox(f"~~{item['titel']}~~" if item["klaar"] else label, value=item["klaar"],
                                  key=f"pi_{item['id']}")
            if klaar != item["klaar"]:
                samen.item_bijwerken(item["id"], klaar=klaar)
                st.rerun()
        elif item["soort"] == "link":
            kol1.markdown(f"🔗 [{item['titel']}]({item['inhoud']})" if item["inhoud"].startswith("http")
                          else f"🔗 {item['titel']} {item['inhoud']}")
        else:
            kol1.markdown(f"📝 **{item['titel']}**  \n{item['inhoud']}")
        if item["soort"] != "link" and item["inhoud"] and item["soort"] != "notitie":
            kol1.caption(item["inhoud"])
        if kol2.button("✕", key=f"pi_weg_{item['id']}", help="Weghalen"):
            samen.item_bijwerken(item["id"], verwijderd=True)
            st.rerun()
    if not items:
        st.caption("Nog leeg. Zet hieronder de eerste taak of notitie erin.")

    with st.form(f"item_{project['id']}", clear_on_submit=True):
        soort = st.pills("Soort", list(samen.SOORTEN_ITEM), default="taak", format_func=samen.SOORTEN_ITEM.get) or "taak"
        titel = st.text_input("Titel", placeholder="Bijv. dozen regelen")
        inhoud = st.text_input("Toelichting of link (optioneel)")
        kol1, kol2 = st.columns(2)
        datum = kol1.date_input("Datum (optioneel)", value=None, format="DD-MM-YYYY")
        namen = [lid["naam"] for lid in leden if lid.get("naam")]
        wie = kol2.selectbox("Wie doet het", ["", *namen], format_func=lambda n: f"@{n}" if n else "Iedereen")
        if st.form_submit_button("➕ Toevoegen") and titel.strip():
            if _fout(samen.item_toevoegen, project["id"], soort, titel.strip(), inhoud.strip(),
                     datum.isoformat() if datum else "", wie) is not None:
                st.rerun()

    with st.expander("👥 Iemand toevoegen of het project verlaten"):
        with st.form(f"lid_{project['id']}", clear_on_submit=True, border=False):
            kol1, kol2 = st.columns([3, 1], vertical_alignment="bottom")
            naam = kol1.text_input("Gebruikersnaam", placeholder="@gebruikersnaam")
            if kol2.form_submit_button("Toevoegen") and naam.strip():
                if lid := _fout(samen.lid_toevoegen, project["id"], naam):
                    st.toast(f"{lid} doet nu mee.", icon="👥")
                    st.rerun()
        if st.button("🚪 Project verlaten", key=f"verlaat_{project['id']}"):
            samen.project_verlaten(project["id"])
            st.session_state.pop("project_keuze", None)
            st.rerun()


# --- Marktplaats ------------------------------------------------------------------

def marktplaats_tabblad() -> None:
    """Onze eigen marktplaats, met verwijzingen naar andere marktplaatsen."""
    keuzes = ["🔎 Zoeken", "➕ Aanbieden", "📅 Boekingen", "💬 Berichten"]
    keuze = st.segmented_control("Marktplaats", keuzes, default=keuzes[0], key="markt_deel",
                                 label_visibility="collapsed") or keuzes[0]
    {"🔎 Zoeken": zoeken, "➕ Aanbieden": aanbieden, "📅 Boekingen": boekingen, "💬 Berichten": berichten}[keuze]()
    with st.expander("🛡️ Veilig kopen, verkopen en boeken"):
        st.markdown(samen.VEILIG)
        st.caption("De app regelt geen betalingen en is geen partij bij de koop of boeking. Zie de voorwaarden bij "
                   "Instellingen › Account.")


def zoeken() -> None:
    with st.form("markt_zoeken", border=False):
        kol1, kol2 = st.columns([4, 1], vertical_alignment="bottom")
        zoekterm = kol1.text_input("Zoeken", placeholder="Bijv. fiets, bijles wiskunde, personal trainer Utrecht",
                                   label_visibility="collapsed", value=st.session_state.get("markt_zoekterm", ""))
        kol2.form_submit_button("🔎", width="stretch")
    st.session_state.markt_zoekterm = zoekterm
    soort = st.pills("Soort", list(samen.SOORTEN_AANBOD), format_func=samen.SOORTEN_AANBOD.get,
                     label_visibility="collapsed", key="markt_soort") or ""
    resultaten = samen.aanbod_zoeken(zoekterm, soort)
    if not resultaten:
        st.caption("Nog niets gevonden op onze marktplaats." + (" Kijk hieronder ook bij de andere marktplaatsen."
                                                               if zoekterm else " Wees de eerste: tik op ➕ Aanbieden."))
    for aanbod in resultaten:
        aanbod_kaart(aanbod)
    with st.expander("🌐 Ook kijken op andere marktplaatsen", expanded=bool(zoekterm) and not resultaten):
        for m in samen.externe_links(zoekterm):
            st.markdown(f"[{m['naam']}]({m['link']}) · :gray[{m['voor']}]")
        st.caption("Dit zijn gewone links; je gaat naar de website van die marktplaats.")


def aanbod_kaart(aanbod: dict) -> None:
    with st.container(border=True):
        st.markdown(f"**{aanbod['titel']}**  \n{samen.SOORTEN_AANBOD[aanbod['soort']]} · **{samen.prijs_tekst(aanbod)}**"
                    + (f" · 📍 {aanbod['plaats']}" if aanbod["plaats"] else "") + f" · {aanbod['aanbieder']}")
        if aanbod["omschrijving"]:
            st.caption(aanbod["omschrijving"][:400] + ("..." if len(aanbod["omschrijving"]) > 400 else ""))
        if aanbod["contact"]:
            st.caption(f"Contact: {aanbod['contact']}")
        if aanbod["van_mij"]:
            st.caption("Dit is jouw aanbod.")
            return
        kolommen = st.columns(3)
        if aanbod["soort"] in ("training", "les", "dienst") and aanbod["vrije_tijden"]:
            with kolommen[0].popover(f"📅 Boeken ({aanbod['vrije_tijden']})", width="stretch"):
                tijden_boeken(aanbod)
        with kolommen[1].popover("💬 Bericht", width="stretch"):
            with st.form(f"vraag_{aanbod['id']}", clear_on_submit=True, border=False):
                tekst = st.text_area("Je bericht", placeholder="Is dit nog beschikbaar?", height=80)
                if st.form_submit_button("Versturen", type="primary") and tekst.strip():
                    if _fout(samen.bericht_sturen, aanbod["id"], tekst.strip()) is not None:
                        st.success("Verstuurd. Het antwoord zie je bij 💬 Berichten.")
        with kolommen[2].popover("🚩 Melden", width="stretch"):
            with st.form(f"meld_{aanbod['id']}", clear_on_submit=True, border=False):
                reden = st.text_area("Wat klopt er niet?", height=80)
                if st.form_submit_button("Melden") and reden.strip():
                    samen.melden(aanbod["id"], reden.strip())
                    st.success("Bedankt, de beheerder kijkt ernaar.")


def tijden_boeken(aanbod: dict) -> None:
    tijden = [t for t in samen.tijden(aanbod["id"]) if t["vrij"]]
    if not tijden:
        st.caption("Er zijn geen vrije tijden meer.")
        return
    opmerking = st.text_input("Opmerking (optioneel)", key=f"opm_{aanbod['id']}",
                              placeholder="Bijv. eerste keer, graag rustig opbouwen")
    for t in tijden[:20]:
        if st.button(f"{samen.tijd_tekst(t['start'])} · {t['minuten']} min", key=f"boek_{t['id']}", width="stretch"):
            if boeking := _fout(samen.boeken, t["id"], opmerking.strip()):
                st.success(f"Geboekt: {boeking['titel']}, {samen.tijd_tekst(boeking['start'])}. Het staat in je agenda. "
                           f"Betalen regel je met {boeking['aanbieder']}.")


def aanbieden() -> None:
    with st.expander("➕ Iets nieuws aanbieden", expanded=not st.session_state.get("markt_heeft_aanbod")):
        with st.form("aanbod_nieuw", clear_on_submit=True, border=False):
            soort = st.pills("Wat bied je aan?", list(samen.SOORTEN_AANBOD), default="product",
                             format_func=samen.SOORTEN_AANBOD.get) or "product"
            titel = st.text_input("Titel", placeholder="Bijv. Racefiets maat 56, of Personal training in het park")
            omschrijving = st.text_area("Omschrijving", height=100,
                                        placeholder="Staat, wat je krijgt, voor wie het geschikt is, hoe lang een les duurt.")
            kol1, kol2 = st.columns(2)
            prijs = kol1.number_input("Prijs in euro (leeg = in overleg)", min_value=0.0, value=None, step=5.0)
            per = kol2.selectbox("Per", ["", "per stuk", "per uur", "per les", "per maand", "per persoon"],
                                 format_func=lambda p: p or "Totaal")
            plaats = st.text_input("Plaats", placeholder="Bijv. Rotterdam, of Online")
            contact = st.text_input("Contact (optioneel, iedereen ziet dit)",
                                    placeholder="Laat leeg om alleen via berichten in de app contact te hebben")
            if soort in ("training", "les"):
                st.caption("Na het plaatsen zet je hieronder bij Mijn aanbod de tijden waarop mensen kunnen boeken.")
            if st.form_submit_button("Plaatsen", type="primary"):
                if not titel.strip():
                    st.error("Vul een titel in.")
                elif _fout(samen.aanbod_plaatsen, soort, titel.strip(), omschrijving.strip(), prijs, per, plaats.strip(),
                           contact.strip()) is not None:
                    st.toast("Je aanbod staat online.", icon="🏪")
                    st.rerun()
    mijn = samen.mijn_aanbod()
    st.session_state.markt_heeft_aanbod = bool(mijn)
    if mijn:
        st.markdown("**Mijn aanbod**")
    for aanbod in mijn:
        with st.container(border=True):
            st.markdown(f"**{aanbod['titel']}** · {samen.prijs_tekst(aanbod)}")
            actief = st.toggle("Zichtbaar op de marktplaats", value=aanbod["actief"], key=f"actief_{aanbod['id']}")
            if actief != aanbod["actief"]:
                samen.aanbod_actief(aanbod["id"], actief)
                st.rerun()
            if aanbod["soort"] in ("training", "les", "dienst"):
                tijden_beheren(aanbod)


def tijden_beheren(aanbod: dict) -> None:
    tijden = samen.tijden(aanbod["id"])
    for t in tijden:
        kol1, kol2 = st.columns([6, 1], vertical_alignment="center")
        wie = f"geboekt door **{t['klant']}**" + (f" · {t['opmerking']}" if t.get("opmerking") else "") if not t["vrij"] else "vrij"
        kol1.markdown(f"{samen.tijd_tekst(t['start'])} · {t['minuten']} min · {wie}")
        if kol2.button("✕", key=f"slot_weg_{t['id']}", help="Deze tijd laten vervallen"):
            samen.boeking_annuleren(t["id"])
            st.rerun()
    with st.popover("➕ Tijden toevoegen"):
        with st.form(f"tijd_{aanbod['id']}", clear_on_submit=True, border=False):
            kol1, kol2 = st.columns(2)
            dag = kol1.date_input("Datum", value=date.today() + timedelta(days=1), min_value=date.today(),
                                  format="DD-MM-YYYY")
            begin = kol2.time_input("Begin", value=datetime.now().replace(hour=9, minute=0).time(), step=900)
            kol3, kol4 = st.columns(2)
            minuten = kol3.number_input("Minuten per keer", min_value=15, max_value=480, value=60, step=15)
            aantal = kol4.number_input("Hoeveel achter elkaar", min_value=1, max_value=12, value=1)
            herhaal = st.checkbox("Ook de komende 3 weken op dezelfde dag")
            if st.form_submit_button("Toevoegen", type="primary"):
                start = datetime.combine(dag, begin)
                gelukt = 0
                for week in range(4 if herhaal else 1):
                    for i in range(int(aantal)):
                        moment = start + timedelta(weeks=week, minutes=i * int(minuten))
                        if _fout(samen.tijd_toevoegen, aanbod["id"], moment, int(minuten)) is not None:
                            gelukt += 1
                if gelukt:
                    st.toast(f"{gelukt} tijd(en) toegevoegd.", icon="📅")
                    st.rerun()


def boekingen() -> None:
    lijst = samen.mijn_boekingen()
    if not lijst:
        st.caption("Je hebt geen boekingen. Zoek een privétraining, les of dienst bij 🔎 Zoeken.")
        return
    in_agenda = {(a["titel"], a["start"]) for a in opslag.afspraken_tussen(date.today().isoformat(), "9999-12-31")}
    for b in lijst:
        with st.container(border=True):
            rol = "Je hebt geboekt bij" if b["rol"] == "klant" else "Geboekt door"
            st.markdown(f"**{b['titel']}** · {samen.tijd_tekst(b['start'])} · {b['minuten']} min  \n{rol} **{b['met']}**"
                        + (f" · 📍 {b['plaats']}" if b["plaats"] else "") + (f"  \n:gray[{b['opmerking']}]" if b["opmerking"] else ""))
            kol1, kol2 = st.columns(2)
            start = datetime.fromisoformat(b["start"]).astimezone().strftime("%Y-%m-%dT%H:%M")
            if (b["titel"], start) not in in_agenda and kol1.button("📅 In mijn agenda", key=f"ag_{b['id']}", width="stretch"):
                samen.in_agenda_zetten(b)
                st.rerun()
            if kol2.button("Annuleren", key=f"ann_{b['id']}", width="stretch"):
                samen.boeking_annuleren(b["id"])
                st.toast("Geannuleerd. Laat de ander even weten waarom via 💬 Berichten.", icon="ℹ️")
                st.rerun()


def berichten() -> None:
    gesprekken = samen.gesprekken()
    if not gesprekken:
        st.caption("Nog geen berichten. Stuur een bericht vanuit een aanbod bij 🔎 Zoeken.")
        return
    sleutels = [(g["aanbod_id"], g["ander_id"]) for g in gesprekken]
    namen = {(g["aanbod_id"], g["ander_id"]): f"{g['ander']} · {g['titel']}" + (f" · {g['ongelezen']} nieuw" if g["ongelezen"] else "")
             for g in gesprekken}
    gekozen = st.selectbox("Gesprek", sleutels, format_func=namen.get, label_visibility="collapsed")
    gesprek = gesprekken[sleutels.index(gekozen)]
    for b in gesprek["berichten"][-30:]:
        with st.chat_message("user" if b["van_mij"] else "assistant", avatar="🙂" if b["van_mij"] else "👤"):
            st.markdown(b["tekst"])
            st.caption(datetime.fromisoformat(b["aangemaakt"]).astimezone().strftime("%d-%m %H:%M"))
    if gesprek["ongelezen"]:
        samen.gelezen(gesprek["aanbod_id"], gesprek["ander_id"])
        _vergeet_nieuw()
    with st.form("antwoord", clear_on_submit=True, border=False):
        kol1, kol2 = st.columns([5, 1], vertical_alignment="bottom")
        tekst = kol1.text_input("Antwoord", label_visibility="collapsed", placeholder=f"Bericht aan {gesprek['ander']}")
        if kol2.form_submit_button("➤") and tekst.strip():
            if _fout(samen.bericht_sturen, gesprek["aanbod_id"], tekst.strip(), gesprek["ander_id"]) is not None:
                st.rerun()


# --- Account en beheer ---------------------------------------------------------------

def account_instellingen() -> None:
    """Profiel, voorwaarden, gegevens downloaden en account verwijderen."""
    gebruiker = ik()
    with st.expander("🙂 Mijn account" + (f" (@{gebruiker['naam']})" if gebruiker.get("naam") else "")):
        if not samen.beschikbaar():
            st.caption("Accounts werken alleen in de online versie.")
        else:
            with st.form("profiel", border=False):
                naam = st.text_input("Gebruikersnaam", value=gebruiker.get("naam") or "")
                weergave = st.text_input("Naam die anderen zien", value=gebruiker.get("weergavenaam") or "")
                nieuw = st.text_input("Nieuw wachtwoord (leeg laten = niet wijzigen)", type="password",
                                      autocomplete="new-password")
                if st.form_submit_button("Opslaan"):
                    nieuwe_naam = naam.strip().lower().lstrip("@")
                    if fout := opslag.profiel_bijwerken(nieuwe_naam or None, weergave.strip(), nieuw or None):
                        st.error(fout)
                    else:
                        # De eigenaar mag met een lege naam blijven inloggen.
                        if st.session_state.get("naam"):
                            st.session_state.naam = nieuwe_naam or st.session_state.naam
                        if nieuw:
                            st.session_state.wachtwoord = nieuw
                        opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.wachtwoord)
                        st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""),
                                                              st.session_state.wachtwoord)
                        st.success("Opgeslagen.")
    with st.expander("📄 Voorwaarden en privacy"):
        st.markdown(teksten.voorwaarden())
        st.divider()
        st.markdown(teksten.privacy())
    with st.expander("⬇️ Mijn gegevens downloaden"):
        st.caption("Alles wat je in de app hebt gezet, als bestand. Wachtwoorden en sleutels zitten er niet in.")
        st.download_button("Download mijn gegevens", opslag.export(), file_name="mijn-gegevens.json",
                           mime="application/json")
    if samen.beschikbaar() and not gebruiker.get("beheerder"):
        with st.expander("🗑️ Account verwijderen"):
            st.warning("Al je gegevens worden gewist en je aanbod gaat offline. Dit kan niet ongedaan worden gemaakt.")
            zeker = st.checkbox("Ja, ik weet het zeker")
            if st.button("Account definitief verwijderen", disabled=not zeker):
                if opslag.account_verwijderen():
                    st.session_state.clear()
                    st.session_state.verwijderd = True
                    st.rerun()
                st.error("Dat lukte niet. Probeer het opnieuw.")
    if gebruiker.get("beheerder") and samen.beschikbaar():
        beheer()


def beheer() -> None:
    gegevens = samen.beheer()
    meldingen = gegevens.get("meldingen", [])
    with st.expander(f"🛡️ Beheer ({len(meldingen)} meldingen)" if meldingen else "🛡️ Beheer"):
        st.caption(f"{gegevens.get('gebruikers', 0)} gebruikers · {gegevens.get('aanbod', 0)} keer aanbod online")
        if not meldingen:
            st.caption("Geen open meldingen.")
        for m in meldingen:
            a = m["aanbod"]
            with st.container(border=True):
                st.markdown(f"🚩 **{a['titel']}** van {a['aanbieder']}  \nGemeld door {m['door']}: {m['reden']}")
                if a["omschrijving"]:
                    st.caption(a["omschrijving"][:300])
                kol1, kol2, kol3 = st.columns(3)
                if kol1.button("Is in orde", key=f"ok_{m['id']}", width="stretch"):
                    samen.melding_afhandelen(m["id"])
                    st.rerun()
                if kol2.button("Offline halen", key=f"off_{m['id']}", width="stretch"):
                    samen.melding_afhandelen(m["id"], aanbod_blokkeren=True)
                    st.rerun()
                if kol3.button("Aanbieder blokkeren", key=f"blok_{m['id']}", width="stretch"):
                    samen.melding_afhandelen(m["id"], aanbod_blokkeren=True, aanbieder_blokkeren=True)
                    st.rerun()
