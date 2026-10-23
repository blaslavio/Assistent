"""Inloggen met Face ID of Touch ID: toegangssleutels (WebAuthn), en een herstelcode per mail.

De browser maakt de sleutel en ondertekent; de Edge Function `sleutel` controleert dat (sql/toegangssleutels.sql).
De knop zit in het onderdeel zelf, omdat Safari Face ID alleen direct na een tik toestaat. Tik je in het veld voor je
gebruikersnaam, dan stelt Safari je toegangssleutel ook meteen voor (zonder knop).
"""

import os
import time

import streamlit as st

import opslag
import taal

CSS = """
.ts-knop{width:100%;min-height:2.5rem;border-radius:.5rem;border:1px solid rgba(49,51,63,.2);background:transparent;
 color:inherit;font:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem}
.ts-knop:hover{border-color:var(--st-primary-color,#4f46e5);color:var(--st-primary-color,#4f46e5)}
.ts-knop svg{width:1.1rem;height:1.1rem}
"""

HTML = ('<button class="ts-knop" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="1.8" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 '
        '2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 16c1.5 1 3.5 1 5 0"/></svg>'
        '<span></span></button>')

JS = """
export default function (component) {
  const { data, setTriggerValue, parentElement } = component;
  const b = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)),
                                   (c) => c.charCodeAt(0));
  const u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_")
                                                                      .replace(/=+$/, "");
  const knop = parentElement.querySelector("button");
  knop.querySelector("span").textContent = data.label;
  // Face ID als knop alleen in de app (vanaf het beginscherm); in de browser beveilig je met tweestapsverificatie.
  const losseApp = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
  if (data.alleen_app && !losseApp) {
    knop.style.display = "none";
    const vak = parentElement.closest?.("[data-testid=stElementContainer]") || parentElement.parentElement;
    if (vak) vak.style.display = "none";
  } else {
    knop.style.display = "";
  }
  const st = parentElement.__ts || (parentElement.__ts = {});
  st.data = data;
  const melden = (r) => setTriggerValue("resultaat", { ...r, t: Date.now() });
  const fout = (e) => { if (e && e.name === "AbortError") return; melden({ fout: (e && e.name) || "fout" }); };
  if (!window.PublicKeyCredential || !navigator.credentials) {
    knop.disabled = true;
    if (!st.gemeld) { st.gemeld = true; melden({ fout: "NietOndersteund" }); }
    return;
  }
  async function inloggen(conditioneel) {
    const o = st.data.opties;
    window.__tsCtrl?.abort();
    const ctrl = window.__tsCtrl = new AbortController();
    const c = await navigator.credentials.get({
      publicKey: { ...o, challenge: b(o.challenge) }, signal: ctrl.signal,
      ...(conditioneel ? { mediation: "conditional" } : {}),
    });
    const r = c.response;
    melden({ antwoord: { id: c.id, clientDataJSON: u(r.clientDataJSON), authenticatorData: u(r.authenticatorData),
                         signature: u(r.signature), userHandle: r.userHandle ? u(r.userHandle) : null } });
  }
  async function maken() {
    const o = st.data.opties;
    window.__tsCtrl?.abort();
    const c = await navigator.credentials.create({ publicKey: {
      ...o, challenge: b(o.challenge), user: { ...o.user, id: b(o.user.id) },
      excludeCredentials: (o.excludeCredentials || []).map((x) => ({ ...x, id: b(x.id) })),
    } });
    const r = c.response;
    melden({ antwoord: { id: c.id, clientDataJSON: u(r.clientDataJSON), attestationObject: u(r.attestationObject) } });
  }
  knop.onclick = () => (st.data.actie === "maken" ? maken() : inloggen(false)).catch(fout);
  if (data.actie === "inloggen" && data.auto && window.__tsAuto !== data.opties.challenge) {
    window.__tsAuto = data.opties.challenge;
    PublicKeyCredential.isConditionalMediationAvailable?.()
      .then((ja) => { if (ja) inloggen(true).catch(() => {}); }).catch(() => {});
  }
}
"""

_onderdeel = st.components.v2.component("toegangssleutel", html=HTML, css=CSS, js=JS)

FOUTEN = {
    "NotAllowedError": "Geannuleerd. Probeer het opnieuw.",
    "InvalidStateError": "Op dit toestel heb je al een toegangssleutel.",
    "SecurityError": "Dit kan hier niet. Open de app los in Safari.",
    "NietOndersteund": "Deze browser kan geen toegangssleutels gebruiken.",
}


def _functie(stap: str, **velden) -> dict:
    """Roept de Edge Function aan. Geeft altijd een dict, bij een storing met {"fout"}."""
    try:
        url = os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")
        r = opslag._verbinding.post(f"{url}/functions/v1/sleutel", json={"stap": stap, **velden},
                                    headers={"apikey": opslag.SUPABASE_PUBLISHABLE_KEY}, timeout=15)
        return r.json()
    except Exception:
        return {"fout": "Even niet bereikbaar. Probeer het zo opnieuw."}


def _knop(key: str, actie: str, opties: dict, label: str, auto: bool = False, alleen_app: bool = False) -> dict | None:
    """Toont de knop; geeft een nieuw resultaat van de browser één keer terug."""
    r = _onderdeel(key=key, data={"actie": actie, "opties": opties, "label": taal.t(label), "auto": auto,
                                  "alleen_app": alleen_app},
                   on_resultaat_change=lambda: None)
    resultaat = getattr(r, "resultaat", None) if r is not None else None
    if not resultaat or resultaat.get("t") == st.session_state.get(f"_{key}_t"):
        return None
    st.session_state[f"_{key}_t"] = resultaat.get("t")
    return resultaat


def foutmelding(resultaat: dict) -> str:
    return FOUTEN.get(resultaat.get("fout", ""), "Dit lukte niet. Probeer het opnieuw.")


# --- Inloggen -------------------------------------------------------------------------------------------------

def inlog_opties() -> dict | None:
    """Opties om in te loggen (een uitdaging van 10 minuten), 8 minuten bewaard. None als het (nog) niet kan."""
    bewaard = st.session_state.get("_ts_inlog")
    if bewaard and bewaard[0] > time.time():
        return bewaard[1]
    if not opslag.online():
        return None
    opties = _functie("inloggen_start").get("opties")
    st.session_state._ts_inlog = (time.time() + (480 if opties else 60), opties)
    return opties


def inlogknop(apparaat: str, key: str = "ts_inloggen") -> dict | None:
    """De knop 'Inloggen met Face ID'. Geeft {"token", "naam"} na een gelukte inlog, {"fout"} bij een fout, anders None."""
    if not (opties := inlog_opties()):
        return None
    resultaat = _knop(key, "inloggen", opties, "Inloggen met Face ID", auto=True, alleen_app=True)
    if not resultaat:
        return None
    if "antwoord" not in resultaat:
        return None if resultaat.get("fout") == "NietOndersteund" else {"fout": foutmelding(resultaat)}
    st.session_state.pop("_ts_inlog", None)  # elke uitdaging werkt één keer
    return _functie("inloggen_klaar", antwoord=resultaat["antwoord"], apparaat=apparaat)


# --- Instellen (ingelogd) -------------------------------------------------------------------------------------

def mijn() -> list[dict]:
    return opslag._rpc_ik("mijn_toegangssleutels")["sleutels"] if opslag.online() else []


def weg(sleutel_id: int) -> None:
    opslag._rpc_ik("toegangssleutel_weg", p_id=sleutel_id)


def instellen(apparaat: str, key: str = "ts_maken", label: str = "Face ID instellen") -> str | None:
    """Knop om op dit toestel een toegangssleutel te maken. Geeft "ok", een foutmelding, of None (nog niets)."""
    bewaard = st.session_state.get("_ts_maken")
    if not bewaard or bewaard[0] < time.time():
        antwoord = _functie("maken_start", naam=st.session_state.get("naam", ""),
                            wachtwoord=st.session_state.get("wachtwoord", ""))
        if not (opties := antwoord.get("opties")):
            st.caption(antwoord.get("fout") or "Even niet beschikbaar.")
            return None
        bewaard = st.session_state._ts_maken = (time.time() + 240, opties)
    resultaat = _knop(key, "maken", bewaard[1], label)
    if not resultaat:
        return None
    if "antwoord" not in resultaat:
        return foutmelding(resultaat)
    st.session_state.pop("_ts_maken", None)
    antwoord = _functie("maken_klaar", naam=st.session_state.get("naam", ""),
                        wachtwoord=st.session_state.get("wachtwoord", ""), antwoord=resultaat["antwoord"],
                        apparaat=apparaat)
    return "ok" if antwoord.get("ok") else (antwoord.get("fout") or "Dit lukte niet. Probeer het opnieuw.")


# --- Herstel per mail -----------------------------------------------------------------------------------------

def mail_ingesteld() -> bool:
    try:
        return bool(opslag._rpc("mail_ingesteld")) if opslag.online() else False
    except Exception:
        return False


def herstel_aanvragen(email: str, apparaat: str) -> dict:
    return opslag._rpc("herstel_aanvragen", p_email=email, p_apparaat=apparaat)


def herstel_afronden(email: str, code: str, nieuw: str, twee_stap: str, apparaat: str) -> dict:
    return opslag._rpc("herstel_afronden", p_email=email, p_code=code, p_nieuw_wachtwoord=nieuw,
                       p_twee_stap=twee_stap, p_apparaat=apparaat)


def mail_instellen(sleutel: str, afzender: str) -> dict:
    return opslag._rpc_ik("mail_instellen", p_sleutel=sleutel, p_afzender=afzender)
