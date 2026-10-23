// Wereld: zelf een 3D-wereld of spel bouwen en spelen. Eigen code bovenop three.js (alleen de 3D-tekenmotor).
//
// Eén bestand voor twee standen:
//   bouwen  - de maker zet dingen neer, verschuift, draait, kleurt en kiest spelregels; alles wordt vanzelf bewaard.
//   spelen  - rondlopen (vegen, joystick, toetsen of VR-bril), munten pakken, vragen beantwoorden, de finish halen.
//
// Een ding in de wereld is een klein object: {id, v: vorm, p: [x, y, z], r: draaiing in graden (om de hoogte-as),
// s: [breedte, hoogte, diepte] als factor, k: kleur, t: tekst, i: nummer van een foto of 3D-model, g: beweging,
// vast: botsen of niet, vraag: {v, opties, goed}}. Het punt p is altijd het midden van de onderkant.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const D = __DATA__;
const BOUWEN = D.modus === "bouwen";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rond = (x, stap = 0.25) => Math.round(x / stap) * stap;
const graden = THREE.MathUtils.degToRad;
const ITEMS = new Map((D.items || []).map((i) => [i.id, i]));

// ---------------------------------------------------------------------------------------------------------------
// Catalogus: alles wat je kunt neerzetten
// ---------------------------------------------------------------------------------------------------------------

const CATALOGUS = [
  { naam: "Basis", dingen: [["blok", "🟫", "Blok"], ["plaat", "▭", "Platform"], ["bol", "⚪", "Bol"], ["cilinder", "🛢️", "Zuil"],
    ["kegel", "🔺", "Kegel"], ["piramide", "◭", "Piramide"], ["ring", "⭕", "Ring"], ["trap", "🪜", "Trap"],
    ["muur", "🧱", "Muur"], ["boog", "⛩️", "Poort"], ["helling", "◺", "Helling"]] },
  { naam: "Natuur", dingen: [["boom", "🌳", "Boom"], ["den", "🌲", "Den"], ["struik", "🌿", "Struik"], ["rots", "🪨", "Rots"],
    ["bloem", "🌷", "Bloem"], ["water", "💧", "Water"], ["wolk", "☁️", "Wolk"]] },
  { naam: "Bouwen", dingen: [["huis", "🏠", "Huis"], ["toren", "🏰", "Toren"], ["hek", "🚧", "Hek"], ["brug", "🌉", "Brug"],
    ["pad", "🟨", "Pad"]] },
  { naam: "Inrichting", dingen: [["tafel", "🍽️", "Tafel"], ["stoel", "🪑", "Stoel"], ["bank", "🛋️", "Bank"],
    ["lamp", "💡", "Lamp"], ["bord", "🪧", "Tekstbord"], ["kist", "📦", "Kist"]] },
  { naam: "Spel", dingen: [["start", "🚩", "Start"], ["munt", "🪙", "Munt"], ["ster", "⭐", "Ster"], ["finish", "🏁", "Finish"],
    ["checkpoint", "📍", "Checkpoint"], ["springkussen", "🟣", "Springkussen"], ["lava", "🔥", "Lava"],
    ["vraag", "❓", "Vraag"], ["portaal", "🌀", "Portaal"]] },
];
const NAMEN = Object.fromEntries(CATALOGUS.flatMap((c) => c.dingen.map(([v, ic, n]) => [v, { icoon: ic, naam: n }])));
NAMEN.foto = { icoon: "🖼️", naam: "Foto" };
NAMEN.model = { icoon: "🧊", naam: "3D-model" };

// Standaardwaarden per vorm: kleur, maat en of je ertegen botst.
const STANDAARD = {
  blok: { k: "#c08457" }, plaat: { k: "#94a3b8", s: [2, 1, 2] }, bol: { k: "#60a5fa" }, cilinder: { k: "#e5e7eb" },
  kegel: { k: "#f97316" }, piramide: { k: "#eab308" }, ring: { k: "#a855f7", vast: false }, trap: { k: "#a8a29e" },
  muur: { k: "#e7e5e4" }, boog: { k: "#dc2626" }, helling: { k: "#94a3b8" },
  boom: { k: "#22c55e" }, den: { k: "#15803d" }, struik: { k: "#4ade80", vast: false }, rots: { k: "#78716c" },
  bloem: { k: "#ec4899", vast: false }, water: { k: "#38bdf8", vast: false, s: [4, 1, 4] }, wolk: { k: "#ffffff", vast: false },
  huis: { k: "#fef3c7" }, toren: { k: "#d6d3d1" }, hek: { k: "#92400e" }, brug: { k: "#a16207" }, pad: { k: "#d6c08f", vast: false, s: [1, 1, 4] },
  tafel: { k: "#a16207" }, stoel: { k: "#78350f" }, bank: { k: "#2563eb" }, lamp: { k: "#fde68a" },
  bord: { k: "#ffffff", t: "Welkom!" }, kist: { k: "#92400e" },
  start: { k: "#22c55e", vast: false }, munt: { k: "#fbbf24", vast: false }, ster: { k: "#facc15", vast: false },
  finish: { k: "#111827", vast: false }, checkpoint: { k: "#3b82f6", vast: false }, springkussen: { k: "#a855f7" },
  lava: { k: "#ef4444", s: [2, 1, 2] }, vraag: { k: "#6366f1", vraag: { v: "Hoeveel is 6 × 7?", opties: ["36", "42", "48"], goed: 1 } },
  portaal: { k: "#8b5cf6", vast: false }, foto: { k: "#1f2937" }, model: { k: "#ffffff" },
};
const KLEUREN = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
                 "#ffffff", "#d6d3d1", "#78716c", "#1f2937", "#c08457", "#92400e", "#fef3c7"];
const BEWEGINGEN = { "": "Stil", draait: "Draait", zweeft: "Zweeft", heen: "Heen en weer", op: "Op en neer" };
const LUCHTEN = {
  dag: { naam: "Dag", boven: "#4f9de8", onder: "#d7ecfb", licht: 1.0, zon: "#ffffff", mist: null },
  ochtend: { naam: "Ochtend", boven: "#7aa7e0", onder: "#fbd5b5", licht: 0.85, zon: "#ffe2c2", mist: null },
  avond: { naam: "Zonsondergang", boven: "#3b2a6b", onder: "#f59e6b", licht: 0.7, zon: "#ffb27a", mist: null },
  nacht: { naam: "Nacht", boven: "#060a1e", onder: "#1b2350", licht: 0.25, zon: "#9fb4ff", mist: null, sterren: 1500 },
  ruimte: { naam: "Ruimte", boven: "#000000", onder: "#05030f", licht: 0.45, zon: "#ffffff", mist: null, sterren: 4000 },
  mist: { naam: "Mist", boven: "#b8c2cc", onder: "#dfe4e8", licht: 0.75, zon: "#ffffff", mist: "#d5dbe0" },
};
const VLOEREN = { gras: "Gras", zand: "Zand", steen: "Steen", hout: "Hout", sneeuw: "Sneeuw", water: "Water", geen: "Geen vloer" };
const SPELSOORTEN = {
  geen: ["Geen spel", "Gewoon rondlopen en kijken."],
  verzamelen: ["Verzamelen", "Pak alle munten en sterren."],
  parcours: ["Parcours", "Haal de finish. Val je, dan begin je bij het laatste checkpoint."],
  quiz: ["Quiz", "Beantwoord alle vragen in de wereld."],
};

// ---------------------------------------------------------------------------------------------------------------
// Tekenmotor
// ---------------------------------------------------------------------------------------------------------------

const doek = $("#doek");
const renderer = new THREE.WebGLRenderer({ canvas: doek, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
const rig = new THREE.Group();  // de speler: camera erin, zodat VR en lopen samengaan
rig.add(camera);
scene.add(rig);

function grootte() {
  const b = window.innerWidth, h = window.innerHeight;
  renderer.setSize(b, h, false);
  camera.aspect = b / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", grootte);
grootte();

// Een kleine voorraad materialen en vormen, zodat honderden dingen soepel blijven.
const materialen = new Map();
function mat(kleur, extra = {}) {
  const sleutel = kleur + JSON.stringify(extra);
  if (!materialen.has(sleutel)) materialen.set(sleutel, new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.8, metalness: 0.05, ...extra }));
  return materialen.get(sleutel);
}
const vormen = new Map();
function geo(sleutel, maak) {
  if (!vormen.has(sleutel)) vormen.set(sleutel, maak());
  return vormen.get(sleutel);
}

// Teksten (op borden en vragen) tekenen we zelf op een canvas.
function tekstTextuur(titel, tekst, b = 512, h = 320, achter = "#ffffff", kleur = "#111827", accent = null) {
  const c = document.createElement("canvas"); c.width = b; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = achter; g.fillRect(0, 0, b, h);
  if (accent) { g.fillStyle = accent; g.fillRect(0, 0, b, 14); }
  g.fillStyle = kleur; g.textBaseline = "top";
  let y = 30;
  const regels = (s, maat, gewicht) => {
    g.font = `${gewicht} ${maat}px -apple-system, system-ui, sans-serif`;
    for (const alinea of String(s || "").split("\n")) {
      let regel = "";
      for (const woord of alinea.split(" ")) {
        const test = regel ? regel + " " + woord : woord;
        if (g.measureText(test).width > b - 48 && regel) { g.fillText(regel, 24, y); y += maat * 1.25; regel = woord; } else regel = test;
      }
      g.fillText(regel, 24, y); y += maat * 1.25;
      if (y > h - maat) return;
    }
  };
  if (titel) { regels(titel, 44, "700"); y += 6; }
  if (tekst) regels(tekst, 30, "400");
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Vloeren: een getekend patroon dat zich herhaalt.
function vloerTextuur(soort) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const ruis = (basis, variatie, aantal, maat) => {
    g.fillStyle = basis; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < aantal; i++) {
      const l = (Math.random() - 0.5) * variatie;
      g.fillStyle = `rgba(${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${Math.abs(l)})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, maat, maat * (1 + Math.random() * 2));
    }
  };
  if (soort === "gras") ruis("#4f8f3a", 0.22, 5000, 2);
  else if (soort === "zand") ruis("#d9c18f", 0.12, 6000, 2);
  else if (soort === "sneeuw") ruis("#f3f6fa", 0.06, 3000, 3);
  else if (soort === "water") ruis("#2a7fc1", 0.15, 1500, 6);
  else if (soort === "steen") {
    ruis("#9aa0a6", 0.12, 3000, 2);
    g.strokeStyle = "rgba(60,60,60,.55)"; g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  } else if (soort === "hout") {
    ruis("#a87543", 0.12, 2500, 2);
    g.strokeStyle = "rgba(70,40,15,.6)"; g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    for (let i = 0; i < 8; i++) { const x = (i * 97) % 256, y = i * 32; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// --- De omgeving ---------------------------------------------------------------------------------------------
const omgeving = new THREE.Group(); scene.add(omgeving);
const zonLicht = new THREE.DirectionalLight(0xffffff, 1.2);
zonLicht.castShadow = true;
zonLicht.shadow.mapSize.set(2048, 2048);
Object.assign(zonLicht.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
zonLicht.shadow.bias = -0.0005;
scene.add(zonLicht, zonLicht.target);
const hemelLicht = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemelLicht);
let vloer = null;

function omgevingMaken(o) {
  omgeving.clear();
  const l = LUCHTEN[o.lucht] || LUCHTEN.dag;
  const hemel = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { boven: { value: new THREE.Color(l.boven) }, onder: { value: new THREE.Color(l.onder) } },
    vertexShader: "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 boven; uniform vec3 onder; varying vec3 p; void main(){ float h = clamp(p.y*1.4+0.15,0.0,1.0); vec3 c = mix(onder,boven,pow(h,0.8)); c = mix(c, onder*0.3, clamp(-p.y*2.5,0.0,1.0)); gl_FragColor = vec4(c,1.0); }",
  }));
  omgeving.add(hemel);
  if (l.sterren) {
    const punten = new Float32Array(l.sterren * 3);
    for (let i = 0; i < l.sterren; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.05; v.normalize().multiplyScalar(380);
      punten.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(punten, 3));
    omgeving.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false })));
  }
  scene.fog = l.mist ? new THREE.Fog(l.mist, 8, 70) : new THREE.Fog(l.onder, 120, 380);
  zonLicht.color.set(l.zon); zonLicht.intensity = 1.6 * l.licht;
  zonLicht.position.set(25, 40, 18);
  hemelLicht.color.set(l.boven); hemelLicht.groundColor.set(l.onder); hemelLicht.intensity = 0.5 + l.licht * 0.6;
  vloer = null;
  if (o.vloer !== "geen") {
    const soort = VLOEREN[o.vloer] ? o.vloer : "gras";
    vloer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: vloerTextuur(soort), roughness: soort === "water" ? 0.2 : 0.95 }));
    vloer.rotation.x = -Math.PI / 2; vloer.receiveShadow = true;
    omgeving.add(vloer);
  }
  if (BOUWEN) {
    const raster = new THREE.GridHelper(100, 100, 0x000000, 0x000000);
    raster.material.opacity = 0.12; raster.material.transparent = true; raster.position.y = 0.01;
    omgeving.add(raster);
  }
}

// --- Vormen maken ------------------------------------------------------------------------------------------
function deel(g, geometrie, materiaal, x = 0, y = 0, z = 0, opties = {}) {
  const m = new THREE.Mesh(geometrie, materiaal);
  m.position.set(x, y, z);
  m.castShadow = opties.schaduw !== false; m.receiveShadow = true;
  if (opties.geenBotsing) m.userData.geenBotsing = true;
  if (opties.r) m.rotation.set(...opties.r);
  if (opties.s) m.scale.set(...opties.s);
  g.add(m);
  return m;
}
const BOX = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32));
const SPH = () => geo("sph", () => new THREE.SphereGeometry(0.5, 32, 16));

function sterVorm() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.2 : 0.5, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }).center();
}

const BOUWERS = {
  blok: (g, k) => deel(g, BOX(), mat(k), 0, 0.5, 0),
  plaat: (g, k) => deel(g, BOX(), mat(k), 0, 0.075, 0, { s: [1, 0.15, 1] }),
  bol: (g, k) => deel(g, SPH(), mat(k), 0, 0.5, 0),
  cilinder: (g, k) => deel(g, CYL(), mat(k), 0, 0.5, 0),
  kegel: (g, k) => deel(g, geo("kegel", () => new THREE.ConeGeometry(0.5, 1, 32)), mat(k), 0, 0.5, 0),
  piramide: (g, k) => deel(g, geo("pir", () => new THREE.ConeGeometry(0.7, 1, 4)), mat(k, { flatShading: true }), 0, 0.5, 0, { r: [0, Math.PI / 4, 0] }),
  ring: (g, k) => deel(g, geo("ring", () => new THREE.TorusGeometry(0.4, 0.1, 16, 48)), mat(k), 0, 0.5, 0),
  trap: (g, k) => { for (let i = 0; i < 5; i++) deel(g, BOX(), mat(k), 0, 0.1 + i * 0.2, 0.8 - i * 0.4, { s: [1, 0.2 + i * 0.2, 0.4] }).position.y = (0.2 + i * 0.2) / 2; },
  muur: (g, k) => deel(g, BOX(), mat(k), 0, 1.25, 0, { s: [4, 2.5, 0.25] }),
  boog: (g, k) => { deel(g, BOX(), mat(k), -1.1, 1.3, 0, { s: [0.35, 2.6, 0.35] }); deel(g, BOX(), mat(k), 1.1, 1.3, 0, { s: [0.35, 2.6, 0.35] });
                    deel(g, BOX(), mat(k), 0, 2.75, 0, { s: [3, 0.3, 0.45] }); },
  helling: (g, k) => {  // een schuine plaat waar je overheen kunt lopen (botsing per trede)
    deel(g, BOX(), mat(k), 0, 0.5, 0, { s: [1, 0.12, 2.3], r: [Math.atan2(1, 2), 0, 0], geenBotsing: true });
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(BOX(), mat(k)); m.visible = false; m.scale.set(1, (i + 1) / 8, 0.25); m.position.set(0, (i + 1) / 16, 0.9 - i * 0.25); g.add(m); }
  },
  boom: (g, k) => { deel(g, CYL(), mat("#7c4a1e"), 0, 0.7, 0, { s: [0.3, 1.4, 0.3] }); deel(g, geo("kruin", () => new THREE.IcosahedronGeometry(0.9, 1)), mat(k, { flatShading: true }), 0, 2, 0, { geenBotsing: true }); },
  den: (g, k) => { deel(g, CYL(), mat("#6b3f17"), 0, 0.4, 0, { s: [0.25, 0.8, 0.25] });
                   [[1.1, 1.2, 1], [0.85, 1.0, 1.7], [0.6, 0.9, 2.35]].forEach(([r, h, y]) => deel(g, geo("den" + r, () => new THREE.ConeGeometry(r, h, 10)), mat(k, { flatShading: true }), 0, y, 0, { geenBotsing: true })); },
  struik: (g, k) => { [[0, 0.35, 0, 0.5], [0.35, 0.3, 0.1, 0.4], [-0.3, 0.28, -0.1, 0.38]].forEach(([x, y, z, r]) => deel(g, SPH(), mat(k, { flatShading: true }), x, y, z, { s: [r * 2, r * 1.6, r * 2] })); },
  rots: (g, k) => deel(g, geo("rots", () => new THREE.DodecahedronGeometry(0.6, 0)), mat(k, { flatShading: true }), 0, 0.42, 0, { s: [1, 0.7, 0.9] }),
  bloem: (g, k) => { deel(g, CYL(), mat("#16a34a"), 0, 0.25, 0, { s: [0.04, 0.5, 0.04] }); deel(g, SPH(), mat(k), 0, 0.55, 0, { s: [0.22, 0.14, 0.22] }); deel(g, SPH(), mat("#fde047"), 0, 0.6, 0, { s: [0.08, 0.08, 0.08] }); },
  water: (g, k) => deel(g, BOX(), mat(k, { transparent: true, opacity: 0.65, roughness: 0.1 }), 0, 0.03, 0, { s: [1, 0.06, 1], schaduw: false }),
  wolk: (g, k) => { [[0, 0, 0, 1.2], [1, -0.1, 0.2, 0.9], [-1, -0.1, -0.1, 0.85], [0.4, 0.35, 0, 0.8]].forEach(([x, y, z, r]) => deel(g, SPH(), mat(k, { roughness: 1 }), x, 6 + y, z, { s: [r * 2, r * 1.5, r * 2], schaduw: false })); },
  huis: (g, k) => { deel(g, BOX(), mat(k), 0, 1.1, 0, { s: [3, 2.2, 3] });
                    deel(g, geo("dak", () => new THREE.ConeGeometry(2.4, 1.4, 4)), mat("#b91c1c", { flatShading: true }), 0, 2.9, 0, { r: [0, Math.PI / 4, 0] });
                    deel(g, BOX(), mat("#5b3714"), 0, 0.7, 1.51, { s: [0.8, 1.4, 0.04] });
                    [-0.95, 0.95].forEach((x) => deel(g, BOX(), mat("#93c5fd", { roughness: 0.2 }), x, 1.4, 1.51, { s: [0.6, 0.6, 0.04] })); },
  toren: (g, k) => { deel(g, CYL(), mat(k), 0, 3, 0, { s: [2, 6, 2] }); deel(g, geo("torendak", () => new THREE.ConeGeometry(1.25, 1.8, 24)), mat("#1d4ed8"), 0, 6.9, 0); },
  hek: (g, k) => { [-0.9, 0, 0.9].forEach((x) => deel(g, BOX(), mat(k), x, 0.5, 0, { s: [0.12, 1, 0.12] }));
                   [0.35, 0.75].forEach((y) => deel(g, BOX(), mat(k), 0, y, 0, { s: [2, 0.1, 0.06] })); },
  brug: (g, k) => { deel(g, BOX(), mat(k), 0, 0.45, 0, { s: [1.6, 0.15, 5] });
                    [-0.75, 0.75].forEach((x) => deel(g, BOX(), mat(k), x, 0.95, 0, { s: [0.08, 0.08, 5] }));
                    for (let z = -2.4; z <= 2.4; z += 1.2) [-0.75, 0.75].forEach((x) => deel(g, BOX(), mat(k), x, 0.7, z, { s: [0.08, 0.5, 0.08] })); },
  pad: (g, k) => deel(g, BOX(), mat(k, { roughness: 1 }), 0, 0.02, 0, { s: [1, 0.04, 1], schaduw: false }),
  tafel: (g, k) => { deel(g, BOX(), mat(k), 0, 0.75, 0, { s: [1.6, 0.08, 0.9] });
                     [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]].forEach(([x, z]) => deel(g, BOX(), mat(k), x, 0.36, z, { s: [0.08, 0.72, 0.08] })); },
  stoel: (g, k) => { deel(g, BOX(), mat(k), 0, 0.45, 0, { s: [0.5, 0.06, 0.5] }); deel(g, BOX(), mat(k), 0, 0.75, -0.22, { s: [0.5, 0.6, 0.06] });
                     [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => deel(g, BOX(), mat(k), x, 0.22, z, { s: [0.05, 0.44, 0.05] })); },
  bank: (g, k) => { deel(g, BOX(), mat(k), 0, 0.3, 0, { s: [2, 0.4, 0.8] }); deel(g, BOX(), mat(k), 0, 0.7, -0.33, { s: [2, 0.6, 0.14] });
                    [-0.95, 0.95].forEach((x) => deel(g, BOX(), mat(k), x, 0.5, 0, { s: [0.14, 0.4, 0.8] })); },
  lamp: (g, k) => { deel(g, CYL(), mat("#374151"), 0, 1.25, 0, { s: [0.08, 2.5, 0.08] });
                    deel(g, SPH(), new THREE.MeshStandardMaterial({ color: k, emissive: k, emissiveIntensity: 1.5 }), 0, 2.6, 0, { s: [0.35, 0.35, 0.35], schaduw: false });
                    if (lampen < 8) { lampen++; const l = new THREE.PointLight(k, 12, 10, 1.6); l.position.set(0, 2.5, 0); g.add(l); } },
  bord: (g, k, d) => { deel(g, BOX(), mat("#6b4423"), 0, 0.6, -0.04, { s: [0.12, 1.2, 0.08] });
                       const t = deel(g, BOX(), [mat("#6b4423"), mat("#6b4423"), mat("#6b4423"), mat("#6b4423"),
                         new THREE.MeshStandardMaterial({ map: tekstTextuur("", d.t || "", 512, 320, k, k === "#1f2937" || k === "#111827" ? "#ffffff" : "#111827") }), mat("#6b4423")],
                         0, 1.55, 0, { s: [1.6, 1, 0.08] }); t.userData.info = true; },
  kist: (g, k) => { deel(g, BOX(), mat(k), 0, 0.3, 0, { s: [0.9, 0.6, 0.6] }); deel(g, BOX(), mat("#facc15", { metalness: 0.6 }), 0, 0.45, 0.31, { s: [0.15, 0.15, 0.03] }); },
  start: (g, k) => { deel(g, CYL(), mat(k, { emissive: k, emissiveIntensity: 0.3 }), 0, 0.02, 0, { s: [1.2, 0.04, 1.2], geenBotsing: true, schaduw: false });
                     deel(g, CYL(), mat("#e5e7eb"), 0.5, 0.9, 0, { s: [0.05, 1.8, 0.05], geenBotsing: true });
                     deel(g, BOX(), mat(k), 0.78, 1.55, 0, { s: [0.5, 0.32, 0.02], geenBotsing: true }); },
  munt: (g, k) => deel(g, geo("munt", () => new THREE.CylinderGeometry(0.3, 0.3, 0.07, 32)), mat(k, { metalness: 0.8, roughness: 0.25, emissive: k, emissiveIntensity: 0.25 }), 0, 0.9, 0, { r: [Math.PI / 2, 0, 0] }),
  ster: (g, k) => deel(g, geo("ster", sterVorm), mat(k, { metalness: 0.6, roughness: 0.3, emissive: k, emissiveIntensity: 0.4 }), 0, 1, 0),
  finish: (g, k) => { [-1.4, 1.4].forEach((x) => deel(g, CYL(), mat("#e5e7eb"), x, 1.5, 0, { s: [0.15, 3, 0.15] }));
                      const c = document.createElement("canvas"); c.width = 256; c.height = 64; const x = c.getContext("2d");
                      for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? "#111" : "#fff"; x.fillRect(i * 16, j * 16, 16, 16); }
                      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
                      deel(g, BOX(), new THREE.MeshStandardMaterial({ map: t }), 0, 2.8, 0, { s: [2.9, 0.6, 0.05] }); },
  checkpoint: (g, k) => { deel(g, CYL(), mat(k, { emissive: k, emissiveIntensity: 0.4, transparent: true, opacity: 0.8 }), 0, 0.02, 0, { s: [1.4, 0.04, 1.4], schaduw: false });
                          deel(g, CYL(), mat("#e5e7eb"), 0, 1, 0, { s: [0.06, 2, 0.06] }); deel(g, BOX(), mat(k), 0.3, 1.75, 0, { s: [0.55, 0.35, 0.02] }); },
  springkussen: (g, k) => { deel(g, CYL(), mat("#1f2937"), 0, 0.1, 0, { s: [1.5, 0.2, 1.5] }); deel(g, CYL(), mat(k, { emissive: k, emissiveIntensity: 0.3 }), 0, 0.22, 0, { s: [1.3, 0.06, 1.3] }); },
  lava: (g, k) => deel(g, BOX(), new THREE.MeshStandardMaterial({ color: k, emissive: k, emissiveIntensity: 0.9, roughness: 0.6 }), 0, 0.05, 0, { s: [1, 0.1, 1] }),
  vraag: (g, k, d) => { deel(g, BOX(), mat("#374151"), 0, 0.6, 0, { s: [0.15, 1.2, 0.15] });
                        const t = deel(g, BOX(), new THREE.MeshStandardMaterial({ map: tekstTextuur("?", (d.vraag && d.vraag.v) || "", 512, 320, k, "#ffffff") }), 0, 1.6, 0, { s: [1.3, 0.8, 0.1] });
                        t.userData.info = true; },
  portaal: (g, k) => { deel(g, geo("portaal", () => new THREE.TorusGeometry(1.1, 0.12, 16, 64)), mat(k, { emissive: k, emissiveIntensity: 0.8 }), 0, 1.3, 0);
                       deel(g, geo("portaalvlak", () => new THREE.CircleGeometry(1.0, 48)), new THREE.MeshBasicMaterial({ color: k, transparent: true, opacity: 0.35, side: THREE.DoubleSide }), 0, 1.3, 0, { schaduw: false, geenBotsing: true }); },
  foto: (g, k, d) => {
    const it = ITEMS.get(d.i);
    const verh = it && it.breedte && it.hoogte ? it.breedte / it.hoogte : 4 / 3;
    let b = 2, h = b / verh; if (h > 2) { h = 2; b = h * verh; }
    deel(g, BOX(), mat(k), 0, 0.3 + h / 2 + 0.6, 0, { s: [b + 0.12, h + 0.12, 0.06] });
    const beeld = new THREE.MeshBasicMaterial({ color: 0xffffff });
    if (it && it.data) new THREE.TextureLoader().load("data:image/jpeg;base64," + it.data, (t) => { t.colorSpace = THREE.SRGBColorSpace; beeld.map = t; beeld.needsUpdate = true; });
    const p = deel(g, geo("vlak", () => new THREE.PlaneGeometry(1, 1)), beeld, 0, 0.3 + h / 2 + 0.6, 0.035, { s: [b, h, 1], schaduw: false });
    p.userData.info = true;
  },
  model: (g, k, d) => {
    const it = ITEMS.get(d.i);
    const plek = deel(g, BOX(), mat("#9ca3af", { transparent: true, opacity: 0.25 }), 0, 0.5, 0, { schaduw: false });
    if (!it || !it.data) return;
    new GLTFLoader().load("data:model/gltf-binary;base64," + it.data, (gltf) => {
      const obj = gltf.scene;
      const doos = new THREE.Box3().setFromObject(obj), maat = doos.getSize(new THREE.Vector3());
      obj.scale.setScalar(1 / Math.max(maat.x, maat.y, maat.z, 0.001));
      const d2 = new THREE.Box3().setFromObject(obj), m = d2.getCenter(new THREE.Vector3());
      obj.position.set(-m.x, -d2.min.y, -m.z);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      g.remove(plek); g.add(obj);
      botsingenBijwerken();
    }, undefined, () => {});
  },
};
let lampen = 0;

// --- De wereld: data naar 3D en terug -------------------------------------------------------------------------
const wereld = new THREE.Group(); scene.add(wereld);
let bouw = null;  // de data
const groepen = new Map();  // id -> THREE.Group

function nieuwId() { return Math.random().toString(36).slice(2, 10); }

function dingMaken(d) {
  const g = new THREE.Group();
  g.userData.ding = d;
  const bouwer = BOUWERS[d.v] || BOUWERS.blok;
  bouwer(g, d.k || (STANDAARD[d.v] || {}).k || "#cccccc", d);
  dingPlaatsen(g, d);
  wereld.add(g);
  groepen.set(d.id, g);
  return g;
}
function dingPlaatsen(g, d) {
  g.position.set(...d.p);
  g.rotation.set(0, graden(d.r || 0), 0);
  g.scale.set(...(d.s || [1, 1, 1]));
  g.userData.basis = g.position.clone();
}
function wereldOpbouwen() {
  for (const g of groepen.values()) wereld.remove(g);
  groepen.clear();
  lampen = 0;
  for (const d of bouw.dingen) dingMaken(d);
  omgevingMaken(bouw.omgeving);
  botsingenBijwerken();
}
function dingVernieuwen(d) {
  const oud = groepen.get(d.id);
  if (oud) { wereld.remove(oud); oud.traverse((o) => { if (o.isLight) lampen--; }); }
  return dingMaken(d);
}

// ---------------------------------------------------------------------------------------------------------------
// Botsen: elk zichtbaar deel van een ding als doos (zo werken trappen en poorten ook)
// ---------------------------------------------------------------------------------------------------------------
let botsers = [];
const SPELDINGEN = new Set(["munt", "ster", "finish", "checkpoint", "springkussen", "lava", "vraag", "portaal", "start"]);
function vast(d) { return d.vast ?? ((STANDAARD[d.v] || {}).vast !== false); }
function botsingenBijwerken() {
  botsers = [];
  wereld.updateMatrixWorld(true);
  for (const g of groepen.values()) {
    const d = g.userData.ding;
    if (!vast(d)) continue;
    const beweegt = !!(d.g);
    g.traverse((o) => {
      if (!o.isMesh || o.userData.geenBotsing) return;
      botsers.push({ mesh: o, box: new THREE.Box3().setFromObject(o), ding: d, beweegt, vorige: null });
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Beweging van dingen (draaien, zweven, heen en weer)
// ---------------------------------------------------------------------------------------------------------------
function bewegen(t) {
  for (const g of groepen.values()) {
    const d = g.userData.ding;
    const b = g.userData.basis;
    if (d.v === "munt" || d.v === "ster") g.rotation.y = t * 2 + (b.x + b.z);
    if (d.v === "portaal") g.children[0] && (g.children[0].rotation.z = t);
    if (!d.g || (BOUWEN && !testen)) continue;  // tijdens het bouwen staat alles stil, zodat je het kunt pakken
    const snel = d.snel || 1;
    if (d.g === "draait") g.rotation.y = graden(d.r || 0) + t * 0.8 * snel;
    else if (d.g === "zweeft") g.position.y = b.y + Math.sin(t * 1.6 * snel) * 0.3 + 0.3;
    else if (d.g === "op") g.position.y = b.y + (Math.sin(t * 0.8 * snel) + 1) * (d.afstand || 2) / 2;
    else if (d.g === "heen") {
      const a = graden(d.r || 0), s = Math.sin(t * 0.8 * snel) * (d.afstand || 3);
      g.position.x = b.x + Math.cos(a) * s; g.position.z = b.z - Math.sin(a) * s;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Spelen
// ---------------------------------------------------------------------------------------------------------------
const speler = { pos: new THREE.Vector3(), snelheid: new THREE.Vector3(), opGrond: false, kijk: 0, hoog: 0, staatOp: null };
const HALF = 0.3, LENGTE = 1.7, OOG = 1.6;
const invoer = { x: 0, z: 0, springen: false, toetsen: new Set() };
let spel = null;  // {bezig, start, punten, gepakt:Set, vragen:Map, checkpoint, klaar}

function startPlek() {
  const s = bouw.dingen.find((d) => d.v === "start");
  if (s) return { pos: new THREE.Vector3(s.p[0], s.p[1] + 0.05, s.p[2]), kijk: graden(s.r || 0) };
  return { pos: new THREE.Vector3(0, 0, 6), kijk: 0 };
}
function spelerNaar(plek) {
  speler.pos.copy(plek.pos); speler.snelheid.set(0, 0, 0); speler.kijk = plek.kijk; speler.hoog = 0;
}
function telDoelen() {
  const soort = bouw.spel.soort;
  return {
    munten: bouw.dingen.filter((d) => d.v === "munt" || d.v === "ster").length,
    vragen: bouw.dingen.filter((d) => d.v === "vraag").length,
    finish: bouw.dingen.some((d) => d.v === "finish"),
    soort,
  };
}

function spelStarten() {
  for (const g of groepen.values()) g.visible = true;
  spel = { bezig: true, start: performance.now(), punten: 0, gepakt: new Set(), vragen: new Map(), checkpoint: startPlek(), klaar: false, doelen: telDoelen() };
  spelerNaar(spel.checkpoint);
  $("#begin").hidden = true;
  hudBijwerken();
}

function spelKlaar(gehaald, reden) {
  if (!spel || spel.klaar) return;
  spel.klaar = true; spel.bezig = false;
  const tijd = performance.now() - spel.start;
  const scherm = $("#einde");
  scherm.hidden = false;
  scherm.innerHTML = `<div class="kaart"><h2>${gehaald ? "Gehaald!" : esc(reden || "Afgelopen")}</h2>
    <p class="groot">${spel.punten} punten · ${tijdTekst(tijd)}</p>
    <div id="toplijst"><p class="klein">${D.api ? "Score bewaren..." : "Log in om je score te bewaren."}</p></div>
    <div class="rij"><button class="knop hoofd" id="opnieuw">Opnieuw</button><button class="knop" id="rondkijken">Rondkijken</button></div></div>`;
  $("#opnieuw").onclick = () => { scherm.hidden = true; spelStarten(); };
  $("#rondkijken").onclick = () => { scherm.hidden = true; };
  if (D.api && D.ruimte.id && bouw.spel.soort !== "geen" && !BOUWEN) {
    api("ruimte_score", { p_id: D.ruimte.id, p_punten: spel.punten, p_tijd_ms: Math.round(tijd) })
      .then((r) => toplijstTonen(r.toplijst || [])).catch(() => { $("#toplijst").innerHTML = `<p class="klein">Je score kon niet worden bewaard.</p>`; });
  } else if (BOUWEN) $("#toplijst").innerHTML = `<p class="klein">Dit was een test. Spelers zien hier de toplijst.</p>`;
}
function toplijstTonen(lijst) {
  const el = $("#toplijst"); if (!el) return;
  el.innerHTML = lijst.length ? `<ol>${lijst.map((s) => `<li><span>${esc(s.naam)}</span><b>${s.punten} · ${tijdTekst(s.tijd_ms)}</b></li>`).join("")}</ol>` : "";
}
function tijdTekst(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function hudBijwerken() {
  const h = $("#hud");
  if (!spel || bouw.spel.soort === "geen") { h.innerHTML = ""; return; }
  const d = spel.doelen, delen = [];
  if (d.munten) delen.push(`🪙 ${[...spel.gepakt].filter((id) => { const x = bouw.dingen.find((y) => y.id === id); return x && (x.v === "munt" || x.v === "ster"); }).length}/${d.munten}`);
  if (d.vragen) delen.push(`❓ ${spel.vragen.size}/${d.vragen}`);
  delen.push(`★ ${spel.punten}`);
  const limiet = (bouw.spel.tijd || 0) * 1000;
  const verstreken = spel.bezig ? performance.now() - spel.start : 0;
  if (spel.bezig) delen.push(`⏱ ${tijdTekst(limiet ? Math.max(0, limiet - verstreken) : verstreken)}`);
  h.innerHTML = delen.map((x) => `<span>${x}</span>`).join("");
}

function melding(tekst) {
  const m = $("#melding"); m.textContent = tekst; m.classList.add("zichtbaar");
  clearTimeout(melding.t); melding.t = setTimeout(() => m.classList.remove("zichtbaar"), 2200);
}
function infoTonen(d) {
  const i = $("#info");
  if (!d) { i.hidden = true; return; }
  const it = d.i ? ITEMS.get(d.i) : null;
  const titel = it ? it.titel : NAMEN[d.v]?.naam || "";
  const tekst = d.t || (it ? it.tekst : "");
  if (!titel && !tekst) return;
  i.innerHTML = `<b>${esc(titel)}</b><div>${esc(tekst)}</div><button class="knop" id="info-dicht">Sluiten</button>`;
  i.hidden = false;
  $("#info-dicht").onclick = () => { i.hidden = true; };
}
function vraagTonen(d) {
  if (!d.vraag || (spel && spel.vragen.has(d.id))) return;
  const v = $("#vraag"), q = d.vraag;
  v.innerHTML = `<div class="kaart"><b>${esc(q.v)}</b>${(q.opties || []).map((o, k) => `<button class="knop optie" data-k="${k}">${esc(o)}</button>`).join("")}
    <button class="knop" id="vraag-later">Later</button></div>`;
  v.hidden = false;
  v.querySelectorAll(".optie").forEach((b) => b.onclick = () => {
    const goed = Number(b.dataset.k) === Number(q.goed);
    b.classList.add(goed ? "goed" : "fout");
    if (spel && spel.bezig) {
      spel.vragen.set(d.id, goed);
      if (goed) spel.punten += 10;
      hudBijwerken();
      const g = groepen.get(d.id); if (g) g.traverse((o) => { if (o.isMesh && o.userData.info) o.material = mat(goed ? "#16a34a" : "#dc2626"); });
    }
    melding(goed ? "Goed! +10" : `Helaas, het was: ${(q.opties || [])[q.goed] ?? ""}`);
    setTimeout(() => { v.hidden = true; doelenControleren(); }, 900);
  });
  $("#vraag-later").onclick = () => { v.hidden = true; d._later = performance.now(); };
}

function doelenControleren() {
  if (!spel || !spel.bezig) return;
  const soort = bouw.spel.soort, d = spel.doelen;
  const munten = [...spel.gepakt].filter((id) => { const x = bouw.dingen.find((y) => y.id === id); return x && (x.v === "munt" || x.v === "ster"); }).length;
  if (soort === "verzamelen" && d.munten && munten >= d.munten) spelKlaar(true);
  if (soort === "quiz" && d.vragen && spel.vragen.size >= d.vragen) spelKlaar(true);
}

// Aanraken van spel-dingen
const spelerDoos = new THREE.Box3();
function spelRegels() {
  if (BOUWEN && !testen) return;
  spelerDoos.min.set(speler.pos.x - HALF, speler.pos.y, speler.pos.z - HALF);
  spelerDoos.max.set(speler.pos.x + HALF, speler.pos.y + LENGTE, speler.pos.z + HALF);
  const nu = performance.now();
  for (const g of groepen.values()) {
    const d = g.userData.ding;
    if (!SPELDINGEN.has(d.v) || !g.visible) continue;
    const doos = new THREE.Box3().setFromObject(g).expandByScalar(d.v === "munt" || d.v === "ster" ? 0.25 : 0.05);
    if (!doos.intersectsBox(spelerDoos)) continue;
    if ((d.v === "munt" || d.v === "ster") && spel && spel.bezig && !spel.gepakt.has(d.id)) {
      spel.gepakt.add(d.id); g.visible = false; spel.punten += d.v === "ster" ? 5 : 1;
      melding(d.v === "ster" ? "Ster! +5" : "+1"); hudBijwerken(); doelenControleren();
    } else if (d.v === "finish" && spel && spel.bezig) {
      if (bouw.spel.soort === "verzamelen" && spel.doelen.munten && spel.gepakt.size < spel.doelen.munten) {
        if (!d._gemeld || nu - d._gemeld > 3000) { melding("Pak eerst alle munten!"); d._gemeld = nu; }
      } else { spel.punten += 20; spelKlaar(true); }
    } else if (d.v === "checkpoint" && spel) {
      if (spel.checkpoint.id !== d.id) { spel.checkpoint = { id: d.id, pos: new THREE.Vector3(d.p[0], d.p[1] + 0.05, d.p[2]), kijk: speler.kijk }; melding("Checkpoint"); }
    } else if (d.v === "springkussen" && speler.snelheid.y <= 0.1 && speler.pos.y >= g.position.y + 0.1) {
      speler.snelheid.y = 14; speler.opGrond = false;
    } else if (d.v === "lava") {
      melding("Au! Terug naar het checkpoint."); spelerNaar(spel ? spel.checkpoint : startPlek());
    } else if (d.v === "portaal" && (!speler.portaalTot || nu > speler.portaalTot)) {
      const alle = bouw.dingen.filter((x) => x.v === "portaal");
      if (alle.length > 1) {
        const doel = alle[(alle.findIndex((x) => x.id === d.id) + 1) % alle.length];
        const a = graden(doel.r || 0);
        speler.pos.set(doel.p[0] + Math.sin(a) * 1.6, doel.p[1] + 0.05, doel.p[2] + Math.cos(a) * 1.6);
        speler.portaalTot = nu + 1500; melding("Woesh!");
      }
    } else if (d.v === "vraag" && spel && spel.bezig && !spel.vragen.has(d.id) && $("#vraag").hidden && (!d._later || nu - d._later > 6000)) {
      vraagTonen(d);
    }
  }
  if (spel && spel.bezig && bouw.spel.tijd && nu - spel.start > bouw.spel.tijd * 1000) spelKlaar(false, "De tijd is om");
}

// Overlap met een klein beetje speling, zodat 'precies erop staan' niet als botsen telt.
function raakt(a, b, e = 0.002) {
  return a.min.x < b.max.x - e && a.max.x > b.min.x + e && a.min.y < b.max.y - e && a.max.y > b.min.y + e && a.min.z < b.max.z - e && a.max.z > b.min.z + e;
}

// Lopen, springen en botsen (as voor as, met opstappen op treden tot 45 cm).
function spelerBewegen(dt) {
  dt = Math.min(dt, 0.05);
  const kijk = renderer.xr.isPresenting ? speler.kijk + (invoer._vrKijk || 0) : speler.kijk;
  const vooruit = new THREE.Vector3(-Math.sin(kijk), 0, -Math.cos(kijk));
  const rechts = new THREE.Vector3(Math.cos(kijk), 0, -Math.sin(kijk));
  let ix = invoer.x, iz = invoer.z;
  const t = invoer.toetsen;
  if (t.has("KeyW") || t.has("ArrowUp")) iz += 1;
  if (t.has("KeyS") || t.has("ArrowDown")) iz -= 1;
  if (t.has("KeyA") || t.has("ArrowLeft")) ix -= 1;
  if (t.has("KeyD") || t.has("ArrowRight")) ix += 1;
  const lengte = Math.hypot(ix, iz); if (lengte > 1) { ix /= lengte; iz /= lengte; }
  const snelheid = 4.6;
  const wens = vooruit.multiplyScalar(iz * snelheid).add(rechts.multiplyScalar(ix * snelheid));
  speler.snelheid.x = wens.x; speler.snelheid.z = wens.z;
  if ((invoer.springen || t.has("Space")) && speler.opGrond) { speler.snelheid.y = 7.8; speler.opGrond = false; }
  invoer.springen = false;
  speler.snelheid.y -= 22 * dt;
  if (speler.snelheid.y < -30) speler.snelheid.y = -30;

  // Meebewegen met een bewegend platform
  if (speler.staatOp && speler.staatOp.beweegt && speler.staatOp.vorige) {
    const nu = speler.staatOp.box.getCenter(new THREE.Vector3());
    speler.pos.add(nu.sub(speler.staatOp.vorige));
  }
  const doos = () => {
    spelerDoos.min.set(speler.pos.x - HALF, speler.pos.y, speler.pos.z - HALF);
    spelerDoos.max.set(speler.pos.x + HALF, speler.pos.y + LENGTE, speler.pos.z + HALF);
    return spelerDoos;
  };
  for (const as of ["x", "z"]) {
    const stap = speler.snelheid[as] * dt;
    if (!stap) continue;
    speler.pos[as] += stap;
    for (const b of botsers) {
      if (!raakt(doos(), b.box)) continue;
      const opstap = b.box.max.y - speler.pos.y;
      if (opstap > 0 && opstap <= 0.45 && speler.opGrond) {
        const oud = speler.pos.y; speler.pos.y = b.box.max.y + 0.001;
        if (!botsers.some((c) => c !== b && raakt(doos(), c.box))) continue;
        speler.pos.y = oud;
      }
      speler.pos[as] = stap > 0 ? b.box.min[as] - HALF - 0.001 : b.box.max[as] + HALF + 0.001;
    }
  }
  const vorigeY = speler.pos.y;
  speler.pos.y += speler.snelheid.y * dt;
  speler.opGrond = false; speler.staatOp = null;
  const e = 0.002;
  for (const b of botsers) {
    const d = doos();
    if (!(d.min.x < b.box.max.x - e && d.max.x > b.box.min.x + e && d.min.z < b.box.max.z - e && d.max.z > b.box.min.z + e)) continue;
    if (speler.snelheid.y <= 0) {
      // landen: de voeten kwamen van boven de bovenkant (of staan er net op)
      if (vorigeY >= b.box.max.y - 0.05 && speler.pos.y <= b.box.max.y + 0.01) {
        speler.pos.y = b.box.max.y; speler.snelheid.y = 0; speler.opGrond = true; speler.staatOp = b;
      }
    } else if (speler.pos.y + LENGTE > b.box.min.y && vorigeY + LENGTE <= b.box.min.y + 0.05) {
      speler.pos.y = b.box.min.y - LENGTE - 0.001; speler.snelheid.y = 0;  // hoofd stoten
    }
  }
  if (vloer && speler.pos.y < 0 && speler.pos.y > -1.5) { speler.pos.y = 0; speler.snelheid.y = Math.max(0, speler.snelheid.y); speler.opGrond = true; }
  if (speler.pos.y < -25) { melding("Oeps! Opnieuw vanaf het checkpoint."); spelerNaar(spel ? spel.checkpoint : startPlek()); }
  speler.pos.x = THREE.MathUtils.clamp(speler.pos.x, -98, 98); speler.pos.z = THREE.MathUtils.clamp(speler.pos.z, -98, 98);
}
function botsersBijwerken() {
  for (const b of botsers) {
    if (!b.beweegt) continue;
    b.vorige = b.box.getCenter(b.vorige || new THREE.Vector3());
    b.box.setFromObject(b.mesh);
  }
}
function spelerCamera() {
  rig.position.copy(speler.pos);
  if (renderer.xr.isPresenting) { rig.rotation.set(0, speler.kijk, 0); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); return; }
  rig.rotation.set(0, 0, 0);
  camera.position.set(0, OOG, 0);
  camera.rotation.set(speler.hoog, speler.kijk, 0, "YXZ");
}

// ---------------------------------------------------------------------------------------------------------------
// Aanraken en muis
// ---------------------------------------------------------------------------------------------------------------
const straal = new THREE.Raycaster();
function aangewezen(x, y) {
  const r = doek.getBoundingClientRect();
  straal.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  const raak = straal.intersectObjects([...groepen.values()].filter((g) => g.visible), true);
  for (const h of raak) {
    let o = h.object;
    while (o && !o.userData.ding) o = o.parent;
    if (o) return { groep: o, punt: h.point };
  }
  return null;
}

const vingers = new Map();
let stick = null;
function spelAanraken() {
  doek.addEventListener("pointerdown", (e) => {
    if (BOUWEN && !testen) return;
    doek.setPointerCapture(e.pointerId);
    const links = e.pointerType !== "mouse" && e.clientX < window.innerWidth * 0.45;
    vingers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), stick: links });
    if (links && !stick) { stick = e.pointerId; stickTonen(e.clientX, e.clientY, 0, 0); }
  });
  doek.addEventListener("pointermove", (e) => {
    if (BOUWEN && !testen) return;
    const v = vingers.get(e.pointerId); if (!v) return;
    if (v.stick) {
      let dx = e.clientX - v.sx, dy = e.clientY - v.sy; const l = Math.hypot(dx, dy), max = 55;
      if (l > max) { dx *= max / l; dy *= max / l; }
      invoer.x = dx / max; invoer.z = -dy / max; stickTonen(v.sx, v.sy, dx, dy);
    } else {
      speler.kijk -= (e.clientX - v.x) * 0.006;
      speler.hoog = THREE.MathUtils.clamp(speler.hoog - (e.clientY - v.y) * 0.006, -1.3, 1.3);
    }
    v.x = e.clientX; v.y = e.clientY;
  });
  const los = (e) => {
    if (BOUWEN && !testen) return;
    const v = vingers.get(e.pointerId); if (!v) return;
    vingers.delete(e.pointerId);
    if (v.stick) { stick = null; invoer.x = invoer.z = 0; $("#stick").hidden = true; return; }
    if (Math.hypot(e.clientX - v.sx, e.clientY - v.sy) < 8 && performance.now() - v.t < 350) {
      const raak = aangewezen(e.clientX, e.clientY);
      if (raak) {
        const d = raak.groep.userData.ding;
        if (d.v === "vraag") { if (spel && spel.bezig) vraagTonen(d); else infoTonen({ ...d, t: d.vraag?.v }); }
        else infoTonen(d);
      }
    }
  };
  doek.addEventListener("pointerup", los);
  doek.addEventListener("pointercancel", los);
  window.addEventListener("keydown", (e) => {
    if ((BOUWEN && !testen) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    invoer.toetsen.add(e.code);
  });
  window.addEventListener("keyup", (e) => invoer.toetsen.delete(e.code));
  window.addEventListener("blur", () => invoer.toetsen.clear());
  $("#spring").addEventListener("pointerdown", (e) => { e.preventDefault(); invoer.springen = true; });
}
function stickTonen(x, y, dx, dy) {
  const s = $("#stick"); s.hidden = false;
  s.style.left = x - 50 + "px"; s.style.top = y - 50 + "px";
  s.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
}

// ---------------------------------------------------------------------------------------------------------------
// VR (bijvoorbeeld Meta Quest): linkerstick lopen, rechterstick draaien, A of trekker springen
// ---------------------------------------------------------------------------------------------------------------
let draaiKlaar = true;
function vrInvoer() {
  const sessie = renderer.xr.getSession(); if (!sessie) return;
  for (const bron of sessie.inputSources) {
    const gp = bron.gamepad; if (!gp) continue;
    const x = gp.axes[2] || 0, y = gp.axes[3] || 0;
    if (bron.handedness === "left") { invoer.x = Math.abs(x) > 0.15 ? x : 0; invoer.z = Math.abs(y) > 0.15 ? -y : 0; }
    if (bron.handedness === "right") {
      if (Math.abs(x) > 0.7 && draaiKlaar) { speler.kijk -= Math.sign(x) * Math.PI / 4; draaiKlaar = false; }
      if (Math.abs(x) < 0.3) draaiKlaar = true;
      if ((gp.buttons[4] && gp.buttons[4].pressed) || (gp.buttons[0] && gp.buttons[0].pressed)) invoer.springen = true;
    }
  }
  // lopen in de kijkrichting van je hoofd
  const hoofd = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  invoer._vrKijk = hoofd.y;
}
async function vrKnop() {
  if (!navigator.xr || !(await navigator.xr.isSessionSupported("immersive-vr").catch(() => false))) return;
  renderer.xr.enabled = true;
  const k = $("#vr"); k.hidden = false;
  k.onclick = async () => {
    const sessie = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] }).catch(() => null);
    if (!sessie) return melding("VR kon niet starten.");
    renderer.xr.setReferenceSpaceType("local-floor");
    await renderer.xr.setSession(sessie);
    if (!spel) spelStarten();
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Bouwen
// ---------------------------------------------------------------------------------------------------------------
let testen = false;
let gekozen = null;  // id
const kader = new THREE.BoxHelper(undefined, 0xfacc15);
kader.visible = false; scene.add(kader);
const baan = { doel: new THREE.Vector3(0, 0, 0), afstand: 16, hoek: 0.6, hoogte: 0.75 };
const terug = [], vooruitStapels = [];
let bewaarTimer = null, bewaarStatus = "opgeslagen";

function bouwCamera() {
  const { doel, afstand, hoek, hoogte } = baan;
  camera.position.set(doel.x + afstand * Math.sin(hoek) * Math.cos(hoogte), doel.y + afstand * Math.sin(hoogte), doel.z + afstand * Math.cos(hoek) * Math.cos(hoogte));
  camera.lookAt(doel);
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
}

function momentopname() {
  terug.push(JSON.stringify(bouw)); if (terug.length > 60) terug.shift();
  vooruitStapels.length = 0;
}
function gewijzigd() {
  bewaarStatus = "wijzigingen"; statusTonen();
  clearTimeout(bewaarTimer); bewaarTimer = setTimeout(bewaren, 2500);
}
function ongedaan(stapel, ander) {
  if (!stapel.length) return;
  ander.push(JSON.stringify(bouw));
  bouw = JSON.parse(stapel.pop());
  kiezen(null); wereldOpbouwen(); gewijzigd();
}

function kiezen(id) {
  gekozen = id;
  const g = id ? groepen.get(id) : null;
  kader.visible = !!g;
  if (g) kader.setFromObject(g);
  paneelTonen();
}
function ding() { return gekozen ? bouw.dingen.find((d) => d.id === gekozen) : null; }

// Laat iets vallen tot het op de vloer of op een ander ding staat.
function laatVallen(d) {
  const g = groepen.get(d.id); if (!g) return;
  const eigen = new THREE.Box3().setFromObject(g);
  let hoogste = vloer ? 0 : d.p[1];
  for (const [id, ander] of groepen) {
    if (id === d.id || !vast(ander.userData.ding)) continue;
    const b = new THREE.Box3().setFromObject(ander);
    if (b.max.x > eigen.min.x + 0.05 && b.min.x < eigen.max.x - 0.05 && b.max.z > eigen.min.z + 0.05 && b.min.z < eigen.max.z - 0.05 && b.max.y <= eigen.min.y + 0.3 + (d.p[1] - eigen.min.y))
      hoogste = Math.max(hoogste, b.max.y);
  }
  d.p[1] = rond(hoogste, 0.05);
}

function toevoegen(v, extra = {}) {
  momentopname();
  const st = STANDAARD[v] || {};
  const d = { id: nieuwId(), v, p: [rond(baan.doel.x, 0.5), 0, rond(baan.doel.z, 0.5)], r: 0, s: [...(st.s || [1, 1, 1])], k: st.k, ...extra };
  if (st.t) d.t = st.t;
  if (st.vraag) d.vraag = JSON.parse(JSON.stringify(st.vraag));
  if (st.vast === false) d.vast = false;
  if (v === "wolk") d.p[1] = 0;
  bouw.dingen.push(d);
  dingMaken(d);
  if (v !== "wolk") { laatVallen(d); dingPlaatsen(groepen.get(d.id), d); }
  botsingenBijwerken();
  kiezen(d.id); gewijzigd();
  $("#catalogus").hidden = true;
}

function aanpassen(fn, opnieuwBouwen = false) {
  const d = ding(); if (!d) return;
  momentopname();
  fn(d);
  if (opnieuwBouwen) dingVernieuwen(d); else dingPlaatsen(groepen.get(d.id), d);
  botsingenBijwerken();
  kader.setFromObject(groepen.get(d.id));
  gewijzigd(); paneelTonen();
}

function richtingVanCamera(dx, dz) {
  // pijltjes bewegen ten opzichte van waar je naar kijkt, in hele stappen langs het raster
  const vooruit = new THREE.Vector3(); camera.getWorldDirection(vooruit); vooruit.y = 0; vooruit.normalize();
  const rechts = new THREE.Vector3(-vooruit.z, 0, vooruit.x);
  const v = rechts.multiplyScalar(dx).add(vooruit.multiplyScalar(dz));
  return Math.abs(v.x) > Math.abs(v.z) ? [Math.sign(v.x), 0] : [0, Math.sign(v.z)];
}

function bouwAanraken() {
  let sleep = null;  // {id, vlakY, verschil}
  let tweeVingers = null;
  const vlak = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const punt = (x, y) => {
    const r = doek.getBoundingClientRect();
    straal.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    return straal.ray.intersectPlane(vlak, new THREE.Vector3());
  };
  doek.addEventListener("pointerdown", (e) => {
    if (testen) return;
    doek.setPointerCapture(e.pointerId);
    vingers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), knop: e.button });
    if (vingers.size === 2) {
      sleep = null;
      const [a, b] = [...vingers.values()];
      tweeVingers = { afstand: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    const raak = aangewezen(e.clientX, e.clientY);
    if (raak && raak.groep.userData.ding.id === gekozen && e.button === 0) {
      const d = ding();
      vlak.constant = -d.p[1];
      const p = punt(e.clientX, e.clientY);
      if (p) { momentopname(); sleep = { verschil: new THREE.Vector3(d.p[0] - p.x, 0, d.p[2] - p.z), bewogen: false }; }
    }
  });
  doek.addEventListener("pointermove", (e) => {
    const v = vingers.get(e.pointerId); if (!v || testen) return;
    const dx = e.clientX - v.x, dy = e.clientY - v.y;
    v.x = e.clientX; v.y = e.clientY;
    if (vingers.size === 2 && tweeVingers) {
      const [a, b] = [...vingers.values()];
      const afstand = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      baan.afstand = THREE.MathUtils.clamp(baan.afstand * (tweeVingers.afstand / Math.max(afstand, 1)), 3, 90);
      schuiven(mx - tweeVingers.mx, my - tweeVingers.my);
      Object.assign(tweeVingers, { afstand, mx, my });
      return;
    }
    if (sleep) {
      const p = punt(e.clientX, e.clientY); if (!p) return;
      const d = ding();
      d.p[0] = rond(p.x + sleep.verschil.x, 0.25); d.p[2] = rond(p.z + sleep.verschil.z, 0.25);
      dingPlaatsen(groepen.get(d.id), d); kader.setFromObject(groepen.get(d.id)); sleep.bewogen = true;
      return;
    }
    if (v.knop === 2 || e.shiftKey) schuiven(dx, dy);
    else { baan.hoek -= dx * 0.008; baan.hoogte = THREE.MathUtils.clamp(baan.hoogte + dy * 0.006, 0.08, 1.45); }
  });
  const los = (e) => {
    const v = vingers.get(e.pointerId); if (!v) return;
    vingers.delete(e.pointerId);
    if (vingers.size < 2) tweeVingers = null;
    if (sleep) {
      if (sleep.bewogen) { botsingenBijwerken(); gewijzigd(); } else terug.pop();
      sleep = null; return;
    }
    if (Math.hypot(e.clientX - v.sx, e.clientY - v.sy) < 8 && performance.now() - v.t < 400 && !testen) {
      const raak = aangewezen(e.clientX, e.clientY);
      kiezen(raak ? raak.groep.userData.ding.id : null);
    }
  };
  doek.addEventListener("pointerup", los);
  doek.addEventListener("pointercancel", los);
  doek.addEventListener("contextmenu", (e) => e.preventDefault());
  doek.addEventListener("wheel", (e) => { e.preventDefault(); baan.afstand = THREE.MathUtils.clamp(baan.afstand * (1 + Math.sign(e.deltaY) * 0.1), 3, 90); }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (testen || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && gekozen) { weghalen(); e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { ongedaan(e.shiftKey ? vooruitStapels : terug, e.shiftKey ? terug : vooruitStapels); e.preventDefault(); }
  });
}
function schuiven(dx, dy) {
  const vooruit = new THREE.Vector3(); camera.getWorldDirection(vooruit); vooruit.y = 0; vooruit.normalize();
  const rechts = new THREE.Vector3(-vooruit.z, 0, vooruit.x), f = baan.afstand / 500;
  baan.doel.addScaledVector(rechts, -dx * f).addScaledVector(vooruit, dy * f);
  baan.doel.x = THREE.MathUtils.clamp(baan.doel.x, -100, 100); baan.doel.z = THREE.MathUtils.clamp(baan.doel.z, -100, 100);
}
function weghalen() {
  const d = ding(); if (!d) return;
  momentopname();
  bouw.dingen = bouw.dingen.filter((x) => x.id !== d.id);
  const g = groepen.get(d.id); if (g) { wereld.remove(g); groepen.delete(d.id); }
  botsingenBijwerken(); kiezen(null); gewijzigd();
}
function kopie() {
  const d = ding(); if (!d) return;
  momentopname();
  const n = JSON.parse(JSON.stringify(d)); n.id = nieuwId();
  const [x, z] = richtingVanCamera(1, 0);
  const g = groepen.get(d.id), maat = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  n.p[0] = rond(n.p[0] + x * Math.max(1, Math.ceil(maat.x)), 0.25); n.p[2] = rond(n.p[2] + z * Math.max(1, Math.ceil(maat.z)), 0.25);
  bouw.dingen.push(n); dingMaken(n); botsingenBijwerken(); kiezen(n.id); gewijzigd();
}

// --- Het paneel van het gekozen ding ---------------------------------------------------------------------------
function paneelTonen() {
  const p = $("#paneel"), d = ding();
  $("#toevoegen").hidden = !!d || testen;
  if (!d || testen) { p.hidden = true; return; }
  const n = NAMEN[d.v] || { icoon: "", naam: d.v };
  const it = d.i ? ITEMS.get(d.i) : null;
  const s = d.s || [1, 1, 1];
  const vastAan = vast(d);
  p.hidden = false;
  p.innerHTML = `
    <div class="kop"><b>${n.icoon} ${esc(it?.titel || n.naam)}</b><button class="knop" data-a="klaar">Klaar</button></div>
    <div class="groep"><span class="label">Verplaatsen</span>
      <div class="rij"><button class="knop rond" data-a="links" aria-label="Naar links">◀</button><button class="knop rond" data-a="voor" aria-label="Naar achteren">▲</button>
      <button class="knop rond" data-a="achter" aria-label="Naar voren">▼</button><button class="knop rond" data-a="rechts" aria-label="Naar rechts">▶</button>
      <button class="knop" data-a="hoger">Hoger</button><button class="knop" data-a="lager">Lager</button><button class="knop" data-a="vallen">Neerzetten</button></div>
      <small>Of sleep het ding met je vinger.</small></div>
    <div class="groep"><span class="label">Draaien en maat</span>
      <div class="rij"><button class="knop" data-a="draai-">⟲ Draai</button><button class="knop" data-a="draai+">Draai ⟳</button>
      <button class="knop" data-a="kleiner">Kleiner</button><button class="knop" data-a="groter">Groter</button></div>
      <div class="rij maten">${["Breedte", "Hoogte", "Diepte"].map((naam, k) => `<label>${naam}<span><button class="knop mini" data-a="maat" data-k="${k}" data-d="-1">−</button><b>${s[k].toFixed(2).replace(/\.?0+$/, "")}</b><button class="knop mini" data-a="maat" data-k="${k}" data-d="1">+</button></span></label>`).join("")}</div></div>
    <div class="groep"><span class="label">Kleur</span><div class="kleuren">${KLEUREN.map((k) => `<button class="kleur ${k === d.k ? "aan" : ""}" data-a="kleur" data-k="${k}" style="background:${k}" aria-label="Kleur ${k}"></button>`).join("")}
      <input type="color" id="eigen-kleur" value="${esc(d.k || "#cccccc")}" aria-label="Eigen kleur"></div></div>
    <div class="groep"><span class="label">Gedrag</span>
      <div class="rij">${Object.entries(BEWEGINGEN).map(([k, naam]) => `<button class="knop pil ${(d.g || "") === k ? "aan" : ""}" data-a="beweging" data-k="${k}">${naam}</button>`).join("")}</div>
      ${d.g ? `<div class="rij"><label class="schuif">Snelheid <input type="range" min="0.25" max="3" step="0.25" value="${d.snel || 1}" id="snel"></label>
        ${d.g === "heen" || d.g === "op" ? `<label class="schuif">Afstand <input type="range" min="1" max="12" step="0.5" value="${d.afstand || (d.g === "op" ? 2 : 3)}" id="afstand"></label>` : ""}</div>` : ""}
      <label class="vink"><input type="checkbox" id="vast" ${vastAan ? "checked" : ""}> Stevig: je kunt erop staan en er niet doorheen lopen</label></div>
    ${d.v === "bord" || d.v === "foto" || d.v === "model" || d.v === "blok" || d.v === "kist" ? `<div class="groep"><span class="label">${d.v === "bord" ? "Tekst op het bord" : "Uitleg als je erop tikt"}</span>
      <textarea id="tekst" rows="3" maxlength="400">${esc(d.t || "")}</textarea></div>` : ""}
    ${d.v === "vraag" ? `<div class="groep"><span class="label">Vraag</span>
      <input id="vraag-v" maxlength="160" value="${esc(d.vraag?.v || "")}" placeholder="Je vraag">
      ${(d.vraag?.opties || []).map((o, k) => `<div class="rij optie-rij"><input type="radio" name="goed" value="${k}" ${Number(d.vraag.goed) === k ? "checked" : ""} aria-label="Goede antwoord">
        <input class="optie-veld" data-k="${k}" maxlength="80" value="${esc(o)}" placeholder="Antwoord ${k + 1}"></div>`).join("")}
      <div class="rij"><button class="knop" data-a="optie+">Antwoord erbij</button>${(d.vraag?.opties || []).length > 2 ? `<button class="knop" data-a="optie-">Laatste weg</button>` : ""}</div>
      <small>Kies met het rondje welk antwoord goed is.</small></div>` : ""}
    <div class="rij onder"><button class="knop" data-a="kopie">Kopie</button><button class="knop gevaar" data-a="weg">Weghalen</button></div>`;
  p.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => paneelActie(b.dataset.a, b.dataset));
  const kleur = $("#eigen-kleur"); if (kleur) kleur.onchange = () => aanpassen((x) => { x.k = kleur.value; }, true);
  const v = $("#vast"); if (v) v.onchange = () => aanpassen((x) => { x.vast = v.checked; });
  const t = $("#tekst"); if (t) t.onchange = () => aanpassen((x) => { x.t = t.value.slice(0, 400); }, d.v === "bord");
  const sn = $("#snel"); if (sn) sn.onchange = () => aanpassen((x) => { x.snel = Number(sn.value); });
  const af = $("#afstand"); if (af) af.onchange = () => aanpassen((x) => { x.afstand = Number(af.value); });
  const vv = $("#vraag-v"); if (vv) vv.onchange = () => aanpassen((x) => { x.vraag.v = vv.value.slice(0, 160); }, true);
  p.querySelectorAll(".optie-veld").forEach((o) => o.onchange = () => aanpassen((x) => { x.vraag.opties[Number(o.dataset.k)] = o.value.slice(0, 80); }));
  p.querySelectorAll("input[name=goed]").forEach((o) => o.onchange = () => aanpassen((x) => { x.vraag.goed = Number(o.value); }));
}
function paneelActie(a, data) {
  const stap = 0.5;
  if (a === "klaar") return kiezen(null);
  if (a === "weg") return weghalen();
  if (a === "kopie") return kopie();
  if (["links", "rechts", "voor", "achter"].includes(a)) {
    const [x, z] = richtingVanCamera(a === "links" ? -1 : a === "rechts" ? 1 : 0, a === "voor" ? 1 : a === "achter" ? -1 : 0);
    return aanpassen((d) => { d.p[0] = rond(d.p[0] + x * stap); d.p[2] = rond(d.p[2] + z * stap); });
  }
  if (a === "hoger") return aanpassen((d) => { d.p[1] = rond(d.p[1] + 0.25); });
  if (a === "lager") return aanpassen((d) => { d.p[1] = Math.max(vloer ? 0 : -20, rond(d.p[1] - 0.25)); });
  if (a === "vallen") return aanpassen((d) => laatVallen(d));
  if (a === "draai-" || a === "draai+") return aanpassen((d) => { d.r = ((d.r || 0) + (a === "draai+" ? -15 : 15) + 360) % 360; });
  if (a === "kleiner" || a === "groter") return aanpassen((d) => { const f = a === "groter" ? 1.25 : 0.8; d.s = d.s.map((x) => THREE.MathUtils.clamp(Math.round(x * f * 100) / 100, 0.1, 30)); });
  if (a === "maat") return aanpassen((d) => { const k = Number(data.k); d.s[k] = THREE.MathUtils.clamp(Math.round((d.s[k] + Number(data.d) * (d.s[k] >= 2 ? 0.5 : 0.25)) * 100) / 100, 0.1, 30); });
  if (a === "kleur") return aanpassen((d) => { d.k = data.k; }, true);
  if (a === "beweging") return aanpassen((d) => { if (data.k) d.g = data.k; else delete d.g; dingPlaatsen(groepen.get(d.id), d); });
  if (a === "optie+") return aanpassen((d) => { if (d.vraag.opties.length < 6) d.vraag.opties.push(""); });
  if (a === "optie-") return aanpassen((d) => { d.vraag.opties.pop(); if (d.vraag.goed >= d.vraag.opties.length) d.vraag.goed = 0; });
}

// --- Catalogus, omgeving en spelregels --------------------------------------------------------------------------
function catalogusTonen(tab = 0) {
  const c = $("#catalogus");
  const fotos = (D.items || []).filter((i) => i.soort === "foto" || i.soort === "model");
  const tabs = [...CATALOGUS.map((x) => x.naam), "Mijn foto's"];
  c.hidden = false;
  c.innerHTML = `<div class="kop"><b>Toevoegen</b><button class="knop" data-a="dicht">Sluiten</button></div>
    <div class="tabs">${tabs.map((t, k) => `<button class="knop pil ${k === tab ? "aan" : ""}" data-tab="${k}">${t}</button>`).join("")}</div>
    <div class="tegels">${tab < CATALOGUS.length ? CATALOGUS[tab].dingen.map(([v, ic, n]) => `<button class="tegel" data-v="${v}"><span>${ic}</span>${n}</button>`).join("")
      : fotos.length ? fotos.map((f) => `<button class="tegel" data-v="${f.soort}" data-i="${f.id}">${f.soort === "foto" && (f.klein || f.data) ? `<img src="data:image/jpeg;base64,${f.klein || f.data}" alt="">` : `<span>🧊</span>`}${esc(f.titel || (f.soort === "foto" ? "Foto" : "3D-model"))}</button>`).join("")
      : `<p class="klein">Nog geen foto's of 3D-modellen. Voeg ze toe onder de bouwer, bij "Foto's en 3D-modellen".</p>`}</div>
    ${tab === 4 ? `<p class="klein">Spel: munten en sterren geven punten, de finish beëindigt het spel, een checkpoint onthoudt waar je was, lava stuurt je terug en een portaal brengt je naar het volgende portaal.</p>` : ""}`;
  c.querySelector("[data-a=dicht]").onclick = () => { c.hidden = true; };
  c.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => catalogusTonen(Number(b.dataset.tab)));
  c.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => toevoegen(b.dataset.v, b.dataset.i ? { i: Number(b.dataset.i) } : {}));
}
function blad(id, html, bind) {
  const b = $(id); b.hidden = false; b.innerHTML = html; bind(b);
  b.querySelector("[data-a=dicht]").onclick = () => { b.hidden = true; };
}
function omgevingTonen() {
  const o = bouw.omgeving;
  blad("#instellingen", `<div class="kop"><b>Omgeving</b><button class="knop" data-a="dicht">Klaar</button></div>
    <span class="label">Lucht</span><div class="rij">${Object.entries(LUCHTEN).map(([k, l]) => `<button class="knop pil ${o.lucht === k ? "aan" : ""}" data-lucht="${k}">${l.naam}</button>`).join("")}</div>
    <span class="label">Vloer</span><div class="rij">${Object.entries(VLOEREN).map(([k, n]) => `<button class="knop pil ${o.vloer === k ? "aan" : ""}" data-vloer="${k}">${n}</button>`).join("")}</div>`,
  (b) => {
    b.querySelectorAll("[data-lucht]").forEach((x) => x.onclick = () => { momentopname(); o.lucht = x.dataset.lucht; omgevingMaken(o); gewijzigd(); omgevingTonen(); });
    b.querySelectorAll("[data-vloer]").forEach((x) => x.onclick = () => { momentopname(); o.vloer = x.dataset.vloer; omgevingMaken(o); gewijzigd(); omgevingTonen(); });
  });
}
function spelTonen() {
  const s = bouw.spel, d = telDoelen();
  const waarschuwing = s.soort === "verzamelen" && !d.munten ? "Zet nog munten of sterren neer (Toevoegen › Spel)."
    : s.soort === "parcours" && !d.finish ? "Zet nog een finish neer (Toevoegen › Spel)."
    : s.soort === "quiz" && !d.vragen ? "Zet nog vragen neer (Toevoegen › Spel)." : "";
  blad("#instellingen", `<div class="kop"><b>Spelregels</b><button class="knop" data-a="dicht">Klaar</button></div>
    <div class="rij">${Object.entries(SPELSOORTEN).map(([k, [n]]) => `<button class="knop pil ${s.soort === k ? "aan" : ""}" data-soort="${k}">${n}</button>`).join("")}</div>
    <p class="klein">${esc(SPELSOORTEN[s.soort][1])}</p>
    ${waarschuwing ? `<p class="waarschuwing">${waarschuwing}</p>` : ""}
    ${s.soort !== "geen" ? `<span class="label">Tijdslimiet</span><div class="rij">${[[0, "Geen"], [30, "30 sec"], [60, "1 min"], [120, "2 min"], [300, "5 min"]].map(([t, n]) => `<button class="knop pil ${(s.tijd || 0) === t ? "aan" : ""}" data-tijd="${t}">${n}</button>`).join("")}</div>` : ""}
    <span class="label">Uitleg voor spelers</span><textarea id="intro" rows="2" maxlength="300" placeholder="Bijvoorbeeld: vind de schat in het bos!">${esc(s.intro || "")}</textarea>
    <p class="klein">Zet een Start neer om te bepalen waar spelers beginnen.</p>`,
  (b) => {
    b.querySelectorAll("[data-soort]").forEach((x) => x.onclick = () => { momentopname(); s.soort = x.dataset.soort; gewijzigd(); spelTonen(); });
    b.querySelectorAll("[data-tijd]").forEach((x) => x.onclick = () => { momentopname(); s.tijd = Number(x.dataset.tijd); gewijzigd(); spelTonen(); });
    $("#intro").onchange = () => { momentopname(); s.intro = $("#intro").value.slice(0, 300); gewijzigd(); };
  });
}

// --- Beginnen met een sjabloon ---------------------------------------------------------------------------------
function sjabloon(soort) {
  const b = { versie: 1, omgeving: { lucht: "dag", vloer: "gras" }, spel: { soort: "geen", tijd: 0, intro: "" }, dingen: [] };
  const zet = (v, x, y, z, extra = {}) => { const st = STANDAARD[v] || {}; const d = { id: nieuwId(), v, p: [x, y, z], r: 0, s: [...(st.s || [1, 1, 1])], k: st.k, ...extra };
    if (st.t && !extra.t) d.t = st.t; if (st.vraag && !extra.vraag) d.vraag = JSON.parse(JSON.stringify(st.vraag)); if (st.vast === false && extra.vast === undefined) d.vast = false; b.dingen.push(d); return d; };
  if (soort === "park") {
    zet("start", 0, 0, 8, { r: 0 });
    for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 9 + (i % 3) * 3; zet(i % 3 ? "boom" : "den", Math.round(Math.cos(a) * r), 0, Math.round(Math.sin(a) * r)); }
    zet("water", 0, 0, -4, { s: [6, 1, 4] }); zet("bank", 4, 0, 0, { r: 270 }); zet("lamp", 4, 0, 2); zet("pad", 0, 0, 3, { s: [1.5, 1, 8] });
    [[-3, 1], [-2.5, 2], [2.5, -1]].forEach(([x, z]) => zet("bloem", x, 0, z, { k: KLEUREN[Math.abs(x * 3 + z) % 9] }));
    zet("bord", -2, 0, 6, { t: "Welkom in mijn park!", r: 0 });
  } else if (soort === "parcours") {
    b.omgeving = { lucht: "avond", vloer: "geen" }; b.spel = { soort: "parcours", tijd: 0, intro: "Spring van platform naar platform en haal de finish!" };
    zet("plaat", 0, 0, 0, { s: [4, 1, 4] }); zet("start", 0, 0.15, 0.5);
    const kleuren = ["#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#4ade80"];
    let x = 0, y = 0, z = -3.5;
    for (let i = 0; i < 12; i++) {
      z -= 3 + (i % 3 === 2 ? 0.5 : 0); x += [0, 1.5, -1.5, 2, -2][i % 5]; y += i % 2 ? 0.6 : 0.3;
      const p = zet("plaat", x, y, z, { s: [2, 1, 2], k: kleuren[i % 5] });
      if (i === 5) { p.g = "heen"; p.afstand = 2; p.r = 0; }
      if (i % 2 === 0) zet("munt", x, y + 0.15, z);
      if (i === 6) zet("checkpoint", x, y + 0.15, z);
    }
    zet("plaat", x, y, z - 4, { s: [4, 1, 4], k: "#facc15" }); zet("finish", x, y + 0.15, z - 4);
  } else if (soort === "doolhof") {
    b.omgeving = { lucht: "dag", vloer: "steen" }; b.spel = { soort: "verzamelen", tijd: 120, intro: "Vind alle munten in het doolhof!" };
    const N = 9, open = new Set(), stapel = [[0, 0]], gezien = new Set(["0,0"]);  // doolhof met een eigen 'diepte eerst'-zoektocht
    while (stapel.length) {
      const [cx, cz] = stapel[stapel.length - 1];
      const buren = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [cx + dx, cz + dz]).filter(([x, z]) => x >= 0 && z >= 0 && x < N && z < N && !gezien.has(`${x},${z}`));
      if (!buren.length) { stapel.pop(); continue; }
      const [nx, nz] = buren[Math.floor(Math.random() * buren.length)];
      open.add(`${cx},${cz}|${nx},${nz}`); open.add(`${nx},${nz}|${cx},${cz}`); gezien.add(`${nx},${nz}`); stapel.push([nx, nz]);
    }
    const C = 3, o = -(N * C) / 2;
    for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
      const px = o + x * C + C / 2, pz = o + z * C + C / 2;
      if (x < N - 1 && !open.has(`${x},${z}|${x + 1},${z}`)) zet("muur", px + C / 2, 0, pz, { r: 90, s: [0.8, 0.8, 1], k: "#78716c" });
      if (z < N - 1 && !open.has(`${x},${z}|${x},${z + 1}`)) zet("muur", px, 0, pz + C / 2, { s: [0.8, 0.8, 1], k: "#78716c" });
      if ((x * 7 + z * 3) % 11 === 5) zet("munt", px, 0, pz);
    }
    for (let i = 0; i < N; i++) {
      zet("muur", o + i * C + C / 2, 0, o, { s: [0.8, 0.8, 1], k: "#57534e" }); zet("muur", o + i * C + C / 2, 0, -o, { s: [0.8, 0.8, 1], k: "#57534e" });
      zet("muur", o, 0, o + i * C + C / 2, { r: 90, s: [0.8, 0.8, 1], k: "#57534e" }); zet("muur", -o, 0, o + i * C + C / 2, { r: 90, s: [0.8, 0.8, 1], k: "#57534e" });
    }
    zet("start", o + C / 2, 0, o + C / 2, { r: 180 });
  } else if (soort === "quiz") {
    b.omgeving = { lucht: "ochtend", vloer: "gras" }; b.spel = { soort: "quiz", tijd: 0, intro: "Loop het pad af en beantwoord alle vragen." };
    zet("start", 0, 0, 4); zet("pad", 0, 0, -8, { s: [1.6, 1, 26] });
    const vragen = [["Wat is de hoofdstad van Nederland?", ["Rotterdam", "Amsterdam", "Den Haag"], 1], ["Hoeveel poten heeft een spin?", ["6", "8", "10"], 1],
                    ["Welke planeet is het dichtst bij de zon?", ["Mercurius", "Venus", "Mars"], 0], ["Hoeveel minuten zitten er in een uur?", ["60", "100", "30"], 0]];
    vragen.forEach(([v, opties, goed], k) => zet("vraag", k % 2 ? 1.6 : -1.6, 0, -k * 6, { r: k % 2 ? 270 : 90, vraag: { v, opties, goed } }));
    for (let i = 0; i < 8; i++) zet("boom", i % 2 ? 5 : -5, 0, -i * 3.5);
    zet("finish", 0, 0, -24);
  } else if (soort === "galerie") {
    b.omgeving = { lucht: "dag", vloer: "hout" };
    const fotos = (D.items || []).filter((i) => i.soort === "foto" || i.soort === "model");
    const lengte = Math.max(4, Math.ceil(fotos.length / 2)) * 4;
    [-5, 5].forEach((x) => zet("muur", x, 0, -lengte / 2 + 2, { r: 90, s: [lengte / 4, 1.6, 1], k: "#f5f5f4" }));
    zet("muur", 0, 0, -lengte + 2, { s: [2.5, 1.6, 1], k: "#f5f5f4" });
    fotos.forEach((f, k) => {
      const kant = k % 2 ? 1 : -1, z = -Math.floor(k / 2) * 4;
      zet(f.soort, kant * (f.soort === "foto" ? 4.8 : 3.5), 0, z, { r: kant > 0 ? 270 : 90, i: f.id });
    });
    zet("bord", 0, 0, -lengte + 2.4, { t: D.ruimte.titel || "Welkom" });
    zet("start", 0, 0, 3);
    for (let z = 0; z > -lengte; z -= 6) zet("lamp", 0, 0, z, { k: "#fff7e0" });
  }
  return b;
}
function sjablonenTonen() {
  const keuzes = [["leeg", "⬜", "Leeg veld", "Begin helemaal opnieuw."], ["park", "🌳", "Park", "Bomen, water en een bankje."],
    ["parcours", "🏁", "Parcours", "Springspel met munten en finish."], ["doolhof", "🧩", "Doolhof", "Zoek de munten op tijd."],
    ["quiz", "❓", "Quizpad", "Vragen langs een pad."], ["galerie", "🖼️", "Expositie", "Je foto's aan de muur."]];
  blad("#instellingen", `<div class="kop"><b>Waar wil je mee beginnen?</b><button class="knop" data-a="dicht">Sluiten</button></div>
    <div class="tegels">${keuzes.map(([k, ic, n, uit]) => `<button class="tegel breed" data-sjabloon="${k}"><span>${ic}</span><b>${n}</b><small>${uit}</small></button>`).join("")}</div>
    ${bouw.dingen.length ? `<p class="waarschuwing">Dit vervangt wat er nu staat. Met Ongedaan maken krijg je het terug.</p>` : ""}`,
  (b) => b.querySelectorAll("[data-sjabloon]").forEach((x) => x.onclick = () => {
    momentopname();
    bouw = x.dataset.sjabloon === "leeg" ? { ...sjabloon("leeg"), dingen: [] } : sjabloon(x.dataset.sjabloon);
    kiezen(null); wereldOpbouwen(); gewijzigd(); b.hidden = true;
    baan.doel.set(0, 0, x.dataset.sjabloon === "parcours" || x.dataset.sjabloon === "quiz" ? -12 : 0); baan.afstand = x.dataset.sjabloon === "doolhof" ? 34 : 22;
  }));
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
    const opgeslagen = { p: camera.position.clone(), q: camera.quaternion.clone() };
    kader.visible = false;
    renderer.render(scene, camera);
    const c = document.createElement("canvas"); c.width = 400; c.height = 250;
    const g = c.getContext("2d"), b = doek.width, h = doek.height, verh = 400 / 250;
    const sb = Math.min(b, h * verh), sh = sb / verh;
    g.drawImage(doek, (b - sb) / 2, (h - sh) / 2, sb, sh, 0, 0, 400, 250);
    kader.visible = !!gekozen;
    camera.position.copy(opgeslagen.p); camera.quaternion.copy(opgeslagen.q);
    return c.toDataURL("image/jpeg", 0.7).split(",")[1];
  } catch (e) { return null; }
}
async function bewaren() {
  clearTimeout(bewaarTimer);
  if (!D.api || bewaarStatus === "opgeslagen") return;
  bewaarStatus = "bezig"; statusTonen();
  try {
    await api("ruimte_bouw_opslaan", { p_id: D.ruimte.id, p_bouw: bouw, p_omslag: omslagMaken() });
    bewaarStatus = "opgeslagen";
  } catch (e) {
    bewaarStatus = "fout";
    $("#status").title = e.message;
    bewaarTimer = setTimeout(bewaren, 8000);
  }
  statusTonen();
}
function statusTonen() {
  const s = $("#status"); if (!s) return;
  s.textContent = { opgeslagen: "Opgeslagen", wijzigingen: "Niet opgeslagen", bezig: "Opslaan...", fout: "Opslaan mislukt, opnieuw..." }[bewaarStatus] || "";
  s.className = "status " + bewaarStatus;
}
window.addEventListener("pagehide", () => { if (bewaarStatus === "wijzigingen") bewaren(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && bewaarStatus === "wijzigingen") bewaren(); });

// --- Wisselen tussen bouwen en testen ----------------------------------------------------------------------------
function testenAan(aan) {
  testen = aan;
  document.body.classList.toggle("testen", aan);
  kiezen(null);
  $("#catalogus").hidden = true; $("#instellingen").hidden = true;
  $("#bouwbalk").hidden = aan; $("#testbalk").hidden = !aan; $("#spring").hidden = !aan;
  vingers.clear();
  if (aan) { omgevingMaken({ ...bouw.omgeving }); for (const g of groepen.values()) g.visible = true; spelStarten(); }
  else { spel = null; $("#einde").hidden = true; $("#vraag").hidden = true; $("#hud").innerHTML = ""; omgevingMaken(bouw.omgeving); for (const g of groepen.values()) g.visible = true; }
}

// ---------------------------------------------------------------------------------------------------------------
// Beginnen
// ---------------------------------------------------------------------------------------------------------------
function opschonen(b) {
  const leeg = { versie: 1, omgeving: { lucht: "dag", vloer: "gras" }, spel: { soort: "geen", tijd: 0, intro: "" }, dingen: [] };
  if (!b || typeof b !== "object") return leeg;
  const uit = { ...leeg, ...b, omgeving: { ...leeg.omgeving, ...(b.omgeving || {}) }, spel: { ...leeg.spel, ...(b.spel || {}) } };
  if (!SPELSOORTEN[uit.spel.soort]) uit.spel.soort = "geen";
  uit.dingen = (Array.isArray(b.dingen) ? b.dingen : []).filter((d) => d && typeof d === "object" && (BOUWERS[d.v])).map((d) => ({
    ...d, id: String(d.id || nieuwId()),
    p: Array.isArray(d.p) && d.p.length === 3 ? d.p.map((x) => Number(x) || 0) : [0, 0, 0],
    s: Array.isArray(d.s) && d.s.length === 3 ? d.s.map((x) => THREE.MathUtils.clamp(Number(x) || 1, 0.05, 40)) : [1, 1, 1],
    k: /^#[0-9a-fA-F]{6}$/.test(d.k || "") ? d.k : (STANDAARD[d.v] || {}).k,
  }));
  return uit;
}

bouw = opschonen(D.bouw);
wereldOpbouwen();
let vorigeTijd = performance.now();
const klok = new THREE.Clock();

if (BOUWEN) {
  document.body.classList.add("bouwen");
  bouwAanraken();
  $("#bouwbalk").hidden = false;
  $("#toevoegen").hidden = false;
  $("#toevoegen").onclick = () => catalogusTonen(0);
  $("#b-terug").onclick = () => ongedaan(terug, vooruitStapels);
  $("#b-vooruit").onclick = () => ongedaan(vooruitStapels, terug);
  $("#b-omgeving").onclick = omgevingTonen;
  $("#b-spel").onclick = spelTonen;
  $("#b-sjabloon").onclick = sjablonenTonen;
  $("#b-testen").onclick = () => testenAan(true);
  $("#t-stop").onclick = () => testenAan(false);
  $("#status").onclick = bewaren;
  spelAanraken();  // voor het testen; luistert alleen als 'testen' aan staat
  if (!bouw.dingen.length) sjablonenTonen();
  statusTonen();
} else {
  spelAanraken();
  $("#spring").hidden = false;
  const s = bouw.spel, d = telDoelen();
  const regels = s.soort === "verzamelen" ? `Pak alle ${d.munten} munten en sterren` : s.soort === "parcours" ? "Haal de finish" : s.soort === "quiz" ? `Beantwoord alle ${d.vragen} vragen` : "";
  const begin = $("#begin");
  begin.hidden = false;
  begin.innerHTML = `<div class="kaart"><h2>${esc(D.ruimte.titel || "")}</h2>${D.ruimte.maker ? `<p class="klein">Van ${esc(D.ruimte.maker)}</p>` : ""}
    ${s.intro || D.ruimte.omschrijving ? `<p>${esc(s.intro || D.ruimte.omschrijving)}</p>` : ""}
    ${regels ? `<p><b>${regels}${s.tijd ? ` binnen ${tijdTekst(s.tijd * 1000)}` : ""}.</b></p>` : ""}
    <p class="klein">Links slepen om te lopen, rechts vegen om rond te kijken, tik op dingen voor uitleg. Op een computer: pijltjes of WASD en spatie.</p>
    <div id="toplijst"></div>
    <div class="rij"><button class="knop hoofd" id="starten">${s.soort === "geen" ? "Binnenstappen" : "Start"}</button></div></div>`;
  $("#starten").onclick = () => { begin.hidden = true; spelStarten(); };
  if (s.soort !== "geen" && D.ruimte.id && D.api_url) {
    fetch(`${D.api_url}/rest/v1/rpc/ruimte_scores`, { method: "POST", headers: { apikey: D.api_key, Authorization: `Bearer ${D.api_key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: D.ruimte.id }) })
      .then((r) => r.json()).then((l) => { if (Array.isArray(l) && l.length) { $("#toplijst").innerHTML = `<p class="label">Toplijst</p>`; $("#toplijst").insertAdjacentHTML("beforeend", `<ol>${l.slice(0, 5).map((x) => `<li><span>${esc(x.naam)}</span><b>${x.punten} · ${tijdTekst(x.tijd_ms)}</b></li>`).join("")}</ol>`); } }).catch(() => {});
  }
  spelerNaar(startPlek());
  vrKnop();
}
$("#scherm").onclick = () => {
  const d = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (d.requestFullscreen || d.webkitRequestFullscreen || (() => melding("Volledig scherm kan hier niet."))).call(d);
};

renderer.setAnimationLoop(() => {
  const nu = performance.now(), dt = (nu - vorigeTijd) / 1000; vorigeTijd = nu;
  const t = klok.getElapsedTime();
  bewegen(t);
  botsersBijwerken();
  if (BOUWEN && !testen) {
    bouwCamera();
    if (gekozen && kader.visible) kader.setFromObject(groepen.get(gekozen));
  } else {
    if (renderer.xr.isPresenting) vrInvoer();
    spelerBewegen(dt);
    spelRegels();
    spelerCamera();
    if (spel && spel.bezig && Math.floor(nu / 250) !== Math.floor((nu - dt * 1000) / 250)) hudBijwerken();
  }
  renderer.render(scene, camera);
});
window.__wereld = { get bouw() { return bouw; }, get speler() { return speler; }, get spel() { return spel; }, toevoegen, kiezen, sjabloon, testenAan, bewaren, get status() { return bewaarStatus; } };
