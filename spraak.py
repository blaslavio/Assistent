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

HTML = """
<div class="spraak">
  <button class="praat" type="button">🎤 Praat</button>
  <button class="lees" type="button" title="Voorlezen">🔊</button>
  <button class="stop" type="button" title="Stoppen">⏹️</button>
  <div class="status"></div>
</div>
"""

CSS = """
.spraak { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 8px; }
button { font: inherit; border-radius: 999px; border: 1px solid var(--st-border-color, #ccc); padding: 10px 18px;
         background: var(--st-secondary-background-color); color: var(--st-text-color); cursor: pointer; }
button.praat { background: var(--st-primary-color); color: white; border: none; font-weight: 600; flex: 1; min-width: 140px; }
button.praat.aan { background: #e0443e; }
.status { width: 100%; font-size: 14px; opacity: .7; min-height: 1em; }
"""

JS = """
const VROUW = ["claire", "ellen", "fleur", "lotte", "sara", "anna", "colette", "femke", "lisa", "google nederlands"];
const MAN = ["xander", "ari", "maarten", "bart", "frank", "guus", "daan", "ruben"];

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
  const { data, setTriggerValue, parentElement } = component;
  const d = data || {};
  const praat = parentElement.querySelector(".praat");
  const lees = parentElement.querySelector(".lees");
  const stop = parentElement.querySelector(".stop");
  const status = parentElement.querySelector(".status");
  const Herkenning = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.__assistentGesproken = window.__assistentGesproken || new Set();

  if (d.alleen_voorlezen) praat.style.display = "none";
  // Eén tik ergens op de pagina ontgrendelt het geluid voor later (iPad en iPhone vragen daarom).
  if (!window.__assistentOntgrendeld) {
    window.__assistentOntgrendeld = true;
    const eenmaal = () => { ontgrendel(); };
    document.addEventListener("touchend", eenmaal, { passive: true });
    document.addEventListener("click", eenmaal, { passive: true });
  }

  function stopAlles() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (window.__assistentBron) { try { window.__assistentBron.onended = null; window.__assistentBron.stop(); } catch (e) {} }
    window.__assistentBron = null;
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
    u.onend = () => { status.textContent = ""; if (daarna) daarna(); };
    status.textContent = "🔊 Aan het voorlezen...";
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
      bron.onended = () => { status.textContent = ""; window.__assistentBron = null; if (daarna) daarna(); };
      window.__assistentBron = bron;
      bron.start(0);
      status.textContent = c.state === "running" ? "🔊 Aan het voorlezen..." : "Tik op 🔊 om te luisteren.";
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

  let luistert = false;
  let herkenner = null;
  function luister() {
    if (!Herkenning) {
      status.textContent = "Inspreken werkt hier niet. Tik in het tekstvak onderaan op 🎤 van je toetsenbord.";
      return;
    }
    stopAlles();
    herkenner = new Herkenning();
    herkenner.lang = d.taal || "nl-NL";
    herkenner.interimResults = true;
    herkenner.continuous = false;
    let tekst = "";
    herkenner.onresult = e => {
      tekst = Array.from(e.results).map(r => r[0].transcript).join(" ");
      status.textContent = "🎤 " + tekst;
    };
    herkenner.onerror = e => {
      status.textContent = e.error === "not-allowed"
        ? "Geef Safari toegang tot de microfoon (Instellingen > Safari > Microfoon) en zet Dicteren aan."
        : "Ik heb niets gehoord. Tik nog eens op Praat.";
    };
    herkenner.onend = () => {
      luistert = false;
      praat.classList.remove("aan");
      praat.textContent = "🎤 Praat";
      if (tekst.trim()) {
        status.textContent = "✓ " + tekst;
        setTriggerValue("gezegd", tekst.trim());
      }
    };
    luistert = true;
    praat.classList.add("aan");
    praat.textContent = "● Ik luister... (tik om te stoppen)";
    status.textContent = "";
    herkenner.start();
  }

  praat.onclick = () => {
    // Een lege uitspraak tijdens de tik ontgrendelt voorlezen op de iPad.
    if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    ontgrendel();
    if (luistert && herkenner) { herkenner.stop(); return; }
    luister();
  };
  lees.onclick = () => { ontgrendel(); spreek(d.tekst); };
  stop.onclick = () => {
    stopAlles();
    if (herkenner) herkenner.abort();
    status.textContent = "";
  };
  lees.disabled = !d.tekst;

  // Nieuw antwoord: één keer automatisch voorlezen, en bij doorpraten daarna weer luisteren.
  if (d.automatisch && d.id && d.tekst && !window.__assistentGesproken.has(d.id)) {
    window.__assistentGesproken.add(d.id);
    const start = () => spreek(d.tekst, d.doorpraten ? luister : null);
    if (!d.geluid && window.speechSynthesis && speechSynthesis.getVoices().length === 0) {
      speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; start(); };
      setTimeout(start, 600);
    } else {
      start();
    }
  }

  return () => {
    if (herkenner) herkenner.abort();
  };
}
"""

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
    """Toont de spraakknoppen. Geeft terug wat er is ingesproken, of None.

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
