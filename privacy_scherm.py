"""Instellingen › Privacy en beveiliging: een beveiligingscheck, de app-vergrendeling met pincode, het verbergen van
de inhoud in het app-overzicht, een incognito-toetsenbord, een lekcheck voor je wachtwoord, wat de assistent mag
onthouden, en (onder Geavanceerd) hoe alles technisch beveiligd is.

De vergrendeling werkt zoals bij Signal en WhatsApp: na een tijdje niets doen, of als je de app een tijd niet open had,
vraagt de app je pincode. De pincode staat alleen als hash (PBKDF2-SHA-256) in je instellingen.
"""

import csv
import hashlib
import io
import secrets
import time
from datetime import datetime, timedelta, timezone

import httpx
import streamlit as st

import opslag

MINUTEN = {1: "1 minuut", 5: "5 minuten", 15: "15 minuten", 60: "1 uur"}
POGINGEN = 5

JS = r"""
export default function (component) {
  const { data, setTriggerValue } = component;
  const s = window.__slot || (window.__slot = {});
  s.data = data || {}; s.zet = setTriggerValue;
  const sluier = () => {
    if (document.getElementById("slot-sluier")) return;
    const d = document.createElement("div");
    d.id = "slot-sluier";
    d.style.cssText = "position:fixed;inset:0;z-index:2147483647;backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);background:rgba(240,242,246,.72)";
    document.body.appendChild(d);
  };
  const weg = () => { const d = document.getElementById("slot-sluier"); if (d) d.remove(); };
  if (!s.klaar) {
    s.klaar = true; s.actief = Date.now();
    // In het app-overzicht van je telefoon is dan niets van je gegevens te zien.
    document.addEventListener("visibilitychange", () => {
      const d = s.data;
      if (document.visibilityState === "hidden") { s.weg = Date.now(); if (d.verbergen) sluier(); return; }
      weg();
      if (d.aan && !d.op_slot && s.weg && Date.now() - s.weg > d.minuten * 60000) s.zet("slot", Date.now());
      s.actief = Date.now();
    });
    window.addEventListener("pagehide", () => { if (s.data.verbergen) sluier(); });
    window.addEventListener("pageshow", weg);
    for (const soort of ["pointerdown", "keydown", "touchstart", "wheel"]) {
      document.addEventListener(soort, () => { s.actief = Date.now(); }, { passive: true, capture: true });
    }
    setInterval(() => {
      const d = s.data;
      if (d.aan && !d.op_slot && document.visibilityState === "visible" && Date.now() - s.actief > d.minuten * 60000) {
        s.actief = Date.now(); s.zet("slot", Date.now());
      }
    }, 15000);
    // Incognito-toetsenbord: geen autocorrectie of spellingcontrole, zodat het toetsenbord niets van je leert.
    const incognito = () => {
      if (!s.data.incognito) return;
      for (const el of document.querySelectorAll("input:not([type=password]):not([type=checkbox]):not([type=radio]), textarea")) {
        if (el.dataset.incognito) continue;
        el.dataset.incognito = "1";
        el.setAttribute("autocorrect", "off"); el.setAttribute("spellcheck", "false"); el.setAttribute("autocapitalize", "off");
        if (!el.getAttribute("autocomplete")) el.setAttribute("autocomplete", "off");
      }
    };
    new MutationObserver(incognito).observe(document.body, { childList: true, subtree: true });
    s.incognito = incognito;
  }
  if (s.incognito) s.incognito();
}
"""

_bewaker = st.components.v2.component("privacy_bewaker", html="<span></span>", js=JS)


def instellingen() -> dict:
    v = opslag.instellingen().get("vergrendeling") or {}
    return {"aan": bool(v.get("aan") and v.get("pin")), "minuten": int(v.get("minuten") or 5),
            "verbergen": bool(v.get("verbergen")), "incognito": bool(v.get("incognito")),
            "pin": v.get("pin", ""), "zout": v.get("zout", "")}


def _hash(pin: str, zout: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(zout), 200_000).hex()


def op_slot() -> bool:
    """Na het inloggen, bij elke ronde: houdt de vergrendeling bij. True = de app is op slot (alleen het slotscherm)."""
    v = instellingen()
    if st.session_state.pop("vergrendeld_bij_start", False) and v["aan"]:
        st.session_state.vergrendeld = True  # vanzelf ingelogd op een onthouden toestel: eerst je pincode
    dicht = bool(v["aan"] and st.session_state.get("vergrendeld"))
    uit = _bewaker(key="privacy_bewaker", data={"aan": v["aan"], "minuten": v["minuten"], "verbergen": v["verbergen"],
                                                "incognito": v["incognito"], "op_slot": dicht},
                   on_slot_change=lambda: None)
    if v["aan"] and not dicht and getattr(uit, "slot", None):
        st.session_state.vergrendeld = True
        st.rerun()
    if dicht:
        slotscherm(v)
    return dicht


def slotscherm(v: dict) -> None:
    st.markdown("<div style='height:8vh'></div>", unsafe_allow_html=True)
    st.markdown("### :material/lock: Op slot")
    st.caption("Vul je pincode in om verder te gaan.")
    with st.form("ontgrendelen", border=False):
        pin = st.text_input("Pincode", type="password", max_chars=8, autocomplete="off",
                            label_visibility="collapsed", placeholder="Pincode")
        if st.form_submit_button("Ontgrendelen", type="primary", width="stretch"):
            if secrets.compare_digest(_hash(pin.strip(), v["zout"]), v["pin"]):
                st.session_state.pop("slot_fout", None)
                st.session_state.vergrendeld = False
                st.rerun()
            fout = st.session_state.slot_fout = st.session_state.get("slot_fout", 0) + 1
            time.sleep(min(fout, 3))  # raden wordt traag
            if fout >= POGINGEN:
                _uitloggen()
            st.error(f"Onjuiste pincode. Nog {POGINGEN - fout} keer, dan log je uit.")
    if st.button("Pincode vergeten? Uitloggen", type="tertiary"):
        _uitloggen()


def _uitloggen() -> None:
    try:
        opslag.uitloggen()
        opslag.apparaat_vergeten(st.session_state.get("apparaat_token", ""))
    except Exception:
        pass
    st.session_state.clear()
    st.session_state.apparaat_wis = True
    st.session_state.apparaat_geprobeerd = True
    st.rerun()


# --- De pagina ---------------------------------------------------------------------------------------------------

def pagina() -> None:
    import samen_scherm
    beveiligingscheck()
    st.markdown("**Vergrendeling en scherm**")
    vergrendeling()
    st.markdown("**Inloggen**")
    with st.expander("Tweestapsverificatie, Face ID en apparaten", icon=":material/key:"):
        samen_scherm.beveiliging()
    with st.expander("Is mijn wachtwoord gelekt?", icon=":material/policy:"):
        lekcheck()
    st.markdown("**Assistent**")
    assistent_privacy()
    if st.toggle("Geavanceerde opties", key="privacy_geavanceerd"):
        geavanceerd()


def beveiligingscheck() -> None:
    """Zoals een beveiligingscheck bij Google of Apple: wat staat goed, en wat kan beter (met één tip)."""
    b = _veilig(opslag.beveiliging, {}) or {}
    import toegangssleutel
    sleutels = _veilig(toegangssleutel.mijn, []) or []
    ik = st.session_state.get("ik") or {}
    week = datetime.now(timezone.utc) - timedelta(days=7)
    mislukt = [i for i in b.get("inlogs", []) if not i.get("gelukt") and _tijd(i.get("tijd")) > week]
    punten = [
        (bool(b.get("twee_stap")), "Tweestapsverificatie staat aan", "Zet tweestapsverificatie aan bij Inloggen."),
        (bool(sleutels), "Inloggen met Face ID", "Stel Face ID in bij Inloggen: veiliger dan een wachtwoord."),
        (not b.get("twee_stap") or b.get("herstelcodes_over", 0) >= 3, "Genoeg herstelcodes",
         "Je hebt bijna geen herstelcodes meer. Zet tweestapsverificatie uit en weer aan voor nieuwe."),
        (bool(ik.get("email")), "Mailadres voor herstel", "Vul je mailadres in bij Account."),
        (instellingen()["aan"], "App-vergrendeling", "Zet de app-vergrendeling aan, hieronder."),
        (len(b.get("sessies", [])) <= 3, "Weinig open sessies", "Log uit op apparaten die je niet meer gebruikt."),
        (not mislukt, "Geen mislukte inlogpogingen deze week",
         f"{len(mislukt)} mislukte poging(en) deze week. Was jij dat niet? Kies een nieuw wachtwoord."),
    ]
    goed = sum(ok for ok, _, _ in punten)
    with st.container(border=True):
        st.markdown(f"**Beveiligingscheck: {goed} van {len(punten)} in orde**")
        st.progress(goed / len(punten))
        for ok, naam, tip in punten:
            st.markdown(f":green[:material/check_circle:] {naam}" if ok else f":orange[:material/error:] {tip}")


def vergrendeling() -> None:
    v = instellingen()
    with st.container(border=True):
        aan = st.toggle("App-vergrendeling met pincode", value=v["aan"], key="slot_aan",
                        help="Na een tijdje niets doen, of als je de app een tijd niet open had, vraagt de app je "
                             "pincode. Ook als je op dit toestel vanzelf bent ingelogd.")
        if aan and not v["aan"]:
            with st.form("pin_kiezen", border=False):
                pin = st.text_input("Kies een pincode (4 tot 8 cijfers)", type="password", max_chars=8)
                minuten = st.selectbox("Op slot na", list(MINUTEN), index=1, format_func=MINUTEN.get)
                if st.form_submit_button("Aanzetten", type="primary"):
                    if not (pin.isdigit() and 4 <= len(pin) <= 8):
                        st.error("Kies 4 tot 8 cijfers.")
                    elif len(set(pin)) == 1 or pin in "0123456789" or pin in "9876543210":
                        st.error("Te makkelijk te raden. Kies een andere pincode.")
                    else:
                        zout = secrets.token_hex(16)
                        _bewaren(aan=True, pin=_hash(pin, zout), zout=zout, minuten=minuten)
                        st.session_state.vergrendeld = False
                        st.toast("De app-vergrendeling staat aan.", icon=":material/lock:")
                        st.rerun()
        elif v["aan"]:
            minuten = st.selectbox("Op slot na", list(MINUTEN), index=list(MINUTEN).index(v["minuten"])
                                   if v["minuten"] in MINUTEN else 1, format_func=MINUTEN.get, key="slot_minuten")
            if minuten != v["minuten"]:
                _bewaren(minuten=minuten)
                st.rerun()
            if not aan:
                _bewaren(aan=False, pin="", zout="")
                st.rerun()
            if st.button("Nu vergrendelen", icon=":material/lock:", type="tertiary"):
                st.session_state.vergrendeld = True
                st.rerun()
        verbergen = st.toggle("Inhoud verbergen in het app-overzicht", value=v["verbergen"], key="slot_verbergen",
                              help="Wie over je schouder of in je app-overzicht kijkt, ziet alleen een wazig scherm.")
        incognito = st.toggle("Incognito-toetsenbord", value=v["incognito"], key="slot_incognito",
                              help="Zet autocorrectie en spellingcontrole uit in de app, zodat je toetsenbord niets "
                                   "leert van wat je typt.")
        if (verbergen, incognito) != (v["verbergen"], v["incognito"]):
            _bewaren(verbergen=verbergen, incognito=incognito)
            st.rerun()


def _bewaren(**nieuw) -> None:
    v = dict(opslag.instellingen().get("vergrendeling") or {})
    opslag.instellingen_bijwerken(vergrendeling=v | nieuw)


def lekcheck() -> None:
    """Have I Been Pwned (Pwned Passwords) met k-anonimiteit: alleen de eerste 5 tekens van de SHA-1-hash gaan naar
    buiten, nooit je wachtwoord. Het antwoord bevat honderden hashes, en de vergelijking gebeurt hier."""
    st.caption("Controleer of je wachtwoord voorkomt in bekende datalekken. Je wachtwoord verlaat de app niet: alleen "
               "de eerste 5 tekens van een versleutelde vingerafdruk gaan naar Have I Been Pwned.")
    with st.form("lekcheck", border=False, clear_on_submit=True):
        ww = st.text_input("Wachtwoord", type="password", autocomplete="current-password")
        if st.form_submit_button("Controleren") and ww:
            h = hashlib.sha1(ww.encode(), usedforsecurity=False).hexdigest().upper()
            try:
                r = httpx.get(f"https://api.pwnedpasswords.com/range/{h[:5]}", timeout=8,
                              headers={"Add-Padding": "true", "User-Agent": "Mijn-assistent"})
                r.raise_for_status()
            except httpx.HTTPError:
                st.error("De controle lukt nu niet. Probeer het later opnieuw.")
                return
            aantal = next((int(n) for regel in r.text.splitlines() if ":" in regel
                           for rest, n in [regel.strip().split(":", 1)] if rest == h[5:]), 0)
            if aantal:
                st.error(f"Dit wachtwoord komt {aantal:,} keer voor in datalekken. Kies een nieuw wachtwoord bij "
                         "Account › Mijn account.".replace(",", "."))
            else:
                st.success("Niet gevonden in bekende datalekken.")


def assistent_privacy() -> None:
    inst = opslag.instellingen()
    with st.container(border=True):
        mag = st.toggle("De assistent mag dingen over je onthouden", value=not inst.get("geheugen_uit"),
                        key="privacy_geheugen", help="Zoals je voorkeuren en gewoontes, voor betere antwoorden.")
        if mag == bool(inst.get("geheugen_uit")):
            opslag.instellingen_bijwerken(geheugen_uit=not mag)
            st.rerun()
        aantal = len(opslag.geheugen())
        if aantal:
            with st.popover(f"Alles vergeten ({aantal})", icon=":material/delete:"):
                st.caption("De assistent vergeet alles wat hij over je heeft onthouden. Dit kan niet terug.")
                if st.button("Ja, alles vergeten", type="primary"):
                    for f in list(opslag.geheugen()):
                        opslag.vergeten(f["id"])
                    st.toast("Vergeten.", icon=":material/check:")
                    st.rerun()
        st.caption("Wat je de assistent vraagt, gaat naar Anthropic (Claude) om te beantwoorden. Anthropic gebruikt "
                   "het niet om te trainen. Je chatberichten met anderen leest hij alleen als jij om een voorstel vraagt.")


def geavanceerd() -> None:
    st.markdown("**Zo is het technisch beveiligd**")
    _tabel()
    b = _veilig(opslag.beveiliging, {}) or {}
    if inlogs := b.get("inlogs"):
        uit = io.StringIO()
        w = csv.writer(uit)
        w.writerow(["tijd", "apparaat", "gelukt", "reden"])
        for i in inlogs:
            w.writerow([i.get("tijd"), i.get("apparaat"), i.get("gelukt"), i.get("reden") or ""])
        st.download_button("Inlogpogingen downloaden (CSV)", uit.getvalue(), file_name="inlogpogingen.csv",
                           mime="text/csv", icon=":material/download:")


TECHNIEK = [
    ("Wachtwoord", "bcrypt (kosten 10, uniek zout); alleen de hash wordt bewaard"),
    ("Sessie", "willekeurige sleutel van 256 bits; de server bewaart alleen de SHA-256. Verloopt 12 uur na het "
               "laatste gebruik, hooguit na 30 dagen"),
    ("Tweestapsverificatie", "TOTP (RFC 6238): 6 cijfers, 30 seconden, elke code één keer; 8 herstelcodes"),
    ("Face ID", "WebAuthn-toegangssleutel (ES256 of RS256); je gezicht of vingerafdruk verlaat je toestel nooit"),
    ("Chat", "end-to-end: ECDH P-256, HKDF-SHA-256, AES-256-GCM, ondertekend met ECDSA P-256"),
    ("Verbinding", "altijd HTTPS (TLS)"),
    ("Database", "PostgreSQL met Row Level Security op elke tabel; alleen bereikbaar via gecontroleerde functies"),
    ("Opslaglocatie", "Europese Unie (Ierland)"),
    ("Nieuwe accounts", "eenmalige rekenpuzzel (SHA-256) en tijdscontrole tegen bots"),
    ("Pincode", "PBKDF2-SHA-256, 200.000 rondes, uniek zout"),
]


def _tabel() -> None:
    st.markdown("\n".join(f"- **{naam}**: {hoe}" for naam, hoe in TECHNIEK))


def _tijd(waarde) -> datetime:
    try:
        return datetime.fromisoformat(str(waarde))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def _veilig(functie, standaard):
    try:
        return functie()
    except Exception:
        return standaard
