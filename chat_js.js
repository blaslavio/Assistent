// Chat met end-to-end-versleuteling. Alles wat leesbaar is, bestaat alleen hier in de browser.
//
// Elk apparaat heeft een eigen sleutelpaar om te versleutelen (ECDH P-256) en een om te ondertekenen (ECDSA P-256).
// De geheime sleutels worden in de browser gemaakt, kunnen niet worden uitgelezen (niet-exporteerbaar) en staan
// alleen in IndexedDB op dit apparaat. Per bericht: een nieuwe willekeurige sleutel (AES-256-GCM); die sleutel wordt
// voor elk apparaat van elke deelnemer apart ingepakt (ECDH met een tijdelijke sleutel + HKDF + AES-GCM). Het
// bericht wordt ondertekend door het apparaat van de afzender. De server ziet alleen versleutelde tekst.

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

// Vertalen: data.taal is {Nederlands: vertaling}. Wat er niet in staat, blijft Nederlands. {} wordt op volgorde gevuld.
let TAAL = {};
const vul = (tekst, waarden) => { let i = 0; return String(tekst).replace(/\{\}/g, (m) => (i < waarden.length ? String(waarden[i++]) : m)); };
const T = (tekst, ...waarden) => vul(Object.prototype.hasOwnProperty.call(TAAL, tekst) && typeof TAAL[tekst] === "string" && TAAL[tekst] ? TAAL[tekst] : tekst, waarden);
const NL = (tekst, ...waarden) => vul(tekst, waarden);  // zelfde vorm, maar niet vertaald (voor wat naar anderen gaat)

// --- Opslag op dit apparaat --------------------------------------------------------------------------------------

function idb() {
  if (!window.__chatDb) {
    window.__chatDb = new Promise((klaar, mis) => {
      const r = indexedDB.open("assistent-chat", 2);
      r.onupgradeneeded = () => {
        for (const naam of ["sleutels", "geverifieerd", "voorbeeld"]) {
          if (!r.result.objectStoreNames.contains(naam)) r.result.createObjectStore(naam);
        }
      };
      r.onsuccess = () => klaar(r.result);
      r.onerror = () => mis(r.error);
    });
  }
  return window.__chatDb;
}
async function idbGet(store, key) {
  const db = await idb();
  return new Promise((klaar, mis) => {
    const r = db.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => klaar(r.result); r.onerror = () => mis(r.error);
  });
}
async function idbPut(store, key, value) {
  const db = await idb();
  return new Promise((klaar, mis) => {
    const t = db.transaction(store, "readwrite");
    t.objectStore(store).put(value, key);
    t.oncomplete = () => klaar(); t.onerror = () => mis(t.error);
  });
}

// --- Cryptografie ------------------------------------------------------------------------------------------------

const ECDH = { name: "ECDH", namedCurve: "P-256" };
const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const pub = (jwk) => ({ kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y });

async function vingerafdruk(ecdh, teken) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(`${ecdh.x}.${ecdh.y}.${teken.x}.${teken.y}`)));
}

async function nieuwApparaat() {
  // false: de geheime sleutel kan nooit uit de browser worden gehaald, ook niet door de app zelf.
  const ecdh = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]);
  const teken = await crypto.subtle.generateKey(ECDSA, false, ["sign", "verify"]);
  const ecdhJwk = pub(await crypto.subtle.exportKey("jwk", ecdh.publicKey));
  const tekenJwk = pub(await crypto.subtle.exportKey("jwk", teken.publicKey));
  return { ecdh, teken, ecdhJwk, tekenJwk, vinger: await vingerafdruk(ecdhJwk, tekenJwk) };
}

async function inpakSleutel(gedeeld, iv, apparaatId, gebruik) {
  const basis = await crypto.subtle.importKey("raw", gedeeld, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: iv, info: enc.encode(`chat:${apparaatId}`) },
    basis, { name: "AES-GCM", length: 256 }, false, [gebruik]);
}

const ondertekenTekst = (gesprek, apparaat, iv, inhoud, epk) => enc.encode(`${gesprek}|${apparaat}|${iv}|${inhoud}|${epk.x}|${epk.y}`);

async function versleutel(st, gesprek, apparaten, bericht) {
  const sleutel = rnd(32);
  const iv = rnd(12);
  const aes = await crypto.subtle.importKey("raw", sleutel, "AES-GCM", false, ["encrypt"]);
  const inhoud = b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`${gesprek}|${st.apparaat}`) },
    aes, enc.encode(JSON.stringify(bericht))));
  const tijdelijk = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const epk = pub(await crypto.subtle.exportKey("jwk", tijdelijk.publicKey));
  const sleutels = {};
  for (const a of apparaten) {
    const hunPub = await crypto.subtle.importKey("jwk", a.ecdh, ECDH, false, []);
    const gedeeld = await crypto.subtle.deriveBits({ name: "ECDH", public: hunPub }, tijdelijk.privateKey, 256);
    const inpak = await inpakSleutel(gedeeld, iv, a.id, "encrypt");
    const iv2 = rnd(12);
    sleutels[a.id] = { i: b64(iv2), w: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv2 }, inpak, sleutel)) };
  }
  const ivB64 = b64(iv);
  const handtekening = b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, st.sleutels.teken.privateKey,
    ondertekenTekst(gesprek, st.apparaat, ivB64, inhoud, epk)));
  return { inhoud, iv: ivB64, epk, sleutels, handtekening };
}

const controleSleutels = new Map();
async function ontsleutel(st, gesprek, b) {
  const controle = controleSleutels.get(b.apparaat) || await crypto.subtle.importKey("jwk", b.teken, ECDSA, false, ["verify"]);
  controleSleutels.set(b.apparaat, controle);
  const echt = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, controle, unb64(b.handtekening),
    ondertekenTekst(gesprek, b.apparaat, b.iv, b.inhoud, b.epk));
  if (!echt) return { fout: "onecht" };
  if (!b.sleutel) return { fout: "geen_sleutel" };
  const iv = unb64(b.iv);
  const hunPub = await crypto.subtle.importKey("jwk", b.epk, ECDH, false, []);
  const gedeeld = await crypto.subtle.deriveBits({ name: "ECDH", public: hunPub }, st.sleutels.ecdh.privateKey, 256);
  const inpak = await inpakSleutel(gedeeld, iv, st.apparaat, "decrypt");
  const sleutel = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(b.sleutel.i) }, inpak, unb64(b.sleutel.w));
  const aes = await crypto.subtle.importKey("raw", sleutel, "AES-GCM", false, ["decrypt"]);
  const tekst = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`${gesprek}|${b.apparaat}`) },
    aes, unb64(b.inhoud));
  return { bericht: JSON.parse(dec.decode(tekst)) };
}

async function veiligheidscode(apparatenA, apparatenB) {
  const deel = async (lijst) => hex(await crypto.subtle.digest("SHA-256", enc.encode(lijst.map((a) => a.vingerafdruk).sort().join(","))));
  const [a, b] = [await deel(apparatenA), await deel(apparatenB)].sort();
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(a + b)));
  const groepen = [];
  for (let i = 0; i < 12; i++) groepen.push(String(((h[i * 2] << 8) | h[i * 2 + 1]) % 100000).padStart(5, "0"));
  return groepen.join(" ");
}

// --- Verbinding met de database ----------------------------------------------------------------------------------

async function rpc(st, functie, parameters = {}) {
  const r = await fetch(`${st.url}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: st.key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_naam: st.naam, p_wachtwoord: st.token, ...parameters }),
  });
  if (!r.ok) throw new Error(T("Verbinding mislukt ({})", r.status));
  const j = await r.json();
  if (j && j.geen_toegang) throw new Error(T("Je bent uitgelogd. Herlaad de app."));
  if (j && j.fout) throw new Error(j.fout);
  return j;
}

// Betalen via de app loopt via de betaalfunctie (die met Stripe praat), niet via de database.
async function betaalFunctie(st, actie, extra = {}) {
  const r = await fetch(`${st.url}/functions/v1/betalen`, {
    method: "POST",
    headers: { apikey: st.key, "Content-Type": "application/json" },
    body: JSON.stringify({ actie, naam: st.naam, wachtwoord: st.token, ...extra }),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* geen antwoord */ }
  if (!j) throw new Error(T("De betaaldienst is even niet bereikbaar. Probeer het later opnieuw."));
  if (j.fout) throw new Error(j.fout);
  return j;
}

// Een venster openen moet meteen bij de tik (anders blokkeert Safari het); het adres komt daarna.
async function betaalVenster(st, ids) {
  const venster = window.open("", "_blank");
  try {
    const r = await betaalFunctie(st, "boeking_afrekenen", { boekingen: ids });
    if (venster) venster.location.href = r.url; else window.location.href = r.url;
  } catch (fout) {
    if (venster) venster.close();
    throw fout;
  }
}

function annuleerRegel(regel, app) {
  if (!regel) return "";
  const r = !regel.uren || !regel.procent ? T("Gratis annuleren kan altijd.")
    : T("Gratis annuleren tot {} uur van tevoren. Daarna betaal je {}%.", regel.uren, regel.procent);
  return app ? `${T("Je betaalt vooraf via de app.")} ${r}` : r;
}

// --- Foto's verkleinen -------------------------------------------------------------------------------------------

function verkleind(bestand) {
  return new Promise((klaar) => {
    const lezer = new FileReader();
    lezer.onload = () => {
      const beeld = new Image();
      beeld.onload = () => {
        const schaal = Math.min(1, 1280 / Math.max(beeld.width, beeld.height));
        const doek = document.createElement("canvas");
        doek.width = Math.round(beeld.width * schaal); doek.height = Math.round(beeld.height * schaal);
        doek.getContext("2d").drawImage(beeld, 0, 0, doek.width, doek.height);
        klaar(doek.toDataURL("image/jpeg", 0.8));
      };
      beeld.onerror = () => klaar(null);
      beeld.src = lezer.result;
    };
    lezer.readAsDataURL(bestand);
  });
}

// --- Weergave ----------------------------------------------------------------------------------------------------

const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const tijd = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const dag = (iso) => {
  const d = new Date(iso); const nu = new Date();
  if (d.toDateString() === nu.toDateString()) return T("Vandaag");
  const gisteren = new Date(nu); gisteren.setDate(nu.getDate() - 1);
  if (d.toDateString() === gisteren.toDateString()) return T("Gisteren");
  return `${T(DAGEN[d.getDay()])} ${d.getDate()} ${T(MAANDEN[d.getMonth()])}`;
};
const kortTijd = (iso) => { if (!iso) return ""; const d = dag(iso); return d === T("Vandaag") ? tijd(iso) : d; };
const wanneer = (lokaal) => { const d = new Date(lokaal); return `${dag(d)} ${tijd(d)}`; };
// --- Afspraken herkennen in gewone berichten ("vrijdag 14:00 kapper") ------------------------------------
const DAGNAMEN = [["zondag", "sunday"], ["maandag", "monday"], ["dinsdag", "tuesday"], ["woensdag", "wednesday"],
  ["donderdag", "thursday"], ["vrijdag", "friday"], ["zaterdag", "saturday"]];
const MAANDNAMEN = ["jan", "feb", "m(?:aa)?r", "apr", "mei|may", "jun", "jul", "aug", "sep", "o[ck]t", "nov", "dec"];
function datumHerkennen(tekst, nu = new Date()) {
  const t = " " + String(tekst || "").toLowerCase() + " ";
  const klok = t.match(/(?:om|at|um|à)?\s*\b([01]?\d|2[0-3])(?:[:.]([0-5]\d)\b|\s?(?:u|uur|h)\b)/);
  if (!klok) return null;
  let dag = null, stuk = [];
  const rel = t.match(/\b(vandaag|today|overmorgen|morgen|tomorrow)\b/);
  if (rel) { dag = new Date(nu); dag.setDate(dag.getDate() + (rel[1] === "overmorgen" ? 2 : rel[1].startsWith("morgen") || rel[1] === "tomorrow" ? 1 : 0)); stuk.push(rel[0]); }
  const datum = t.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/) || null;
  const metMaand = t.match(new RegExp("\\b(\\d{1,2})\\s+(" + MAANDNAMEN.join("|") + ")[a-z]*\\.?(?:\\s+(\\d{4}))?\\b"));
  if (!dag && (metMaand || datum)) {
    const d = Number((metMaand || datum)[1]);
    const m = metMaand ? MAANDNAMEN.findIndex((x) => new RegExp("^(" + x + ")").test(metMaand[2])) : Number(datum[2]) - 1;
    let j = Number((metMaand || datum)[3]) || nu.getFullYear(); if (j < 100) j += 2000;
    if (m >= 0 && m < 12 && d >= 1 && d <= 31) {
      dag = new Date(j, m, d);
      if (!(metMaand || datum)[3] && dag < new Date(nu.getFullYear(), nu.getMonth(), nu.getDate())) dag.setFullYear(j + 1);
      stuk.push((metMaand || datum)[0]);
    }
  }
  if (!dag) {
    const i = DAGNAMEN.findIndex((namen) => namen.some((n) => new RegExp("\\b" + n + "\\b").test(t)));
    if (i >= 0) { dag = new Date(nu); dag.setDate(dag.getDate() + ((i - nu.getDay() + 7) % 7 || 7)); stuk.push(DAGNAMEN[i].find((n) => t.includes(n))); }
  }
  if (!dag) return null;  // alleen een tijd is te vaag
  dag.setHours(Number(klok[1]), Number(klok[2] || 0), 0, 0);
  if (dag < nu) return null;
  stuk.push(klok[0]);
  let titel = String(tekst);
  for (const x of stuk) titel = titel.replace(new RegExp(x.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  titel = titel.replace(/\b(op|om|at|on|de|het)\b\s*(?=[,.!?]|$)/gi, "").replace(/\s+/g, " ").replace(/^[\s,.:;!-]+|[\s,.:;!?-]+$/g, "");
  titel = (titel.split(/\s*[,.!?;]\s+|\s*[!?]$/).find((x) => x.trim()) || "").trim();  // alleen het eerste stukje zin
  titel = titel.length > 60 ? titel.slice(0, 57) + "..." : titel;
  return { start: lokaal(dag), titel: titel ? titel[0].toUpperCase() + titel.slice(1) : T("Afspraak") };
}

// --- Betaalverzoeken: de app verstuurt zelf geen geld; je betaalt met je eigen bank of betaallink -----------
const bedragTekst = (centen) => new Intl.NumberFormat(navigator.language || "nl-NL", { style: "currency", currency: "EUR" }).format(centen / 100);
function ibanGoed(iban) {
  const s = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const omgezet = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0; for (const c of omgezet) rest = (rest * 10 + Number(c)) % 97;
  return rest === 1;
}
const ibanMooi = (iban) => String(iban || "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
function veiligeLink(link) {
  try { const u = new URL(String(link || "").trim()); return u.protocol === "https:" ? u : null; } catch (e) { return null; }
}
const duurTekst = (m) => (m >= 60 && m % 60 === 0 ? T("{} uur", m / 60) : T("{} min", m));
const dienstTekst = (d) => [d.naam, duurTekst(d.minuten), d.prijs > 0 ? bedragTekst(d.prijs) : ""].filter(Boolean).join(" · ");
const HERHAAL = { "": "Eenmalig", week: "Elke week", twee_weken: "Elke 2 weken" };
const bewaard = (k) => { try { return localStorage.getItem("c-" + k) || ""; } catch (e) { return ""; } };
const bewaren = (k, w) => { try { localStorage.setItem("c-" + k, w); } catch (e) { /* privé venster */ } };

const VERDWIJNEN = { 0: "Uit", 3600: "1 uur", 86400: "24 uur", 604800: "7 dagen", 7776000: "90 dagen" };

const ICOON = {
  terug: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  nieuw: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
  slot: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  stuur: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  chats: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5z"/></svg>',
  mensen: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6"/></svg>',
  groep: '<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 19a6 6 0 0112 0M10 19a6 6 0 0112 0"/></svg>',
  agenda: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  kanaal: '<svg viewBox="0 0 24 24"><path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/></svg>',
  vast: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 4H6l4-4-1-6zM12 14v7"/></svg>',
  antwoord: '<svg viewBox="0 0 24 24"><path d="M10 8L5 12l5 4M5 12h9a5 5 0 015 5v1"/></svg>',
  kopie: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
  weg: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  delen: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg>',
  geld: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/></svg>',
};
const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const SKIP = new Set(["reactie", "emoji", "stem", "betaald"]);
const KLEUREN = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
function avatar(naam, groot = false) {
  let h = 0; for (const c of String(naam || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="c-avatar${groot ? " c-groot" : ""}" style="background:${KLEUREN[h % KLEUREN.length]}">${esc(String(naam || "?").trim().slice(0, 1).toUpperCase())}</span>`;
}
const communityAvatar = (naam, groot = false) => avatar(naam, groot).replace('class="c-avatar', 'class="c-avatar c-vierkant');
const communityOngelezen = (c) => (c.kanalen || []).reduce((n, k) => n + (k.ongelezen || 0), 0);
const leden = (n) => (n === 1 ? T("1 lid") : T("{} leden", n));
const codeTekst = (code) => String(code || "").match(/.{1,4}/g)?.join("-") || "";

function gesprekNaam(st, g) {
  if (g.community) return "# " + g.naam;
  if (g.soort === "groep") return g.naam;
  const ander = g.leden.find((l) => l.id !== st.ik);
  return ander ? ander.naam : T("Gesprek");
}

function voorbeeldTekst(st, g, m, afzender) {
  if (!m) return "";
  const lid = g.leden.find((l) => l.id === afzender);
  const wie = afzender === st.ik ? T("Jij") + ": " : (g.soort === "groep" && lid ? `${lid.naam}: ` : (m.t === "reactie" && lid ? `${lid.naam} ` : ""));
  if (m.t === "tekst") return wie + m.tekst.slice(0, 80);
  if (m.t === "foto") return wie + T("Foto");
  if (m.t === "afspraak") return wie + T("Afspraak: {}", m.titel);
  if (m.t === "peiling") return wie + T("Peiling: {}", m.vraag);
  if (m.t === "emoji") return m.emoji ? wie.replace(/: $/, " ") + T("reageerde {}", m.emoji) : "";
  if (m.t === "stem") return wie.replace(/: $/, " ") + T("stemde");
  if (m.t === "vrij") return wie + T("Wanneer ik kan");
  if (m.t === "betaal") return wie + T("Betaalverzoek: {}", bedragTekst(m.bedrag));
  if (m.t === "betaald") return wie.replace(/: $/, " ") + T("heeft betaald");
  if (m.t === "diensten") return wie + T("Diensten: {}", m.titel || (m.soorten || []).map((d) => d.naam).join(", "));
  if (m.t === "boeking") return wie + T("Boeking: {}", m.soort);
  if (m.t === "reactie") return wie.replace(/: $/, " ") + (m.antwoord === "ja" ? T("zet de afspraak in de agenda") : T("kan niet op die afspraak"));
  return "";
}

function kop(links, midden, rechts = "") {
  return `<div class="c-balk">${links}<div class="c-balk-midden">${midden}</div>${rechts}</div>`;
}
const terugKnop = (a) => `<button class="c-ikoon" data-a="${a}" aria-label="${esc(T("Terug"))}">${ICOON.terug}</button>`;

function tabs(st) {
  const verzoeken = st.gesprekken.filter((g) => g.status === "verzoek").length;
  const ongelezen = st.gesprekken.reduce((n, g) => n + (g.ongelezen || 0), 0) + verzoeken
    + (st.communities || []).reduce((n, c) => n + communityOngelezen(c) + (c.status === "uitgenodigd" ? 1 : 0), 0);
  return `<div class="c-tabs">
    <button class="c-tab ${st.scherm === "lijst" ? "c-aan" : ""}" data-a="lijst">${ICOON.chats}<span>${T("Chats")}${ongelezen ? ` (${ongelezen})` : ""}</span></button>
    <button class="c-tab ${st.scherm === "contacten" ? "c-aan" : ""}" data-a="contacten">${ICOON.mensen}<span>${T("Contacten")}</span></button></div>`;
}

function toon(st) {
  const w = st.wortel;
  if (st.fout) {
    w.innerHTML = `<div class="c-inhoud c-midden"><div class="c-fout">${esc(st.fout)}</div>
      <button class="c-knop" data-a="opnieuw">${T("Opnieuw proberen")}</button></div>`;
    return;
  }
  if (!st.klaar) { w.innerHTML = `<div class="c-inhoud c-midden"><div class="c-leeg">${ICOON.slot}<br>${T("Chat beveiligen...")}</div></div>`; return; }
  if (st.scherm === "gesprek") return toonGesprek(st);
  if (st.scherm === "contacten") return toonContacten(st);
  if (st.scherm === "groep") return toonGroep(st);
  if (st.scherm === "info") return toonInfo(st);
  if (st.scherm === "apparaten") return toonApparaten(st);
  if (st.scherm === "community") return toonCommunity(st);
  if (st.scherm === "cinfo") return toonCommunityInfo(st);
  if (st.scherm === "cnieuw") return toonCommunityNieuw(st);
  toonLijst(st);
}

function itemHtml(st, g) {
  const naam = gesprekNaam(st, g);
  const v = st.voorbeelden.get(g.id);
  const onder = g.status === "verzoek" ? `<span class="c-accent">${T("Wil met je chatten")}</span>`
    : esc(v && v.id === g.laatste_id ? v.tekst : (g.laatste_id ? T("Versleuteld bericht") : (g.soort === "groep" ? T("{} deelnemers", g.leden.length) : T("Nog geen berichten"))));
  return `<button class="c-item" data-a="open" data-id="${g.id}" data-naam="${esc(naam.toLowerCase())}"
      data-soort="${g.soort === "groep" ? "groep" : "prive"}" data-ongelezen="${g.ongelezen || g.status === "verzoek" ? 1 : 0}">
      ${g.soort === "groep" ? `<span class="c-avatar c-groep">${ICOON.groep}</span>` : avatar(naam)}
      <span class="c-item-tekst"><b>${esc(naam)}</b><small>${onder}</small></span>
      <span class="c-item-rechts"><small class="${g.ongelezen ? "c-accent" : ""}">${esc(kortTijd(g.laatst))}</small>
        ${g.ongelezen ? `<span class="c-badge">${g.ongelezen}</span>` : (g.stil ? `<small>${T("stil")}</small>` : "<span></span>")}</span>
    </button>`;
}

function communityItemHtml(st, c) {
  const ongelezen = communityOngelezen(c);
  const onder = c.status === "uitgenodigd" ? `<span class="c-accent">${esc(c.door ? T("Uitnodiging van {}", c.door) : T("Uitnodiging"))}</span>`
    : `${c.kanalen.length === 1 ? T("1 kanaal") : T("{} kanalen", c.kanalen.length)} · ${leden(c.leden)}`;
  const laatst = c.kanalen.reduce((m, k) => (k.laatst > m ? k.laatst : m), "");
  return `<button class="c-item" data-a="community" data-id="${c.id}" data-naam="${esc(c.naam.toLowerCase())}"
      data-soort="community" data-ongelezen="${ongelezen || c.status === "uitgenodigd" ? 1 : 0}">${communityAvatar(c.naam)}
      <span class="c-item-tekst"><b>${esc(c.naam)}</b><small>${onder}</small></span>
      <span class="c-item-rechts"><small class="${ongelezen ? "c-accent" : ""}">${esc(kortTijd(laatst))}</small>
        ${ongelezen ? `<span class="c-badge">${ongelezen}</span>` : "<span></span>"}</span></button>`;
}

function nieuwBlad() {
  return `<div class="c-achtergrond" data-a="blad-dicht"></div><div class="c-blad">
    <button class="c-blad-knop" data-a="contacten">${ICOON.chats}${T("Nieuw gesprek")}</button>
    <button class="c-blad-knop" data-a="groep-nieuw">${ICOON.groep}${T("Nieuwe groep")}</button>
    <button class="c-blad-knop" data-a="cnieuw">${ICOON.kanaal}${T("Community maken of meedoen")}</button></div>`;
}

function toonLijst(st) {
  const communities = st.communities || [];
  const verzoeken = [...st.gesprekken.filter((g) => g.status === "verzoek").map((g) => itemHtml(st, g)),
                     ...communities.filter((c) => c.status === "uitgenodigd").map((c) => communityItemHtml(st, c))];
  const laatstC = (c) => c.kanalen.reduce((m, k) => (k.laatst > m ? k.laatst : m), "");
  const rest = [...st.gesprekken.filter((g) => g.status !== "verzoek").map((g) => [g.laatst || "", itemHtml(st, g)]),
                ...communities.filter((c) => c.status === "lid").map((c) => [laatstC(c), communityItemHtml(st, c)])]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)).map((x) => x[1]);
  const filter = st.lijstFilter || "alles";
  const pil = (f, tekst) => `<button class="c-pil ${filter === f ? "c-pil-aan" : ""}" data-a="lijstfilter" data-f="${f}">${tekst}</button>`;
  const actief = st.wortel.getRootNode().activeElement;
  const zocht = actief && actief.id === "c-lijst-zoek" ? actief.selectionStart : null;
  st.wortel.innerHTML = `
    <div class="c-lijst-kop">
      <div class="c-rij-kop"><b class="c-groot-titel">${T("Chats")}</b>
        <button class="c-ikoon" data-a="apparaten" aria-label="${esc(T("Beveiliging"))}">${ICOON.slot}</button></div>
      <input id="c-lijst-zoek" class="c-lijst-zoek" type="search" placeholder="${esc(T("Zoeken"))}" value="${esc(st.lijstZoek || "")}"
        autocomplete="off" enterkeyhint="search">
      <div class="c-pillen">${pil("alles", T("Alles"))}${pil("ongelezen", T("Ongelezen"))}${pil("groep", T("Groepen"))}${pil("community", T("Communities"))}</div>
    </div>
    <div class="c-inhoud c-lijst">
      ${verzoeken.length ? `<div class="c-sectie">${T("Verzoeken en uitnodigingen")}</div>${verzoeken.join("")}
        <div class="c-sectie">${T("Gesprekken")}</div>` : ""}
      ${rest.join("") || (verzoeken.length ? "" : `<div class="c-leeg">${T("Nog geen gesprekken.")}<br>
        <button class="c-knop c-hoofd" data-a="blad">${T("Begin een gesprek")}</button></div>`)}
      <div class="c-leeg c-niets" hidden>${T("Niets gevonden.")}</div>
      <div class="c-voet">${ICOON.slot} ${T("Berichten zijn end-to-end versleuteld")}</div>
    </div>
    <button class="c-fab" data-a="blad" aria-label="${esc(T("Nieuw gesprek"))}">${ICOON.nieuw}</button>
    ${tabs(st)}
    ${st.blad === "nieuw" ? nieuwBlad() : ""}`;
  lijstFilteren(st);
  if (zocht !== null) {
    const veld = st.wortel.querySelector("#c-lijst-zoek");
    veld.focus(); veld.setSelectionRange(zocht, zocht);
  }
}

function lijstFilteren(st) {
  // Zoeken en filteren zonder opnieuw te tekenen, zodat het toetsenbord open blijft.
  const zoek = (st.lijstZoek || "").trim().toLowerCase();
  const filter = st.lijstFilter || "alles";
  let zichtbaar = 0;
  for (const el of st.wortel.querySelectorAll(".c-lijst .c-item")) {
    const past = (!zoek || el.dataset.naam.includes(zoek))
      && (filter === "alles" || (filter === "ongelezen" ? el.dataset.ongelezen === "1" : el.dataset.soort === filter));
    el.hidden = !past;
    zichtbaar += past ? 1 : 0;
  }
  const items = st.wortel.querySelectorAll(".c-lijst .c-item").length;
  const niets = st.wortel.querySelector(".c-niets");
  if (niets) niets.hidden = !(items && !zichtbaar);
  for (const sectie of st.wortel.querySelectorAll(".c-lijst .c-sectie")) sectie.hidden = !!(zoek || filter !== "alles");
}

function toonCommunity(st) {
  const c = (st.communities || []).find((x) => x.id === st.communityId);
  if (!c) { st.scherm = "lijst"; return toonLijst(st); }
  const beheer = c.rol === "eigenaar" || c.rol === "beheerder";
  st.wortel.innerHTML = `
    ${kop(terugKnop("lijst"), `<button class="c-titel" data-a="cinfo">${communityAvatar(c.naam).replace("c-avatar", "c-avatar c-klein")}
      <span><b>${esc(c.naam)}</b><small>${leden(c.leden)}</small></span></button>`)}
    <div class="c-inhoud">
      ${c.omschrijving ? `<div class="c-uitleg" style="padding-top:12px">${esc(c.omschrijving)}</div>` : ""}
      ${c.status === "uitgenodigd" ? `<div class="c-verzoek"><div>${c.door ? T("{} nodigt je uit voor {}.", `<b>${esc(c.door)}</b>`, `<b>${esc(c.naam)}</b>`)
        : T("Je bent uitgenodigd voor {}.", `<b>${esc(c.naam)}</b>`)}</div>
        <div class="c-rij"><button class="c-knop c-hoofd" data-a="c-ja">${T("Meedoen")}</button><button class="c-knop" data-a="c-nee">${T("Weigeren")}</button></div></div>`
      : `<div class="c-sectie">${T("Kanalen")}</div>${c.kanalen.map((k) => `<button class="c-item" data-a="open" data-id="${k.id}">
          <span class="c-hekje">#</span><span class="c-item-tekst"><b>${esc(k.naam)}</b>
          <small>${k.alleen_beheer ? T("Mededelingen van beheerders") : "&nbsp;"}</small></span>
          <span class="c-item-rechts"><small class="${k.ongelezen ? "c-accent" : ""}">${esc(kortTijd(k.laatst))}</small>
          ${k.ongelezen ? `<span class="c-badge">${k.ongelezen}</span>` : "<span></span>"}</span></button>`).join("")}
        <div class="c-vulling"><button class="c-knop" data-a="cinfo">${beheer ? T("Uitnodigen en beheren") : T("Mensen uitnodigen")}</button></div>`}
    </div>`;
}

async function cinfoLaden(st) {
  st.cinfo = await rpc(st, "chat_community", { p_community: st.communityId });
}

function toonCommunityInfo(st) {
  const c = st.cinfo;
  if (!c) { st.wortel.innerHTML = `${kop(terugKnop("cterug"), `<b>${T("Community")}</b>`)}<div class="c-inhoud"></div>`; return; }
  const beheer = c.rol === "eigenaar" || c.rol === "beheerder";
  const rolNaam = { eigenaar: T("eigenaar"), beheerder: T("beheerder"), lid: "" };
  const keuzes = (d) => {
    if (!beheer || d.id === st.ik || d.rol === "eigenaar" || (d.rol === "beheerder" && c.rol !== "eigenaar")) return "";
    const opties = [["", "..."], d.rol === "beheerder" ? ["lid", T("Gewoon lid maken")] : ["beheerder", T("Beheerder maken")],
      ...(c.rol === "eigenaar" && d.status === "lid" ? [["eigenaar", T("Eigenaar maken")]] : []),
      ["verwijderen", T("Verwijderen")], ["weren", T("Weren")]];
    return `<select class="c-rol" data-wie="${d.id}" data-naam="${esc(d.naam)}" aria-label="${esc(T("Beheren"))}">${opties.map(([w, t]) => `<option value="${w}">${t}</option>`).join("")}</select>`;
  };
  st.wortel.innerHTML = `
    ${kop(terugKnop("cterug"), `<b>${T("Community")}</b>`)}
    <div class="c-inhoud c-vulling">
      <div class="c-profiel">${communityAvatar(c.naam, true)}<b>${esc(c.naam)}</b>
        ${c.omschrijving ? `<small>${esc(c.omschrijving)}</small>` : ""}<small>${leden(c.leden)}</small></div>
      <div class="c-sectie">${T("Uitnodigen")}</div>
      <div class="c-zoek"><input class="c-veld" id="c-c-wie" placeholder="${esc(T("Gebruikersnaam"))}" autocapitalize="none" autocomplete="off">
        <button class="c-knop c-hoofd" data-a="c-uitnodigen">${T("Uitnodigen")}</button></div>
      ${c.code ? `<div class="c-kaart"><b>${T("Uitnodigingscode")}</b>
        ${c.code_aan ? `<div class="c-code-groot">${esc(codeTekst(c.code))}</div>
        <small>${T("Wie deze code heeft, kan meedoen. Deel hem alleen met wie je erbij wilt.")}</small>
        <div class="c-rij c-wrap"><button class="c-knop" data-a="c-delen">${T("Delen")}</button><button class="c-knop" data-a="c-nieuwe-code">${T("Nieuwe code")}</button></div>`
        : `<small>${T("Meedoen met een code staat uit. Alleen wie je uitnodigt, kan erbij.")}</small>`}
        <label class="c-vink"><span>${T("Meedoen met code")}</span><input type="checkbox" id="c-code-aan" ${c.code_aan ? "checked" : ""}></label></div>` : ""}
      ${beheer ? `<div class="c-sectie">${T("Kanalen")}</div>
        ${c.kanalen.map((k) => `<div class="c-lid"><span># ${esc(k.naam)}${k.alleen_beheer ? ` <small>${T("alleen beheerders schrijven")}</small>` : ""}</span>
          <button class="c-mini" data-a="kanaal-weg" data-id="${k.id}" data-naam="${esc(k.naam)}" aria-label="${esc(T("Weghalen"))}">×</button></div>`).join("")}
        <div class="c-zoek"><input class="c-veld" id="c-k-naam" placeholder="${esc(T("Nieuw kanaal"))}" autocapitalize="none" autocomplete="off">
          <button class="c-knop" data-a="kanaal-maken">${T("Maken")}</button></div>
        <label class="c-vink"><span>${T("Alleen beheerders schrijven in het nieuwe kanaal")}</span><input type="checkbox" id="c-k-alleen"></label>
        <div class="c-sectie">${T("Naam en omschrijving")}</div>
        <input class="c-veld" id="c-c-naam" value="${esc(c.naam)}" maxlength="60">
        <input class="c-veld" id="c-c-omschr" value="${esc(c.omschrijving)}" placeholder="${esc(T("Omschrijving"))}" maxlength="300">
        <button class="c-knop" data-a="c-opslaan">${T("Opslaan")}</button>` : ""}
      <div class="c-sectie">${T("Deelnemers")}</div>
      ${(c.deelnemers || []).map((d) => `<div class="c-lid">${avatar(d.naam)}<span>${esc(d.naam)}${d.id === st.ik ? ` (${T("jij")})` : ""}
          <br><small>${d.status === "uitgenodigd" ? T("uitgenodigd") : rolNaam[d.rol]}</small></span>${keuzes(d)}</div>`).join("")}
      <div class="c-rij c-wrap">${c.rol === "eigenaar" ? `<button class="c-knop c-rood" data-a="c-opheffen">${T("Community opheffen")}</button>`
        : `<button class="c-knop c-rood" data-a="c-verlaten">${T("Community verlaten")}</button>`}</div>
    </div>`;
  const codeAan = st.wortel.querySelector("#c-code-aan");
  if (codeAan) codeAan.addEventListener("change", (e) => actie(st, "c-code-aan", e.target));
  for (const s of st.wortel.querySelectorAll(".c-rol")) s.addEventListener("change", (e) => actie(st, "c-rol", e.target));
}

function toonCommunityNieuw(st) {
  st.wortel.innerHTML = `
    ${kop(terugKnop("lijst"), `<b>${T("Community")}</b>`)}
    <div class="c-inhoud c-vulling">
      <div class="c-uitleg" style="padding:0">${T("Een community is een plek met kanalen voor een club, team, klas of buurt. Ook hier is alles end-to-end versleuteld.")}</div>
      <label>${T("Naam")}<input class="c-veld" id="c-n-naam" placeholder="${esc(T("Bijvoorbeeld: Voetbalclub"))}" maxlength="60"></label>
      <label>${T("Omschrijving (optioneel)")}<input class="c-veld" id="c-n-omschr" maxlength="300"></label>
      <button class="c-knop c-hoofd" data-a="c-maken">${T("Community maken")}</button>
      <div class="c-sectie">${T("Heb je een code?")}</div>
      <div class="c-zoek"><input class="c-veld" id="c-n-code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off">
        <button class="c-knop" data-a="c-meedoen">${T("Meedoen")}</button></div>
    </div>`;
}

function toonContacten(st) {
  const lijst = st.contacten || [];
  st.wortel.innerHTML = `
    ${kop("", `<b class='c-groot-titel'>${T("Contacten")}</b>`,
      `<button class="c-ikoon" data-a="groep-nieuw" aria-label="${esc(T("Nieuwe groep"))}">${ICOON.groep}</button>`)}
    <div class="c-inhoud">
      <div class="c-zoek"><input class="c-veld" id="c-nieuw-contact" type="search" placeholder="${esc(T("Naam, gebruikersnaam of telefoonnummer"))}" autocapitalize="none" autocomplete="off">
        <button class="c-knop c-hoofd" data-a="contact-toevoegen">${T("Toevoegen")}</button></div>
      <div id="c-suggesties" class="c-suggesties"></div>
      <div class="c-uitleg">${T("Met je contacten app je direct. Iemand die jou niet als contact heeft, stuurt eerst een verzoek.")}</div>
      ${lijst.length ? lijst.map((c) => `
        <div class="c-item c-contact">
          <button class="c-item-knop" data-a="chat-met" data-naam="${esc(c.gebruikersnaam || "")}" ${c.chat ? "" : "disabled"}>
            ${avatar(c.naam)}<span class="c-item-tekst"><b>${esc(c.naam)}</b>
            <small>${c.chat ? "@" + esc(c.gebruikersnaam || "") : T("Gebruikt de chat nog niet")}</small></span></button>
          <button class="c-mini" data-a="contact-weg" data-id="${c.id}" data-naam="${esc(c.naam)}" aria-label="${esc(T("Weghalen"))}">×</button>
        </div>`).join("") : `<div class="c-leeg">${T("Nog geen contacten. Vul hierboven een gebruikersnaam in.")}</div>`}
    </div>
    ${tabs(st)}`;
  const veld = st.wortel.querySelector("#c-nieuw-contact");
  veld.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); actie(st, "contact-toevoegen"); } });
  veld.addEventListener("input", () => contactSuggesties(st, veld.value));
}

// Suggesties terwijl je typt: je contacten en mensen uit je groepen. Alleen wie je al kent; een nummer zoekt de server.
function contactSuggesties(st, tekst) {
  const vak = st.wortel.querySelector("#c-suggesties");
  if (!vak) return;
  const q = tekst.trim().toLowerCase().replace(/^@/, "");
  const cijfers = q.replace(/[^0-9]/g, "");
  if (!q) { vak.innerHTML = ""; return; }
  const bekend = new Map();
  for (const c of st.contacten || []) if (c.gebruikersnaam) bekend.set(c.gebruikersnaam, { naam: c.naam, wie: c.gebruikersnaam, contact: true, chat: c.chat });
  for (const g of st.gesprekken || []) for (const l of g.leden || []) {
    if (l.id !== st.ik && l.gebruikersnaam && !bekend.has(l.gebruikersnaam)) bekend.set(l.gebruikersnaam, { naam: l.naam, wie: l.gebruikersnaam, contact: false });
  }
  const gevonden = [...bekend.values()].filter((p) => p.wie.includes(q) || (p.naam || "").toLowerCase().includes(q)).slice(0, 6);
  const regels = gevonden.map((p) => `<button class="c-suggestie" data-a="${p.contact ? "chat-met" : "contact-suggestie"}" data-naam="${esc(p.wie)}" ${p.contact && !p.chat ? "disabled" : ""}>
      ${avatar(p.naam)}<span><b>${esc(p.naam)}</b><small>@${esc(p.wie)} · ${p.contact ? T("in je contacten") : T("uit je groepen")}</small></span></button>`);
  if (/^[+0-9][0-9 ()-]{6,}$/.test(q) && cijfers.length >= 8) {
    regels.push(`<button class="c-suggestie" data-a="contact-toevoegen"><span class="c-suggestie-i">📞</span><span><b>${esc(tekst.trim())}</b><small>${T("Zoeken op telefoonnummer")}</small></span></button>`);
  }
  vak.innerHTML = regels.join("");
}

function toonGroep(st) {
  const lijst = (st.contacten || []).filter((c) => c.chat);
  st.wortel.innerHTML = `
    ${kop(terugKnop("contacten"), `<b>${T("Nieuwe groep")}</b>`)}
    <div class="c-inhoud c-vulling">
      <label>${T("Naam van de groep")}<input class="c-veld" id="c-groep" placeholder="${esc(T("Bijvoorbeeld: Familie"))}"></label>
      <div class="c-sectie">${T("Wie doet er mee?")}</div>
      ${lijst.map((c) => `<label class="c-vink">${avatar(c.naam)}<span>${esc(c.naam)}</span>
        <input type="checkbox" class="c-groep-lid" value="${esc(c.gebruikersnaam || "")}"></label>`).join("")
        || `<div class="c-leeg">${T("Voeg eerst contacten toe.")}</div>`}
      <button class="c-knop c-hoofd c-breed" data-a="groep">${T("Groep maken")}</button>
    </div>`;
}

function tekstHtml(g, tekst) {
  let html = esc(tekst).replace(/\n/g, "<br>");
  const namen = g.leden.map((l) => l.gebruikersnaam).filter(Boolean);
  if (namen.length && html.includes("@")) {
    html = html.replace(/@([a-z0-9._-]+)/gi, (heel, naam) => (namen.includes(naam.toLowerCase()) ? `<span class="c-vermeld">${heel}</span>` : heel));
  }
  return html;
}

function korteInhoud(m, vertaal = T) {
  if (!m) return "";
  if (m.t === "tekst") return m.tekst.slice(0, 100);
  if (m.t === "foto") return vertaal("Foto");
  if (m.t === "afspraak") return vertaal("Afspraak: {}", m.titel);
  if (m.t === "peiling") return vertaal("Peiling: {}", m.vraag);
  if (m.t === "vrij") return vertaal("Wanneer ik kan");
  if (m.t === "betaal") return vertaal("Betaalverzoek: {}", bedragTekst(m.bedrag));
  if (m.t === "diensten") return vertaal("Diensten: {}", m.titel || (m.soorten || []).map((d) => d.naam).join(", "));
  if (m.t === "boeking") return vertaal("Boeking: {}", m.soort);
  return "";
}

function emojiHtml(st, b) {
  const per = st.emoji.get(b.id);
  if (!per || !per.size) return "";
  const tel = new Map();
  for (const e of per.values()) tel.set(e, (tel.get(e) || 0) + 1);
  const mijn = per.get(st.ik);
  return `<div class="c-emojis">${[...tel].map(([e, n]) => `<button class="c-emoji ${mijn === e ? "c-aan" : ""}" data-a="emoji"
    data-b="${b.id}" data-e="${esc(e)}">${esc(e)}${n > 1 ? " " + n : ""}</button>`).join("")}</div>`;
}

function berichtHtml(st, g, b, vorige) {
  const mijn = b.afzender === st.ik;
  const afzender = g.leden.find((l) => l.id === b.afzender);
  const naam = g.soort === "groep" && !mijn && (!vorige || vorige.afzender !== b.afzender)
    ? `<div class="c-naam">${esc(afzender ? afzender.naam : T("Oud lid"))}</div>` : "";
  let inhoud;
  let kaart = false;
  if (b.weg) inhoud = `<i class="c-grijs">${T("Dit bericht is verwijderd.")}</i>`;
  else if (b.fout) inhoud = `<i class="c-waarschuwing">${T("Dit bericht kon niet worden gecontroleerd en wordt niet getoond.")}</i>`;
  else if (!b.bericht) inhoud = `<i class="c-grijs">...</i>`;
  else {
    const m = b.bericht;
    const citaat = m.antwoord ? `<button class="c-citaat" data-a="naar" data-b="${Number(m.antwoord.id) || 0}">
      <b>${esc(m.antwoord.naam)}</b><span>${esc(m.antwoord.tekst)}</span></button>` : "";
    if (m.t === "tekst") {
      inhoud = citaat + tekstHtml(g, m.tekst);
      const gevonden = datumHerkennen(m.tekst);
      if (gevonden) inhoud += `<button class="c-chip" data-a="tekst-agenda" data-b="${b.id}">${ICOON.agenda}<span>${esc(T("In agenda"))} · ${esc(wanneer(gevonden.start))}</span></button>`;
    }
    else if (m.t === "foto") inhoud = `<img src="${esc(m.data)}" alt="${esc(T("Foto"))}">${m.tekst ? `<div>${esc(m.tekst)}</div>` : ""}`;
    else if (m.t === "afspraak") {
      kaart = true;
      const reacties = st.reacties.get(m.id) || [];
      const ikKoos = reacties.find((r) => r.id === st.ik);
      const ja = reacties.filter((r) => r.antwoord === "ja"), nee = reacties.filter((r) => r.antwoord !== "ja");
      const wie = reacties.length > 4 ? `${T("{} komen", ja.length)}${nee.length ? ` · ${T("{} kunnen niet", nee.length)}` : ""}`
        : reacties.map((r) => `${esc(r.naam)}: ${r.antwoord === "ja" ? T("kan") : T("kan niet")}`).join(", ");
      inhoud = `<div class="c-kaart"><div class="c-kaart-kop">${ICOON.agenda}<span>${g.community ? T("Evenement") : T("Afspraak voorgesteld")}</span></div>
        <b>${esc(m.titel)}</b><div>${esc(wanneer(m.start))}${m.plaats ? ` · ${esc(m.plaats)}` : ""}</div>
        ${reacties.length ? `<small>${wie}</small>` : ""}
        ${ikKoos && !mijn ? "" : `<div class="c-rij"><button class="c-knop c-hoofd" data-a="agenda" data-b="${b.id}">${T("In mijn agenda")}</button>
        ${mijn ? "" : `<button class="c-knop" data-a="kanniet" data-b="${b.id}">${T("Kan niet")}</button>`}</div>`}</div>`;
    } else if (m.t === "peiling") {
      kaart = true;
      const stemmen = st.stemmen.get(m.id) || new Map();
      const totaal = stemmen.size;
      const mijnKeuze = stemmen.get(st.ik);
      const tel = (k) => [...stemmen.values()].filter((x) => x === k).length;
      inhoud = `<div class="c-kaart"><div class="c-kaart-kop"><span>${T("Peiling")}</span></div><b>${esc(m.vraag)}</b>
        ${(m.opties || []).map((o, k) => { const n = tel(k); const pct = totaal ? Math.round((n / totaal) * 100) : 0;
          return `<button class="c-optie ${mijnKeuze === k ? "c-aan" : ""}" data-a="stem" data-b="${b.id}" data-k="${k}">
            <i style="width:${mijnKeuze === undefined ? 0 : pct}%"></i><span>${esc(o)}</span><small>${mijnKeuze === undefined ? "" : n}</small></button>`; }).join("")}
        <small>${totaal === 1 ? T("1 stem") : T("{} stemmen", totaal)}${mijnKeuze === undefined ? ` · ${T("tik om te stemmen")}` : ""}</small></div>`;
    } else if (m.t === "vrij") {
      kaart = true;
      inhoud = `<div class="c-kaart"><div class="c-kaart-kop">${ICOON.agenda}<span>${mijn ? T("Wanneer ik kan") : T("Wanneer {} kan", esc(afzender ? afzender.naam : ""))}</span></div>
        <div class="c-rij c-wrap">${m.momenten.map((x) => `<button class="c-pil" data-a="kies" data-m="${esc(x)}">${esc(wanneer(x))}</button>`).join("")}</div></div>`;
    } else if (m.t === "betaal") {
      kaart = true;
      const betaald = st.betaald.get(m.id) || [];
      const ikBetaalde = betaald.some((x) => x.id === st.ik);
      inhoud = `<div class="c-kaart"><div class="c-kaart-kop">${ICOON.geld}<span>${T("Betaalverzoek")}</span></div>
        <b class="c-bedrag">${esc(bedragTekst(m.bedrag))}</b>${m.omschrijving ? `<div>${esc(m.omschrijving)}</div>` : ""}
        <small>${esc(T("Aan {}", m.naam || (afzender ? afzender.naam : "")))}</small>
        ${betaald.length ? `<small class="c-groen">✓ ${esc(T("Betaald door {}", betaald.map((x) => x.naam || T("Jij")).join(", ")))}</small>` : ""}
        ${mijn || ikBetaalde ? "" : `<div class="c-rij"><button class="c-knop c-hoofd" data-a="betalen" data-b="${b.id}">${T("Betalen")}</button></div>`}</div>`;
    } else if (m.t === "diensten") {
      kaart = true;
      inhoud = `<div class="c-kaart"><div class="c-kaart-kop">${ICOON.agenda}<span>${T("Diensten")}</span></div>
        ${m.titel ? `<b>${esc(m.titel)}</b>` : ""}${(m.soorten || []).map((d) => `<div>${esc(dienstTekst(d))}</div>`).join("")}
        ${m.locatie ? `<small>${esc(m.locatie)}</small>` : ""}
        ${mijn ? `<small>${T("Anderen kiezen hier zelf een vrij moment.")}</small>` : `<div class="c-rij c-wrap">
          ${(m.soorten || []).length ? `<button class="c-knop c-hoofd" data-a="boek-open" data-b="${b.id}">${T("Boeken")}</button>` : ""}
          ${m.lessen ? `<button class="c-knop ${(m.soorten || []).length ? "" : "c-hoofd"}" data-a="boek-rooster" data-b="${b.id}">${T("Lesrooster")}</button>` : ""}</div>`}</div>`;
    } else if (m.t === "boeking") {
      kaart = true;
      inhoud = boekingKaart(st, b, m, mijn, afzender);
    } else inhoud = `<i class="c-grijs">${T("Onbekend bericht.")}</i>`;
  }
  const anderen = g.leden.filter((l) => l.id !== st.ik && l.status === "lid");
  const gelezen = mijn && anderen.length && anderen.every((l) => l.gelezen_tot >= b.id);
  const vinkjes = mijn && !g.community ? `<span class="${gelezen ? "c-gelezen" : ""}">${gelezen ? " ✓✓" : " ✓"}</span>` : "";
  const vast = (g.vast || []).includes(b.id) ? "📌 " : "";
  const menu = !b.weg && b.bericht ? ` data-menu="${b.id}"` : "";
  return `<div class="c-bericht ${mijn ? "c-mijn" : ""} ${kaart ? "c-met-kaart" : ""}" id="c-b-${b.id}"${menu}>${naam}${inhoud}
    <span class="c-tijd">${vast}${b.verloopt ? "⏱ " : ""}${esc(tijd(b.aangemaakt))}${vinkjes}</span>${b.weg ? "" : emojiHtml(st, b)}</div>`;
}

function toonGesprek(st) {
  const g = st.gesprek;
  if (!g) return;
  const rijen = [];
  let vorigeDag = "", vorige = null;
  for (const b of st.berichten) {
    if (b.bericht && SKIP.has(b.bericht.t)) continue;
    const d = dag(b.aangemaakt);
    if (d !== vorigeDag) { rijen.push(`<div class="c-dag">${esc(d)}</div>`); vorigeDag = d; vorige = null; }
    rijen.push(berichtHtml(st, g, b, vorige));
    vorige = b;
  }
  const ander = g.soort === "twee" ? g.leden.find((l) => l.id !== st.ik) : null;
  const verzoek = g.status === "verzoek" ? `<div class="c-verzoek"><div>${g.soort === "groep"
      ? T("Je bent toegevoegd aan {} door iemand die niet in je contacten staat.", `<b>${esc(g.naam)}</b>`)
      : T("{} staat niet in je contacten en wil met je chatten.", `<b>${esc(gesprekNaam(st, g))}</b>`)}</div>
    <div class="c-rij"><button class="c-knop c-hoofd" data-a="ja">${T("Accepteren")}</button><button class="c-knop" data-a="nee">${T("Weigeren")}</button>
    ${g.soort === "twee" ? `<button class="c-knop c-rood" data-a="blokkeer">${T("Blokkeren")}</button>` : ""}</div></div>` : "";
  const wachtOp = ander && ander.status === "verzoek" && g.status === "lid"
    ? `<div class="c-tip">${T("{} heeft jou niet als contact en ziet je bericht als verzoek.", esc(ander.naam))}</div>` : "";
  const sleutelWaarschuwing = st.sleutelsVeranderd ? `<div class="c-tip c-waarschuwing">${T("De beveiligingscode is veranderd, bijvoorbeeld door een nieuw apparaat.")}
    <button class="c-link" data-a="info">${T("Controleer de code")}</button></div>` : "";
  const oud = st.wortel.querySelector(".c-berichten");
  const onderaan = !oud || oud.scrollHeight - oud.scrollTop - oud.clientHeight < 80;
  const veldOud = st.wortel.querySelector("#c-tekst");
  const concept = veldOud ? veldOud.value : (st.concept || "");
  const hadFocus = veldOud && st.wortel.contains(document.activeElement) && document.activeElement === veldOud;
  const waarde = (id) => (st.wortel.querySelector(id) || {}).value;
  if (st.paneel === "afspraak" && st.wortel.querySelector("#c-a-titel")) {
    st.voorstel = { ...st.voorstel, titel: waarde("#c-a-titel"), start: waarde("#c-a-start"), duur: Number(waarde("#c-a-duur")), plaats: waarde("#c-a-plaats") };
  }
  if (st.paneel === "betaal" && st.wortel.querySelector("#c-b-bedrag")) {
    st.betaalConcept = { bedrag: waarde("#c-b-bedrag"), oms: waarde("#c-b-oms"), iban: waarde("#c-b-iban"), naam: waarde("#c-b-naam"), link: waarde("#c-b-link") };
  }
  const bc = st.paneel === "betaal" ? (st.betaalConcept || {}) : {};
  if (st.paneel === "peiling" && st.wortel.querySelector("#c-p-vraag")) peilingBewaren(st);
  if (st.paneel === "boeken" && st.boek && st.wortel.querySelector("#c-bk-herhaal")) {
    st.boek.herhaal = waarde("#c-bk-herhaal"); st.boek.aantal = Number(waarde("#c-bk-aantal")) || 4; st.boek.notitie = waarde("#c-bk-notitie");
  }
  const sub = g.community ? g.community_naam || "" : g.soort === "groep" ? T("{} deelnemers", g.leden.length) : (ander && ander.gebruikersnaam ? "@" + ander.gebruikersnaam : "");
  const terug = g.community ? `<button class="c-ikoon" data-a="community" data-id="${g.community}" aria-label="${esc(T("Terug"))}">${ICOON.terug}</button>` : terugKnop("lijst");
  const beeld = g.community ? `<span class="c-hekje">#</span>` : g.soort === "groep" ? `<span class="c-avatar c-groep c-klein">${ICOON.groep}</span>` : avatar(gesprekNaam(st, g));
  const vastIds = (g.vast || []).filter((id) => st.berichten.some((x) => x.id === id && x.bericht));
  const vastId = vastIds.length ? vastIds[(st.vastStap || 0) % vastIds.length] : null;
  const vastBericht = vastId ? st.berichten.find((x) => x.id === vastId) : null;
  const magSchrijven = g.status === "lid" && (!g.alleen_beheer || g.beheerder);
  st.wortel.innerHTML = `
    ${kop(terug, `<button class="c-titel" data-a="${g.community ? "cinfo" : "info"}">${beeld}
      <span><b>${esc(g.community ? g.naam : gesprekNaam(st, g))}</b><small>${g.verdwijnen ? `⏱ ${T(VERDWIJNEN[g.verdwijnen] || "")} · ` : ""}${esc(sub)}</small></span></button>`)}
    ${vastBericht ? `<button class="c-vast" data-a="vast-volgende" data-b="${vastBericht.id}">${ICOON.vast}<span>${esc(korteInhoud(vastBericht.bericht))}</span>
      ${vastIds.length > 1 ? `<small>${((st.vastStap || 0) % vastIds.length) + 1}/${vastIds.length}</small>` : ""}</button>` : ""}
    ${sleutelWaarschuwing}
    <div class="c-berichten">
      <div class="c-e2e">${ICOON.slot} ${g.community ? T("Berichten zijn end-to-end versleuteld. Niemand buiten de community kan ze lezen, ook de app niet.") : T("Berichten zijn end-to-end versleuteld. Niemand anders kan ze lezen, ook de app niet.")}</div>
      ${rijen.join("")}
      ${wachtOp}
    </div>
    ${verzoek}
    ${st.paneel === "afspraak" ? `<div class="c-paneel">
      <b>${T("Afspraak voorstellen")}</b>
      <label>${T("Wat")}<input class="c-veld" id="c-a-titel" placeholder="${esc(T("Bijvoorbeeld: koffie drinken"))}" value="${esc(st.voorstel.titel || "")}"></label>
      <div class="c-rij"><label>${T("Wanneer")}<input class="c-veld" id="c-a-start" type="datetime-local" value="${esc(st.voorstel.start || "")}"></label>
      <label class="c-smal">${T("Hoe lang")}<select class="c-veld" id="c-a-duur">${[30, 60, 90, 120, 180].map((m) => `<option value="${m}" ${m === (st.voorstel.duur || 60) ? "selected" : ""}>${m < 60 ? T("{} min", m) : T("{} uur", m / 60)}</option>`).join("")}</select></label></div>
      <label>${T("Waar (optioneel)")}<input class="c-veld" id="c-a-plaats" value="${esc(st.voorstel.plaats || "")}"></label>
      <div class="c-rij">${st.voorstel.eigen ? `<button class="c-knop c-hoofd" data-a="eigen-agenda">${T("In mijn agenda")}</button>`
        : `<button class="c-knop c-hoofd" data-a="stuur-afspraak">${T("Voorstellen")}</button>`}<button class="c-knop" data-a="sluit">${T("Annuleren")}</button></div></div>` : ""}
    ${st.paneel === "betaal" ? `<div class="c-paneel">
      <b>${T("Betaalverzoek")}</b>
      <div class="c-rij"><label class="c-smal">${T("Bedrag")}<input class="c-veld" id="c-b-bedrag" inputmode="decimal" placeholder="12,50" value="${esc(bc.bedrag || "")}"></label>
        <label>${T("Waarvoor")}<input class="c-veld" id="c-b-oms" maxlength="80" placeholder="${esc(T("Bijvoorbeeld: pizza"))}" value="${esc(bc.oms || "")}"></label></div>
      <label>${T("Jouw IBAN")}<input class="c-veld" id="c-b-iban" autocomplete="off" value="${esc(bc.iban ?? bewaard("iban"))}" placeholder="NL00 BANK 0123 4567 89"></label>
      <label>${T("Naam op je rekening")}<input class="c-veld" id="c-b-naam" value="${esc(bc.naam ?? bewaard("rekeningnaam"))}"></label>
      <label>${T("Betaallink (optioneel)")}<input class="c-veld" id="c-b-link" inputmode="url" value="${esc(bc.link ?? bewaard("betaallink"))}" placeholder="https://bunq.me/... of https://tikkie.me/..."></label>
      <small>${T("De app verstuurt zelf geen geld. De ander betaalt met de eigen bank of via jouw betaallink.")}</small>
      <div class="c-rij"><button class="c-knop c-hoofd" data-a="stuur-betaal">${T("Versturen")}</button><button class="c-knop" data-a="sluit">${T("Annuleren")}</button></div></div>` : ""}
    ${st.paneel === "betalen" && st.betaalBericht ? (() => { const m = st.betaalBericht.bericht; const link = veiligeLink(m.link);
      return `<div class="c-paneel">
      <b>${esc(T("{} betalen aan {}", bedragTekst(m.bedrag), m.naam || ""))}</b>
      ${link ? `<a class="c-knop c-hoofd c-breed c-link-knop" href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${esc(T("Betalen via {}", link.hostname))}</a>` : ""}
      ${m.iban ? `<div class="c-kopie-rij"><span><small>${T("IBAN")}</small><b>${esc(ibanMooi(m.iban))}</b></span><button class="c-knop" data-a="kopieer" data-w="${esc(String(m.iban).replace(/\s+/g, ""))}">${T("Kopieer")}</button></div>
        <div class="c-kopie-rij"><span><small>${T("Bedrag")}</small><b>${esc(bedragTekst(m.bedrag))}</b></span><button class="c-knop" data-a="kopieer" data-w="${esc((m.bedrag / 100).toFixed(2).replace(".", ","))}">${T("Kopieer")}</button></div>
        ${m.omschrijving ? `<div class="c-kopie-rij"><span><small>${T("Omschrijving")}</small><b>${esc(m.omschrijving)}</b></span><button class="c-knop" data-a="kopieer" data-w="${esc(m.omschrijving)}">${T("Kopieer")}</button></div>` : ""}
        <small>${T("Open je bankapp, maak een overboeking en plak de gegevens.")}</small>` : ""}
      <div class="c-rij"><button class="c-knop c-hoofd" data-a="ik-betaalde">${T("Ik heb betaald")}</button><button class="c-knop" data-a="sluit">${T("Later")}</button></div></div>`; })() : ""}
    ${st.paneel === "boeken" && st.boek ? boekPaneel(st) : ""}
    ${st.paneel === "rooster" && st.rooster ? roosterPaneel(st) : ""}
    ${st.paneel === "peiling" ? `<div class="c-paneel">
      <b>${T("Peiling")}</b>
      <input class="c-veld" id="c-p-vraag" placeholder="${esc(T("Vraag"))}" value="${esc(st.peiling.vraag || "")}" maxlength="200">
      ${st.peiling.opties.map((o, k) => `<input class="c-veld c-p-optie" placeholder="${esc(T("Keuze {}", k + 1))}" value="${esc(o)}" maxlength="80">`).join("")}
      <div class="c-rij c-wrap"><button class="c-knop c-hoofd" data-a="stuur-peiling">${T("Versturen")}</button>
      ${st.peiling.opties.length < 8 ? `<button class="c-knop" data-a="optie-erbij">${T("Keuze erbij")}</button>` : ""}
      <button class="c-knop" data-a="sluit">${T("Annuleren")}</button></div></div>` : ""}
    ${st.paneel === "plus" ? `<div class="c-paneel c-plus">
      <button class="c-plus-knop" data-a="foto"><span>📷</span>${T("Foto")}</button>
      <button class="c-plus-knop" data-a="afspraak"><span>📅</span>${g.community ? T("Evenement") : T("Afspraak")}</button>
      ${g.soort === "groep" ? `<button class="c-plus-knop" data-a="peiling"><span>📊</span>${T("Peiling")}</button>` : ""}
      <button class="c-plus-knop" data-a="vrij"><span>🕒</span>${T("Wanneer ik kan")}</button>
      ${g.community ? "" : `<button class="c-plus-knop" data-a="betaal"><span>💶</span>${T("Betaalverzoek")}</button>`}
      ${g.community ? "" : `<button class="c-plus-knop" data-a="diensten"><span>🗓️</span>${T("Mijn diensten")}</button>`}</div>` : ""}
    ${st.antwoord && magSchrijven ? `<div class="c-antwoord-balk"><div><b>${esc(st.antwoord.naam)}</b><span>${esc(st.antwoord.tekst)}</span></div>
      <button class="c-mini" data-a="antwoord-weg" aria-label="${esc(T("Niet beantwoorden"))}">×</button></div>` : ""}
    ${magSchrijven ? `<div class="c-vermeld-rij"></div><div class="c-invoer"><button class="c-rond" data-a="plus" aria-label="${esc(T("Meer"))}">${ICOON.plus}</button>
      <textarea id="c-tekst" class="c-veld" rows="1" placeholder="${g.community ? esc(T("Bericht in #{}", g.naam)) : esc(T("Bericht"))}"></textarea>
      <button class="c-rond c-hoofd" data-a="stuur" aria-label="${esc(T("Versturen"))}">${ICOON.stuur}</button></div>`
      : g.status === "lid" ? `<div class="c-alleen">${T("Alleen beheerders schrijven in dit kanaal.")}</div>` : ""}
    <input type="file" id="c-foto" accept="image/*" hidden>
    ${st.menu ? menuBlad(st, g) : ""}`;
  const lijst = st.wortel.querySelector(".c-berichten");
  if (onderaan || st.naarOnder) { lijst.scrollTop = lijst.scrollHeight; st.naarOnder = false; }
  else if (oud) lijst.scrollTop = oud.scrollTop;
  const veld = st.wortel.querySelector("#c-tekst");
  if (veld) {
    veld.value = concept;
    const hoogte = () => { veld.style.height = "auto"; veld.style.height = Math.min(veld.scrollHeight, 140) + "px"; };
    hoogte();
    veld.addEventListener("input", () => { st.concept = veld.value; hoogte(); vermeldVoorstel(st, veld); });
    veld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); actie(st, "stuur"); } });
    if (st.focus || hadFocus) { veld.focus({ preventScroll: true }); st.focus = false; }
  }
  const foto = st.wortel.querySelector("#c-foto");
  foto.addEventListener("change", async () => {
    if (!foto.files || !foto.files[0]) return;
    const data = await verkleind(foto.files[0]);
    if (data) await versturen(st, { t: "foto", data, tekst: "" });
  });
}

function peilingBewaren(st) {
  st.peiling = { vraag: st.wortel.querySelector("#c-p-vraag").value,
                 opties: [...st.wortel.querySelectorAll(".c-p-optie")].map((x) => x.value) };
}

// Lang drukken op een bericht: reageren met een emoji, beantwoorden, vastzetten, kopiëren of verwijderen.
function menuBlad(st, g) {
  const b = st.berichten.find((x) => x.id === st.menu);
  if (!b || !b.bericht) return "";
  const mijn = b.afzender === st.ik;
  const magBeheren = g.soort === "twee" || g.beheerder;
  const vast = (g.vast || []).includes(b.id);
  const schrijven = g.status === "lid" && (!g.alleen_beheer || g.beheerder);
  return `<div class="c-achtergrond" data-a="menu-dicht"></div><div class="c-blad">
    ${g.status === "lid" ? `<div class="c-emoji-rij">${EMOJI.map((e) => `<button data-a="emoji" data-b="${b.id}" data-e="${e}">${e}</button>`).join("")}</div>` : ""}
    ${schrijven ? `<button class="c-blad-knop" data-a="beantwoord">${ICOON.antwoord}${T("Beantwoorden")}</button>` : ""}
    ${magBeheren ? `<button class="c-blad-knop" data-a="vastzetten">${ICOON.vast}${vast ? T("Losmaken") : T("Vastzetten")}</button>` : ""}
    ${b.bericht.t === "tekst" ? `<button class="c-blad-knop" data-a="kopieer">${ICOON.kopie}${T("Kopiëren")}</button>` : ""}
    ${mijn || (g.soort === "groep" && g.beheerder) ? `<button class="c-blad-knop c-rood" data-a="verwijder">${ICOON.weg}${T("Verwijderen")}</button>` : ""}</div>`;
}

// @naam: een paar deelnemers voorstellen terwijl je typt.
function vermeldVoorstel(st, veld) {
  const rij = st.wortel.querySelector(".c-vermeld-rij");
  const g = st.gesprek;
  if (!rij || !g || g.soort !== "groep") return;
  const m = veld.value.slice(0, veld.selectionStart).match(/@([a-z0-9._-]*)$/i);
  if (!m) { rij.innerHTML = ""; return; }
  const zoek = m[1].toLowerCase();
  const passend = g.leden.filter((l) => l.id !== st.ik && l.gebruikersnaam && l.status === "lid"
    && (l.gebruikersnaam.startsWith(zoek) || l.naam.toLowerCase().startsWith(zoek))).slice(0, 6);
  rij.innerHTML = passend.map((l) => `<button class="c-pil" data-a="vermeld" data-naam="${esc(l.gebruikersnaam)}">${esc(l.naam)}</button>`).join("");
}

async function toonInfo(st) {
  const g = st.gesprek;
  const ander = g.soort === "twee" ? g.leden.find((l) => l.id !== st.ik) : null;
  let code = "";
  if (ander && st.sleutelLijst) {
    code = await veiligheidscode(st.sleutelLijst.filter((a) => a.gebruiker === st.ik),
                                 st.sleutelLijst.filter((a) => a.gebruiker === ander.id));
  }
  st.wortel.innerHTML = `
    ${kop(terugKnop("terug"), `<b>${T("Info")}</b>`)}
    <div class="c-inhoud c-vulling">
      <div class="c-profiel">${g.soort === "groep" ? `<span class="c-avatar c-groep c-groot">${ICOON.groep}</span>` : avatar(gesprekNaam(st, g), true)}
        <b>${esc(gesprekNaam(st, g))}</b>${ander && ander.gebruikersnaam ? `<small>@${esc(ander.gebruikersnaam)}</small>` : ""}
        ${ander && !ander.contact ? `<button class="c-knop" data-a="als-contact" data-naam="${esc(ander.gebruikersnaam || "")}">${T("Aan contacten toevoegen")}</button>` : ""}</div>
      ${ander && code ? `<div class="c-kaart"><b>${ICOON.slot} ${T("Beveiligingscode")}</b>
        <div class="c-code">${esc(code)}</div>
        <small>${T("Vergelijk deze code met die op het scherm van {}, het liefst samen of via een telefoontje. Zijn ze gelijk, dan weet je zeker dat niemand meeleest.", esc(ander.naam))}</small>
        <div class="c-rij"><button class="c-knop" data-a="gecontroleerd" data-code="${esc(code)}">${T("Code is gelijk")}</button></div></div>` : ""}
      <label>${T("Verdwijnende berichten")}<select class="c-veld" id="c-verdwijn">${Object.entries(VERDWIJNEN).map(([k, v]) =>
        `<option value="${k}" ${Number(k) === (g.verdwijnen || 0) ? "selected" : ""}>${T(v)}</option>`).join("")}</select></label>
      <label class="c-vink"><span>${T("Geen meldingen voor dit gesprek")}</span><input type="checkbox" id="c-stil" ${g.stil ? "checked" : ""}></label>
      ${g.soort === "groep" ? `<div class="c-sectie">${T("Deelnemers")}</div>
        ${g.leden.map((l) => `<div class="c-lid">${avatar(l.naam)}<span>${esc(l.naam)}${l.id === st.ik ? ` (${T("jij")})` : ""}</span>
          <small>${l.beheerder ? T("beheerder") : ""}${l.status === "verzoek" ? T("uitgenodigd") : ""}</small></div>`).join("")}
        ${g.beheerder ? `<div class="c-zoek"><input class="c-veld" id="c-toevoegen" placeholder="${esc(T("Gebruikersnaam"))}" autocapitalize="none"><button class="c-knop" data-a="toevoegen">${T("Toevoegen")}</button></div>` : ""}` : ""}
      <div class="c-rij c-wrap"><button class="c-knop c-rood" data-a="verlaten">${g.soort === "groep" ? T("Groep verlaten") : T("Gesprek verwijderen")}</button>
      ${ander ? `<button class="c-knop c-rood" data-a="blokkeer">${T("Blokkeren")}</button>` : ""}</div>
    </div>`;
  st.wortel.querySelector("#c-verdwijn").addEventListener("change", (e) => instellen(st, { p_verdwijnen: Number(e.target.value) }));
  st.wortel.querySelector("#c-stil").addEventListener("change", (e) => instellen(st, { p_stil: e.target.checked }));
}

async function toonApparaten(st) {
  const ik = await rpc(st, "chat_ik", { p_apparaat: st.apparaat });
  st.wortel.innerHTML = `
    ${kop(terugKnop("lijst"), `<b>${T("Beveiliging")}</b>`)}
    <div class="c-inhoud c-vulling">
      <div class="c-kaart"><b>${ICOON.slot} ${T("Hoe het werkt")}</b>
        ${T("Elk bericht wordt op je apparaat versleuteld en pas op het apparaat van de ander weer leesbaar. De sleutels blijven op je apparaat; de server en de makers van de app kunnen je berichten niet lezen, ook de assistent niet. Een nieuw apparaat kan berichten van vóór de aanmelding niet lezen.")}</div>
      <div class="c-sectie">${T("Je apparaten met chat")}</div>
      ${ik.apparaten.map((a) => `<div class="c-lid"><span><b>${esc(a.naam || T("Apparaat"))}</b>${a.id === st.apparaat ? ` (${T("dit apparaat")})` : ""}
        <br><small>${esc(a.vingerafdruk.slice(0, 8))} · ${esc(T("laatst {}", dag(a.laatst)))}</small></span>
        ${a.id === st.apparaat ? "" : `<button class="c-knop" data-a="apparaat-weg" data-id="${a.id}">${T("Weghalen")}</button>`}</div>`).join("")}
    </div>`;
}

// --- Acties ------------------------------------------------------------------------------------------------------

async function gesprekkenLaden(st) {
  const r = await rpc(st, "chat_gesprekken");
  st.gesprekken = r.gesprekken; st.communities = r.communities || [];
  voorbeeldenBijwerken(st).catch(() => {});
}

async function contactenLaden(st) {
  st.contacten = (await rpc(st, "chat_contacten")).contacten;
}

// Het laatste bericht van elk gesprek, hier ontsleuteld, als voorbeeld in de lijst. Blijft op dit apparaat.
async function voorbeeldenBijwerken(st) {
  let veranderd = false;
  for (const g of st.gesprekken.slice(0, 30)) {
    if (!g.laatste_id) continue;
    if (!st.voorbeelden.has(g.id)) {
      const bewaard = await idbGet("voorbeeld", `${st.ik}:${g.id}`);
      if (bewaard) { st.voorbeelden.set(g.id, bewaard); veranderd = true; }
    }
    const v = st.voorbeelden.get(g.id);
    if (v && v.id >= g.laatste_id) continue;
    const r = await rpc(st, "chat_berichten", { p_gesprek: g.id, p_na: g.laatste_id - 1, p_apparaat: st.apparaat });
    const b = r.berichten[r.berichten.length - 1];
    let tekst = "";
    if (b && b.weg) tekst = T("Bericht verwijderd");
    else if (b && b.inhoud) {
      try { const o = await ontsleutel(st, g.id, b); tekst = voorbeeldTekst(st, g, o.bericht, b.afzender); } catch (e) { tekst = ""; }
    }
    const nieuw = { id: g.laatste_id, tekst: tekst || T("Versleuteld bericht") };
    st.voorbeelden.set(g.id, nieuw);
    idbPut("voorbeeld", `${st.ik}:${g.id}`, nieuw).catch(() => {});
    veranderd = true;
  }
  if (veranderd && st.scherm === "lijst") toon(st);
}

async function berichtenLaden(st) {
  const g = st.gesprek;
  if (!g) return;
  const na = st.berichten.length ? st.berichten[st.berichten.length - 1].id : 0;
  const r = await rpc(st, "chat_berichten", { p_gesprek: g.id, p_na: na, p_apparaat: st.apparaat });
  if (!st.gesprek || st.gesprek.id !== g.id) return;
  const stand = (x) => JSON.stringify([x.leden.map((l) => [l.id, l.status, l.gelezen_tot]), x.vast || [], x.naam, x.alleen_beheer, x.beheerder]);
  const ledenVoor = stand(st.gesprek);
  st.gesprek = r.gesprek || g;
  if (!st.gesprek.leden) st.gesprek.leden = g.leden;  // grote kanalen sturen de ledenlijst alleen als er iets veranderde
  let nieuw = stand(st.gesprek) !== ledenVoor;
  const al = new Set(st.berichten.map((x) => x.id));
  for (const b of r.berichten) {
    if (al.has(b.id)) continue;  // twee keer tegelijk geladen (openen en verversen)
    al.add(b.id);
    if (!b.weg && b.inhoud) {
      try { Object.assign(b, await ontsleutel(st, g.id, b)); } catch (e) { b.fout = "kapot"; }
    }
    if (b.bericht && b.bericht.t === "reactie") {
      const lid = st.gesprek.leden.find((l) => l.id === b.afzender) || {};
      const lijst = st.reacties.get(b.bericht.op) || [];
      st.reacties.set(b.bericht.op, [...lijst.filter((x) => x.id !== b.afzender), { id: b.afzender, naam: lid.naam || "", antwoord: b.bericht.antwoord }]);
    }
    if (b.bericht && b.bericht.t === "emoji") {
      const per = st.emoji.get(Number(b.bericht.op)) || new Map();
      if (b.bericht.emoji) per.set(b.afzender, String(b.bericht.emoji).slice(0, 8)); else per.delete(b.afzender);
      st.emoji.set(Number(b.bericht.op), per);
    }
    if (b.bericht && b.bericht.t === "betaald") {
      const lid = st.gesprek.leden.find((l) => l.id === b.afzender) || {};
      const lijst = st.betaald.get(b.bericht.op) || [];
      if (!lijst.some((x) => x.id === b.afzender)) st.betaald.set(b.bericht.op, [...lijst, { id: b.afzender, naam: b.afzender === st.ik ? "" : lid.naam || "" }]);
    }
    if (b.bericht && b.bericht.t === "stem") {
      const per = st.stemmen.get(b.bericht.op) || new Map();
      per.set(b.afzender, Number(b.bericht.keuze));
      st.stemmen.set(b.bericht.op, per);
    }
    if (st.berichten.some((x) => x.id === b.id)) continue;
    st.berichten.push(b);
    nieuw = true;
  }
  if (await boekStatusLaden(st, r.berichten.some((b) => b.bericht && b.bericht.t === "boeking"))) nieuw = true;
  const laatste = [...st.berichten].reverse().find((b) => b.bericht || b.weg);
  if (laatste && r.berichten.length) {
    const v = { id: laatste.id, tekst: laatste.weg ? T("Bericht verwijderd") : voorbeeldTekst(st, st.gesprek, laatste.bericht, laatste.afzender) };
    st.voorbeelden.set(g.id, v);
    idbPut("voorbeeld", `${st.ik}:${g.id}`, v).catch(() => {});
  }
  const hoogste = st.berichten.length ? st.berichten[st.berichten.length - 1].id : 0;
  if (r.berichten.length && hoogste && st.gesprek.status === "lid") rpc(st, "chat_gelezen", { p_gesprek: g.id, p_tot: hoogste }).catch(() => {});
  return nieuw;
}

async function sleutelsLaden(st) {
  st.sleutelLijst = (await rpc(st, "chat_sleutels", { p_gesprek: st.gesprek.id })).apparaten;
  const g = st.gesprek;
  if (g.soort === "twee") {
    const ander = g.leden.find((l) => l.id !== st.ik);
    if (ander) {
      const bekend = await idbGet("geverifieerd", `${st.ik}:${ander.id}`);
      const code = await veiligheidscode(st.sleutelLijst.filter((a) => a.gebruiker === st.ik),
                                         st.sleutelLijst.filter((a) => a.gebruiker === ander.id));
      st.sleutelsVeranderd = Boolean(bekend && bekend !== code);
    }
  }
}

async function openen(st, id) {
  const kanaal = (st.communities || []).flatMap((c) => c.kanalen.map((k) => ({ ...k, community: c.id, community_naam: c.naam })))
    .find((k) => k.id === id);
  st.gesprek = st.gesprekken.find((g) => g.id === id)
    || (kanaal ? { id, naam: kanaal.naam, community: kanaal.community, community_naam: kanaal.community_naam, leden: [], soort: "groep", status: "lid" }
              : { id, leden: [], soort: "twee", status: "lid" });
  st.berichten = []; st.reacties = new Map(); st.emoji = new Map(); st.stemmen = new Map(); st.betaald = new Map(); st.scherm = "gesprek"; st.paneel = null; st.naarOnder = true;
  st.boekStatus = new Map(); st.boekTijd = 0; st.boek = null;
  st.menu = null; st.antwoord = null; st.vastStap = 0; st.blad = null;
  st.sleutelsVeranderd = false; st.sleutelLijst = null; st.concept = "";
  toon(st);
  await berichtenLaden(st);
  if (st.gesprek.status === "lid") await sleutelsLaden(st).catch(() => {});
  st.naarOnder = true;
  toon(st);
}

// --- Diensten boeken via de chat (trainer, kapper, bijles...) ---------------------------------------------------------
// De aanbieder deelt zijn diensten; de klant kiest een vrij moment (eventueel elke week) en betaalt met de eigen bank
// of de betaallink van de aanbieder. De boeking zelf staat in de database; de chat laat de stand ervan zien.

async function boekStatusLaden(st, nu) {
  const ids = st.berichten.filter((b) => b.bericht && b.bericht.t === "boeking").flatMap((b) => (b.bericht.ids || []).map(Number));
  if (!ids.length || (!nu && Date.now() - (st.boekTijd || 0) < 30000)) return false;
  st.boekTijd = Date.now();
  const r = await rpc(st, "chat_boeking_status", { p_ids: ids });
  const voor = JSON.stringify([...st.boekStatus]);
  st.boekStatus = new Map(r.boekingen.map((x) => [x.id, x]));
  // Afgewezen of geannuleerd? Dan haalt de app die keren ook uit je eigen agenda.
  st.wegGemeld = st.wegGemeld || new Set();
  const weg = r.boekingen.filter((x) => !x.aanbieder && ["afgewezen", "geannuleerd"].includes(x.status) && !st.wegGemeld.has(x.id)).map((x) => x.id);
  if (weg.length) { weg.forEach((id) => st.wegGemeld.add(id)); st.zet("boekingweg", { ids: weg, n: Date.now() }); }
  return JSON.stringify([...st.boekStatus]) !== voor;
}

function boekingKaart(st, b, m, mijn, afzender) {
  const ids = (m.ids || []).map(Number);
  const status = ids.map((id) => st.boekStatus.get(id)).filter(Boolean);
  const actief = status.filter((x) => ["aangevraagd", "bevestigd"].includes(x.status));
  const aanbieder = status.length ? status[0].aanbieder : !mijn;
  const kort = (x, start) => {
    const s = x ? x.status : m.status;
    const teken = x && x.afgevinkt === "gekomen" ? "✓ " : x && x.afgevinkt === "niet_gekomen" ? "✗ " : "";
    const tekst = esc(teken + wanneer(start));
    return ["afgewezen", "geannuleerd"].includes(s) ? `<s class="c-grijs">${tekst}</s>` : tekst;
  };
  const starts = m.starts || [];
  const regels = starts.slice(0, 4).map((x, k) => `<div>${kort(st.boekStatus.get(ids[k]), x)}</div>`).join("")
    + (starts.length > 4 ? `<small>${esc(T("en nog {} keer", starts.length - 4))}</small>` : "");
  const open = actief.some((x) => x.geld === "open");
  const viaApp = status.some((x) => x.geld && x.geld !== "open");
  const wacht = actief.some((x) => x.status === "aangevraagd") || (!status.length && m.status === "aangevraagd");
  const allesWeg = status.length && !actief.length && status.every((x) => ["afgewezen", "geannuleerd"].includes(x.status));
  const stand = allesWeg ? T(status[0].status === "afgewezen" ? "Afgewezen" : "Geannuleerd")
    : open ? T("Wacht op betaling") : wacht ? T("Wacht op bevestiging") : T("Bevestigd");
  const totaal = (m.prijs || 0) * (status.length ? actief.length || 0 : starts.length);
  const betaald = (st.betaald.get(m.id) || []).length || status.some((x) => x.betaald);
  const saldo = status.length ? status[0].saldo : null;
  const saldoTekst = saldo > 0 ? T("Tegoed: {}", bedragTekst(saldo)) : saldo < 0 ? T("Nog te betalen: {}", bedragTekst(-saldo)) : "";
  const betalen = status.length && status[0].betalen;
  const wie = mijn ? T("bij {}", m.naam || "") : (afzender ? afzender.naam : "");
  const knoppen = [];
  if (!aanbieder) {
    if (open) knoppen.push(`<button class="c-knop c-hoofd" data-a="boek-betalen" data-b="${b.id}">${T("Betalen")}</button>`);
    else if (!allesWeg && totaal > 0 && betalen && !betaald && !viaApp) knoppen.push(`<button class="c-knop c-hoofd" data-a="boek-betalen" data-b="${b.id}">${T("Betalen")}</button>`);
    if (actief.some((x) => new Date(x.start) > new Date())) knoppen.push(`<button class="c-knop" data-a="boek-annuleer" data-b="${b.id}">${T("Annuleren")}</button>`);
  } else {
    if (actief.some((x) => x.status === "aangevraagd" && x.geld !== "open")) {
      knoppen.push(`<button class="c-knop c-hoofd" data-a="boek-ja" data-b="${b.id}">${T("Bevestigen")}</button>`);
      knoppen.push(`<button class="c-knop" data-a="boek-nee" data-b="${b.id}">${T("Afwijzen")}</button>`);
    }
    if (betaald && !viaApp && totaal > 0 && !status.some((x) => x.ontvangen) && !st.ontvangen?.has(m.id)) knoppen.push(`<button class="c-knop" data-a="boek-ontvangen" data-b="${b.id}">${T("Geld ontvangen")}</button>`);
  }
  return `<div class="c-kaart"><div class="c-kaart-kop">${ICOON.agenda}<span>${T("Boeking")} · ${esc(stand)}</span></div>
    <b>${esc(m.soort)}</b><small>${esc(wie)}${m.locatie ? ` · ${esc(m.locatie)}` : ""}</small>${regels}
    ${totaal > 0 ? `<div>${esc(T("Totaal {}", bedragTekst(totaal)))}${starts.length > 1 ? ` <small>(${esc(T("{} per keer", bedragTekst(m.prijs)))})</small>` : ""}</div>` : ""}
    ${open ? `<small>${esc(T("Betaal binnen 30 minuten, anders vervalt de boeking."))}</small>` : ""}
    ${viaApp ? `<small class="c-groen">✓ ${esc(aanbieder ? T("Betaald via de app. Het geld komt na de afspraak naar je toe.") : T("Betaald via de app"))}</small>`
      : status.some((x) => x.ontvangen) ? `<small class="c-groen">✓ ${esc(T("Betaling ontvangen"))}</small>`
      : betaald ? `<small class="c-groen">✓ ${esc(aanbieder ? T("De klant heeft betaald") : T("Je hebt betaald"))}</small>` : ""}
    ${saldoTekst && !aanbieder && !viaApp ? `<small>${esc(saldoTekst)}</small>` : ""}
    ${!aanbieder && status.some((x) => x.terug > 0) ? `<small>${esc(T("Je krijgt {} terug.", bedragTekst(status.reduce((n, x) => n + (x.terug || 0), 0))))}</small>` : ""}
    ${knoppen.length ? `<div class="c-rij c-wrap">${knoppen.join("")}</div>` : ""}</div>`;
}

function boekPaneel(st) {
  const bk = st.boek;
  const d = bk.soorten[bk.soort] || bk.soorten[0];
  const dagLabel = (x) => { const dt = new Date(x + "T12:00"); return dag(dt); };
  return `<div class="c-paneel">
    <b>${esc(T("Boeken bij {}", bk.naam || ""))}</b>
    ${bk.soorten.length > 1 ? `<div class="c-pillen">${bk.soorten.map((x, k) => `<button class="c-pil ${k === bk.soort ? "c-pil-aan" : ""}" data-a="boek-soort" data-k="${k}">${esc(dienstTekst(x))}</button>`).join("")}</div>`
      : `<div>${esc(dienstTekst(d))}</div>`}
    ${bk.dagen === null ? `<small>${T("Vrije momenten zoeken...")}</small>` : !bk.dagen.length ? `<small>${T("Er zijn op dit moment geen vrije momenten.")}</small>` : `
      <div class="c-pillen">${bk.dagen.slice(0, 14).map((x) => `<button class="c-pil ${x === bk.dag ? "c-pil-aan" : ""}" data-a="boek-dag" data-d="${esc(x)}">${esc(dagLabel(x))}</button>`).join("")}</div>
      ${bk.tijden === null ? `<small>${T("Tijden laden...")}</small>` : `<div class="c-rij c-wrap">${bk.tijden.map((x) => `<button class="c-pil ${x === bk.tijd ? "c-pil-aan" : ""}" data-a="boek-tijd" data-t="${esc(x)}">${esc(tijd(new Date(x)))}</button>`).join("") || `<small>${T("Op deze dag is niets meer vrij.")}</small>`}</div>`}`}
    <div class="c-rij"><label>${T("Hoe vaak")}<select class="c-veld" id="c-bk-herhaal">${Object.entries(HERHAAL).map(([k, w]) => `<option value="${k}" ${k === (bk.herhaal || "") ? "selected" : ""}>${T(w)}</option>`).join("")}</select></label>
      <label class="c-smal">${T("Aantal keer")}<select class="c-veld" id="c-bk-aantal">${[2, 3, 4, 6, 8, 10, 12].map((n) => `<option value="${n}" ${n === (bk.aantal || 4) ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
    <input class="c-veld" id="c-bk-notitie" maxlength="300" placeholder="${esc(T("Opmerking (optioneel)"))}" value="${esc(bk.notitie || "")}">
    ${bk.annuleren && (d.prijs || 0) > 0 ? `<small>${esc(annuleerRegel(bk.annuleren, bk.app_betalen))}</small>` : ""}
    <div class="c-rij"><button class="c-knop c-hoofd" data-a="boek-stuur" ${bk.tijd ? "" : "disabled"}>${(d.prijs || 0) > 0 && bk.app_betalen ? T("Boeken en betalen") : T("Boeken")}</button><button class="c-knop" data-a="sluit">${T("Annuleren")}</button></div></div>`;
}

function roosterPaneel(st) {
  const r = st.rooster;
  const knop = (les) => {
    if (les.mijn === "ingeschreven") return `<button class="c-knop" data-a="boek-les" data-id="${les.id}">${T("Afmelden")}</button>`;
    if (les.mijn === "wachtlijst") return `<button class="c-knop" data-a="boek-les" data-id="${les.id}">${T("Van wachtlijst af")}</button>`;
    const vol = les.ingeschreven >= les.plekken;
    return `<button class="c-knop c-hoofd" data-a="boek-les" data-id="${les.id}">${vol ? T("Wachtlijst") : T("Inschrijven")}</button>`;
  };
  return `<div class="c-paneel" style="max-height:55vh;overflow-y:auto">
    <b>${esc(T("Lesrooster van {}", r.naam || ""))}</b>
    ${r.lessen === null ? `<small>${T("Laden...")}</small>` : !r.lessen.length ? `<small>${T("Geen lessen in de komende twee weken.")}</small>`
      : r.lessen.map((les) => `<div class="c-kopie-rij"><span><b>${esc(les.naam)}</b>
        <small>${esc([wanneer(les.start), duurTekst(les.minuten), les.prijs ? bedragTekst(les.prijs) : "",
                      les.mijn === "ingeschreven" ? T("Je doet mee") : les.mijn === "wachtlijst" ? T("Op de wachtlijst")
                      : T("{} plekken vrij", Math.max(0, les.plekken - les.ingeschreven))].filter(Boolean).join(" · "))}</small></span>${knop(les)}</div>`).join("")}
    <div class="c-rij"><button class="c-knop" data-a="sluit">${T("Sluiten")}</button></div></div>`;
}

async function boekDagen(st) {
  const bk = st.boek;
  bk.dagen = null; bk.tijden = null; bk.tijd = null; toon(st);
  const r = await rpc(st, "chat_dienst_bekijken", { p_adres: bk.adres, p_soort: bk.soort });
  bk.dagen = r.dagen || []; bk.naam = r.naam || bk.naam; bk.annuleren = r.annuleren; bk.app_betalen = !!r.app_betalen;
  bk.dag = bk.dagen[0] || null;
  if (bk.dag) await boekTijden(st); else toon(st);
}

async function boekTijden(st) {
  const bk = st.boek;
  bk.tijden = null; bk.tijd = null; toon(st);
  const r = await rpc(st, "chat_dienst_tijden", { p_adres: bk.adres, p_soort: bk.soort, p_datum: bk.dag });
  bk.tijden = r.tijden || [];
  toon(st);
}

async function boekActie(st, a, el, v) {
  const b = el.dataset.b ? st.berichten.find((x) => x.id === Number(el.dataset.b)) : null;
  const m = b && b.bericht;
  if (a === "diensten") {
    const r = await rpc(st, "chat_diensten");
    return versturen(st, { t: "diensten", id: b64(rnd(9)), adres: r.adres, titel: r.titel || "", soorten: r.soorten, locatie: r.locatie || "", lessen: !!r.lessen });
  }
  if (a === "boek-open") {
    if (!m) return;
    st.boek = { adres: m.adres, soorten: m.soorten || [], soort: 0, naam: gesprekNaam(st, st.gesprek), herhaal: "", aantal: 4, notitie: "" };
    st.paneel = "boeken"; st.naarOnder = true;
    return boekDagen(st);
  }
  if (a === "boek-rooster") {
    if (!m) return;
    st.rooster = { adres: m.adres, naam: gesprekNaam(st, st.gesprek), lessen: null };
    st.paneel = "rooster"; st.naarOnder = true; toon(st);
    const r = await rpc(st, "chat_rooster", { p_adres: m.adres });
    st.rooster.lessen = r.lessen; st.rooster.naam = r.naam || st.rooster.naam;
    return toon(st);
  }
  if (a === "boek-les" && st.rooster) {
    const les = (st.rooster.lessen || []).find((x) => x.id === Number(el.dataset.id));
    if (!les) return;
    const aan = !les.mijn || les.mijn === "afgemeld";
    const r = await rpc(st, "chat_les", { p_les: les.id, p_aan: aan });
    Object.assign(les, r.les, { mijn: r.status });
    if (aan) {
      st.zet("boeking", { n: Date.now(), titel: `${les.naam} · ${st.rooster.naam}`, starts: [les.start], ids: [`les:${les.id}`],
                          minuten: les.minuten, plaats: les.locatie || "", met: st.rooster.naam, status: r.status === "wachtlijst" ? "aangevraagd" : "bevestigd" });
      melding(st, r.status === "wachtlijst" ? T("De les is vol. Je staat op de wachtlijst.") : T("Ingeschreven en in je agenda gezet."));
    } else {
      st.zet("boekingweg", { n: Date.now(), ids: [`les:${les.id}`] });
      melding(st, T("Afgemeld."));
    }
    return toon(st);
  }
  if (!st.boek && ["boek-soort", "boek-dag", "boek-tijd", "boek-stuur"].includes(a)) return;
  if (a === "boek-soort") { st.boek.soort = Number(el.dataset.k); return boekDagen(st); }
  if (a === "boek-dag") { st.boek.dag = el.dataset.d; return boekTijden(st); }
  if (a === "boek-tijd") { st.boek.tijd = el.dataset.t; return toon(st); }
  if (a === "boek-stuur") {
    const bk = st.boek;
    const herhaal = v("#c-bk-herhaal"); const aantal = herhaal ? Number(v("#c-bk-aantal")) || 4 : 1;
    const metApp = bk.app_betalen && ((bk.soorten[bk.soort] || {}).prijs || 0) > 0;
    const venster = metApp ? window.open("", "_blank") : null;
    let r;
    try {
      r = await rpc(st, "chat_boeken", { p_adres: bk.adres, p_soort: bk.soort, p_start: bk.tijd, p_herhaal: herhaal,
                                         p_aantal: aantal, p_notitie: v("#c-bk-notitie").trim() });
    } catch (fout) {
      if (venster) venster.close();
      throw fout;
    }
    st.paneel = null; st.boek = null;
    st.zet("boeking", { n: Date.now(), titel: `${r.soort} · ${r.naam}`, starts: r.starts, ids: r.ids, minuten: r.minuten,
                        plaats: r.locatie || "", met: r.naam, status: r.status });
    st.boekTijd = 0;
    const id = b64(rnd(9));
    await versturen(st, { t: "boeking", id, adres: bk.adres, ids: r.ids, starts: r.starts, soort: r.soort, minuten: r.minuten,
                          prijs: r.prijs, naam: r.naam, locatie: r.locatie || "", status: r.status });
    if (r.app_betalen) {
      melding(st, T("Betaal binnen 30 minuten, dan is je boeking bevestigd."));
      try {
        const b = await betaalFunctie(st, "boeking_afrekenen", { boekingen: r.ids });
        if (venster) venster.location.href = b.url; else window.location.href = b.url;
      } catch (fout) {
        if (venster) venster.close();
        melding(st, fout.message);
      }
      return;
    }
    if (venster) venster.close();
    melding(st, r.overgeslagen.length ? T("Geboekt. {} keer was niet vrij en is overgeslagen.", r.overgeslagen.length)
      : r.status === "aangevraagd" ? T("Aangevraagd. Je krijgt bericht als het bevestigd is.") : T("Geboekt en in je agenda gezet."));
    if (r.prijs > 0 && r.betalen) {
      st.betaalBericht = { boekingIds: r.ids, bericht: { id, bedrag: r.prijs * r.ids.length, naam: r.betalen.naam, iban: r.betalen.iban,
                                                          link: r.betalen.link, omschrijving: `${r.soort} ${r.starts.length > 1 ? `${r.starts.length}x` : dag(new Date(r.starts[0]))}`.slice(0, 80) } };
      st.paneel = "betalen"; toon(st);
    }
    return;
  }
  if (!m) return;
  const ids = (m.ids || []).map(Number);
  if (a === "boek-betalen") {
    const s = ids.map((id) => st.boekStatus.get(id)).filter(Boolean);
    if (s.some((x) => x.geld === "open")) {
      await betaalVenster(st, s.filter((x) => x.geld === "open").map((x) => x.id));
      st.boekTijd = 0;
      return;
    }
    const actief = s.filter((x) => ["aangevraagd", "bevestigd"].includes(x.status));
    const info = s.length && s[0].betalen;
    if (!info) return melding(st, T("Vraag de aanbieder hoe je kunt betalen."));
    st.betaalBericht = { boekingIds: ids, bericht: { id: m.id, bedrag: (m.prijs || 0) * actief.length, naam: info.naam, iban: info.iban, link: info.link,
                                                      omschrijving: `${m.soort} ${ids.length > 1 ? `${actief.length}x` : dag(new Date(m.starts[0]))}`.slice(0, 80) } };
    st.paneel = "betalen"; return toon(st);
  }
  if (a === "boek-annuleer") {
    const s = ids.map((id) => st.boekStatus.get(id)).filter((x) => x && ["aangevraagd", "bevestigd"].includes(x.status) && new Date(x.start) > new Date());
    const regel = s.length && s[0].annuleren;
    const betaald = s.filter((x) => x.geld === "betaald");
    let terug = 0;
    for (const x of betaald) {
      const op_tijd = !regel || !regel.uren || new Date(x.start) - new Date() >= regel.uren * 3600000;
      terug += op_tijd ? x.prijs : x.prijs - Math.round(x.prijs * regel.procent / 100);
    }
    const vraag = betaald.length ? T("Alle komende keren annuleren? Je krijgt {} terug.", bedragTekst(terug)) : T("Alle komende keren annuleren?");
    if (!confirm(vraag)) return;
    const r = await rpc(st, "chat_boeking_klant", { p_ids: ids, p_actie: "annuleren" });
    if (r.betaald) betaalFunctie(st, "boekingen_verrekenen").catch(() => {});
    st.boekTijd = 0; await boekStatusLaden(st, true);
    melding(st, r.betaald ? T("{} keer geannuleerd. Je krijgt {} terug op je rekening.", r.aantal, bedragTekst(r.terug))
      : T("{} keer geannuleerd.", r.aantal)); return toon(st);
  }
  if (a === "boek-ja" || a === "boek-nee") {
    const r = await rpc(st, "chat_boeking_afhandelen", { p_ids: ids, p_actie: a === "boek-ja" ? "bevestigen" : "afwijzen" });
    if (a === "boek-nee" && ids.some((id) => (st.boekStatus.get(id) || {}).geld === "betaald")) betaalFunctie(st, "boekingen_verrekenen").catch(() => {});
    await boekStatusLaden(st, true);
    melding(st, a === "boek-ja" ? T("Bevestigd. Het staat in je agenda.") : T("Afgewezen."));
    if (r.ok) await versturen(st, { t: "tekst", tekst: a === "boek-ja" ? T("Je boeking is bevestigd: {}", m.soort) : T("Je boeking kan helaas niet doorgaan: {}", m.soort) });
    return toon(st);
  }
  if (a === "boek-ontvangen") {
    await rpc(st, "zaak_betaling_ontvangen", { p_ids: ids, p_bedrag: null });
    st.ontvangen = st.ontvangen || new Set(); st.ontvangen.add(m.id);
    melding(st, T("Staat in je boekhouding.")); return toon(st);
  }
}

async function versturen(st, bericht) {
  const g = st.gesprek;
  if (!st.sleutelLijst || !st.sleutelLijst.length) await sleutelsLaden(st);
  const pakket = await versleutel(st, g.id, st.sleutelLijst, bericht);
  const r = await rpc(st, "chat_versturen", { p_gesprek: g.id, p_apparaat: st.apparaat, p_inhoud: pakket.inhoud, p_iv: pakket.iv,
                                              p_epk: pakket.epk, p_sleutels: pakket.sleutels, p_handtekening: pakket.handtekening });
  st.paneel = null; st.menu = null;
  if (!SKIP.has(bericht.t)) st.naarOnder = true;
  await berichtenLaden(st);
  toon(st);
  return r.id;
}

async function gesprekVernieuwen(st) {
  st.gesprek = (await rpc(st, "chat_berichten", { p_gesprek: st.gesprek.id, p_na: 2 ** 52, p_apparaat: st.apparaat })).gesprek;
}

async function instellen(st, w) {
  try {
    await rpc(st, "chat_instellen", { p_gesprek: st.gesprek.id, p_verdwijnen: null, p_stil: null, p_groepsnaam: null, ...w });
    st.gesprek = (await rpc(st, "chat_berichten", { p_gesprek: st.gesprek.id, p_na: 2 ** 52, p_apparaat: st.apparaat })).gesprek;
  } catch (e) { melding(st, e.message); }
}

function melding(st, tekst) {
  let m = st.wortel.querySelector(".c-melding");
  if (!m) { m = document.createElement("div"); m.className = "c-melding"; st.wortel.appendChild(m); }
  m.textContent = tekst;
  clearTimeout(st.meldingKlok);
  st.meldingKlok = setTimeout(() => m.remove(), 4000);
}

function lokaal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function actie(st, a, el) {
  const v = (id) => (st.wortel.querySelector(id) || {}).value || "";
  try {
    if (a === "opnieuw") { st.fout = null; return start(st); }
    if (a !== "blad") st.blad = null;
    if (a === "blad") { st.blad = "nieuw"; return toon(st); }
    if (a === "blad-dicht") return toon(st);
    if (a === "lijstfilter") { st.lijstFilter = el.dataset.f; return toon(st); }
    if (a === "cnieuw") { st.scherm = "cnieuw"; return toon(st); }
    if (a === "community") {
      st.communityId = Number(el.dataset.id); st.scherm = "community"; st.gesprek = null; toon(st);
      await gesprekkenLaden(st); return toon(st);
    }
    if (a === "cinfo") {
      st.cinfoTerug = st.scherm === "gesprek" ? "gesprek" : "community";
      if (st.scherm === "gesprek") st.communityId = st.gesprek.community;
      st.cinfo = null; st.scherm = "cinfo"; toon(st); await cinfoLaden(st); return toon(st);
    }
    if (a === "cterug") {
      st.scherm = st.cinfoTerug || "community"; st.naarOnder = true;
      if (st.scherm === "community") await gesprekkenLaden(st);
      return toon(st);
    }
    if (a === "c-maken") {
      const r = await rpc(st, "chat_community_maken", { p_community: v("#c-n-naam"), p_omschrijving: v("#c-n-omschr") });
      await gesprekkenLaden(st); st.communityId = r.id; st.scherm = "community"; toon(st);
      melding(st, T("Community gemaakt. Nodig mensen uit met de knop hieronder."));
      return;
    }
    if (a === "c-meedoen") {
      const r = await rpc(st, "chat_community_deelnemen", { p_code: v("#c-n-code") });
      await gesprekkenLaden(st); st.communityId = r.id; st.scherm = "community"; toon(st);
      melding(st, T("Welkom bij {}.", r.naam));
      return;
    }
    if (a === "c-ja" || a === "c-nee" || a === "c-verlaten") {
      if (a === "c-verlaten" && !confirm(T("Deze community verlaten? Je ziet de kanalen dan niet meer."))) return;
      await rpc(st, "chat_community_antwoorden", { p_community: st.communityId, p_antwoord: { "c-ja": "ja", "c-nee": "nee", "c-verlaten": "verlaten" }[a] });
      await gesprekkenLaden(st);
      st.scherm = a === "c-ja" ? "community" : "lijst"; return toon(st);
    }
    if (a === "c-opheffen") {
      if (!confirm(T("De community opheffen? Alle kanalen en berichten verdwijnen, voor iedereen."))) return;
      await rpc(st, "chat_community_instellen", { p_community: st.communityId, p_titel: null, p_omschrijving: null,
                                                  p_code_aan: null, p_nieuwe_code: null, p_opheffen: true });
      await gesprekkenLaden(st); st.scherm = "lijst"; return toon(st);
    }
    if (a === "c-opslaan" || a === "c-code-aan" || a === "c-nieuwe-code") {
      if (a === "c-nieuwe-code" && !confirm(T("Een nieuwe code maken? De oude werkt dan niet meer."))) return;
      await rpc(st, "chat_community_instellen", { p_community: st.communityId,
        p_titel: a === "c-opslaan" ? v("#c-c-naam") : null, p_omschrijving: a === "c-opslaan" ? v("#c-c-omschr") : null,
        p_code_aan: a === "c-code-aan" ? el.checked : null, p_nieuwe_code: a === "c-nieuwe-code", p_opheffen: false });
      await cinfoLaden(st); toon(st);
      if (a === "c-opslaan") melding(st, T("Opgeslagen."));
      return;
    }
    if (a === "c-delen") {
      const c = st.cinfo;
      const tekst = T("Doe mee met {} in de chat van de Assistent-app. Open Chat, tik op het potlood en kies \"Community maken of meedoen\". Code: {}", c.naam, codeTekst(c.code));
      if (navigator.share) { try { await navigator.share({ title: c.naam, text: tekst }); } catch (e) { /* geannuleerd */ } return; }
      await navigator.clipboard.writeText(tekst); melding(st, T("Gekopieerd.")); return;
    }
    if (a === "c-uitnodigen") {
      const r = await rpc(st, "chat_community_uitnodigen", { p_community: st.communityId, p_wie: v("#c-c-wie") });
      await cinfoLaden(st); toon(st);
      melding(st, r.status === "lid" ? T("Doet nu mee.") : T("Uitnodiging verstuurd."));
      return;
    }
    if (a === "c-rol") {
      const actieNaam = el.value; el.value = "";
      if (!actieNaam) return;
      const vraag = { eigenaar: T("{} eigenaar maken? Jij wordt dan beheerder.", el.dataset.naam),
                      verwijderen: T("{} uit de community halen?", el.dataset.naam),
                      weren: T("{} weren? Diegene kan dan ook niet terug met de code.", el.dataset.naam) }[actieNaam];
      if (vraag && !confirm(vraag)) return;
      await rpc(st, "chat_community_lid", { p_community: st.communityId, p_wie: Number(el.dataset.wie), p_actie: actieNaam });
      await cinfoLaden(st); return toon(st);
    }
    if (a === "kanaal-maken") {
      await rpc(st, "chat_kanaal_maken", { p_community: st.communityId, p_kanaal: v("#c-k-naam"),
                                           p_alleen_beheer: Boolean((st.wortel.querySelector("#c-k-alleen") || {}).checked) });
      await cinfoLaden(st); return toon(st);
    }
    if (a === "kanaal-weg") {
      if (!confirm(T("#{} weghalen? De berichten erin verdwijnen voor iedereen.", el.dataset.naam))) return;
      await rpc(st, "chat_kanaal_instellen", { p_kanaal: Number(el.dataset.id), p_titel: null, p_alleen_beheer: null, p_weg: true });
      await cinfoLaden(st); return toon(st);
    }
    if (a === "menu-dicht") { st.menu = null; return toon(st); }
    if (a === "emoji") {
      const id = Number(el.dataset.b);
      const nu = (st.emoji.get(id) || new Map()).get(st.ik);
      st.menu = null;
      return versturen(st, { t: "emoji", op: id, emoji: nu === el.dataset.e ? "" : el.dataset.e });
    }
    if (a === "beantwoord") {
      const b = st.berichten.find((x) => x.id === st.menu);
      const lid = st.gesprek.leden.find((l) => l.id === b.afzender);
      st.antwoord = { id: b.id, naam: b.afzender === st.ik ? "Jij" : (lid ? lid.naam : ""), tekst: korteInhoud(b.bericht, NL) };
      st.menu = null; st.focus = true; return toon(st);
    }
    if (a === "antwoord-weg") { st.antwoord = null; return toon(st); }
    if (a === "vastzetten") {
      const id = st.menu; st.menu = null;
      await rpc(st, "chat_vastzetten", { p_bericht: id, p_aan: !(st.gesprek.vast || []).includes(id) });
      await gesprekVernieuwen(st); st.vastStap = 0; return toon(st);
    }
    if (a === "vast-volgende" || a === "naar") {
      const id = Number(el.dataset.b);
      if (!st.wortel.querySelector(`#c-b-${id}`)) { melding(st, T("Dit bericht is niet meer in beeld.")); return; }
      st.wortel.querySelector(`#c-b-${id}`).scrollIntoView({ block: "center" });
      if (a === "vast-volgende") { st.vastStap = (st.vastStap || 0) + 1; toon(st); }
      const doel = st.wortel.querySelector(`#c-b-${id}`);
      doel.classList.add("c-flits"); setTimeout(() => doel.classList.remove("c-flits"), 1500);
      return;
    }
    if (a === "kopieer") {
      const b = st.berichten.find((x) => x.id === st.menu); st.menu = null; toon(st);
      await navigator.clipboard.writeText(b.bericht.tekst); melding(st, T("Gekopieerd.")); return;
    }
    if (a === "verwijder") {
      const id = st.menu; st.menu = null; toon(st);
      if (!confirm(T("Dit bericht voor iedereen verwijderen?"))) return;
      if (!await rpc(st, "chat_bericht_weg", { p_bericht: id })) { melding(st, T("Dat kan niet.")); return; }
      const b = st.berichten.find((x) => x.id === id); if (b) { b.weg = true; b.bericht = null; }
      return toon(st);
    }
    if (a === "vermeld") {
      const veld = st.wortel.querySelector("#c-tekst");
      const voor = veld.value.slice(0, veld.selectionStart).replace(/@([a-z0-9._-]*)$/i, `@${el.dataset.naam} `);
      veld.value = voor + veld.value.slice(veld.selectionStart); st.concept = veld.value;
      veld.focus(); veld.setSelectionRange(voor.length, voor.length);
      st.wortel.querySelector(".c-vermeld-rij").innerHTML = "";
      return;
    }
    if (a === "peiling") { st.peiling = { vraag: "", opties: ["", ""] }; st.paneel = "peiling"; return toon(st); }
    if (a === "optie-erbij") {
      const velden = st.wortel.querySelectorAll(".c-p-optie");
      const nieuw = document.createElement("input");
      nieuw.className = "c-veld c-p-optie"; nieuw.maxLength = 80; nieuw.placeholder = T("Keuze {}", velden.length + 1);
      velden[velden.length - 1].after(nieuw); nieuw.focus();
      if (velden.length + 1 >= 8) el.remove();
      return;
    }
    if (a === "stuur-peiling") {
      peilingBewaren(st);
      const vraag = st.peiling.vraag.trim(); const opties = st.peiling.opties.map((o) => o.trim()).filter(Boolean);
      if (!vraag || opties.length < 2) { melding(st, T("Vul een vraag en minstens twee keuzes in.")); return; }
      return versturen(st, { t: "peiling", id: b64(rnd(9)), vraag, opties });
    }
    if (a === "stem") {
      const b = st.berichten.find((x) => x.id === Number(el.dataset.b));
      if (!b || !b.bericht || st.gesprek.status !== "lid") return;
      return versturen(st, { t: "stem", op: b.bericht.id, keuze: Number(el.dataset.k) });
    }
    if (a === "lijst") { st.scherm = "lijst"; st.gesprek = null; toon(st); await gesprekkenLaden(st); return toon(st); }
    if (a === "contacten") { st.scherm = "contacten"; st.gesprek = null; toon(st); await contactenLaden(st); return toon(st); }
    if (a === "groep-nieuw") { st.scherm = "groep"; if (!st.contacten) await contactenLaden(st); return toon(st); }
    if (a === "apparaten") { st.scherm = "apparaten"; return toon(st); }
    if (a === "open") return openen(st, Number(el.dataset.id));
    if (a === "terug") { st.scherm = "gesprek"; st.naarOnder = true; return toon(st); }
    if (a === "info") { if (!st.sleutelLijst && st.gesprek.status === "lid") await sleutelsLaden(st).catch(() => {}); st.scherm = "info"; return toon(st); }
    if (a === "contact-toevoegen") {
      const naam = v("#c-nieuw-contact").trim();
      if (!naam) return;
      const r = await rpc(st, "chat_contact_toevoegen", { p_wie: naam });
      await contactenLaden(st); toon(st);
      melding(st, r.chat ? T("{} staat in je contacten.", r.naam) : T("{} staat in je contacten, maar gebruikt de chat nog niet.", r.naam));
      return;
    }
    if (a === "contact-suggestie") {
      st.wortel.querySelector("#c-nieuw-contact").value = el.dataset.naam;
      return actie(st, "contact-toevoegen");
    }
    if (a === "contact-weg") {
      if (!confirm(T("{} uit je contacten halen? Een nieuw bericht van diegene komt dan eerst als verzoek binnen.", el.dataset.naam))) return;
      await rpc(st, "chat_contact_weg", { p_wie: Number(el.dataset.id) });
      await contactenLaden(st); return toon(st);
    }
    if (a === "als-contact") {
      await rpc(st, "chat_contact_toevoegen", { p_wie: el.dataset.naam });
      await instellen(st, {}); st.contacten = null; melding(st, T("Staat in je contacten.")); return toon(st);
    }
    if (a === "chat-met") {
      const r = await rpc(st, "chat_starten", { p_met: el.dataset.naam });
      await gesprekkenLaden(st); return openen(st, r.id);
    }
    if (a === "groep") {
      const leden = [...st.wortel.querySelectorAll(".c-groep-lid:checked")].map((x) => x.value).filter(Boolean);
      if (!v("#c-groep").trim()) { melding(st, T("Geef de groep een naam.")); return; }
      if (!leden.length) { melding(st, T("Kies wie er meedoet.")); return; }
      const r = await rpc(st, "chat_groep_maken", { p_groep: v("#c-groep"), p_leden: leden });
      await gesprekkenLaden(st); await openen(st, r.id);
      if (r.niet_gevonden && r.niet_gevonden.length) melding(st, T("Niet toegevoegd: {}", r.niet_gevonden.join(", ")));
      return;
    }
    if (a === "stuur") {
      const veld = st.wortel.querySelector("#c-tekst");
      const tekst = (veld ? veld.value : "").trim();
      if (!tekst) return;
      st.concept = ""; veld.value = ""; st.focus = true;
      const bericht = { t: "tekst", tekst };
      if (st.antwoord) { bericht.antwoord = st.antwoord; st.antwoord = null; }
      const genoemd = st.gesprek.soort === "groep" ? st.gesprek.leden.filter((l) => l.id !== st.ik && l.gebruikersnaam
        && new RegExp(`@${l.gebruikersnaam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9._-])`, "i").test(tekst)).map((l) => l.id) : [];
      const id = await versturen(st, bericht);
      if (id && genoemd.length) rpc(st, "chat_vermelden", { p_bericht: id, p_wie: genoemd }).catch(() => {});
      return;
    }
    if (a === "plus") { st.paneel = st.paneel === "plus" ? null : "plus"; st.naarOnder = true; return toon(st); }
    if (a === "sluit") { st.paneel = null; return toon(st); }
    if (a === "foto") { st.wortel.querySelector("#c-foto").click(); return; }
    if (a === "afspraak") {
      const morgen = new Date(); morgen.setDate(morgen.getDate() + 1); morgen.setHours(19, 0, 0, 0);
      st.voorstel = { start: lokaal(morgen) }; st.paneel = "afspraak"; return toon(st);
    }
    if (a === "kies") { st.voorstel = { start: el.dataset.m.slice(0, 16) }; st.paneel = "afspraak"; return toon(st); }
    if (a === "vrij") {
      if (!st.vrij.length) { melding(st, T("Je hebt de komende week geen vrije momenten in je agenda.")); return; }
      return versturen(st, { t: "vrij", momenten: st.vrij });
    }
    if (a === "stuur-afspraak") {
      const titel = v("#c-a-titel").trim(); const begin = v("#c-a-start");
      if (!titel || !begin) { melding(st, T("Vul in wat en wanneer.")); return; }
      return versturen(st, { t: "afspraak", id: b64(rnd(9)), titel, start: begin, minuten: Number(v("#c-a-duur")) || 60, plaats: v("#c-a-plaats").trim() });
    }
    if (a === "tekst-agenda") {
      const b = st.berichten.find((x) => x.id === Number(el.dataset.b));
      const gevonden = b && b.bericht && datumHerkennen(b.bericht.tekst);
      if (!gevonden) return;
      const van = (st.gesprek.leden.find((l) => l.id === b.afzender) || {}).naam || "";
      st.voorstel = { titel: gevonden.titel, start: gevonden.start, duur: 60, plaats: "", eigen: true, met: b.afzender === st.ik ? gesprekNaam(st, st.gesprek) : van };
      st.paneel = "afspraak"; return toon(st);
    }
    if (a === "eigen-agenda") {
      const titel = v("#c-a-titel").trim() || T("Afspraak");
      const begin = v("#c-a-start");
      if (!begin) return melding(st, T("Kies wanneer."));
      st.zet("agenda", { titel, start: begin, minuten: Number(v("#c-a-duur")) || 60, plaats: v("#c-a-plaats").trim(),
                         met: (st.voorstel && st.voorstel.met) || "", n: Date.now() });
      st.paneel = null; st.voorstel = {}; melding(st, T("Staat in je agenda.")); return toon(st);
    }
    if (a === "betaal") { st.paneel = "betaal"; st.betaalConcept = null; return toon(st); }
    if (a === "stuur-betaal") {
      const bedrag = Math.round(Number(v("#c-b-bedrag").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) * 100);
      const iban = v("#c-b-iban").replace(/\s+/g, "").toUpperCase();
      const link = v("#c-b-link").trim();
      if (!(bedrag > 0 && bedrag <= 1000000)) return melding(st, T("Vul een bedrag in."));
      if (iban && !ibanGoed(iban)) return melding(st, T("Dit IBAN klopt niet."));
      if (link && !veiligeLink(link)) return melding(st, T("De betaallink moet met https:// beginnen."));
      if (!iban && !link) return melding(st, T("Vul je IBAN of een betaallink in."));
      const naam = v("#c-b-naam").trim().slice(0, 70);
      bewaren("iban", iban); bewaren("rekeningnaam", naam); bewaren("betaallink", link);
      st.paneel = null;
      return versturen(st, { t: "betaal", id: b64(rnd(9)), bedrag, omschrijving: v("#c-b-oms").trim().slice(0, 80), iban, naam, link });
    }
    if (a === "betalen") {
      st.betaalBericht = st.berichten.find((x) => x.id === Number(el.dataset.b));
      if (!st.betaalBericht || !st.betaalBericht.bericht) return;
      st.paneel = "betalen"; return toon(st);
    }
    if (a === "kopieer") {
      try { await navigator.clipboard.writeText(el.dataset.w); melding(st, T("Gekopieerd.")); } catch (e) { melding(st, el.dataset.w); }
      return;
    }
    if (a === "ik-betaalde") {
      const m = st.betaalBericht && st.betaalBericht.bericht;
      st.paneel = null;
      if (!m) return toon(st);
      if (st.betaalBericht.boekingIds) {
        await rpc(st, "chat_boeking_klant", { p_ids: st.betaalBericht.boekingIds, p_actie: "betaald" });
        st.boekTijd = 0;
      }
      return versturen(st, { t: "betaald", op: m.id });
    }
    if (a.startsWith("boek-") || a === "diensten") return boekActie(st, a, el, v);
    if (a === "agenda" || a === "kanniet") {
      const b = st.berichten.find((x) => x.id === Number(el.dataset.b));
      if (!b || !b.bericht) return;
      const m = b.bericht;
      if (a === "agenda") {
        const van = (st.gesprek.leden.find((l) => l.id === b.afzender) || {}).naam || "";
        st.zet("agenda", { titel: m.titel, start: m.start, minuten: m.minuten || 60, plaats: m.plaats || "",
                           met: b.afzender === st.ik ? gesprekNaam(st, st.gesprek) : van, n: Date.now() });
        melding(st, T("Staat in je agenda."));
      }
      if (b.afzender !== st.ik) await versturen(st, { t: "reactie", op: m.id, antwoord: a === "agenda" ? "ja" : "nee", titel: m.titel });
      return;
    }
    if (a === "menu") { st.menu = Number(el.dataset.menu); st.paneel = null; return toon(st); }
    if (a === "ja" || a === "nee") {
      await rpc(st, "chat_antwoorden", { p_gesprek: st.gesprek.id, p_antwoord: a });
      if (a === "nee") return actie(st, "lijst");
      await gesprekkenLaden(st); st.contacten = null; return openen(st, st.gesprek.id);
    }
    if (a === "verlaten") {
      if (!confirm(T("Weet je het zeker?"))) return;
      await rpc(st, "chat_antwoorden", { p_gesprek: st.gesprek.id, p_antwoord: st.gesprek.status === "verzoek" ? "nee" : "verlaten" });
      return actie(st, "lijst");
    }
    if (a === "blokkeer") {
      const ander = st.gesprek.leden.find((l) => l.id !== st.ik);
      if (!ander || !confirm(T("{} blokkeren? Jullie kunnen elkaar dan geen berichten meer sturen.", ander.naam))) return;
      await rpc(st, "chat_blokkeren", { p_wie: ander.id, p_aan: true });
      st.contacten = null;
      return actie(st, "lijst");
    }
    if (a === "toevoegen") {
      await rpc(st, "chat_lid_toevoegen", { p_gesprek: st.gesprek.id, p_wie: v("#c-toevoegen") });
      await instellen(st, {}); st.sleutelLijst = null; return toon(st);
    }
    if (a === "gecontroleerd") {
      const ander = st.gesprek.leden.find((l) => l.id !== st.ik);
      await idbPut("geverifieerd", `${st.ik}:${ander.id}`, el.dataset.code);
      st.sleutelsVeranderd = false; melding(st, T("Opgeslagen. Verandert de code, dan zie je een waarschuwing."));
      return;
    }
    if (a === "apparaat-weg") {
      if (!confirm(T("Dit apparaat weghalen? Het kan daarna geen nieuwe berichten meer lezen."))) return;
      await rpc(st, "chat_apparaat_weg", { p_apparaat: Number(el.dataset.id) });
      return toon(st);
    }
  } catch (e) {
    melding(st, e.message || T("Er ging iets mis."));
  }
}

// --- Opstarten en bijhouden --------------------------------------------------------------------------------------

async function start(st) {
  try {
    const sleutelNaam = `apparaat:${st.naam || "eigenaar"}`;
    let opgeslagen = await idbGet("sleutels", sleutelNaam);
    let ik = opgeslagen ? await rpc(st, "chat_ik", { p_apparaat: opgeslagen.apparaat }) : null;
    if (!opgeslagen || !ik.apparaat_geldig) {
      const nieuw = await nieuwApparaat();
      const r = await rpc(st, "chat_apparaat_aanmelden", { p_apparaat: st.label, p_ecdh: nieuw.ecdhJwk,
                                                         p_teken: nieuw.tekenJwk, p_vingerafdruk: nieuw.vinger });
      opgeslagen = { apparaat: r.id, gebruiker: r.gebruiker, sleutels: { ecdh: nieuw.ecdh, teken: nieuw.teken } };
      await idbPut("sleutels", sleutelNaam, opgeslagen);
      ik = await rpc(st, "chat_ik", { p_apparaat: r.id });
    }
    st.apparaat = opgeslagen.apparaat; st.sleutels = opgeslagen.sleutels; st.ik = ik.gebruiker;
    await gesprekkenLaden(st);
    st.klaar = true;
    if (st.open) { const id = st.open; st.open = null; return openen(st, id); }
    toon(st);
  } catch (e) {
    st.fout = e.message || T("De chat kon niet starten.");
    toon(st);
  }
}

function bijhouden(st) {
  clearTimeout(st.klok);
  st.klok = setTimeout(async () => {
    if (!st.wortel.isConnected) return;
    if (document.visibilityState === "visible" && st.klaar && !st.bezig) {
      st.bezig = true;
      try {
        if (st.scherm === "gesprek" && st.gesprek) { if (await berichtenLaden(st)) toon(st); }
        else if (st.scherm === "lijst" && !st.blad) { await gesprekkenLaden(st); toon(st); }
        else if (st.scherm === "community") { await gesprekkenLaden(st); toon(st); }
      } catch (e) { /* volgende keer opnieuw */ }
      st.bezig = false;
    }
    bijhouden(st);
  }, st.scherm === "gesprek" ? 2500 : 8000);
}

// Zoals WhatsApp: de pagina zelf schuift niet, alleen de berichten. Het chatvenster vult precies de ruimte
// onder de kopbalk, ook als het toetsenbord opent (visualViewport).
function vastzetten(wortel) {
  // Zoals een echte chat-app: het venster staat vast op het scherm, alleen de berichten schuiven.
  // Op iPhone helpt overflow: hidden niet genoeg; daarom staat het venster vast (position: fixed) en houden we
  // veegbewegingen tegen die niet in een lijst met berichten of gesprekken vallen.
  const scrollers = [document.documentElement, document.body,
    ...document.querySelectorAll('[data-testid="stMain"], [data-testid="stAppViewContainer"], section.main')];
  const oud = scrollers.map((el) => [el, el.style.overflow, el.style.overscrollBehavior]);
  for (const el of scrollers) { el.scrollTop = 0; el.style.overflow = "hidden"; el.style.overscrollBehavior = "none"; }
  window.scrollTo(0, 0);
  const plek = wortel.parentElement;
  const passen = () => {
    if (window.scrollY) window.scrollTo(0, 0);
    const vv = window.visualViewport;
    const kop = document.querySelector(".st-key-kopbalk");
    const kopOnder = kop ? kop.getBoundingClientRect().bottom + 6 : 0;
    const boven = Math.max(kopOnder, vv ? vv.offsetTop : 0);
    const onder = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const smal = window.innerWidth < 700;
    const r = plek.getBoundingClientRect();
    Object.assign(wortel.style, {
      position: "fixed", top: boven + "px", height: Math.max(240, Math.floor(onder - boven)) + "px",
      left: (smal ? 0 : r.left) + "px", width: (smal ? window.innerWidth : r.width) + "px", zIndex: 50,
    });
    wortel.classList.toggle("c-vol", smal);
  };
  const scrolltNog = (e, dy) => {
    for (const el of e.composedPath()) {
      if (el === wortel || !(el instanceof Element)) break;
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if (dy < 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) return false;  // al onderaan
        if (dy > 0 && el.scrollTop <= 0) return false;  // al bovenaan
        return true;
      }
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
    }
    return false;
  };
  let startX = 0, startY = 0;
  const begin = (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
  const beweeg = (e) => {
    if (e.touches.length > 1) return;  // inzoomen mag
    const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) return;  // opzij vegen (zoals door de filters) mag
    if (!scrolltNog(e, dy)) e.preventDefault();
  };
  wortel.addEventListener("touchstart", begin, { passive: true });
  wortel.addEventListener("touchmove", beweeg, { passive: false });
  passen();
  const vv = window.visualViewport;
  window.addEventListener("resize", passen);
  window.addEventListener("scroll", passen);
  if (vv) { vv.addEventListener("resize", passen); vv.addEventListener("scroll", passen); }
  const later = [setTimeout(passen, 300), setTimeout(passen, 1200)];
  return () => {
    later.forEach(clearTimeout);
    wortel.removeEventListener("touchstart", begin);
    wortel.removeEventListener("touchmove", beweeg);
    window.removeEventListener("resize", passen);
    window.removeEventListener("scroll", passen);
    if (vv) { vv.removeEventListener("resize", passen); vv.removeEventListener("scroll", passen); }
    for (const [el, overflow, overscroll] of oud) { el.style.overflow = overflow; el.style.overscrollBehavior = overscroll; }
    for (const k of ["position", "top", "height", "left", "width", "zIndex"]) wortel.style[k] = "";
    wortel.classList.remove("c-vol");
  };
}

export default function (component) {
  const { data, setTriggerValue, parentElement } = component;
  const taalVoor = TAAL;
  TAAL = (data && data.taal && typeof data.taal === "object") ? data.taal : {};
  let st = parentElement.__chat;
  const wortel = parentElement.querySelector(".c-wortel");
  if (!st || st.naam !== data.naam || st.token !== data.token) {
    st = parentElement.__chat = {
      url: data.url, key: data.key, naam: data.naam, token: data.token, label: data.label, wortel,
      scherm: "lijst", gesprekken: [], communities: [], berichten: [], reacties: new Map(), emoji: new Map(), stemmen: new Map(),
      voorbeelden: new Map(), betaald: new Map(), peiling: { vraag: "", opties: ["", ""] },
      vrij: data.vrij || [], open: data.open || null, contacten: null,
    };
    wortel.addEventListener("input", (e) => {
      if (e.target.id === "c-lijst-zoek") { st.lijstZoek = e.target.value; lijstFilteren(st); }
    });
    wortel.addEventListener("click", (e) => {
      const el = e.target.closest("[data-a]");
      if (el && !el.disabled) actie(st, el.dataset.a, el);
    });
    // Lang op je eigen bericht drukken: verwijderen (zoals in WhatsApp).
    let druk = null;
    wortel.addEventListener("pointerdown", (e) => {
      const el = e.target.closest("[data-menu]");
      if (!el || e.target.closest("button")) return;
      druk = setTimeout(() => { druk = null; actie(st, "menu", el); }, 600);
    });
    for (const soort of ["pointerup", "pointercancel", "pointerleave", "scroll"]) {
      wortel.addEventListener(soort, () => { clearTimeout(druk); druk = null; }, true);
    }
    wortel.addEventListener("contextmenu", (e) => {
      const el = e.target.closest("[data-menu]");
      if (!el) return;
      e.preventDefault();
      if (!e.target.closest("button")) actie(st, "menu", el);
    });
    start(st);
  }
  st.wortel = wortel;
  st.vrij = data.vrij || [];
  if (st.klaar && JSON.stringify(taalVoor) !== JSON.stringify(TAAL)) toon(st);  // andere taal: meteen opnieuw tekenen
  st.zet = setTriggerValue;
  bijhouden(st);
  if (st.losmaken && st.vastOp !== wortel) { st.losmaken(); st.losmaken = null; }
  if (!st.losmaken) { st.losmaken = vastzetten(wortel); st.vastOp = wortel; }
  return () => { if (st.losmaken) { st.losmaken(); st.losmaken = null; } };
}
