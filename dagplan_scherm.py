"""Dagvoorstel in het centrale gesprek: bewerken, weglaten en expliciet bevestigen."""

import copy
import uuid
from datetime import datetime

import streamlit as st

import agendacontrole
import dagplan
import intenties
import opslag


def paneel(bij_bericht) -> None:
    wachtend = st.session_state.get("_os_dagplan")
    if not wachtend:
        return
    plan = wachtend.get("ingediend") or wachtend["gegevens"]
    vast = "ingediend" in wachtend
    herplan = plan.get("modus") == "herplan"
    st.subheader("Herplan de rest van vandaag" if herplan else "Voorstel voor vandaag")
    st.caption(f"{plan['datum']} · {plan['uren']['van']}–{plan['uren']['tot']} · minimaal 10 minuten pauze · alleen de appagenda")
    st.caption("Bewerk de tijden of vink blokken uit. Gekoppelde agenda’s zijn niet gecontroleerd.")
    with st.expander("Capaciteit in de huidige agenda"):
        import taakplanning_scherm
        taakplanning_scherm.capaciteit_paneel(dagen=1)
    if fout := st.session_state.pop("_os_dagfout", None):
        st.error(fout)
    gewijzigd = copy.deepcopy(plan)
    herbereken = False
    if herplan:
        st.caption("Vaste afspraken, lopende blokken en afgeronde taken blijven staan. Vul de resterende minuten zelf in; verstreken tijd telt niet automatisch als werk.")
        with st.expander("Wat verandert er na bevestiging?", expanded=True):
            for oud in plan["vervangt"]:
                st.write(f"Vervangen: {oud['titel']} · {oud['start'][11:16]}–{oud['einde'][11:16]}")
            if plan["verlenging"]:
                v = plan["verlenging"]
                st.write(f"Uitloop {v['voor']['titel']}: einde {v['voor'].get('einde', 'onbekend')} → {v['na']['einde']}")
            st.caption("Uitgevinkte taken blijven ongewijzigd na herberekenen. Gekozen taken krijgen de ingevulde resterende duur.")
    with st.form("dagplan_" + wachtend["id"]):
        if not plan["regels"]:
            st.info("Er zijn geen open, nog ongeplande taken. Voeg eerst een taak toe of bekijk je bestaande focusblokken.")
        if herplan:
            opties = [None] + [a["id"] for a in plan["afspraak_opties"]]
            namen = {a["id"]: f"{a['titel']} · {a['start'][11:16]}" for a in plan["afspraak_opties"]}
            afspraak_id = st.selectbox("Afspraak met uitloop (optioneel)", opties,
                                       index=opties.index(plan["keuze"]["afspraak_id"]),
                                       format_func=lambda v: namen.get(v, "Geen afspraak verlengen"),
                                       key="herplan_afspraak_" + wachtend["id"], disabled=vast)
            uitloop = st.number_input("Uitloop in minuten", min_value=0, max_value=240, value=plan["keuze"]["uitloop"],
                                       step=5, key="herplan_uitloop_" + wachtend["id"], disabled=vast)
            gewijzigd["nieuwe_keuze"] = {"afspraak_id": afspraak_id, "uitloop": uitloop}
        for nummer, regel in enumerate(gewijzigd["regels"]):
            taak = regel["taak"]
            st.write(f"{taak['titel']} · {regel['minuten']} minuten" + (f" · deadline {taak['deadline']}" if taak.get("deadline") else ""))
            if herplan:
                regel["plannen"] = st.checkbox("Deze taak herplannen", value=regel["plannen"],
                                                key=f"herplan_taak_{wachtend['id']}_{taak['id']}", disabled=vast)
                regel["resterend_minuten"] = st.number_input("Nog nodig (minuten)", min_value=1, max_value=10080,
                                                              value=regel["resterend_minuten"], step=5,
                                                              key=f"herplan_rest_{wachtend['id']}_{taak['id']}", disabled=vast)
            if regel.get("geblokkeerd_door"):
                st.warning("Wacht op: " + ", ".join(b["titel"] for b in regel["geblokkeerd_door"]))
            if regel["te_laat"]:
                st.warning("De deadline van deze taak is al voorbij.")
            if regel["rest"] and not regel.get("geblokkeerd_door") and (not herplan or regel["plannen"]):
                st.caption(f"{regel['rest']} minuten passen niet meer in dit voorstel. Die blijven ongepland.")
            for index, blok in enumerate(regel["blokken"]):
                sleutel = f"dag_{wachtend['id']}_{nummer}_{index}"
                origineel = wachtend["gegevens"]["regels"][nummer]["blokken"][index]
                blok["opnemen"] = st.checkbox("Dit blok inplannen", value=blok.get("opnemen", True), key=sleutel + "_aan", disabled=vast)
                begin = st.time_input("Vanaf", value=datetime.fromisoformat(blok["start"] or origineel["start"]).time(), step=60,
                                      key=sleutel + "_van", disabled=vast)
                einde = st.time_input("Tot", value=datetime.fromisoformat(blok["einde"] or origineel["einde"]).time(), step=60,
                                      key=sleutel + "_tot", disabled=vast)
                blok.update(start=plan["datum"] + "T" + begin.isoformat(timespec="minutes") if begin else None,
                            einde=plan["datum"] + "T" + einde.isoformat(timespec="minutes") if einde else None)
        if vast:
            st.caption("De ingediende blokken blijven vaststaan. Opnieuw proberen gebruikt dezelfde opdracht.")
        if herplan:
            st.caption("Na wijziging van taken, resterende minuten of uitloop: herbereken eerst. Handmatige tijdkeuzes worden dan opnieuw voorgesteld.")
            herbereken = st.form_submit_button("Herbereken voorstel", key="herplan_herbereken", disabled=vast)
        bevestig = st.form_submit_button("Opnieuw proberen" if vast else "Herplanning bevestigen" if herplan else "Dagvoorstel bevestigen",
                                         key="dag_bevestig", type="primary", disabled=not any(r["blokken"] for r in plan["regels"])
                                         and not (herplan and (plan["regels"] or plan["verlenging"] or plan["vervangt"])))
        annuleer = st.form_submit_button("Sluiten" if vast else "Annuleren", key="dag_annuleer")
    if annuleer:
        st.session_state.pop("_os_dagplan", None)
        st.session_state.pop("_os_dagfout", None)
        st.rerun()
    if herbereken:
        keuzes = {str(r["taak"]["id"]): {"plannen": r["plannen"], "minuten": r["resterend_minuten"]} for r in gewijzigd["regels"]}
        try:
            nieuw = opslag.herplanvoorstel(keuzes, afspraak_id, uitloop)
        except opslag.GeenToegang:
            raise
        except (ValueError, OSError, opslag.httpx.HTTPError) as fout:
            st.error(str(fout) if isinstance(fout, ValueError) else "Herberekenen is niet gelukt. Probeer opnieuw.")
        else:
            st.session_state._os_dagplan = {"id": uuid.uuid4().hex, "gegevens": nieuw}
            st.session_state.pop("_os_dagfout", None)
            st.rerun()
    if st.button("Nieuwe herplanning maken" if herplan else "Nieuw dagvoorstel maken", key="dag_vernieuw", disabled=vast):
        try:
            nieuw = opslag.herplanvoorstel() if herplan else opslag.dagvoorstel()
        except opslag.GeenToegang:
            raise
        except (ValueError, OSError, opslag.httpx.HTTPError):
            st.error("Een nieuw voorstel maken is niet gelukt. Controleer je taken, agenda en planningsuren.")
        else:
            st.session_state._os_dagplan = {"id": uuid.uuid4().hex, "gegevens": nieuw}
            st.session_state.pop("_os_dagfout", None)
            st.rerun()
    if bevestig:
        wachtend["ingediend"] = plan if vast else gewijzigd
        try:
            ontvangst = opslag.dagplan_bevestigen(wachtend["id"], wachtend["ingediend"])
        except opslag.GeenToegang:
            raise
        except (dagplan.PlanOngeldig, agendacontrole.ControleOnvolledig) as fout:
            wachtend.pop("ingediend", None)
            st.session_state._os_dagfout = str(fout)
            st.rerun()
        except opslag.OpslagNietIngericht:
            st.session_state._os_dagfout = "De database-update voor veilige opslag ontbreekt. Er is niets bevestigd."
            st.rerun()
        except (opslag.OpslagConflict, OSError, opslag.httpx.HTTPError, ValueError):
            st.session_state._os_dagfout = "Opslaan is nog niet bevestigd. Probeer dezelfde opdracht opnieuw; er worden geen dubbele blokken toegevoegd."
            st.rerun()
        else:
            st.session_state._os_laatst = {"opdracht_id": wachtend["id"], "ontvangst": ontvangst}
            bij_bericht("assistant", ontvangst["tekst"])
            st.session_state.pop("_os_dagplan", None)
            st.session_state.pop("_os_dagfout", None)
            st.rerun()
