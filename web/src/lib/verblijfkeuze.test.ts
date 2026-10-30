import { expect, it } from "vitest";
import { prijsVoorReis, selecteerVerblijf, sorteerVerblijven, ruimteVoorVerblijf } from "./verblijfkeuze";
import type { Verblijf } from "./verhuur";
const verblijf=(id:string,prijs=10000,schoonmaak=0):Verblijf=>({id,prijs,schoonmaak,personen:4,titel:id,versie:1,plaats:"Gent",land:"België",beschrijving:"Huis",regels:"Regels",van:"2030-01-01",tot:"2030-12-31",voorzieningen:[],open:true});
it("vergelijkt op totale prijs inclusief schoonmaak en past de volgorde aan de reisduur aan",()=>{
 const a=verblijf("a",8000,20000),b=verblijf("b",10000,0),lijst=[a,b];
 expect(sorteerVerblijven(lijst,"2030-05-01","2030-05-03",2).map(v=>v.id)).toEqual(["b","a"]);
 expect(sorteerVerblijven(lijst,"2030-05-01","2030-05-21",2).map(v=>v.id)).toEqual(["a","b"]);expect(lijst).toEqual([a,b]);
 expect(prijsVoorReis(a,"2030-05-01","2030-05-03",2)).toMatchObject({totaal:36000,perPersoonPerNacht:9000});
});
it("houdt vergelijking beperkt tot drie, zonder dubbele verblijven of mutatie",()=>{
 const a=verblijf("a"),b=verblijf("b"),c=verblijf("c"),d=verblijf("d");let lijst=selecteerVerblijf([],a);lijst=selecteerVerblijf(lijst,b);lijst=selecteerVerblijf(lijst,c);
 expect(()=>selecteerVerblijf(lijst,d)).toThrow();expect(selecteerVerblijf(lijst,a)).toEqual([b,c]);expect(lijst).toHaveLength(3);
});
it("houdt vervoer en dagbudget apart bij het bepalen van ruimte voor verblijf",()=>{
 const p={id:"plan",titel:"Reis",plaats:"Gent",van:"2030-05-01",tot:"2030-05-03",personen:2,budget:100000,verblijf:30000,vervoer:10000,perDag:5000,checklist:[]};
 expect(ruimteVoorVerblijf(p)).toBe(60000);expect(ruimteVoorVerblijf({...p,personen:4})).toBe(30000);expect(ruimteVoorVerblijf({...p,budget:0})).toBeNull();
});
it("weigert onmogelijke gasten, prijzen en periodes",()=>{
 expect(()=>prijsVoorReis(verblijf("a"),"2030-05-01","2030-05-03",5)).toThrow();expect(()=>prijsVoorReis(verblijf("a",NaN),"2030-05-01","2030-05-03",2)).toThrow();
 expect(()=>prijsVoorReis(verblijf("a"),"2030-05-03","2030-05-01",2)).toThrow();
});
