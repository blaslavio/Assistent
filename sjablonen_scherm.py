"""Sjablonen bewaren en gebruiken via de bestaande bevestigingsschermen."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
import uuid
import streamlit as st
import opslag
import sjablonen


def _account() -> None:
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_sj_account") != account:
        for sleutel in list(st.session_state):
            if sleutel.startswith("sj_"):
                del st.session_state[sleutel]
        st.session_state._sj_account = account


def uit_werk(soort, item):
    _account()
    if st.session_state.get("sj_pending"):
        raise ValueError("Rond eerst de eerdere sjabloonopslag af.")
    st.session_state.sj_seed = sjablonen.uit_resultaat(soort, item)
    st.session_state.sj_bron = "nieuw"
    st.session_state.pop("sj_create_id", None)
    st.session_state.pop("sj_soort_nieuw", None)


def _bewaar() -> bool:
    wachtend = st.session_state.get("sj_pending")
    if not wachtend:
        return True
    try:
        opslag.sjabloon_opslaan(wachtend["id"], wachtend["gegevens"])
    except opslag.GeenToegang:
        raise
    except (opslag.OpslagConflict, opslag.OpslagNietIngericht, OSError, opslag.httpx.HTTPError):
        st.error("Opslaan is niet bevestigd. Probeer dezelfde opslag opnieuw; het sjabloon wordt niet dubbel gemaakt.")
        return False
    except ValueError as fout:
        st.error(str(fout))
        st.session_state.pop("sj_pending", None)
        return False
    st.session_state.pop("sj_pending", None)
    st.session_state.pop("sj_create_id", None)
    st.session_state.pop("sj_seed", None)
    st.success("Sjabloon opgeslagen. Er is geen taak, afspraak of aanbieding uitgevoerd.")
    return True


def voorbereiden(sjabloon: dict, dag=None, begintijd=None, deadline=None) -> None:
    """Lees actuele gegevens en zet alleen een bewerkbaar voorstel klaar."""
    if any(st.session_state.get(k) for k in ("_os_voorstel", "_os_dagplan", "_al_voorstel")):
        raise ValueError("Bevestig of annuleer eerst je openstaande voorstel.")
    resultaat = sjablonen.voorstel(sjabloon, dag, begintijd, deadline)
    soort = resultaat["soort"]
    sleutel = uuid.uuid4().hex
    if soort == "dagplan":
        plan = opslag.dagvoorstel()
        st.session_state._os_dagplan = {"id": sleutel, "gegevens": plan}
    elif soort == "csv":
        st.session_state.bt_bewerking = "CSV analyseren"
    else:
        doel = "_al_voorstel" if soort == "actielink" else "_os_voorstel"
        st.session_state[doel] = {"id": sleutel, "gegevens": resultaat["gegevens"]}
    st.session_state.pop("_os_vervolg", None)


def pagina() -> None:
    import universal_os
    import bestandsgereedschap_scherm
    _account()
    universal_os.bewaak_account()
    st.subheader("Sjablonen")
    st.caption("Bewaar instellingen voor hergebruik. Elke taak, afspraak, conceptactie en dagplanning vraagt daarna opnieuw om bevestiging. Maximaal 100 sjablonen per account.")
    if st.session_state.get("sj_pending"):
        st.info("Een eerdere opslag wacht op bevestiging. Opnieuw proberen gebruikt dezelfde inhoud en hetzelfde ID.")
        if st.button("Opslag opnieuw proberen", key="sj_retry") and _bewaar():
            st.rerun()
        return
    g = opslag.laden(vers=True)
    bronnen = {"nieuw": None}
    namen = {"nieuw": "Leeg sjabloon"}
    for opdracht, ontvangst in g.get("intentie_ontvangst", {}).items():
        if ontvangst.get("wat") in {"taak", "afspraak"} and "item" in ontvangst:
            key = "opdracht:" + opdracht
            bronnen[key] = (ontvangst["wat"], ontvangst["item"])
            namen[key] = ontvangst["wat"] + ": " + ontvangst["item"]["titel"]
    for code, link in g.get("actielinks", {}).items():
        bronnen["link:" + code] = ("actielink", link)
        namen["link:" + code] = "Conceptactie: " + link["titel"]
    with st.expander("Nieuw sjabloon", expanded=bool(st.session_state.get("sj_seed")) or not bool(g.get("sjablonen"))):
        bron = st.selectbox("Overnemen uit opgeslagen opdracht", list(bronnen), format_func=namen.get, key="sj_bron")
        standaard = st.session_state.get("sj_seed", {}) if bron == "nieuw" else {}
        if bronnen[bron]:
            try:
                standaard = sjablonen.uit_resultaat(*bronnen[bron])
            except (ValueError, KeyError, TypeError):
                st.warning("Deze bron kan niet veilig worden overgenomen. Vul de instellingen handmatig in.")
        soort = st.selectbox("Onderdeel", list(sjablonen.SOORTEN), index=list(sjablonen.SOORTEN).index(standaard.get("soort", "taak")),
                             format_func=sjablonen.SOORTEN.get, key="sj_soort_" + bron)
        create_id = st.session_state.setdefault("sj_create_id", uuid.uuid4().hex)
        key = create_id + bron + soort
        with st.form("sj_maak_" + key):
            naam = st.text_input("Naam van het sjabloon", value=standaard.get("naam", ""), max_chars=80)
            waarde = {"naam": naam, "soort": soort}
            if soort in {"taak", "afspraak", "actielink"}:
                waarde["titel"] = st.text_input("Titel voor nieuwe voorstellen", value=standaard.get("titel", ""), max_chars=160)
            if soort in {"taak", "afspraak"}:
                waarde["minuten"] = st.number_input("Duur in minuten", min_value=1, max_value=1440, value=standaard.get("minuten") or 30, step=1)
            if soort == "afspraak":
                waarde["locatie"] = st.text_input("Locatie", value=standaard.get("locatie", ""), max_chars=500)
                st.caption("Datum en begintijd kies je opnieuw bij elk gebruik.")
            if soort == "actielink":
                prijs = standaard.get("prijs_cent")
                prijs_tekst = st.text_input("Prijs in euro", value=f"{prijs // 100},{prijs % 100:02d}" if prijs is not None else "")
                waarde["uren"] = st.number_input("Geldigheid in uren", min_value=1, max_value=168, value=standaard.get("uren", 24), step=1)
            if soort == "dagplan":
                st.caption("Maakt steeds een nieuw voorstel met de actuele open taken, afspraken en planningsuren. Bewaart geen oude focusblokken.")
            if soort == "csv":
                st.caption("Opent CSV analyseren. Je kiest zelf een bestand en klikt daarna op Verwerken; bestanden worden niet in het sjabloon bewaard.")
            bewaren = st.form_submit_button("Sjabloon opslaan", key="sj_save")
        if bewaren:
            try:
                if soort == "actielink":
                    import actielinks
                    waarde["prijs_cent"] = actielinks.prijs_cent(prijs_tekst)
                waarde = sjablonen.valideer(waarde)
            except ValueError as fout:
                st.error(str(fout))
            else:
                st.session_state.sj_pending = {"id": create_id, "gegevens": waarde}
                if _bewaar():
                    st.rerun()
    sj = g.get("sjablonen", {})
    if sj:
        gekozen = st.selectbox("Bewaard sjabloon", sorted(sj, key=lambda k: (sj[k]["naam"].casefold(), k)),
                               format_func=lambda k: sj[k]["naam"] + " · " + sjablonen.SOORTEN[sj[k]["soort"]], key="sj_gekozen")
        s = sj[gekozen]
        st.json(s, expanded=False)
        dag = begintijd = deadline = None
        with st.form("sj_gebruik_" + gekozen):
            if s["soort"] == "afspraak":
                dag = st.date_input("Datum voor dit gebruik", value=datetime.now(ZoneInfo("Europe/Amsterdam")).date() + timedelta(days=1), format="DD/MM/YYYY")
                begintijd = st.time_input("Begintijd voor dit gebruik", value=time(9), step=60)
            elif s["soort"] == "taak":
                deadline = st.date_input("Deadline voor dit gebruik (optioneel)", value=None, format="DD/MM/YYYY")
            gebruik = st.form_submit_button("Voorstel voorbereiden" if s["soort"] != "csv" else "Open CSV-gereedschap", key="sj_use")
        if gebruik:
            try:
                voorbereiden(s, dag, begintijd, deadline)
            except opslag.GeenToegang:
                raise
            except (ValueError, OSError, opslag.httpx.HTTPError) as fout:
                st.error(str(fout) if isinstance(fout, ValueError) else "Voorbereiden is niet gelukt. Probeer opnieuw.")
            else:
                if s["soort"] == "csv":
                    st.session_state.sj_csv = True
                st.success("Klaar voor controle. Er is nog niets uitgevoerd.")
        with st.expander("Sjabloon verwijderen"):
            akkoord = st.checkbox("Verwijder alleen dit sjabloon", key="sj_delete_ok_" + gekozen)
            if st.button("Verwijderen", key="sj_delete_" + gekozen, disabled=not akkoord):
                try:
                    opslag.sjabloon_verwijderen(gekozen, s)
                except opslag.GeenToegang:
                    raise
                except (ValueError, OSError, opslag.httpx.HTTPError) as fout:
                    st.error(str(fout) if isinstance(fout, ValueError) else "Verwijderen is niet bevestigd. Probeer opnieuw.")
                else:
                    st.rerun()
    universal_os.paneel()
    if st.session_state.get("sj_csv"):
        bestandsgereedschap_scherm.pagina()
