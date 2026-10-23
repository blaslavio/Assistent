"""Alleen mensen: de rekenpuzzel bij het aanmelden (zie sql/alleen_mensen.sql).

De server geeft een eenmalige uitdaging (zout en moeilijkheid). De browser zoekt een getal waarmee
SHA-256(zout + getal) met genoeg nullen begint. Voor één persoon duurt dat ongeveer een seconde, op de achtergrond
terwijl je het formulier invult; voor wie duizenden accounts wil maken wordt het onbetaalbaar.
Geen captcha van een ander bedrijf: niets van je gaat naar buiten.
"""

import streamlit as st

import opslag

JS = r"""
// SHA-256 (FIPS 180-4), synchroon: duizenden keren per milliseconde, zonder de wachttijd van crypto.subtle.
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,
  0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,
  0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,
  0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,
  0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const W = new Uint32Array(64);
function eersteWoord(tekst) {
  // Alleen de eerste 32 bits van de hash: meer hebben we niet nodig om de nullen te tellen.
  const n = tekst.length, blokken = ((n + 9 + 63) >> 6);
  const m = new Uint8Array(blokken * 64);
  for (let i = 0; i < n; i++) m[i] = tekst.charCodeAt(i);
  m[n] = 0x80;
  const bits = n * 8; m[m.length - 4] = bits >>> 24; m[m.length - 3] = bits >>> 16; m[m.length - 2] = bits >>> 8; m[m.length - 1] = bits;
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let b = 0; b < m.length; b += 64) {
    for (let t = 0; t < 16; t++) W[t] = (m[b + t * 4] << 24) | (m[b + t * 4 + 1] << 16) | (m[b + t * 4 + 2] << 8) | m[b + t * 4 + 3];
    for (let t = 16; t < 64; t++) {
      const x = W[t - 15], y = W[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }
    let a = h0, c1 = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & c1) ^ (a & c) ^ (c1 & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = c1; c1 = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + c1) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return h0 >>> 0;
}

export default function (component) {
  const { data, setTriggerValue } = component;
  if (!data || !data.zout) return;
  const klaar = window.__mensKlaar || (window.__mensKlaar = {});
  if (klaar[data.id]) { setTriggerValue("oplossing", klaar[data.id]); return; }
  if (window.__mensBezig === data.id) return;
  window.__mensBezig = data.id;
  const grens = 2 ** (32 - data.moeilijkheid);
  let i = 0;
  const stap = () => {
    // In stukjes, zodat het scherm gewoon blijft reageren terwijl je typt.
    const tot = i + 20000;
    for (; i < tot; i++) {
      if (eersteWoord(data.zout + i.toString(16)) < grens) {
        klaar[data.id] = { id: data.id, oplossing: i.toString(16) };
        window.__mensBezig = null;
        setTriggerValue("oplossing", klaar[data.id]);
        return;
      }
    }
    setTimeout(stap, 0);
  };
  setTimeout(stap, 0);
}
"""

_puzzel = st.components.v2.component("mens_puzzel", html="<span></span>", js=JS)


def uitdaging() -> dict | None:
    """De uitdaging voor dit formulier (één per keer). None als de server geen uitdaging kan geven."""
    u = st.session_state.get("aanmeld_uitdaging")
    if not u:
        antwoord = opslag._rpc("aanmelden_uitdaging")
        if antwoord.get("fout") or not antwoord.get("id"):
            return None
        u = st.session_state.aanmeld_uitdaging = antwoord
    return u


def oplossing(u: dict) -> str | None:
    """Laat de browser de puzzel oplossen. Geeft de oplossing zodra die er is, anders None."""
    resultaat = _puzzel(key=f"mens_{u['id']}", data=u, on_oplossing_change=lambda: None)
    o = getattr(resultaat, "oplossing", None) if resultaat is not None else None
    if isinstance(o, dict) and o.get("id") == u["id"]:
        # Een seintje uit de browser telt maar één keer; daarom bewaren we de oplossing bij de uitdaging.
        u["oplossing"] = str(o.get("oplossing", ""))[:32]
    return u.get("oplossing")


def vergeten() -> None:
    """Na een poging: de volgende keer een nieuwe uitdaging (elke werkt maar één keer)."""
    st.session_state.pop("aanmeld_uitdaging", None)
