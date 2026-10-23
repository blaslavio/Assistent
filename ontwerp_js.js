// 3D-studio: zelf een 3D-ontwerp maken uit vormen. Draai er met je vinger omheen, pak een vorm en verschuif,
// draai of rek hem met de handvatten. Eigen code bovenop three.js (tekenmotor, camera- en handvatbesturing,
// exporteren). De vormen zelf staan in vormen_js.js, zodat een ontwerp in een wereld er precies zo uitziet.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

const D = __DATA__;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KLEUREN = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
                 "#ffffff", "#d1d5db", "#6b7280", "#111827", "#c08457", "#92400e", "#fef3c7"];
const rond = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

__VORMEN__

// ---------------------------------------------------------------------------------------------------------------
// Tekenmotor
// ---------------------------------------------------------------------------------------------------------------
const doek = $("#doek");
const renderer = new THREE.WebGLRenderer({ canvas: doek, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e8ecf2");
omgevingLicht(renderer, scene, 0.9);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 400);
camera.position.set(3.2, 2.6, 4.2);

const zon = new THREE.DirectionalLight(0xffffff, 1.6);
zon.position.set(4, 8, 5); zon.castShadow = true; zon.shadow.mapSize.set(2048, 2048);
Object.assign(zon.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
zon.shadow.bias = -0.0004; zon.shadow.radius = 4;
scene.add(zon, new THREE.HemisphereLight(0xffffff, 0xb8c0cc, 0.5));

const vloer = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.16 }));
vloer.rotation.x = -Math.PI / 2; vloer.receiveShadow = true; scene.add(vloer);
const fijn = new THREE.GridHelper(10, 100, 0x94a3b8, 0x94a3b8); fijn.material.transparent = true; fijn.material.opacity = 0.18;
const grof = new THREE.GridHelper(10, 10, 0x64748b, 0x64748b); grof.material.transparent = true; grof.material.opacity = 0.45;
fijn.position.y = grof.position.y = 0.001;
scene.add(fijn, grof);

function grootte() {
  const b = window.innerWidth, h = window.innerHeight;
  renderer.setSize(b, h, false);
  camera.aspect = b / Math.max(h, 1); camera.updateProjectionMatrix();
}
window.addEventListener("resize", grootte); grootte();

const baan = new OrbitControls(camera, doek);
baan.enableDamping = true; baan.dampingFactor = 0.12;
baan.target.set(0, 0.6, 0); baan.maxDistance = 60; baan.minDistance = 0.3;
baan.maxPolarAngle = Math.PI * 0.495;

const handvat = new TransformControls(camera, doek);
handvat.setSize(matchMedia("(pointer: coarse)").matches ? 1.25 : 0.9);
scene.add(handvat.getHelper());
let laatsteSleep = 0;
handvat.addEventListener("dragging-changed", (e) => { baan.enabled = !e.value; if (!e.value) laatsteSleep = performance.now(); });

// ---------------------------------------------------------------------------------------------------------------
// Het ontwerp
// ---------------------------------------------------------------------------------------------------------------
let delen = delenOpschonen(D.ontwerp?.delen);
const model = new THREE.Group(); scene.add(model);
let meshes = [];
let gekozen = -1, stand = "translate", raster = true;
const terug = [], vooruit = [];
let bewaarTimer = null, bewaarStatus = "opgeslagen";

function opbouwen() {
  handvat.detach();
  model.clear(); meshes = [];
  delen.forEach((d, i) => { const m = deelMesh(d); m.userData.i = i; model.add(m); meshes.push(m); });
  if (gekozen >= delen.length) gekozen = -1;
  if (gekozen >= 0) handvat.attach(meshes[gekozen]);
}
function vernieuwen(i) {
  const oud = meshes[i], m = deelMesh(delen[i]); m.userData.i = i;
  model.remove(oud); model.add(m); meshes[i] = m;
  if (gekozen === i) handvat.attach(m);
}
function momentopname() { terug.push(JSON.stringify(delen)); if (terug.length > 80) terug.shift(); vooruit.length = 0; }
function ongedaan(van, naar) {
  if (!van.length) return;
  naar.push(JSON.stringify(delen)); delen = JSON.parse(van.pop());
  kiezen(-1); opbouwen(); gewijzigd();
}
function gewijzigd() { bewaarStatus = "wijzigingen"; statusTonen(); clearTimeout(bewaarTimer); bewaarTimer = setTimeout(bewaren, 2000); }

function kiezen(i) {
  gekozen = i;
  if (i >= 0) { handvat.attach(meshes[i]); standZetten(stand); } else handvat.detach();
  $("#toevoegen").hidden = i >= 0;
  $("#gereedschap").hidden = i < 0;
  if (i < 0) $("#paneel").hidden = true; else if (!$("#paneel").hidden) paneelTonen();
}
function standZetten(s) {
  stand = s;
  handvat.setMode(s);
  handvat.setSpace(s === "scale" ? "local" : "world");
  handvat.setTranslationSnap(raster ? 0.05 : null);
  handvat.setRotationSnap(raster ? THREE.MathUtils.degToRad(15) : null);
  handvat.setScaleSnap(raster ? 0.05 : null);
  document.querySelectorAll("[data-stand]").forEach((b) => b.classList.toggle("aan", b.dataset.stand === s));
}

// Wat je met de handvatten doet, gaat meteen terug in de data.
handvat.addEventListener("mouseDown", () => momentopname());
handvat.addEventListener("objectChange", () => {
  if (gekozen < 0) return;
  const m = meshes[gekozen], d = delen[gekozen];
  d.p = m.position.toArray().map((x) => rond(x));
  d.r = [m.rotation.x, m.rotation.y, m.rotation.z].map((x) => rond(THREE.MathUtils.radToDeg(x), 1));
  d.s = m.scale.toArray().map((x) => rond(Math.max(Math.abs(x), 0.01)));
  m.scale.set(...d.s);
  if (!$("#paneel").hidden) paneelWaarden();
});
handvat.addEventListener("mouseUp", () => gewijzigd());

function toevoegen(v) {
  momentopname();
  const s = [...VORM_MAAT[v]];
  // een nieuwe vorm komt naast wat er al staat, op de vloer, waar je naar kijkt
  const x = rond(baan.target.x, 2), z = rond(baan.target.z, 2);
  const d = { v, p: [x, s[1] / 2, z], r: [0, 0, 0], s, k: KLEUREN[(delen.length * 5 + 5) % 9], m: "glans" };
  if (v === "tekst") { d.t = "Hallo"; d.s = [rond(0.5 * verhoudingTekst("Hallo"), 2), 0.5, 0.15]; d.p[1] = 0.25; }
  delen.push(d);
  const m = deelMesh(d); m.userData.i = delen.length - 1; model.add(m); meshes.push(m);
  if (v === "tekst" && !letter) wanneerLettertype(() => { d.s[0] = rond(0.5 * verhoudingTekst(d.t), 2); vernieuwen(delen.indexOf(d)); });
  $("#catalogus").hidden = true;
  kiezen(delen.length - 1); standZetten("translate"); gewijzigd();
}
function aanpassen(fn, opnieuw = true) {
  if (gekozen < 0) return;
  momentopname(); fn(delen[gekozen]);
  if (opnieuw) vernieuwen(gekozen); else deelPlaatsen(meshes[gekozen], delen[gekozen]);
  gewijzigd();
}
function kopie() {
  if (gekozen < 0) return;
  momentopname();
  const n = JSON.parse(JSON.stringify(delen[gekozen]));
  n.p[0] = rond(n.p[0] + Math.max(0.2, n.s[0] * 0.6), 2);
  delen.push(n); opbouwen(); kiezen(delen.length - 1); gewijzigd();
}
function weghalen() {
  if (gekozen < 0) return;
  momentopname(); delen.splice(gekozen, 1); gekozen = -1; opbouwen(); kiezen(-1); gewijzigd();
}
function opVloer() {
  aanpassen((d) => {
    const m = meshes[gekozen]; m.updateMatrixWorld();
    const b = new THREE.Box3().setFromObject(m);
    d.p[1] = rond(d.p[1] - b.min.y);
  }, false);
  if (!$("#paneel").hidden) paneelWaarden();
}
function spiegelen() {
  // maakt een gespiegelde kopie aan de andere kant (handig voor armen, wielen, ogen)
  if (gekozen < 0) return;
  momentopname();
  const n = JSON.parse(JSON.stringify(delen[gekozen]));
  n.p[0] = rond(-n.p[0]); n.r = [n.r[0], rond(-n.r[1], 1), rond(-n.r[2], 1)];
  if (Math.abs(n.p[0]) < 0.01) n.p[0] = rond(n.s[0] * 1.1);
  delen.push(n); opbouwen(); kiezen(delen.length - 1); gewijzigd();
}

// ---------------------------------------------------------------------------------------------------------------
// Aanraken: tik op een vorm om hem te pakken; één vinger draait om het ontwerp, twee vingers zoomen en schuiven.
// ---------------------------------------------------------------------------------------------------------------
const straal = new THREE.Raycaster();
let tik = null;
doek.addEventListener("pointerdown", (e) => { tik = (handvat.dragging || handvat.axis) ? null : { x: e.clientX, y: e.clientY, t: performance.now() }; });
doek.addEventListener("pointerup", (e) => {
  if (!tik || handvat.dragging || performance.now() - laatsteSleep < 250) { tik = null; return; }
  if (Math.hypot(e.clientX - tik.x, e.clientY - tik.y) > 8 || performance.now() - tik.t > 450) { tik = null; return; }
  tik = null;
  const r = doek.getBoundingClientRect();
  straal.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const raak = straal.intersectObjects(meshes, false)[0];
  kiezen(raak ? raak.object.userData.i : -1);
});
window.addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") { ongedaan(e.shiftKey ? vooruit : terug, e.shiftKey ? terug : vooruit); e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && k === "d") { kopie(); e.preventDefault(); }
  else if ((k === "delete" || k === "backspace") && gekozen >= 0) { weghalen(); e.preventDefault(); }
  else if (k === "w" || k === "g") standZetten("translate");
  else if (k === "e" || k === "r") standZetten("rotate");
  else if (k === "s") standZetten("scale");
  else if (k === "escape") kiezen(-1);
});

// ---------------------------------------------------------------------------------------------------------------
// Camera: zichten en alles in beeld
// ---------------------------------------------------------------------------------------------------------------
let vlucht = null;
function omhullende() {
  const b = new THREE.Box3();
  if (meshes.length) b.setFromObject(model); else b.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return b;
}
function zicht(richting) {
  const b = omhullende(), m = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const straal = Math.max(s.length() / 2, 0.4);
  const afstand = straal / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  const r = { "3d": [0.6, 0.45, 0.75], voor: [0, 0.05, 1], zij: [1, 0.05, 0], boven: [0, 1, 0.02], achter: [0, 0.05, -1] }[richting] || [0.6, 0.45, 0.75];
  const naar = m.clone().add(new THREE.Vector3(...r).normalize().multiplyScalar(afstand));
  vlucht = { van: camera.position.clone(), naar, doelVan: baan.target.clone(), doelNaar: m, t0: performance.now() };
  $("#instellingen").hidden = true;
}

// ---------------------------------------------------------------------------------------------------------------
// Panelen
// ---------------------------------------------------------------------------------------------------------------
function blad(id, html, bind) {
  const b = $(id); b.hidden = false; b.innerHTML = html; bind && bind(b);
  const dicht = b.querySelector("[data-a=dicht]"); if (dicht) dicht.onclick = () => { b.hidden = true; };
}

// Plaatjes van de vormen voor de catalogus, één keer getekend.
let plaatjes = null;
function vormPlaatjes() {
  if (plaatjes) return plaatjes;
  plaatjes = {};
  try {
    const c = document.createElement("canvas"); c.width = c.height = 160;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(); omgevingLicht(r, sc, 1);
    const l = new THREE.DirectionalLight(0xffffff, 1.8); l.position.set(2, 4, 3); sc.add(l);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 20); cam.position.set(1.7, 1.3, 2.3); cam.lookAt(0, 0, 0);
    VORMEN.forEach(([v, , s], k) => {
      if (v === "tekst" && !letter) return;
      const m = new THREE.Mesh(vormGeometrie(v, "Abc"), ontwerpMateriaal(KLEUREN[[5, 6, 7, 0, 1, 2, 3, 4, 8][k % 9]], "glans"));
      const grootste = Math.max(...s); m.scale.set(...s.map((x) => x / grootste));
      sc.add(m); r.render(sc, cam); plaatjes[v] = c.toDataURL("image/png"); sc.remove(m);
    });
    r.dispose();
  } catch (e) { /* zonder plaatjes werkt de catalogus ook */ }
  return plaatjes;
}
function catalogusTonen() {
  const p = vormPlaatjes();
  blad("#catalogus", `<div class="kop"><b>Vorm toevoegen</b><button class="knop" data-a="dicht">Sluiten</button></div>
    <div class="tegels">${VORMEN.map(([v, n]) => `<button class="tegel" data-v="${v}">${p[v] ? `<img class="vorm" src="${p[v]}" alt="">` : `<span class="vorm-leeg">Aa</span>`}${n}</button>`).join("")}</div>
    <p class="klein">Tip: met Kopie en Spiegelen maak je snel twee dezelfde armen, wielen of ogen.</p>`,
  (b) => b.querySelectorAll("[data-v]").forEach((x) => x.onclick = () => toevoegen(x.dataset.v)));
  if (!letter) wanneerLettertype(() => { plaatjes = null; if (!$("#catalogus").hidden) catalogusTonen(); });
}

function paneelTonen() {
  if (gekozen < 0) return;
  const d = delen[gekozen];
  const veld = (id, waarde, eenheid) => `<label>${eenheid[0]}<input type="number" inputmode="decimal" step="any" id="${id}" value="${waarde}"><i>${eenheid[1]}</i></label>`;
  blad("#paneel", `<div class="kop"><b>${esc(VORM_NAMEN[d.v] || d.v)}</b><button class="knop" data-a="dicht">Klaar</button></div>
    ${d.v === "tekst" ? `<span class="label">Tekst</span><input type="text" id="tekst" maxlength="40" value="${esc(d.t)}">` : ""}
    <span class="label">Kleur</span>
    <div class="kleuren">${KLEUREN.map((k) => `<button class="kleur ${k === d.k ? "aan" : ""}" data-k="${k}" style="background:${k}" aria-label="Kleur ${k}"></button>`).join("")}
      <input type="color" id="eigen-kleur" value="${esc(d.k)}" aria-label="Eigen kleur"></div>
    <span class="label">Materiaal</span>
    <div class="rij">${Object.entries(MATERIAAL_NAMEN).map(([k, n]) => `<button class="knop pil ${d.m === k ? "aan" : ""}" data-m="${k}">${n}</button>`).join("")}</div>
    <span class="label">Maat</span><div class="getallen">${["Breed", "Hoog", "Diep"].map((n, k) => veld("s" + k, rond(d.s[k] * 100, 1), [n, "cm"])).join("")}</div>
    <span class="label">Plek</span><div class="getallen">${["Links/rechts", "Hoogte", "Voor/achter"].map((n, k) => veld("p" + k, rond(d.p[k] * 100, 1), [n, "cm"])).join("")}</div>
    <span class="label">Draaien</span><div class="getallen">${["Voorover", "Rond", "Opzij"].map((n, k) => veld("r" + k, rond(d.r[k], 1), [n, "°"])).join("")}</div>
    <div class="rij onder"><button class="knop" data-a="vloer">Op de vloer</button><button class="knop" data-a="spiegel">Spiegelen</button>
      <button class="knop" data-a="kopie">Kopie</button><button class="knop gevaar" data-a="weg">Weghalen</button></div>`,
  (b) => {
    b.querySelectorAll("[data-k]").forEach((x) => x.onclick = () => { aanpassen((d) => { d.k = x.dataset.k; }); paneelTonen(); });
    $("#eigen-kleur").onchange = (e) => { aanpassen((d) => { d.k = e.target.value; }); paneelTonen(); };
    b.querySelectorAll("[data-m]").forEach((x) => x.onclick = () => { aanpassen((d) => { d.m = x.dataset.m; }); paneelTonen(); });
    const t = $("#tekst");
    if (t) t.onchange = () => aanpassen((d) => { d.t = t.value.slice(0, 40) || "Tekst"; d.s[0] = rond(d.s[1] * verhoudingTekst(d.t), 2); });
    for (const [s, f] of [["s", 0.01], ["p", 0.01], ["r", 1]]) for (let k = 0; k < 3; k++) {
      $(`#${s}${k}`).onchange = (e) => {
        const w = Number(String(e.target.value).replace(",", "."));
        if (!Number.isFinite(w)) return paneelWaarden();
        aanpassen((d) => { d[s][k] = s === "s" ? Math.min(Math.max(w * f, 0.01), 50) : s === "p" ? Math.min(Math.max(w * f, -50), 50) : ((w % 360) + 360) % 360; }, false);
        paneelWaarden();
      };
    }
    b.querySelector("[data-a=vloer]").onclick = opVloer;
    b.querySelector("[data-a=spiegel]").onclick = spiegelen;
    b.querySelector("[data-a=kopie]").onclick = kopie;
    b.querySelector("[data-a=weg]").onclick = weghalen;
  });
}
function paneelWaarden() {
  if (gekozen < 0) return;
  const d = delen[gekozen];
  for (let k = 0; k < 3; k++) {
    const s = $(`#s${k}`), p = $(`#p${k}`), r = $(`#r${k}`);
    if (s && document.activeElement !== s) s.value = rond(d.s[k] * 100, 1);
    if (p && document.activeElement !== p) p.value = rond(d.p[k] * 100, 1);
    if (r && document.activeElement !== r) r.value = rond(d.r[k], 1);
  }
}

function weergaveTonen() {
  blad("#instellingen", `<div class="kop"><b>Bekijken</b><button class="knop" data-a="dicht">Sluiten</button></div>
    <div class="rij">${[["3d", "3D"], ["voor", "Voorkant"], ["zij", "Zijkant"], ["achter", "Achterkant"], ["boven", "Bovenkant"]].map(([k, n]) => `<button class="knop pil" data-zicht="${k}">${n}</button>`).join("")}</div>
    <label class="vink"><input type="checkbox" id="raster" ${raster ? "checked" : ""}> Vastklikken op het raster (5 cm en 15°)</label>
    <label class="vink"><input type="checkbox" id="vloerraster" ${fijn.visible ? "checked" : ""}> Raster op de vloer laten zien</label>
    <p class="klein">Eén vinger: om je ontwerp heen draaien. Twee vingers: zoomen en schuiven.</p>`,
  (b) => {
    b.querySelectorAll("[data-zicht]").forEach((x) => x.onclick = () => zicht(x.dataset.zicht));
    $("#raster").onchange = (e) => { raster = e.target.checked; standZetten(stand); };
    $("#vloerraster").onchange = (e) => { fijn.visible = grof.visible = e.target.checked; };
  });
}

// --- Sjablonen om mee te beginnen ---------------------------------------------------------------------------------
const deel = (v, p, s, k, m = "glans", r = [0, 0, 0], t) => ({ v, p, s, k, m, r, ...(t ? { t } : {}) });
const SJABLONEN = {
  leeg: ["Leeg", "Begin met niets.", () => []],
  robot: ["Robot", "Met lichtgevende ogen.", () => [
    deel("afgerond", [0, 0.95, 0], [0.8, 0.9, 0.5], "#3b82f6"), deel("afgerond", [0, 1.68, 0], [0.62, 0.5, 0.5], "#e5e7eb"),
    deel("bol", [-0.14, 1.72, 0.25], [0.13, 0.13, 0.06], "#22d3ee", "licht"), deel("bol", [0.14, 1.72, 0.25], [0.13, 0.13, 0.06], "#22d3ee", "licht"),
    deel("cilinder", [0, 2.04, 0], [0.04, 0.24, 0.04], "#9ca3af", "metaal"), deel("bol", [0, 2.2, 0], [0.11, 0.11, 0.11], "#ef4444", "licht"),
    deel("cilinder", [-0.53, 0.98, 0], [0.15, 0.7, 0.15], "#9ca3af", "metaal", [0, 0, -12]), deel("cilinder", [0.53, 0.98, 0], [0.15, 0.7, 0.15], "#9ca3af", "metaal", [0, 0, 12]),
    deel("bol", [-0.61, 0.6, 0], [0.19, 0.19, 0.19], "#e5e7eb"), deel("bol", [0.61, 0.6, 0], [0.19, 0.19, 0.19], "#e5e7eb"),
    deel("cilinder", [-0.2, 0.27, 0], [0.18, 0.46, 0.18], "#9ca3af", "metaal"), deel("cilinder", [0.2, 0.27, 0], [0.18, 0.46, 0.18], "#9ca3af", "metaal"),
    deel("afgerond", [-0.2, 0.04, 0.05], [0.26, 0.08, 0.36], "#374151", "mat"), deel("afgerond", [0.2, 0.04, 0.05], [0.26, 0.08, 0.36], "#374151", "mat"),
    deel("hart", [0, 1.05, 0.26], [0.22, 0.2, 0.05], "#ef4444")]],
  raket: ["Raket", "Klaar voor de lancering.", () => [
    deel("cilinder", [0, 1.25, 0], [0.6, 1.6, 0.6], "#f8fafc"), deel("kegel", [0, 2.35, 0], [0.6, 0.6, 0.6], "#ef4444"),
    deel("ring", [0, 1.55, 0.3], [0.3, 0.3, 0.07], "#9ca3af", "metaal"), deel("bol", [0, 1.55, 0.29], [0.22, 0.22, 0.05], "#38bdf8", "glas"),
    ...[0, 120, 240].map((a) => deel("wig", [rond(Math.sin(THREE.MathUtils.degToRad(a)) * 0.46), 0.75, rond(Math.cos(THREE.MathUtils.degToRad(a)) * 0.46)], [0.05, 0.6, 0.34], "#ef4444", "glans", [0, a, 0])),
    deel("cilinder", [0, 0.4, 0], [0.42, 0.12, 0.42], "#6b7280", "metaal"), deel("kegel", [0, 0.18, 0], [0.34, 0.36, 0.34], "#f97316", "licht", [180, 0, 0])]],
  auto: ["Auto", "Een rode sportauto.", () => [
    deel("afgerond", [0, 0.45, 0], [2, 0.42, 1], "#ef4444"), deel("afgerond", [-0.12, 0.82, 0], [1.1, 0.42, 0.88], "#ef4444"),
    deel("afgerond", [-0.12, 0.84, 0], [1.12, 0.3, 0.9], "#93c5fd", "glas"),
    ...[[0.66, 0.5], [0.66, -0.5], [-0.66, 0.5], [-0.66, -0.5]].flatMap(([x, z]) => [deel("cilinder", [x, 0.26, z], [0.52, 0.22, 0.52], "#111827", "mat", [90, 0, 0]),
                                                                                      deel("cilinder", [x, 0.26, z * 1.02], [0.26, 0.22, 0.26], "#d1d5db", "metaal", [90, 0, 0])]),
    deel("bol", [1, 0.5, 0.3], [0.06, 0.12, 0.2], "#fef08a", "licht"), deel("bol", [1, 0.5, -0.3], [0.06, 0.12, 0.2], "#fef08a", "licht")]],
  huis: ["Huisje", "Met dak, deur en ramen.", () => [
    deel("blok", [0, 0.75, 0], [2, 1.5, 1.6], "#fef3c7", "mat"), deel("piramide", [0, 1.95, 0], [2.4, 0.9, 2], "#b91c1c", "mat"),
    deel("blok", [0, 0.45, 0.81], [0.45, 0.9, 0.04], "#78350f", "mat"), deel("blok", [-0.6, 0.95, 0.81], [0.4, 0.4, 0.04], "#93c5fd", "glas"),
    deel("blok", [0.6, 0.95, 0.81], [0.4, 0.4, 0.04], "#93c5fd", "glas"), deel("blok", [0.6, 2.05, 0], [0.25, 0.55, 0.25], "#78716c", "mat")]],
  sneeuwpop: ["Sneeuwpop", "Drie bollen en een hoed.", () => [
    deel("bol", [0, 0.45, 0], [0.9, 0.9, 0.9], "#f8fafc", "mat"), deel("bol", [0, 1.15, 0], [0.65, 0.65, 0.65], "#f8fafc", "mat"),
    deel("bol", [0, 1.66, 0], [0.46, 0.46, 0.46], "#f8fafc", "mat"), deel("kegel", [0, 1.66, 0.32], [0.08, 0.26, 0.08], "#f97316", "mat", [90, 0, 0]),
    deel("bol", [-0.09, 1.74, 0.2], [0.06, 0.06, 0.06], "#111827"), deel("bol", [0.09, 1.74, 0.2], [0.06, 0.06, 0.06], "#111827"),
    deel("cilinder", [0, 1.9, 0], [0.5, 0.04, 0.5], "#111827"), deel("cilinder", [0, 2.04, 0], [0.32, 0.26, 0.32], "#111827"),
    deel("bol", [0, 1.2, 0.32], [0.07, 0.07, 0.07], "#111827"), deel("bol", [0, 1.05, 0.32], [0.07, 0.07, 0.07], "#111827")]],
  tafel: ["Tafel", "Om zelf meubels te ontwerpen.", () => [
    deel("afgerond", [0, 0.75, 0], [1.4, 0.06, 0.8], "#a16207", "glans"),
    ...[[0.6, 0.3], [0.6, -0.3], [-0.6, 0.3], [-0.6, -0.3]].map(([x, z]) => deel("cilinder", [x, 0.36, z], [0.06, 0.72, 0.06], "#111827", "metaal"))]],
};
function beginTonen() {
  blad("#instellingen", `<div class="kop"><b>Waar wil je mee beginnen?</b><button class="knop" data-a="dicht">Sluiten</button></div>
    <div class="tegels">${Object.entries(SJABLONEN).map(([k, [n, uit]]) => `<button class="tegel breed" data-sjabloon="${k}"><b>${n}</b><small>${uit}</small></button>`).join("")}</div>
    ${delen.length ? `<p class="waarschuwing">Dit vervangt je ontwerp. Met Ongedaan maken krijg je het terug.</p>` : ""}`,
  (b) => b.querySelectorAll("[data-sjabloon]").forEach((x) => x.onclick = () => {
    momentopname(); delen = delenOpschonen(SJABLONEN[x.dataset.sjabloon][2]()); kiezen(-1); opbouwen(); gewijzigd();
    b.hidden = true; zicht("3d");
  }));
}

// --- Exporteren: voor andere apps, een 3D-printer of je eigen kamer (AR op iPhone en iPad) -------------------------
const bestandsnaam = () => (String(D.ontwerp?.titel || "ontwerp").replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "ontwerp").slice(0, 60);
function downloaden(blob, naam) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = naam;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
function exportGroep() {
  // een schone kopie zonder handvatten, met het midden van de onderkant op 0
  const g = ontwerpGroep(delen, true); g.updateMatrixWorld(true); return g;
}
async function exporteren(soort) {
  if (!delen.length) return melding("Er is nog niets om te bewaren.");
  try {
    if (soort === "glb") {
      const data = await new GLTFExporter().parseAsync(exportGroep(), { binary: true });
      downloaden(new Blob([data], { type: "model/gltf-binary" }), bestandsnaam() + ".glb");
    } else if (soort === "stl") {
      const g = exportGroep(); g.scale.setScalar(1000); g.updateMatrixWorld(true);  // printers rekenen in millimeters
      downloaden(new Blob([new STLExporter().parse(g, { binary: true })], { type: "model/stl" }), bestandsnaam() + ".stl");
    } else if (soort === "ar") {
      const data = await new USDZExporter().parseAsync(exportGroep());
      const blob = new Blob([data], { type: "model/vnd.usdz+zip" });
      const a = document.createElement("a"); a.rel = "ar"; a.href = URL.createObjectURL(blob); a.download = bestandsnaam() + ".usdz";
      a.appendChild(document.createElement("img"));  // Safari wil een plaatje in de link om AR te openen
      document.body.appendChild(a); a.click(); a.remove();
    }
    melding("Klaar");
  } catch (e) { melding("Dat lukte niet. Probeer het nog eens."); }
}
function exportTonen() {
  blad("#instellingen", `<div class="kop"><b>Delen en bewaren</b><button class="knop" data-a="dicht">Sluiten</button></div>
    <div class="lijst">
      <button class="knop regel" data-x="ar"><b>In je kamer bekijken</b><small>Zet je ontwerp met de camera in je eigen kamer (iPhone en iPad).</small></button>
      <button class="knop regel" data-x="glb"><b>3D-bestand (.glb)</b><small>Voor andere 3D-apps, Blender of een website.</small></button>
      <button class="knop regel" data-x="stl"><b>Voor een 3D-printer (.stl)</b><small>In echte maat in millimeters; verklein het in je printerprogramma.</small></button>
    </div>
    <p class="klein">In je eigen wereld: Bouwen › Toevoegen › Mijn ontwerpen.</p>`,
  (b) => b.querySelectorAll("[data-x]").forEach((x) => x.onclick = () => exporteren(x.dataset.x)));
}

function melding(tekst) {
  const m = $("#melding"); m.textContent = tekst; m.classList.add("zichtbaar");
  clearTimeout(melding.t); melding.t = setTimeout(() => m.classList.remove("zichtbaar"), 2200);
}

// --- Opslaan -----------------------------------------------------------------------------------------------------
async function api(functie, parameters) {
  const r = await fetch(`${D.api.url}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: D.api.key, Authorization: `Bearer ${D.api.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_naam: D.api.naam, p_wachtwoord: D.api.token, ...parameters }),
  });
  if (!r.ok) throw new Error(`fout ${r.status}`);
  const j = await r.json();
  if (j && j.geen_toegang) throw new Error("Log opnieuw in.");
  if (j && j.fout) throw new Error(j.fout);
  return j;
}
function omslagMaken() {
  try {
    const helper = handvat.getHelper(), zichtbaar = helper.visible;
    helper.visible = false; fijn.visible = grof.visible = false;
    renderer.render(scene, camera);
    const c = document.createElement("canvas"); c.width = 320; c.height = 240;
    const g = c.getContext("2d"), b = doek.width, h = doek.height, verh = 320 / 240;
    const sb = Math.min(b, h * verh), sh = sb / verh;
    g.drawImage(doek, (b - sb) / 2, (h - sh) / 2, sb, sh, 0, 0, 320, 240);
    helper.visible = zichtbaar; fijn.visible = grof.visible = $("#vloerraster") ? $("#vloerraster").checked : true;
    return c.toDataURL("image/jpeg", 0.75).split(",")[1];
  } catch (e) { return null; }
}
async function bewaren() {
  clearTimeout(bewaarTimer);
  if (!D.api || bewaarStatus === "opgeslagen") return;
  bewaarStatus = "bezig"; statusTonen();
  try {
    await api("ontwerp_opslaan", { p_id: D.ontwerp.id, p_delen: delen, p_omslag: omslagMaken() });
    bewaarStatus = "opgeslagen";
  } catch (e) {
    bewaarStatus = "fout"; $("#status").title = e.message;
    bewaarTimer = setTimeout(bewaren, 8000);
  }
  statusTonen();
}
function statusTonen() {
  const s = $("#status");
  s.textContent = { opgeslagen: "Opgeslagen", wijzigingen: "Niet opgeslagen", bezig: "Opslaan...", fout: "Opslaan mislukt, opnieuw..." }[bewaarStatus] || "";
  s.className = "status " + bewaarStatus;
}
window.addEventListener("pagehide", () => { if (bewaarStatus === "wijzigingen") bewaren(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && bewaarStatus === "wijzigingen") bewaren(); });

// ---------------------------------------------------------------------------------------------------------------
// Beginnen
// ---------------------------------------------------------------------------------------------------------------
$("#b-terug").onclick = () => ongedaan(terug, vooruit);
$("#b-vooruit").onclick = () => ongedaan(vooruit, terug);
$("#b-begin").onclick = beginTonen;
$("#b-bekijken").onclick = weergaveTonen;
$("#b-delen").onclick = exportTonen;
$("#status").onclick = bewaren;
$("#toevoegen").onclick = catalogusTonen;
document.querySelectorAll("[data-stand]").forEach((b) => b.onclick = () => standZetten(b.dataset.stand));
$("#g-aanpassen").onclick = () => { $("#paneel").hidden ? paneelTonen() : ($("#paneel").hidden = true); };
$("#g-kopie").onclick = kopie;
$("#g-weg").onclick = weghalen;
$("#g-klaar").onclick = () => kiezen(-1);
$("#scherm").onclick = () => {
  const d = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (d.requestFullscreen || d.webkitRequestFullscreen || (() => melding("Volledig scherm kan hier niet."))).call(d);
};

if (delen.some((d) => d.v === "tekst")) wanneerLettertype(() => {});
opbouwen();
statusTonen();
if (delen.length) zicht("3d"); else beginTonen();
if (vlucht) { camera.position.copy(vlucht.naar); baan.target.copy(vlucht.doelNaar); vlucht = null; }

renderer.setAnimationLoop(() => {
  if (vlucht) {
    const t = Math.min((performance.now() - vlucht.t0) / 450, 1), e = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(vlucht.van, vlucht.naar, e); baan.target.lerpVectors(vlucht.doelVan, vlucht.doelNaar, e);
    if (t >= 1) vlucht = null;
  }
  baan.update();
  renderer.render(scene, camera);
});
window.__studio = { get delen() { return delen; }, toevoegen, kiezen, standZetten, zicht, bewaren, exporteren, get status() { return bewaarStatus; },
                    sjabloon: (k) => { delen = delenOpschonen(SJABLONEN[k][2]()); opbouwen(); gewijzigd(); zicht("3d"); } };
