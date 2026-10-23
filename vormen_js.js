// Vormen voor 3D-ontwerpen: gedeeld door de 3D-studio (ontwerp_js.js) en de wereldbouwer (wereld_js.js).
//
// Een ontwerp is een lijst delen: {v: vorm, p: [x, y, z] midden in meters, r: [x, y, z] draaiing in graden,
// s: [breedte, hoogte, diepte] in meters, k: kleur, m: materiaal, t: tekst (alleen bij vorm 'tekst')}.
// Elke vorm is precies 1 bij 1 bij 1 rond het midden, zodat de maat s meteen de echte maat is.

import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const VORMEN = [
  ["blok", "Blok", [1, 1, 1]], ["afgerond", "Afgerond blok", [1, 1, 1]], ["cilinder", "Cilinder", [1, 1, 1]],
  ["bol", "Bol", [1, 1, 1]], ["kegel", "Kegel", [1, 1, 1]], ["piramide", "Piramide", [1, 1, 1]],
  ["wig", "Wig", [1, 1, 1]], ["koepel", "Koepel", [1, 0.5, 1]], ["buis", "Buis", [1, 1, 1]],
  ["ring", "Ring", [1, 1, 0.25]], ["boog", "Boog", [1, 0.55, 0.25]], ["zeskant", "Zeskant", [1, 1, 1]],
  ["ster", "Ster", [1, 1, 0.25]], ["hart", "Hart", [1, 0.9, 0.3]], ["tekst", "Tekst", [1.6, 0.5, 0.15]],
];
const VORM_NAMEN = Object.fromEntries(VORMEN.map(([v, n]) => [v, n]));
const VORM_MAAT = Object.fromEntries(VORMEN.map(([v, , s]) => [v, s]));
const MATERIAAL_NAMEN = { mat: "Mat", glans: "Glans", metaal: "Metaal", glas: "Glas", licht: "Licht" };

// Ruimtelijke belichting (een 'kamer' die weerspiegelt in glans, metaal en glas).
function omgevingLicht(renderer, scene, sterkte = 1) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = sterkte;
  pmrem.dispose();
}

// Een vorm uit een plat figuur (ster, hart, wig) met een beetje dikte.
function uitgetrokken(vorm, afgerond = true) {
  return new THREE.ExtrudeGeometry(vorm, { depth: 1, bevelEnabled: afgerond, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 24 });
}
function eenheid(g) {
  // midden op 0 en precies 1 bij 1 bij 1
  g.computeBoundingBox();
  const b = g.boundingBox, m = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  g.translate(-m.x, -m.y, -m.z);
  g.scale(1 / Math.max(s.x, 1e-4), 1 / Math.max(s.y, 1e-4), 1 / Math.max(s.z, 1e-4));
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
const MAKERS = {
  blok: () => new THREE.BoxGeometry(1, 1, 1),
  afgerond: () => new RoundedBoxGeometry(1, 1, 1, 5, 0.12),
  cilinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 64),
  bol: () => new THREE.SphereGeometry(0.5, 64, 32),
  kegel: () => new THREE.ConeGeometry(0.5, 1, 64),
  piramide: () => new THREE.ConeGeometry(0.5, 1, 4).rotateY(Math.PI / 4),
  zeskant: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  wig: () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(1, 0); s.lineTo(0, 1); s.lineTo(0, 0);
               return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).rotateY(-Math.PI / 2); },
  koepel: () => {  // een halve bol met een dichte onderkant
    const punten = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; punten.push(new THREE.Vector2(0.5 * Math.cos(a), 0.5 * Math.sin(a))); }
    return new THREE.LatheGeometry(punten, 64);
  },
  buis: () => { const s = new THREE.Shape(); s.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
                const gat = new THREE.Path(); gat.absarc(0, 0, 0.36, 0, Math.PI * 2, true); s.holes.push(gat);
                return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2); },
  ring: () => new THREE.TorusGeometry(0.4, 0.12, 24, 72),
  boog: () => new THREE.TorusGeometry(0.4, 0.12, 24, 48, Math.PI),
  ster: () => { const s = new THREE.Shape();
                for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.2 : 0.5, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
                  i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
                return uitgetrokken(s); },
  hart: () => { const s = new THREE.Shape();
                s.moveTo(0, -0.5); s.bezierCurveTo(-0.15, -0.35, -0.55, -0.1, -0.55, 0.18); s.bezierCurveTo(-0.55, 0.42, -0.35, 0.55, -0.2, 0.55);
                s.bezierCurveTo(-0.08, 0.55, 0, 0.47, 0, 0.38); s.bezierCurveTo(0, 0.47, 0.08, 0.55, 0.2, 0.55);
                s.bezierCurveTo(0.35, 0.55, 0.55, 0.42, 0.55, 0.18); s.bezierCurveTo(0.55, -0.1, 0.15, -0.35, 0, -0.5);
                return uitgetrokken(s); },
};

// Het lettertype voor 3D-tekst laden we pas als iemand tekst gebruikt.
let letter = null, letterBezig = null;
const letterWachters = [];
function wanneerLettertype(fn) {
  if (letter) return fn();
  letterWachters.push(fn);
  if (!letterBezig) letterBezig = new FontLoader().load(`${D.three}/examples/fonts/helvetiker_bold.typeface.json`,
    (f) => { letter = f; letterWachters.splice(0).forEach((w) => w()); }, undefined, () => {});
}
function verhoudingTekst(t) {
  // breedte gedeeld door hoogte van een tekst, om een nieuwe tekst de juiste maat te geven
  if (!letter) return Math.max(1, String(t || "").length * 0.7);
  const g = new TextGeometry(String(t || " "), { font: letter, size: 1, depth: 0.3, curveSegments: 6 });
  g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3()); g.dispose();
  return s.x / Math.max(s.y, 0.01);
}

const vormVoorraad = new Map();
function vormGeometrie(v, t) {
  if (v === "tekst") {
    const tekst = String(t || "Tekst").slice(0, 40);
    if (!letter) return null;
    const sleutel = "tekst:" + tekst;
    if (!vormVoorraad.has(sleutel)) vormVoorraad.set(sleutel, eenheid(new TextGeometry(tekst, { font: letter, size: 1, depth: 0.3, curveSegments: 8,
      bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 })));
    return vormVoorraad.get(sleutel);
  }
  if (!vormVoorraad.has(v)) vormVoorraad.set(v, eenheid((MAKERS[v] || MAKERS.blok)()));
  return vormVoorraad.get(v);
}

const materiaalVoorraad = new Map();
function ontwerpMateriaal(kleur, soort) {
  const sleutel = kleur + "|" + soort;
  if (!materiaalVoorraad.has(sleutel)) {
    const k = new THREE.Color(kleur);
    materiaalVoorraad.set(sleutel,
      soort === "glans" ? new THREE.MeshPhysicalMaterial({ color: k, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })
      : soort === "metaal" ? new THREE.MeshStandardMaterial({ color: k, metalness: 1, roughness: 0.28 })
      : soort === "glas" ? new THREE.MeshPhysicalMaterial({ color: k, roughness: 0.04, transmission: 0.92, thickness: 0.4, ior: 1.45, transparent: true, opacity: 0.55 })
      : soort === "licht" ? new THREE.MeshStandardMaterial({ color: k, emissive: k, emissiveIntensity: 1.6, roughness: 0.5 })
      : new THREE.MeshStandardMaterial({ color: k, roughness: 0.62, metalness: 0.02 }));
  }
  return materiaalVoorraad.get(sleutel);
}

function deelMesh(d) {
  const g = vormGeometrie(d.v, d.t);
  const m = new THREE.Mesh(g || vormGeometrie("blok"), ontwerpMateriaal(d.k || "#9ca3af", d.m || "mat"));
  if (!g) { m.material = ontwerpMateriaal(d.k || "#9ca3af", "glas"); wanneerLettertype(() => { m.geometry = vormGeometrie(d.v, d.t); }); }
  deelPlaatsen(m, d);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function deelPlaatsen(m, d) {
  m.position.set(...d.p);
  m.rotation.set(...d.r.map((x) => THREE.MathUtils.degToRad(x)), "XYZ");
  m.scale.set(...d.s.map((x) => Math.max(Math.abs(x), 0.005)));
}

// Een heel ontwerp als groep; 'opVloer' zet het midden van de onderkant op 0 (voor in een wereld).
function ontwerpGroep(delen, opVloer = false) {
  const g = new THREE.Group();
  for (const d of delen) g.add(deelMesh(d));
  if (opVloer) {
    const doos = new THREE.Box3();
    for (const d of delen) {  // de omhullende uit de data, zodat tekst die nog laadt geen verschil maakt
      const m = new THREE.Mesh(vormGeometrie(d.v === "tekst" ? "blok" : d.v)); deelPlaatsen(m, d); m.updateMatrixWorld(); doos.expandByObject(m);
    }
    if (!doos.isEmpty()) { const c = doos.getCenter(new THREE.Vector3()); g.children.forEach((m) => m.position.sub(new THREE.Vector3(c.x, doos.min.y, c.z))); }
  }
  return g;
}

// Delen controleren en opschonen (data van buiten vertrouwen we niet blind).
function delenOpschonen(lijst) {
  const getal = (x, standaard, min, max) => THREE.MathUtils.clamp(Number.isFinite(Number(x)) ? Number(x) : standaard, min, max);
  return (Array.isArray(lijst) ? lijst : []).filter((d) => d && (MAKERS[d.v] || d.v === "tekst")).slice(0, 400).map((d) => ({
    v: d.v,
    p: [0, 1, 2].map((k) => getal(d.p?.[k], 0, -50, 50)),
    r: [0, 1, 2].map((k) => getal(Array.isArray(d.r) ? d.r[k] : 0, 0, -360, 360)),
    s: [0, 1, 2].map((k) => getal(d.s?.[k], 1, 0.01, 50)),
    k: /^#[0-9a-fA-F]{6}$/.test(d.k || "") ? d.k : "#9ca3af",
    m: MATERIAAL_NAMEN[d.m] ? d.m : "mat",
    ...(d.v === "tekst" ? { t: String(d.t || "Tekst").slice(0, 40) } : {}),
  }));
}
