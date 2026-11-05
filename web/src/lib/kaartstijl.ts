export function kaartDonker(root:HTMLElement=document.documentElement,voorkeur=matchMedia("(prefers-color-scheme: dark)").matches) {
  return root.dataset.thema==="donker"||(root.dataset.thema!=="licht"&&voorkeur);
}
export function kaartStijlURL(donker:boolean){return `https://tiles.openfreemap.org/styles/${donker?"dark":"positron"}`;}
// Eigen, rustige kaartkleuren: lichtgrijze ondergrond, helder water, zacht groen, warme gebouwen en witte straten
// met iets donkerdere hoofdwegen, zodat een speld en route er duidelijk bovenop liggen.
export function eigenKaartkleur(id:string,type:string,donker:boolean):{eigenschap:"background-color"|"fill-color"|"line-color";kleur:string}|null {
  if(type==="background")return{eigenschap:"background-color",kleur:donker?"#111e2a":"#f3f4f6"};
  if(type==="fill"&&/water/i.test(id))return{eigenschap:"fill-color",kleur:donker?"#163f56":"#a9d8f0"};
  if(type==="fill"&&/park|landcover|landuse.*grass/i.test(id))return{eigenschap:"fill-color",kleur:donker?"#213b35":"#d6f0dc"};
  if(type==="fill"&&/building/i.test(id))return{eigenschap:"fill-color",kleur:donker?"#263c4d":"#f2e8d8"};
  if(type==="line"&&/highway|road/i.test(id)&&!/casing|path|rail|label/i.test(id))
    return{eigenschap:"line-color",kleur:/motorway|trunk|primary|major/i.test(id)?(donker?"#3a5268":"#c3cddb"):(donker?"#22313f":"#ffffff")};
  return null;
}
