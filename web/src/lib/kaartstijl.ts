export function kaartDonker(root:HTMLElement=document.documentElement,voorkeur=matchMedia("(prefers-color-scheme: dark)").matches) {
  return root.dataset.thema==="donker"||(root.dataset.thema!=="licht"&&voorkeur);
}
export function kaartStijlURL(donker:boolean){return `https://tiles.openfreemap.org/styles/${donker?"dark":"positron"}`;}
export function eigenKaartkleur(id:string,type:string,donker:boolean):{eigenschap:"background-color"|"fill-color";kleur:string}|null {
  if(type==="background")return{eigenschap:"background-color",kleur:donker?"#111e2a":"#f5f9fc"};
  if(type==="fill"&&/water/i.test(id))return{eigenschap:"fill-color",kleur:donker?"#163f56":"#b9ddf1"};
  if(type==="fill"&&/park|landcover|landuse.*grass/i.test(id))return{eigenschap:"fill-color",kleur:donker?"#213b35":"#ddf0de"};
  if(type==="fill"&&/building/i.test(id))return{eigenschap:"fill-color",kleur:donker?"#263c4d":"#e0eaf2"};
  return null;
}
