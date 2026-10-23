"""VR-ruimtes: een 3D-ruimte waarin je een project laat zien met foto's, teksten en 3D-modellen.

De ruimte wordt in de browser getekend met A-Frame (WebXR). Op de iPad kijk je rond door te vegen en ga je met
pijlen van ding naar ding; met een VR-bril (bijvoorbeeld Meta Quest) stap je de ruimte in met de knop VR.
"""

import base64
import io
import json

import opslag

THEMAS = {"galerie": "🖼️ Galerie (licht)", "museum": "🏛️ Museum (donker, spotjes)", "natuur": "🌳 Buiten",
          "studio": "🎨 Studio"}
AFRAME = "https://cdn.jsdelivr.net/npm/aframe@1.7.1/dist/aframe-v1.7.1.min.js"


class Fout(Exception):
    """Iets lukte niet; de tekst is geschikt om aan de gebruiker te tonen."""


def _ok(antwoord: dict) -> dict:
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    return antwoord


def mijn_ruimtes() -> list[dict]:
    return opslag._rpc_ik("mijn_ruimtes")["ruimtes"]


def opslaan(titel: str, omschrijving: str, thema: str, kleur: str, openbaar: bool, ruimte_id: int | None = None) -> int:
    return _ok(opslag._rpc_ik("ruimte_opslaan", p_id=ruimte_id, p_titel=titel, p_omschrijving=omschrijving,
                              p_thema=thema, p_kleur=kleur, p_openbaar=openbaar))["id"]


def weg(ruimte_id: int) -> None:
    _ok(opslag._rpc_ik("ruimte_weg", p_id=ruimte_id))


def inhoud(ruimte_id: int) -> list[dict]:
    return opslag._rpc_ik("ruimte_inhoud", p_id=ruimte_id)["dingen"]


def foto_klaarmaken(data: bytes) -> dict:
    """Verkleint een foto voor de ruimte (groot) en voor overzichten (klein)."""
    from PIL import Image, ImageOps

    try:
        import pillow_heif  # foto's van iPhone en iPad (HEIC)

        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    beeld = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    groot = beeld.copy()
    groot.thumbnail((1280, 1280))
    uit = io.BytesIO()
    groot.save(uit, "JPEG", quality=80)
    klein = beeld.copy()
    klein.thumbnail((320, 320))
    uit_klein = io.BytesIO()
    klein.save(uit_klein, "JPEG", quality=70)
    return {"data": base64.b64encode(uit.getvalue()).decode(), "klein": base64.b64encode(uit_klein.getvalue()).decode(),
            "breedte": groot.width, "hoogte": groot.height}


def foto_toevoegen(ruimte_id: int, data: bytes, titel: str = "", tekst: str = "") -> None:
    try:
        foto = foto_klaarmaken(data)
    except Exception as fout:
        raise Fout("Deze foto kan niet worden gelezen. Kies een JPG- of PNG-foto.") from fout
    _ok(opslag._rpc_ik("ruimte_item_toevoegen", p_ruimte=ruimte_id, p_soort="foto", p_titel=titel, p_tekst=tekst,
                       p_data=foto["data"], p_klein=foto["klein"], p_breedte=foto["breedte"], p_hoogte=foto["hoogte"]))


def tekst_toevoegen(ruimte_id: int, titel: str, tekst: str) -> None:
    _ok(opslag._rpc_ik("ruimte_item_toevoegen", p_ruimte=ruimte_id, p_soort="tekst", p_titel=titel, p_tekst=tekst,
                       p_data="", p_klein="", p_breedte=None, p_hoogte=None))


def model_toevoegen(ruimte_id: int, data: bytes, titel: str = "", tekst: str = "") -> None:
    """Een 3D-model als .glb (zoals uit de iPhone-app Reality Composer, Polycam of Blender)."""
    if data[:4] != b"glTF":
        raise Fout("Dit is geen .glb-bestand. Exporteer je 3D-model als GLB.")
    if len(data) > 4 * 1024 * 1024:
        raise Fout("Een 3D-model mag hooguit 4 MB zijn.")
    _ok(opslag._rpc_ik("ruimte_item_toevoegen", p_ruimte=ruimte_id, p_soort="model", p_titel=titel, p_tekst=tekst,
                       p_data=base64.b64encode(data).decode(), p_klein="", p_breedte=None, p_hoogte=None))


def item_weg(item_id: int) -> None:
    _ok(opslag._rpc_ik("ruimte_item_weg", p_item=item_id))


def verplaatsen(item_id: int, richting: int) -> None:
    _ok(opslag._rpc_ik("ruimte_item_verplaatsen", p_item=item_id, p_richting=richting))


def zoeken(zoekterm: str = "") -> list[dict]:
    """Openbare ruimtes, ook zonder account."""
    return opslag._rpc("ruimtes_zoeken", p_zoekterm=zoekterm)


def bekijken(ruimte_id: int) -> dict:
    """Een ruimte met alles erin. Openbaar voor iedereen; je eigen ruimte ook als die nog niet openbaar is."""
    return _ok(opslag._rpc("ruimte_bekijken", p_naam=opslag._naam.get(), p_wachtwoord=opslag._wachtwoord.get(),
                           p_id=ruimte_id))


def kopie(ruimte_id: int) -> int:
    """Een openbare wereld kopiëren om zelf verder te bouwen (zonder de foto's en modellen van een ander)."""
    return _ok(opslag._rpc_ik("ruimte_kopie", p_id=ruimte_id))["id"]


def melden(ruimte_id: int, reden: str) -> None:
    _ok(opslag._rpc_ik("ruimte_melden", p_id=ruimte_id, p_reden=reden))


def beheer_meldingen() -> list[dict]:
    return opslag._rpc_ik("beheer_ruimte_meldingen")["meldingen"]


def beheer_afhandelen(ruimte_id: int, verbergen: bool) -> None:
    _ok(opslag._rpc_ik("beheer_ruimte_afhandelen", p_ruimte=ruimte_id, p_verbergen=verbergen))


# --- De 3D-ruimte ----------------------------------------------------------------------

def html(ruimte: dict, hoogte: int = 560) -> str:
    """De hele ruimte als losse webpagina (voor st.iframe). Alle gegevens gaan als JSON mee, niet als HTML."""
    gegevens = {k: ruimte.get(k) for k in ("titel", "omschrijving", "thema", "kleur", "maker")}
    gegevens["dingen"] = [{k: d.get(k) for k in ("soort", "titel", "tekst", "data", "breedte", "hoogte")}
                          for d in ruimte.get("dingen", [])]
    data = json.dumps(gegevens).replace("</", "<\\/")
    return SCENE.replace("__AFRAME__", AFRAME).replace("__HOOGTE__", str(hoogte)).replace("__DATA__", data)


SCENE = r"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="__AFRAME__"></script>
<style>
  html,body{margin:0;height:__HOOGTE__px;overflow:hidden;font-family:-apple-system,system-ui,sans-serif;background:#111}
  a-scene{height:__HOOGTE__px}
  #knoppen{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:8px;z-index:10}
  #knoppen button{font-size:17px;padding:10px 16px;border:0;border-radius:22px;background:rgba(255,255,255,.92);
    color:#111;box-shadow:0 1px 6px rgba(0,0,0,.3)}
  #teller{position:absolute;top:10px;left:12px;z-index:10;color:#fff;background:rgba(0,0,0,.45);padding:4px 10px;
    border-radius:12px;font-size:14px}
  #info{position:absolute;left:12px;right:12px;top:44px;z-index:11;background:rgba(255,255,255,.96);color:#111;
    border-radius:12px;padding:12px 14px;display:none;max-height:55%;overflow:auto;font-size:15px;line-height:1.4}
  #info b{display:block;margin-bottom:4px}
  #info div{white-space:pre-line}
</style></head>
<body>
<div id="teller"></div>
<div id="info"></div>
<div id="knoppen"><button id="vorige">◀</button><button id="begin">Ingang</button><button id="volgende">▶</button>
  <button id="scherm">⛶</button></div>
<a-scene id="scene" renderer="colorManagement: true; antialias: true" cursor="rayOrigin: mouse"
         raycaster="objects: .klik" vr-mode-ui="enabled: true" loading-screen="dotsColor: #fff; backgroundColor: #111">
  <a-entity id="rig" position="0 0 1.5">
    <a-entity id="camera" camera position="0 1.6 0" look-controls="pointerLockEnabled: false; magicWindowTrackingEnabled: false"
              wasd-controls="acceleration: 25"></a-entity>
    <a-entity id="links" laser-controls="hand: left" raycaster="objects: .klik" lopen></a-entity>
    <a-entity id="rechts" laser-controls="hand: right" raycaster="objects: .klik" lopen></a-entity>
  </a-entity>
</a-scene>
<script>
const R = __DATA__;
const THEMA = {
  galerie: {muur: "#f5f5f4", vloer: "#c8b08c", plafond: "#ffffff", lucht: null, licht: 0.75, tekst: "#1c1917", bord: "#ffffff"},
  museum:  {muur: "#2a2a2e", vloer: "#1c1917", plafond: "#111111", lucht: null, licht: 0.25, tekst: "#f5f5f4", bord: "#1f1f23", spot: true},
  natuur:  {muur: null, vloer: "#6a9f4f", plafond: null, lucht: "#9fd3f2", licht: 0.8, tekst: "#1c1917", bord: "#fffdf7"},
  studio:  {muur: "#e5e7eb", vloer: "#9ca3af", plafond: "#f3f4f6", lucht: null, licht: 0.7, tekst: "#111827", bord: "#ffffff"},
}[R.thema] || {};
const scene = document.getElementById("scene"), rig = document.getElementById("rig"), cam = document.getElementById("camera");
const B = 8, AFSTAND = 3.6, n = R.dingen.length, paren = Math.max(1, Math.ceil(n / 2));
const LENGTE = paren * AFSTAND + 4;
function el(tag, attrs, ouder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === "object" ? AFRAME.utils.styleParser.stringify(v) : v);
  (ouder || scene).appendChild(e); return e;
}
// Tekst op een bord: getekend op een canvas, zodat letters met accenten goed gaan.
function bord(titel, tekst, b, h, achtergrond, kleur, accent) {
  const c = document.createElement("canvas"), px = 512 / b; c.width = 512; c.height = Math.round(h * px);
  const g = c.getContext("2d"); g.fillStyle = achtergrond; g.fillRect(0, 0, c.width, c.height);
  if (accent) { g.fillStyle = accent; g.fillRect(0, 0, 10, c.height); }
  g.fillStyle = kleur; let y = 44;
  function regels(s, grootte, gewicht) {
    g.font = `${gewicht} ${grootte}px -apple-system, system-ui, sans-serif`;
    for (const alinea of String(s || "").split("\n")) {
      let regel = "";
      for (const woord of alinea.split(" ")) {
        const test = regel ? regel + " " + woord : woord;
        if (g.measureText(test).width > c.width - 56 && regel) { g.fillText(regel, 28, y); y += grootte * 1.3; regel = woord; }
        else regel = test;
      }
      g.fillText(regel, 28, y); y += grootte * 1.3;
      if (y > c.height - 10) return;
    }
  }
  if (titel) { regels(titel, 30, "600"); y += 6; }
  if (tekst) regels(tekst, 21, "400");
  return c.toDataURL("image/png");  // als adres, zodat elk bord een eigen textuur krijgt
}
function info(d) {
  const i = document.getElementById("info");
  if (!d || (!d.titel && !d.tekst)) { i.style.display = "none"; return; }
  i.innerHTML = ""; const b = document.createElement("b"); b.textContent = d.titel || ""; i.appendChild(b);
  const p = document.createElement("div"); p.textContent = d.tekst || ""; i.appendChild(p); i.style.display = "block";
}
document.getElementById("info").addEventListener("click", () => info(null));

// Ruimte
el("a-entity", {light: {type: "ambient", intensity: THEMA.licht ?? 0.7}});
el("a-entity", {light: {type: "directional", intensity: 0.5}, position: "1 4 2"});
const midden = -(LENGTE / 2) + 2;
el("a-plane", {width: R.thema === "natuur" ? 80 : B, height: R.thema === "natuur" ? 80 : LENGTE, rotation: "-90 0 0",
               position: `0 0 ${midden}`, material: {color: THEMA.vloer, roughness: 1}});
if (THEMA.lucht) el("a-sky", {color: THEMA.lucht});
if (THEMA.muur) {
  for (const x of [-B / 2, B / 2])
    el("a-plane", {width: LENGTE, height: 4, position: `${x} 2 ${midden}`, rotation: `0 ${x < 0 ? 90 : -90} 0`, material: {color: THEMA.muur}});
  el("a-plane", {width: B, height: 4, position: `0 2 ${-(LENGTE - 2)}`, material: {color: THEMA.muur}});
  el("a-plane", {width: B, height: 4, position: "0 2 2", rotation: "0 180 0", material: {color: THEMA.muur}});
  el("a-plane", {width: B, height: LENGTE, position: `0 4 ${midden}`, rotation: "90 0 0", material: {color: THEMA.plafond}});
  for (const x of [-B / 2 + 0.01, B / 2 - 0.01])  // sierlijst in de eigen kleur
    el("a-plane", {width: LENGTE, height: 0.12, position: `${x} 0.06 ${midden}`, rotation: `0 ${x < 0 ? 90 : -90} 0`, material: {color: R.kleur, shader: "flat"}});
}
// Welkomstbord aan het eind van de ruimte
const welkom = el("a-plane", {width: 3.2, height: 1.8, position: `0 1.8 ${-(LENGTE - 2) + 0.02}`, class: "klik"});
welkom.setAttribute("material", {shader: "flat", src: bord(R.titel, (R.omschrijving || "") + (R.maker ? "\n\nVan " + R.maker : ""), 3.2, 1.8, THEMA.bord, THEMA.tekst, R.kleur)});
welkom.addEventListener("click", () => info({titel: R.titel, tekst: R.omschrijving}));

// Standplaatsen: eerst de ingang, dan elk ding
const plekken = [{x: 0, z: 1.5, draai: 0}];
R.dingen.forEach((d, k) => {
  const kant = k % 2 === 0 ? -1 : 1, z = -Math.floor(k / 2) * AFSTAND - 1.8;
  const wand = THEMA.muur ? kant * (B / 2 - 0.03) : kant * 3.2, draai = kant < 0 ? 90 : -90;
  const groep = el("a-entity", {position: `${wand} 0 ${z}`, rotation: `0 ${draai} 0`});
  if (!THEMA.muur) el("a-box", {width: 2.8, height: 2.6, depth: 0.08, position: "0 1.6 -0.06", material: {color: "#f3efe6"}}, groep);
  if (d.soort === "foto") {
    const verh = (d.breedte && d.hoogte) ? d.breedte / d.hoogte : 4 / 3;
    let w = 2.2, h = w / verh; if (h > 1.7) { h = 1.7; w = h * verh; }
    el("a-box", {width: w + 0.12, height: h + 0.12, depth: 0.04, position: "0 1.75 0", material: {color: R.thema === "museum" ? "#b08d57" : "#222"}}, groep);
    const foto = el("a-plane", {width: w, height: h, position: "0 1.75 0.025", class: "klik"}, groep);
    foto.setAttribute("material", {shader: "flat", src: "data:image/jpeg;base64," + d.data});
    foto.addEventListener("click", () => info(d));
    if (d.titel || d.tekst) {
      const label = el("a-plane", {width: 1.3, height: 0.42, position: `0 ${1.75 - h / 2 - 0.36} 0.02`, class: "klik"}, groep);
      label.setAttribute("material", {shader: "flat", src: bord(d.titel, d.tekst, 1.3, 0.42, THEMA.bord, THEMA.tekst, R.kleur)});
      label.addEventListener("click", () => info(d));
    }
  } else if (d.soort === "tekst") {
    const t = el("a-plane", {width: 2.2, height: 1.6, position: "0 1.7 0.02", class: "klik"}, groep);
    t.setAttribute("material", {shader: "flat", src: bord(d.titel, d.tekst, 2.2, 1.6, THEMA.bord, THEMA.tekst, R.kleur)});
    t.addEventListener("click", () => info(d));
  } else if (d.soort === "model") {
    el("a-cylinder", {radius: 0.45, height: 1, position: "0 0.5 1.1", material: {color: R.thema === "museum" ? "#3f3f46" : "#e7e5e4"}}, groep);
    const m = el("a-entity", {position: "0 1 1.1", class: "klik",
                              animation: {property: "rotation", to: "0 360 0", loop: true, dur: 20000, easing: "linear"}}, groep);
    m.addEventListener("model-loaded", () => {
      const obj = m.getObject3D("mesh"), box = new THREE.Box3().setFromObject(obj), maat = box.getSize(new THREE.Vector3());
      const s = 1.1 / Math.max(maat.x, maat.y, maat.z, 0.001); obj.scale.setScalar(s);
      const b2 = new THREE.Box3().setFromObject(obj), c = m.object3D.worldToLocal(b2.getCenter(new THREE.Vector3()));
      obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y += 1 - b2.min.y;  // midden op de sokkel
    });
    m.setAttribute("gltf-model", "data:model/gltf-binary;base64," + d.data);
    m.addEventListener("click", () => info(d));
    if (d.titel || d.tekst) {
      const label = el("a-plane", {width: 1.3, height: 0.42, position: "0 1.7 0.02", class: "klik"}, groep);
      label.setAttribute("material", {shader: "flat", src: bord(d.titel, d.tekst, 1.3, 0.42, THEMA.bord, THEMA.tekst, R.kleur)});
    }
  }
  if (THEMA.spot) el("a-entity", {light: {type: "spot", intensity: 1.4, angle: 35, penumbra: 0.5, distance: 6},
                                  position: "0 3.8 1.2", rotation: "-55 0 0"}, groep);
  const sta = d.soort === "model" ? 2.7 : 2.3;
  plekken.push({x: wand - kant * sta, z: z, draai: draai, d: d});
});

// Van plek naar plek
let nu = 0;
function ga(i) {
  nu = Math.max(0, Math.min(plekken.length - 1, i));
  const p = plekken[nu], van = rig.object3D.position.clone(), vanDraai = rig.object3D.rotation.y;
  const lc = cam.components["look-controls"]; if (lc) { lc.pitchObject.rotation.x = 0; lc.yawObject.rotation.y = 0; }
  let doel = THREE.MathUtils.degToRad(p.draai), verschil = doel - vanDraai;
  verschil = Math.atan2(Math.sin(verschil), Math.cos(verschil));
  const start = performance.now();
  (function stap(t) {
    const f = Math.min(1, (t - start) / 900), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    rig.object3D.position.set(van.x + (p.x - van.x) * e, 0, van.z + (p.z - van.z) * e);
    rig.object3D.rotation.y = vanDraai + verschil * e;
    if (f < 1) requestAnimationFrame(stap);
  })(start);
  document.getElementById("teller").textContent = nu === 0 ? `${R.titel} · ${n} dingen` : `${nu} / ${n}`;
  info(nu ? p.d : null);
}
document.getElementById("vorige").onclick = () => ga(nu - 1);
document.getElementById("volgende").onclick = () => ga(nu + 1);
document.getElementById("begin").onclick = () => ga(0);
document.getElementById("scherm").onclick = () => {
  const d = document.documentElement;
  (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d);
};
// In VR: lopen met de duimstick, draaien in stappen van 45 graden.
AFRAME.registerComponent("lopen", {
  init() { this.as = {x: 0, y: 0}; this.el.addEventListener("thumbstickmoved", (e) => { this.as = e.detail; }); this.gedraaid = false; },
  tick(t, dt) {
    const {x, y} = this.as; if (!dt) return;
    if (this.el.id === "rechts") {
      if (Math.abs(x) > 0.7 && !this.gedraaid) { rig.object3D.rotation.y -= Math.sign(x) * Math.PI / 4; this.gedraaid = true; }
      if (Math.abs(x) < 0.3) this.gedraaid = false;
      return;
    }
    if (Math.abs(y) < 0.15 && Math.abs(x) < 0.15) return;
    const richting = new THREE.Vector3(); cam.object3D.getWorldDirection(richting); richting.y = 0; richting.normalize();
    const opzij = new THREE.Vector3(-richting.z, 0, richting.x), v = 2.2 * dt / 1000;
    rig.object3D.position.addScaledVector(richting, y * v).addScaledVector(opzij, -x * v);
  },
});
ga(0);
</script>
</body></html>"""
