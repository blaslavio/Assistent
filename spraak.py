"""Praten met de assistent: inspreken en antwoorden laten voorlezen, met gevoel in de stem.

Standaard gebeurt alles in de browser (Safari), zonder extra kosten of sleutels: spraakherkenning via de
dicteerfunctie van het apparaat en voorlezen met de stemmen die op het apparaat staan. De toonhoogte en het
tempo volgen het gevoel van het antwoord.

Wie een echt natuurlijke stem wil die emoties overbrengt (lachen, zuchten, enthousiast of meelevend klinken),
koppelt ElevenLabs met een eigen sleutel. Lukt dat niet, dan valt de app terug op de stem van het apparaat.
"""

import base64
import hashlib
import os
import re

import httpx
import streamlit as st

# Regio's en de taalcode van de stem.
REGIO = {"Nederland": "nl-NL", "Vlaanderen": "nl-BE"}
GESLACHT = ["Vrouw", "Man"]
STANDAARD = {"regio": "Nederland", "geslacht": "Vrouw", "snelheid": 1.0, "voorlezen": True, "doorpraten": False,
             "natuurlijk": False, "stem_id": ""}

# Het gevoel van een antwoord. De assistent zet het label [gevoel: ...] vooraan; het wordt niet getoond.
# toonhoogte en tempo zijn voor de stem van het apparaat, tag voor de natuurlijke stem (ElevenLabs).
GEVOELENS = {
    "neutraal": {"icoon": "🙂", "toonhoogte": 1.0, "tempo": 1.0, "tag": ""},
    "blij": {"icoon": "😊", "toonhoogte": 1.1, "tempo": 1.04, "tag": "[cheerfully]"},
    "enthousiast": {"icoon": "🤩", "toonhoogte": 1.15, "tempo": 1.08, "tag": "[excited]"},
    "rustig": {"icoon": "😌", "toonhoogte": 0.96, "tempo": 0.92, "tag": "[calmly]"},
    "meelevend": {"icoon": "🤗", "toonhoogte": 0.94, "tempo": 0.9, "tag": "[softly, with warmth]"},
    "bemoedigend": {"icoon": "💪", "toonhoogte": 1.05, "tempo": 1.0, "tag": "[encouragingly]"},
    "serieus": {"icoon": "🧐", "toonhoogte": 0.92, "tempo": 0.95, "tag": "[seriously]"},
    "grappig": {"icoon": "😄", "toonhoogte": 1.1, "tempo": 1.05, "tag": "[playfully]"},
    "verrast": {"icoon": "😮", "toonhoogte": 1.15, "tempo": 1.04, "tag": "[surprised]"},
    "trots": {"icoon": "🥳", "toonhoogte": 1.08, "tempo": 1.0, "tag": "[proudly]"},
}
# Klanken die de assistent in gesproken antwoorden mag gebruiken, met dubbele haken: [[lacht]].
KLANKEN = {"lacht": "[laughs]", "grinnikt": "[chuckles]", "zucht": "[sighs]", "fluistert": "[whispers]"}

_LABEL = re.compile(r"\[\s*gevoel\s*:\s*([a-zA-Zë]+)\s*\]\s*")
_KLANK = re.compile(r"\s*\[\[\s*([a-zA-Zë ]+?)\s*\]\]")


def gevoel_van(tekst: str) -> str:
    """Het laatste gevoelslabel in de tekst, of neutraal."""
    gevonden = [g.lower() for g in _LABEL.findall(tekst or "")]
    return next((g for g in reversed(gevonden) if g in GEVOELENS), "neutraal")


def zonder_labels(tekst: str) -> str:
    """Tekst zoals de gebruiker hem ziet: zonder gevoelslabels en klanken (ook half binnengekomen)."""
    tekst = _KLANK.sub("", _LABEL.sub("", tekst or ""))
    tekst = re.sub(r"^\s*\[[^\]\n]{0,20}$", "", tekst)  # label dat nog binnenkomt
    tekst = re.sub(r"\s*\[\[[^\]\n]{0,20}$", "", tekst)  # klank die nog binnenkomt
    return tekst.strip()


def met_klanken(tekst: str) -> str:
    """Tekst voor de natuurlijke stem: klanken als ElevenLabs-tags, labels eruit."""
    tekst = _LABEL.sub("", tekst or "")
    return _KLANK.sub(lambda m: " " + KLANKEN.get(m.group(1).lower().strip(), ""), tekst).strip()


# --- Natuurlijke stem (ElevenLabs) -------------------------------------------------------------

ELEVEN_URL = os.environ.get("ELEVENLABS_URL", "https://api.elevenlabs.io/v1/text-to-speech")
# Standaardstemmen uit de bibliotheek van ElevenLabs; ze spreken ook Nederlands. Een eigen stem-ID kan ook.
ELEVEN_STEMMEN = {"Vrouw": "EXAVITQu4vr4xnSDxMaL", "Man": "JBFqnCBsd6RMkjVDRZzb"}
# Nieuwste model eerst (begrijpt tags als [laughs]); het oudere model als terugval.
ELEVEN_MODELLEN = ["eleven_v4", "eleven_v3", "eleven_multilingual_v2"]


class StemFout(Exception):
    pass


def _eleven(tekst: str, sleutel: str, stem_id: str, model: str, snelheid: float) -> bytes:
    if model == "eleven_multilingual_v2":
        tekst = re.sub(r"\[[a-z ,]+\]\s*", "", tekst)  # dit model leest tags anders hardop voor
    r = httpx.post(f"{ELEVEN_URL}/{stem_id}", params={"output_format": "mp3_44100_64"},
                   headers={"xi-api-key": sleutel, "Accept": "audio/mpeg"}, timeout=60,
                   json={"text": tekst, "model_id": model, "language_code": "nl",
                         "voice_settings": {"stability": 0.4, "similarity_boost": 0.8, "style": 0.45,
                                            "speed": max(0.7, min(1.2, snelheid))}})
    if r.status_code in (401, 403):
        raise StemFout("De ElevenLabs-sleutel werkt niet (of mag geen spraak maken). Controleer hem bij Instellingen › Stem.")
    if r.status_code == 402 or "quota" in r.text.lower():
        raise StemFout("Je tegoed bij ElevenLabs is op. Tot dan lees ik voor met de stem van je apparaat.")
    if r.status_code in (400, 404, 422):
        raise LookupError(r.text[:200])
    r.raise_for_status()
    return r.content


def natuurlijk_voorlezen(tekst: str, gevoel: str, stem: dict, sleutel: str) -> bytes:
    """Maakt een mp3 met een natuurlijke stem en het gevoel van het antwoord. Bewaard per tekst."""
    zin = voor_voorlezen(met_klanken(tekst))[:2500]
    tag = GEVOELENS.get(gevoel, GEVOELENS["neutraal"])["tag"]
    stem_id = (stem.get("stem_id") or "").strip() or ELEVEN_STEMMEN.get(stem.get("geslacht"), ELEVEN_STEMMEN["Vrouw"])
    cache = st.session_state.setdefault("_stem_cache", {})
    sleutel_cache = hashlib.sha256(f"{stem_id}|{gevoel}|{stem.get('snelheid')}|{zin}".encode()).hexdigest()
    if sleutel_cache in cache:
        return cache[sleutel_cache]
    laatste = None
    for model in ELEVEN_MODELLEN:
        try:
            geluid = _eleven(f"{tag} {zin}".strip(), sleutel, stem_id, model, stem.get("snelheid", 1.0))
            break
        except LookupError as fout:  # model of stem onbekend: probeer het volgende model
            laatste = fout
    else:
        raise StemFout("Deze stem werkt niet bij ElevenLabs. Laat het stem-ID leeg of kies een andere stem.") from laatste
    if len(cache) > 20:
        cache.clear()
    cache[sleutel_cache] = geluid
    return geluid

LUIDSPREKER = ('<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3 10v4c0 '
               '.55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71V6.41c0-.89-1.08-1.34-1.71-.71L7 9H4c-.55 0-1 .45-1 1zm13.5 2A4.5 '
               '4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 4.45v.2c0 .38.25.71.6.85C17.18 6.53 19 9.06 19 12s-1.82 '
               '5.47-4.4 6.5c-.36.14-.6.47-.6.85v.2c0 .63.63 1.07 1.21.85C18.6 19.11 21 15.84 21 12s-2.4-7.11-5.79-8.4c-.58-.23'
               '-1.21.22-1.21.85z"/></svg>')
STOP = ('<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="6" '
        'width="12" height="12" rx="2"/></svg>')
MICROFOON = ('<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 '
             '3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 '
             '16 12 16s-4.52-1.8-4.93-4.15a.998.998 0 0 0-.98-.85c-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 '
             '1 1 1s1-.45 1-1v-2.08a6.993 6.993 0 0 0 5.91-5.78c.1-.6-.39-1.14-1-1.14z"/></svg>')

HTML = f"""
<div class="spraak">
  <button class="lees" type="button" title="Voorlezen" aria-label="Voorlezen">{LUIDSPREKER}<span>Voorlezen</span></button>
</div>
"""

CSS = """
.spraak { display: flex; align-items: center; margin: 0; }
button.lees { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 14px; cursor: pointer;
  border: 1px solid var(--st-border-color, rgba(128,128,128,.3)); border-radius: 999px; padding: 6px 12px;
  background: transparent; color: var(--st-text-color); opacity: .8; }
button.lees:hover { opacity: 1; border-color: var(--st-primary-color); color: var(--st-primary-color); }
button.lees.bezig { opacity: 1; color: var(--st-primary-color); border-color: var(--st-primary-color); }
button.lees:disabled { display: none; }
"""

JS = """
const VROUW = ["claire", "ellen", "fleur", "lotte", "sara", "anna", "colette", "femke", "lisa", "google nederlands"];
const MAN = ["xander", "ari", "maarten", "bart", "frank", "guus", "daan", "ruben"];
const LUIDSPREKER = `__LUIDSPREKER__`;
const STOP = `__STOP__`;

function kiesStem(taal, geslacht) {
  const alle = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const nl = alle.filter(v => v.lang && v.lang.toLowerCase().startsWith("nl"));
  const zelfdeRegio = nl.filter(v => v.lang.replace("_", "-").toLowerCase() === taal.toLowerCase());
  const namen = geslacht === "Man" ? MAN : VROUW;
  const past = l => l.find(v => namen.some(n => v.name.toLowerCase().includes(n)));
  // Verbeterde (premium) stemmen klinken natuurlijker, die gaan voor.
  const beste = l => l.find(v => /premium|enhanced|verbeterd/i.test(v.name) && namen.some(n => v.name.toLowerCase().includes(n)));
  return beste(zelfdeRegio) || past(zelfdeRegio) || beste(nl) || past(nl) || zelfdeRegio[0] || nl[0] || null;
}

function context() {
  if (!window.__assistentCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    window.__assistentCtx = new C();
    // Ook geluid als de iPhone op stil staat (Safari 17+).
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
  }
  return window.__assistentCtx;
}

function ontgrendel() {
  const c = context();
  if (!c) return;
  if (c.state !== "running") c.resume();
  const leeg = c.createBufferSource();
  leeg.buffer = c.createBuffer(1, 1, 22050);
  leeg.connect(c.destination);
  leeg.start(0);
}

export default function (component) {
  const { data, parentElement } = component;
  const d = data || {};
  const lees = parentElement.querySelector(".lees");
  window.__assistentGesproken = window.__assistentGesproken || new Set();

  // Eén tik ergens op de pagina ontgrendelt het geluid voor later (iPad en iPhone vragen daarom).
  if (!window.__assistentOntgrendeld) {
    window.__assistentOntgrendeld = true;
    const eenmaal = () => { ontgrendel(); };
    document.addEventListener("touchend", eenmaal, { passive: true });
    document.addEventListener("click", eenmaal, { passive: true });
  }

  function toon(bezig) {
    lees.classList.toggle("bezig", bezig);
    lees.innerHTML = bezig ? STOP + "<span>Stoppen</span>" : LUIDSPREKER + "<span>Voorlezen</span>";
    lees.title = bezig ? "Stoppen" : "Voorlezen";
  }

  function stopAlles() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (window.__assistentBron) { try { window.__assistentBron.onended = null; window.__assistentBron.stop(); } catch (e) {} }
    window.__assistentBron = null;
    toon(false);
  }

  function klaar(daarna) {
    toon(false);
    if (daarna) daarna();
  }

  function spreekApparaat(tekst, daarna) {
    if (!window.speechSynthesis || !tekst) return;
    stopAlles();
    const u = new SpeechSynthesisUtterance(tekst);
    u.lang = d.taal || "nl-NL";
    u.rate = (d.snelheid || 1) * (d.tempo || 1);
    u.pitch = d.toonhoogte || 1;
    const stem = kiesStem(u.lang, d.geslacht);
    if (stem) u.voice = stem;
    u.onend = () => klaar(daarna);
    toon(true);
    speechSynthesis.speak(u);
  }

  // Natuurlijke stem: een mp3 via Web Audio. Die is na één tik op de pagina ontgrendeld, ook op de iPad.
  async function speelGeluid(b64, daarna) {
    const c = context();
    if (!c) return false;
    try {
      const bytes = Uint8Array.from(atob(b64), t => t.charCodeAt(0));
      const buffer = await c.decodeAudioData(bytes.buffer);
      stopAlles();
      if (c.state !== "running") await c.resume();
      const bron = c.createBufferSource();
      bron.buffer = buffer;
      bron.connect(c.destination);
      bron.onended = () => { window.__assistentBron = null; klaar(daarna); };
      window.__assistentBron = bron;
      bron.start(0);
      toon(true);
      return true;
    } catch (e) {
      return false;
    }
  }

  function spreek(tekst, daarna) {
    if (d.geluid) {
      speelGeluid(d.geluid, daarna).then(ok => { if (!ok) spreekApparaat(tekst, daarna); });
    } else {
      spreekApparaat(tekst, daarna);
    }
  }

  lees.onclick = () => {
    ontgrendel();
    if (lees.classList.contains("bezig")) { stopAlles(); return; }
    spreek(d.tekst);
  };
  lees.disabled = !d.tekst;

  // Nieuw antwoord: één keer automatisch voorlezen, en bij doorpraten daarna weer luisteren (via de microfoon).
  if (d.automatisch && d.id && d.tekst && !window.__assistentGesproken.has(d.id)) {
    window.__assistentGesproken.add(d.id);
    const verder = d.doorpraten ? () => { if (window.__assistentLuister) window.__assistentLuister(); } : null;
    const start = () => spreek(d.tekst, verder);
    if (!d.geluid && window.speechSynthesis && speechSynthesis.getVoices().length === 0) {
      speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; start(); };
      setTimeout(start, 600);
    } else {
      start();
    }
  }
}
""".replace("__LUIDSPREKER__", LUIDSPREKER).replace("__STOP__", STOP)

# De microfoon zit in het invoerveld onderaan, naast het pijltje omhoog, zoals in de Claude-app.
# Het onderdeel zelf is onzichtbaar; het zet een knop in de invoerbalk van Streamlit en houdt die daar.
MIC_CSS = """
[data-testid="stChatInput"] .assistent-mic { display: flex; align-items: center; justify-content: center;
  width: 2.25rem; height: 2.25rem; border-radius: 999px; border: none; background: transparent; cursor: pointer;
  color: var(--st-text-color, #31333f); opacity: .75; padding: 0; margin-right: 2px; flex-shrink: 0; align-self: end; }
[data-testid="stChatInput"] .assistent-mic:hover { opacity: 1; background: rgba(128,128,128,.12); }
[data-testid="stChatInput"] .assistent-mic.aan { opacity: 1; color: #fff; background: #e0443e;
  animation: assistent-puls 1.4s ease-in-out infinite; }
@keyframes assistent-puls { 0%, 100% { box-shadow: 0 0 0 0 rgba(224,68,62,.45); } 50% { box-shadow: 0 0 0 7px rgba(224,68,62,0); } }
"""

MIC_JS = """
const MICROFOON = `__MICROFOON__`;
const CSS = `__CSS__`;

export default function (component) {
  const { data, setTriggerValue } = component;
  const d = data || {};
  const Herkenning = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!document.getElementById("assistent-mic-stijl")) {
    const stijl = document.createElement("style");
    stijl.id = "assistent-mic-stijl";
    stijl.textContent = CSS;
    document.head.appendChild(stijl);
  }
  const st = window.__assistentMic = window.__assistentMic || { luistert: false, herkenner: null };
  st.setTriggerValue = setTriggerValue;
  st.taal = d.taal || "nl-NL";

  function veld() { return document.querySelector('[data-testid="stChatInputTextArea"]'); }

  function zetTekst(tekst) {
    // Het tekstvak is van React: via de echte setter en een input-gebeurtenis ziet Streamlit de nieuwe tekst.
    const v = veld();
    if (!v) return;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(v, tekst);
    v.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function knopStand() {
    if (!st.knop) return;
    st.knop.classList.toggle("aan", st.luistert);
    st.knop.title = st.luistert ? "Stoppen met luisteren" : "Inspreken";
    st.knop.setAttribute("aria-label", st.knop.title);
  }

  function luister() {
    const v = veld();
    if (!Herkenning) {
      if (v) { v.placeholder = "Inspreken: tik in dit vak en gebruik de microfoon van je toetsenbord"; v.focus(); }
      return;
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (window.__assistentBron) { try { window.__assistentBron.stop(); } catch (e) {} }
    const h = st.herkenner = new Herkenning();
    h.lang = st.taal;
    h.interimResults = true;
    h.continuous = false;
    let tekst = "";
    const oud = v ? v.placeholder : "";
    h.onresult = e => {
      tekst = Array.from(e.results).map(r => r[0].transcript).join(" ");
      zetTekst(tekst);
    };
    h.onerror = e => {
      const w = veld();
      if (w && e.error === "not-allowed") w.placeholder = "Geef Safari toegang tot de microfoon (Instellingen › Safari)";
    };
    h.onend = () => {
      st.luistert = false;
      knopStand();
      const w = veld();
      if (w && w.placeholder.startsWith("Ik luister")) w.placeholder = oud;
      if (tekst.trim()) {
        zetTekst("");
        st.setTriggerValue("gezegd", tekst.trim());
      }
    };
    st.luistert = true;
    knopStand();
    if (v) v.placeholder = "Ik luister...";
    h.start();
  }
  window.__assistentLuister = luister;

  function maakKnop() {
    const k = document.createElement("button");
    k.type = "button";
    k.className = "assistent-mic";
    k.innerHTML = MICROFOON;
    k.onclick = (e) => {
      e.preventDefault();
      // Een lege uitspraak tijdens de tik ontgrendelt voorlezen op de iPad.
      if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      if (st.luistert && st.herkenner) { st.herkenner.stop(); return; }
      luister();
    };
    return k;
  }

  function plaats() {
    const balk = document.querySelector('[data-testid="stChatInput"]');
    const verzend = balk && balk.querySelector('[data-testid="stChatInputSubmitButton"]');
    if (!verzend) return;
    if (!st.knop) st.knop = maakKnop();
    const plek = verzend.parentElement;
    if (st.knop.nextSibling !== plek || st.knop.parentElement !== plek.parentElement) {
      plek.parentElement.insertBefore(st.knop, plek);
    }
    knopStand();
  }
  plaats();
  // Streamlit tekent de invoerbalk soms opnieuw; zet de knop er dan weer in (hooguit één keer per beeldje).
  if (!st.waker) {
    let gepland = false;
    st.waker = new MutationObserver(() => {
      if (gepland) return;
      gepland = true;
      requestAnimationFrame(() => { gepland = false; plaats(); });
    });
    st.waker.observe(document.body, { childList: true, subtree: true });
  }
}
""".replace("__MICROFOON__", MICROFOON).replace("__CSS__", MIC_CSS)

_microfoon = st.components.v2.component("microfoon", html="<span></span>", js=MIC_JS)


def microfoon(stem: dict, key: str = "microfoon") -> str | None:
    """De microfoonknop in het invoerveld onderaan. Geeft terug wat er is ingesproken, of None."""
    resultaat = _microfoon(key=key, data={"taal": REGIO.get(stem["regio"], "nl-NL")}, on_gezegd_change=lambda: None)
    return getattr(resultaat, "gezegd", None) if resultaat is not None else None


_component = st.components.v2.component("spraak", html=HTML, css=CSS, js=JS)


def instellingen(opgeslagen: dict | None) -> dict:
    return {**STANDAARD, **(opgeslagen or {})}


def voor_voorlezen(tekst: str) -> str:
    """Markdown omzetten naar gewone zinnen: zonder sterretjes, kopjes, links en emoji-opsommingen."""
    tekst = _LABEL.sub("", tekst or "")
    tekst = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", tekst)
    tekst = re.sub(r"https?://\S+", "", tekst)
    tekst = re.sub(r"[*_`#>|]", "", tekst)
    tekst = re.sub(r"^\s*[-•]\s*", "", tekst, flags=re.M)
    tekst = re.sub(r"\s*\n+\s*", ". ", tekst.strip())
    tekst = re.sub(r"([:.!?])\.", r"\1", tekst)
    return re.sub(r"\s+", " ", tekst).strip()


def knop(stem: dict, tekst: str = "", antwoord_id: str = "", automatisch: bool = False, key: str = "spraak",
         alleen_voorlezen: bool = False, gevoel: str = "neutraal", geluid: bytes | None = None) -> str | None:
    """Een knop Voorlezen (wordt Stoppen tijdens het voorlezen). Inspreken gaat via microfoon() in het invoerveld.

    `gevoel` kleurt de stem van het apparaat; `geluid` (mp3 van de natuurlijke stem) gaat daar voor.
    """
    g = GEVOELENS.get(gevoel, GEVOELENS["neutraal"])
    resultaat = _component(
        key=key,
        data={
            "tekst": voor_voorlezen(zonder_labels(tekst)),
            "toonhoogte": g["toonhoogte"],
            "tempo": g["tempo"],
            "geluid": base64.b64encode(geluid).decode() if geluid else "",
            "id": antwoord_id,
            "automatisch": automatisch,
            "taal": REGIO.get(stem["regio"], "nl-NL"),
            "geslacht": stem["geslacht"],
            "snelheid": stem["snelheid"],
            "doorpraten": stem["doorpraten"],
            "alleen_voorlezen": alleen_voorlezen,
        },
        on_gezegd_change=lambda: None,
    )
    return getattr(resultaat, "gezegd", None) if resultaat is not None else None
