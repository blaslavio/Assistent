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

// --- Opslag op dit apparaat --------------------------------------------------------------------------------------

function idb() {
  if (!window.__chatDb) {
    window.__chatDb = new Promise((klaar, mis) => {
      const r = indexedDB.open("assistent-chat", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("sleutels"); r.result.createObjectStore("geverifieerd"); };
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
  if (!r.ok) throw new Error(`Verbinding mislukt (${r.status})`);
  const j = await r.json();
  if (j && j.geen_toegang) throw new Error("Je bent uitgelogd. Herlaad de app.");
  if (j && j.fout) throw new Error(j.fout);
  return j;
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
  if (d.toDateString() === nu.toDateString()) return "Vandaag";
  const gisteren = new Date(nu); gisteren.setDate(nu.getDate() - 1);
  if (d.toDateString() === gisteren.toDateString()) return "Gisteren";
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
};
const wanneer = (lokaal) => { const d = new Date(lokaal); return `${dag(d)} ${tijd(d)}`; };
const VERDWIJNEN = { 0: "Uit", 3600: "1 uur", 86400: "24 uur", 604800: "7 dagen", 7776000: "90 dagen" };

function gesprekNaam(st, g) {
  if (g.soort === "groep") return g.naam;
  const ander = g.leden.find((l) => l.id !== st.ik);
  return ander ? ander.naam : "Gesprek";
}

function toon(st) {
  const w = st.wortel;
  if (st.fout) {
    w.innerHTML = `<div class="c-fout">${esc(st.fout)}</div><button class="c-knop" data-a="opnieuw">Opnieuw proberen</button>`;
    return;
  }
  if (!st.klaar) { w.innerHTML = `<div class="c-leeg">Chat beveiligen...</div>`; return; }
  if (st.scherm === "gesprek") return toonGesprek(st);
  if (st.scherm === "nieuw") return toonNieuw(st);
  if (st.scherm === "info") return toonInfo(st);
  if (st.scherm === "apparaten") return toonApparaten(st);
  toonLijst(st);
}

function toonLijst(st) {
  const items = st.gesprekken.map((g) => `
    <button class="c-item" data-a="open" data-id="${g.id}">
      <span class="c-avatar">${esc(gesprekNaam(st, g).slice(0, 1).toUpperCase())}</span>
      <span class="c-item-tekst"><b>${esc(gesprekNaam(st, g))}</b>
        <small>${g.status === "verzoek" ? "Wil met je chatten" : (g.soort === "groep" ? `${g.leden.length} deelnemers` : "Versleuteld")}</small></span>
      <span class="c-item-rechts"><small>${esc(dag(g.laatst))}</small>${g.ongelezen ? `<span class="c-badge">${g.ongelezen}</span>` : ""}</span>
    </button>`).join("");
  st.wortel.innerHTML = `
    <div class="c-kop"><b>Chats</b><span class="c-ruimte"></span>
      <button class="c-knop" data-a="apparaten" title="Beveiliging">Beveiliging</button>
      <button class="c-knop c-hoofd" data-a="nieuw">Nieuw</button></div>
    ${items || `<div class="c-leeg">Nog geen gesprekken. Tik op Nieuw en vul een gebruikersnaam in.</div>`}
    <div class="c-voet">Berichten zijn end-to-end versleuteld: alleen jij en de mensen in het gesprek kunnen ze lezen.</div>`;
}

function toonNieuw(st) {
  st.wortel.innerHTML = `
    <div class="c-kop"><button class="c-knop" data-a="lijst">Terug</button><b>Nieuw gesprek</b></div>
    <label>Gebruikersnaam<input class="c-veld" id="c-met" placeholder="bijvoorbeeld sanne" autocapitalize="none"></label>
    <button class="c-knop c-hoofd c-breed" data-a="starten">Chatten</button>
    <div class="c-scheid">Of maak een groep</div>
    <label>Naam van de groep<input class="c-veld" id="c-groep" placeholder="bijvoorbeeld Familie"></label>
    <label>Wie? (gebruikersnamen, met komma's)<input class="c-veld" id="c-leden" autocapitalize="none"></label>
    <button class="c-knop c-breed" data-a="groep">Groep maken</button>`;
}

function berichtHtml(st, g, b) {
  const mijn = b.afzender === st.ik;
  const afzender = g.leden.find((l) => l.id === b.afzender);
  const naam = g.soort === "groep" && !mijn ? `<div class="c-naam">${esc(afzender ? afzender.naam : "Oud lid")}</div>` : "";
  let inhoud;
  if (b.weg) inhoud = `<i class="c-grijs">Dit bericht is verwijderd.</i>`;
  else if (b.fout === "geen_sleutel") inhoud = `<i class="c-grijs">Verstuurd voordat dit apparaat werd aangemeld. Lees het op je andere apparaat.</i>`;
  else if (b.fout) inhoud = `<i class="c-waarschuwing">Dit bericht kon niet worden gecontroleerd en wordt niet getoond.</i>`;
  else if (!b.bericht) inhoud = `<i class="c-grijs">...</i>`;
  else {
    const m = b.bericht;
    if (m.t === "tekst") inhoud = esc(m.tekst).replace(/\n/g, "<br>");
    else if (m.t === "foto") inhoud = `<img src="${esc(m.data)}" alt="Foto">${m.tekst ? `<div>${esc(m.tekst)}</div>` : ""}`;
    else if (m.t === "afspraak") {
      const reacties = st.reacties.get(m.id) || [];
      inhoud = `<div class="c-kaart"><small>Afspraak voorgesteld</small><b>${esc(m.titel)}</b>
        <div>${esc(wanneer(m.start))}${m.plaats ? ` · ${esc(m.plaats)}` : ""}</div>
        ${reacties.length ? `<small>${reacties.map((r) => `${esc(r.naam)}: ${r.antwoord === "ja" ? "kan" : "kan niet"}`).join(", ")}</small>` : ""}
        <div class="c-rij"><button class="c-knop c-hoofd" data-a="agenda" data-b="${b.id}">In mijn agenda</button>
        ${mijn ? "" : `<button class="c-knop" data-a="kanniet" data-b="${b.id}">Kan niet</button>`}</div></div>`;
    } else if (m.t === "vrij") {
      inhoud = `<div class="c-kaart"><small>Wanneer ${mijn ? "ik kan" : esc(afzender ? afzender.naam : "") + " kan"}</small>
        <div class="c-rij c-wrap">${m.momenten.map((x) => `<button class="c-pil" data-a="kies" data-m="${esc(x)}">${esc(wanneer(x))}</button>`).join("")}</div></div>`;
    } else if (m.t === "reactie") {
      inhoud = `<i class="c-grijs">${m.antwoord === "ja" ? "Komt in de agenda" : "Kan niet"}${m.titel ? `: ${esc(m.titel)}` : ""}</i>`;
    } else inhoud = `<i class="c-grijs">Onbekend bericht.</i>`;
  }
  const anderen = g.leden.filter((l) => l.id !== st.ik && l.status === "lid");
  const gelezen = mijn && anderen.length && anderen.every((l) => l.gelezen_tot >= b.id);
  const menu = mijn && !b.weg ? `<button class="c-mini" data-a="weg" data-b="${b.id}" title="Verwijderen voor iedereen">×</button>` : "";
  return `<div class="c-bericht ${mijn ? "c-mijn" : ""}">${naam}${inhoud}
    <div class="c-tijd">${b.verloopt ? "⏱ " : ""}${esc(tijd(b.aangemaakt))}${mijn ? (gelezen ? " ✓✓" : " ✓") : ""}${menu}</div></div>`;
}

function toonGesprek(st) {
  const g = st.gesprek;
  if (!g) return;
  const rijen = [];
  let vorige = "";
  for (const b of st.berichten) {
    if (b.bericht && b.bericht.t === "reactie") continue;
    const d = dag(b.aangemaakt);
    if (d !== vorige) { rijen.push(`<div class="c-dag">${esc(d)}</div>`); vorige = d; }
    rijen.push(berichtHtml(st, g, b));
  }
  const verzoek = g.status === "verzoek" ? `<div class="c-verzoek">${g.soort === "groep"
      ? `Je bent toegevoegd aan <b>${esc(g.naam)}</b>.` : `<b>${esc(gesprekNaam(st, g))}</b> wil met je chatten.`}
    <div class="c-rij"><button class="c-knop c-hoofd" data-a="ja">Accepteren</button><button class="c-knop" data-a="nee">Weigeren</button>
    ${g.soort === "twee" ? `<button class="c-knop" data-a="blokkeer">Blokkeren</button>` : ""}</div></div>` : "";
  const sleutelWaarschuwing = st.sleutelsVeranderd ? `<div class="c-verzoek">De beveiligingscode van dit gesprek is veranderd,
    bijvoorbeeld door een nieuw apparaat. <button class="c-link" data-a="info">Controleer de code</button></div>` : "";
  const oud = st.wortel.querySelector(".c-berichten");
  const onderaan = !oud || oud.scrollHeight - oud.scrollTop - oud.clientHeight < 80;
  const concept = st.wortel.querySelector("#c-tekst") ? st.wortel.querySelector("#c-tekst").value : (st.concept || "");
  const waarde = (id) => (st.wortel.querySelector(id) || {}).value;
  if (st.paneel === "afspraak" && st.wortel.querySelector("#c-a-titel")) {
    st.voorstel = { titel: waarde("#c-a-titel"), start: waarde("#c-a-start"), duur: Number(waarde("#c-a-duur")), plaats: waarde("#c-a-plaats") };
  }
  st.wortel.innerHTML = `
    <div class="c-kop"><button class="c-knop" data-a="lijst">Terug</button>
      <button class="c-titel" data-a="info"><b>${esc(gesprekNaam(st, g))}</b><small>${g.verdwijnen ? `⏱ ${VERDWIJNEN[g.verdwijnen] || ""} · ` : ""}Versleuteld · info</small></button></div>
    ${sleutelWaarschuwing}
    <div class="c-berichten">${rijen.join("") || `<div class="c-leeg">Nog geen berichten. Ze zijn end-to-end versleuteld.</div>`}</div>
    ${verzoek}
    ${st.paneel === "afspraak" ? `<div class="c-paneel">
      <label>Wat<input class="c-veld" id="c-a-titel" placeholder="Bijvoorbeeld: koffie drinken" value="${esc(st.voorstel.titel || "")}"></label>
      <div class="c-rij"><label>Wanneer<input class="c-veld" id="c-a-start" type="datetime-local" value="${esc(st.voorstel.start || "")}"></label>
      <label>Hoe lang<select class="c-veld" id="c-a-duur">${[30, 60, 90, 120, 180].map((m) => `<option value="${m}" ${m === (st.voorstel.duur || 60) ? "selected" : ""}>${m < 60 ? m + " min" : m / 60 + " uur"}</option>`).join("")}</select></label></div>
      <label>Waar (optioneel)<input class="c-veld" id="c-a-plaats" value="${esc(st.voorstel.plaats || "")}"></label>
      <div class="c-rij"><button class="c-knop c-hoofd" data-a="stuur-afspraak">Voorstellen</button><button class="c-knop" data-a="sluit">Annuleren</button></div></div>` : ""}
    ${st.paneel === "plus" ? `<div class="c-paneel c-rij c-wrap">
      <button class="c-knop" data-a="foto">Foto</button>
      <button class="c-knop" data-a="afspraak">Afspraak voorstellen</button>
      <button class="c-knop" data-a="vrij">Wanneer kan ik?</button>
      <button class="c-knop" data-a="sluit">Sluiten</button></div>` : ""}
    ${g.status === "lid" ? `<div class="c-invoer"><button class="c-rond" data-a="plus" title="Meer">+</button>
      <textarea id="c-tekst" class="c-veld" rows="1" placeholder="Bericht"></textarea>
      <button class="c-rond c-hoofd" data-a="stuur" title="Versturen">↑</button></div>` : ""}
    <input type="file" id="c-foto" accept="image/*" hidden>`;
  const lijst = st.wortel.querySelector(".c-berichten");
  if (onderaan || st.naarOnder) { lijst.scrollTop = lijst.scrollHeight; st.naarOnder = false; }
  else if (oud) lijst.scrollTop = oud.scrollTop;
  const veld = st.wortel.querySelector("#c-tekst");
  if (veld) {
    veld.value = concept;
    veld.addEventListener("input", () => { st.concept = veld.value; veld.style.height = "auto"; veld.style.height = Math.min(veld.scrollHeight, 140) + "px"; });
    veld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); actie(st, "stuur"); } });
    if (st.focus) { veld.focus(); st.focus = false; }
  }
  const foto = st.wortel.querySelector("#c-foto");
  foto.addEventListener("change", async () => {
    if (!foto.files || !foto.files[0]) return;
    const data = await verkleind(foto.files[0]);
    if (data) await versturen(st, { t: "foto", data, tekst: "" });
  });
}

async function toonInfo(st) {
  const g = st.gesprek;
  const ander = g.soort === "twee" ? g.leden.find((l) => l.id !== st.ik) : null;
  let code = "";
  if (ander) {
    const mijnApp = st.sleutelLijst.filter((a) => a.gebruiker === st.ik);
    const hunApp = st.sleutelLijst.filter((a) => a.gebruiker === ander.id);
    code = await veiligheidscode(mijnApp, hunApp);
  }
  st.wortel.innerHTML = `
    <div class="c-kop"><button class="c-knop" data-a="terug">Terug</button><b>${esc(gesprekNaam(st, g))}</b></div>
    ${ander ? `<div class="c-kaart"><b>Beveiligingscode</b>
      <div class="c-code">${esc(code)}</div>
      <small>Vergelijk deze code met die op het scherm van ${esc(ander.naam)}, het liefst samen of via een telefoontje.
      Zijn ze gelijk, dan weet je zeker dat niemand meeleest.</small>
      <div class="c-rij"><button class="c-knop" data-a="gecontroleerd" data-code="${esc(code)}">Code is gelijk</button></div></div>` : ""}
    <label>Verdwijnende berichten<select class="c-veld" id="c-verdwijn">${Object.entries(VERDWIJNEN).map(([k, v]) =>
      `<option value="${k}" ${Number(k) === (g.verdwijnen || 0) ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="c-vink"><input type="checkbox" id="c-stil" ${g.stil ? "checked" : ""}> Geen meldingen voor dit gesprek</label>
    ${g.soort === "groep" ? `<div class="c-scheid">Deelnemers</div>
      ${g.leden.map((l) => `<div class="c-lid">${esc(l.naam)}${l.id === st.ik ? " (jij)" : ""}${l.beheerder ? " · beheerder" : ""}${l.status === "verzoek" ? " · uitgenodigd" : ""}</div>`).join("")}
      ${g.beheerder ? `<div class="c-rij"><input class="c-veld" id="c-toevoegen" placeholder="Gebruikersnaam" autocapitalize="none"><button class="c-knop" data-a="toevoegen">Toevoegen</button></div>` : ""}` : ""}
    <div class="c-rij c-wrap"><button class="c-knop" data-a="verlaten">${g.soort === "groep" ? "Groep verlaten" : "Gesprek verwijderen"}</button>
    ${ander ? `<button class="c-knop" data-a="blokkeer">Blokkeren</button>` : ""}</div>`;
  st.wortel.querySelector("#c-verdwijn").addEventListener("change", (e) => instellen(st, { p_verdwijnen: Number(e.target.value) }));
  st.wortel.querySelector("#c-stil").addEventListener("change", (e) => instellen(st, { p_stil: e.target.checked }));
}

async function toonApparaten(st) {
  const ik = await rpc(st, "chat_ik", { p_apparaat: st.apparaat });
  st.wortel.innerHTML = `
    <div class="c-kop"><button class="c-knop" data-a="lijst">Terug</button><b>Beveiliging</b></div>
    <div class="c-kaart"><small>Hoe het werkt</small>
      Elk bericht wordt op je apparaat versleuteld en pas op het apparaat van de ander weer leesbaar. De sleutels
      blijven op je apparaat; de server en de makers van de app kunnen je berichten niet lezen, ook de assistent niet.
      Een nieuw apparaat kan berichten van vóór de aanmelding niet lezen.</div>
    <div class="c-scheid">Je apparaten met chat</div>
    ${ik.apparaten.map((a) => `<div class="c-lid"><b>${esc(a.naam || "Apparaat")}</b>${a.id === st.apparaat ? " (dit apparaat)" : ""}
      <small> · ${esc(a.vingerafdruk.slice(0, 8))} · laatst ${esc(dag(a.laatst))}</small>
      ${a.id === st.apparaat ? "" : `<button class="c-mini" data-a="apparaat-weg" data-id="${a.id}">Weghalen</button>`}</div>`).join("")}`;
}

// --- Acties ------------------------------------------------------------------------------------------------------

async function gesprekkenLaden(st) {
  st.gesprekken = (await rpc(st, "chat_gesprekken")).gesprekken;
}

async function berichtenLaden(st) {
  const g = st.gesprek;
  if (!g) return;
  const na = st.berichten.length ? st.berichten[st.berichten.length - 1].id : 0;
  const r = await rpc(st, "chat_berichten", { p_gesprek: g.id, p_na: na, p_apparaat: st.apparaat });
  if (!st.gesprek || st.gesprek.id !== g.id) return;
  st.gesprek = r.gesprek || g;
  let nieuw = false;
  for (const b of r.berichten) {
    if (!b.weg && b.inhoud) {
      try { Object.assign(b, await ontsleutel(st, g.id, b)); } catch (e) { b.fout = "kapot"; }
    }
    if (b.bericht && b.bericht.t === "reactie") {
      const naam = (st.gesprek.leden.find((l) => l.id === b.afzender) || {}).naam || "";
      const lijst = st.reacties.get(b.bericht.op) || [];
      st.reacties.set(b.bericht.op, [...lijst.filter((x) => x.naam !== naam), { naam, antwoord: b.bericht.antwoord }]);
    }
    st.berichten.push(b);
    nieuw = true;
  }
  // Verwijderde of verdwenen berichten bijwerken (de server zet ze leeg).
  const laatste = st.berichten.length ? st.berichten[st.berichten.length - 1].id : 0;
  if (nieuw && laatste && st.gesprek.status === "lid") rpc(st, "chat_gelezen", { p_gesprek: g.id, p_tot: laatste }).catch(() => {});
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
  st.gesprek = st.gesprekken.find((g) => g.id === id) || { id, leden: [], soort: "twee", status: "lid" };
  st.berichten = []; st.reacties = new Map(); st.scherm = "gesprek"; st.paneel = null; st.naarOnder = true;
  st.sleutelsVeranderd = false;
  toon(st);
  await berichtenLaden(st);
  if (st.gesprek.status === "lid") await sleutelsLaden(st).catch(() => {});
  st.naarOnder = true;
  toon(st);
}

async function versturen(st, bericht) {
  const g = st.gesprek;
  if (!st.sleutelLijst || !st.sleutelLijst.length) await sleutelsLaden(st);
  const pakket = await versleutel(st, g.id, st.sleutelLijst, bericht);
  await rpc(st, "chat_versturen", { p_gesprek: g.id, p_apparaat: st.apparaat, p_inhoud: pakket.inhoud, p_iv: pakket.iv,
                                    p_epk: pakket.epk, p_sleutels: pakket.sleutels, p_handtekening: pakket.handtekening });
  st.paneel = null; st.naarOnder = true;
  await berichtenLaden(st);
  toon(st);
}

async function instellen(st, w) {
  try {
    await rpc(st, "chat_instellen", { p_gesprek: st.gesprek.id, p_verdwijnen: null, p_stil: null, p_groepsnaam: null, ...w });
    st.gesprek = (await rpc(st, "chat_berichten", { p_gesprek: st.gesprek.id, p_na: 2 ** 52, p_apparaat: st.apparaat })).gesprek;
  } catch (e) { melding(st, e.message); }
}

function melding(st, tekst) {
  let m = st.wortel.querySelector(".c-melding");
  if (!m) { m = document.createElement("div"); m.className = "c-melding"; st.wortel.prepend(m); }
  m.textContent = tekst;
  setTimeout(() => m.remove(), 5000);
}

function lokaal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function actie(st, a, el) {
  const v = (id) => (st.wortel.querySelector(id) || {}).value || "";
  try {
    if (a === "opnieuw") { st.fout = null; return start(st); }
    if (a === "lijst") { st.scherm = "lijst"; st.gesprek = null; await gesprekkenLaden(st); return toon(st); }
    if (a === "nieuw") { st.scherm = "nieuw"; return toon(st); }
    if (a === "apparaten") { st.scherm = "apparaten"; return toon(st); }
    if (a === "open") return openen(st, Number(el.dataset.id));
    if (a === "terug") { st.scherm = "gesprek"; return toon(st); }
    if (a === "info") { if (!st.sleutelLijst) await sleutelsLaden(st).catch(() => {}); st.scherm = "info"; return toon(st); }
    if (a === "starten") {
      const r = await rpc(st, "chat_starten", { p_met: v("#c-met") });
      await gesprekkenLaden(st); return openen(st, r.id);
    }
    if (a === "groep") {
      const leden = v("#c-leden").split(/[,;]/).map((x) => x.trim().replace(/^@/, "")).filter(Boolean);
      const r = await rpc(st, "chat_groep_maken", { p_groep: v("#c-groep"), p_leden: leden });
      await gesprekkenLaden(st); await openen(st, r.id);
      if (r.niet_gevonden && r.niet_gevonden.length) melding(st, `Niet toegevoegd (onbekend, of gebruikt de chat nog niet): ${r.niet_gevonden.join(", ")}`);
      return;
    }
    if (a === "stuur") {
      const tekst = v("#c-tekst").trim();
      if (!tekst) return;
      st.concept = ""; st.wortel.querySelector("#c-tekst").value = ""; st.focus = true;
      return versturen(st, { t: "tekst", tekst });
    }
    if (a === "plus") { st.paneel = st.paneel === "plus" ? null : "plus"; return toon(st); }
    if (a === "sluit") { st.paneel = null; return toon(st); }
    if (a === "foto") { st.wortel.querySelector("#c-foto").click(); return; }
    if (a === "afspraak") {
      const morgen = new Date(); morgen.setDate(morgen.getDate() + 1); morgen.setHours(19, 0, 0, 0);
      st.voorstel = { start: lokaal(morgen) }; st.paneel = "afspraak"; return toon(st);
    }
    if (a === "kies") { st.voorstel = { start: el.dataset.m.slice(0, 16) }; st.paneel = "afspraak"; return toon(st); }
    if (a === "vrij") {
      if (!st.vrij.length) { melding(st, "Je hebt de komende week geen vrije momenten in je agenda."); return; }
      return versturen(st, { t: "vrij", momenten: st.vrij });
    }
    if (a === "stuur-afspraak") {
      const titel = v("#c-a-titel").trim(); const start = v("#c-a-start");
      if (!titel || !start) { melding(st, "Vul in wat en wanneer."); return; }
      return versturen(st, { t: "afspraak", id: b64(rnd(9)), titel, start, minuten: Number(v("#c-a-duur")) || 60, plaats: v("#c-a-plaats").trim() });
    }
    if (a === "agenda" || a === "kanniet") {
      const b = st.berichten.find((x) => x.id === Number(el.dataset.b));
      if (!b || !b.bericht) return;
      const m = b.bericht;
      if (a === "agenda") {
        const van = (st.gesprek.leden.find((l) => l.id === b.afzender) || {}).naam || "";
        st.zet("agenda", { titel: m.titel, start: m.start, minuten: m.minuten || 60, plaats: m.plaats || "",
                           met: b.afzender === st.ik ? gesprekNaam(st, st.gesprek) : van, n: Date.now() });
        melding(st, "Staat in je agenda.");
      }
      if (b.afzender !== st.ik) await versturen(st, { t: "reactie", op: m.id, antwoord: a === "agenda" ? "ja" : "nee", titel: m.titel });
      return;
    }
    if (a === "weg") {
      if (!confirm("Dit bericht voor iedereen verwijderen?")) return;
      await rpc(st, "chat_bericht_weg", { p_bericht: Number(el.dataset.b) });
      const b = st.berichten.find((x) => x.id === Number(el.dataset.b)); if (b) { b.weg = true; b.bericht = null; }
      return toon(st);
    }
    if (a === "ja" || a === "nee") {
      await rpc(st, "chat_antwoorden", { p_gesprek: st.gesprek.id, p_antwoord: a });
      if (a === "nee") return actie(st, "lijst");
      await gesprekkenLaden(st); return openen(st, st.gesprek.id);
    }
    if (a === "verlaten") {
      if (!confirm("Weet je het zeker?")) return;
      await rpc(st, "chat_antwoorden", { p_gesprek: st.gesprek.id, p_antwoord: st.gesprek.status === "verzoek" ? "nee" : "verlaten" });
      return actie(st, "lijst");
    }
    if (a === "blokkeer") {
      const ander = st.gesprek.leden.find((l) => l.id !== st.ik);
      if (!ander || !confirm(`${ander.naam} blokkeren? Jullie kunnen elkaar dan geen berichten meer sturen.`)) return;
      await rpc(st, "chat_blokkeren", { p_wie: ander.id, p_aan: true });
      return actie(st, "lijst");
    }
    if (a === "toevoegen") {
      await rpc(st, "chat_lid_toevoegen", { p_gesprek: st.gesprek.id, p_wie: v("#c-toevoegen") });
      await instellen(st, {}); st.sleutelLijst = null; return toon(st);
    }
    if (a === "gecontroleerd") {
      const ander = st.gesprek.leden.find((l) => l.id !== st.ik);
      await idbPut("geverifieerd", `${st.ik}:${ander.id}`, el.dataset.code);
      st.sleutelsVeranderd = false; melding(st, "Opgeslagen. Verandert de code, dan zie je een waarschuwing.");
      return;
    }
    if (a === "apparaat-weg") {
      if (!confirm("Dit apparaat weghalen? Het kan daarna geen nieuwe berichten meer lezen.")) return;
      await rpc(st, "chat_apparaat_weg", { p_apparaat: Number(el.dataset.id) });
      return toon(st);
    }
  } catch (e) {
    melding(st, e.message || "Er ging iets mis.");
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
    st.fout = e.message || "De chat kon niet starten.";
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
        else if (st.scherm === "lijst") { await gesprekkenLaden(st); toon(st); }
      } catch (e) { /* volgende keer opnieuw */ }
      st.bezig = false;
    }
    bijhouden(st);
  }, st.scherm === "gesprek" ? 3000 : 10000);
}

export default function (component) {
  const { data, setTriggerValue, parentElement } = component;
  let st = parentElement.__chat;
  const wortel = parentElement.querySelector(".c-wortel");
  if (!st || st.naam !== data.naam || st.token !== data.token) {
    st = parentElement.__chat = {
      url: data.url, key: data.key, naam: data.naam, token: data.token, label: data.label, wortel,
      scherm: "lijst", gesprekken: [], berichten: [], reacties: new Map(), vrij: data.vrij || [], open: data.open || null,
    };
    wortel.addEventListener("click", (e) => {
      const el = e.target.closest("[data-a]");
      if (el) actie(st, el.dataset.a, el);
    });
    start(st);
  }
  st.wortel = wortel;
  st.vrij = data.vrij || [];
  st.zet = setTriggerValue;
  bijhouden(st);
}
