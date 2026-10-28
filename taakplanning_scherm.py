"""Overzicht van werkdruk en expliciete taakvolgorde binnen het eigen account."""
import streamlit as st
import capaciteit
import opslag
import taakvolgorde


def _account() -> None:
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_tv_account") != account:
        for sleutel in list(st.session_state):
            if sleutel.startswith("tv_"):
                del st.session_state[sleutel]
        st.session_state._tv_account = account


def capaciteit_paneel(gegevens: dict | None = None, dagen: int = 14) -> None:
    try:
        r = capaciteit.rapport(gegevens if gegevens is not None else opslag.laden(vers=True), dagen)
    except (ValueError, TypeError, KeyError) as fout:
        st.warning("De capaciteit kan niet volledig worden berekend. Controleer taakduren, deadlines en afspraken. " + str(fout))
        return
    st.caption(f"{r['van']} t/m {r['tot']} · Nederlandse tijd · standaard 30 minuten als een taakduur ontbreekt")
    st.caption(r["beperking"])
    if r["over_deadline"]:
        st.warning(f"{r['over_deadline']} open taken hebben al een verstreken deadline.")
    for grens in r["grenzen"]:
        if grens["minimaal_tekort"]:
            st.warning(f"Tot en met {grens['tot_en_met']}: minimaal {grens['minimaal_tekort']} minuten te weinig vrije tijd voor het resterende werk.")
    if not any(g["minimaal_tekort"] for g in r["grenzen"]):
        st.info("Op basis van de opgegeven duren is geen tijdtekort aangetoond. Controleer ook blokkades en het daadwerkelijke planningsvoorstel.")
    st.dataframe(r["grenzen"], hide_index=True, column_config={
        "tot_en_met": "Tot en met", "nog_in_te_plannen": "Nog in te plannen (min)", "al_gereserveerd": "Gereserveerd (min)",
        "vrij_minuten": "Maximaal vrij (min)", "minimaal_tekort": "Minimaal tekort (min)"})
    if r["geschatte_taken"]:
        st.caption(f"Voor {r['geschatte_taken']} taken is 30 minuten geschat. Vul de taakduur in voor een betere berekening.")
    for taak in r["taken"]:
        if taak["geblokkeerd_door"]:
            st.warning(taak["titel"] + " wacht op: " + ", ".join(b["titel"] for b in taak["geblokkeerd_door"]))


def pagina() -> None:
    import universal_os
    _account()
    universal_os.bewaak_account()
    st.subheader("Taken en capaciteit")
    gegevens = opslag.laden(vers=True)
    dagen = st.selectbox("Vooruitkijken", [1, 7, 14, 31], index=2, format_func=lambda n: f"{n} dagen", key="tv_dagen")
    capaciteit_paneel(gegevens, dagen)
    st.subheader("Wat moet eerst af?")
    st.caption("Een vervolgtaak wordt pas automatisch ingepland nadat alle voorafgaande taken zijn afgevinkt. Alleen een tijd reserveren is niet voldoende.")
    taken = {t["id"]: t for t in gegevens["taken"]}
    open_ids = [i for i, t in taken.items() if not t.get("klaar")]
    if not open_ids:
        st.info("Er zijn geen open taken om afhankelijkheden voor in te stellen.")
        return
    gekozen = st.selectbox("Vervolgtaak", open_ids, format_func=lambda i: taken[i]["titel"] + f" (#{i})", key="tv_taak")
    taak = taken[gekozen]
    bestaand = taak.get("afhankelijk_van", [])
    if not isinstance(bestaand, list) or any(type(i) is not int for i in bestaand):
        st.error("Deze taak bevat ongeldige afhankelijkheden. Herstel de gegevens voordat je verdergaat.")
        return
    opties = sorted((set(taken) | set(bestaand)) - {gekozen})
    with st.form("taak_deps_" + str(gekozen)):
        afhankelijk = st.multiselect("Deze taken moeten eerst af", opties, key="tv_deps_" + str(gekozen) + str(bestaand), default=[i for i in bestaand if i in opties],
                                    format_func=lambda i: taken[i]["titel"] + (" · afgerond" if taken[i].get("klaar") else "") if i in taken else f"Verwijderde taak #{i} · verwijderen uit selectie")
        bevestig = st.form_submit_button("Afhankelijkheden opslaan")
    if bevestig:
        try:
            opslag.taak_afhankelijkheden(gekozen, afhankelijk, bestaand)
        except opslag.GeenToegang:
            raise
        except (ValueError, OSError, opslag.httpx.HTTPError) as fout:
            st.error(str(fout) if isinstance(fout, ValueError) else "Opslaan is niet bevestigd. Probeer opnieuw met dezelfde selectie.")
        else:
            st.success("Afhankelijkheden opgeslagen. Er zijn geen afspraken verplaatst.")
    if st.button("Ververs overzicht"):
        st.rerun()
