import { afterEach,expect,it,vi } from "vitest";
import { agendaKaartplek,kaartContext,routeSchets,geldigKaartpunt } from "./kaartverbinding";
import { kaartBestemmingOpenen,kaartContextLezen,agendaPlekOpenen,agendaPlekLezen } from "./naar";
import { kaartDonker,eigenKaartkleur } from "./kaartstijl";
afterEach(()=>{window.dispatchEvent(new Event("assistent-sessie"));sessionStorage.clear();delete document.documentElement.dataset.thema;});
it("maakt een begrensde app-context zonder extra velden of gedeelde objectreferenties",()=>{
 const punt={lat:52.09,lon:5.12};const r=kaartContext(" Utrecht ",{bron:"agenda",titel:"Afspraak",punt});punt.lat=0;
 expect(r).toEqual({adres:"Utrecht",bron:"agenda",titel:"Afspraak",punt:{lat:52.09,lon:5.12}});
 expect(kaartContext("Adres\nPrivé")).toBeNull();expect(kaartContext("x",{bron:"onbekend" as never})).toBeNull();expect(kaartContext("x",{punt:{lat:91,lon:5}})).toBeNull();
 expect(geldigKaartpunt({lat:"52",lon:5})).toBe(false);
});
it("geeft alleen het gekozen adres en de eigen bron door, één keer en uitsluitend in geheugen",()=>{
 const luisteren=vi.fn();window.addEventListener("kaart-openen",luisteren);
 kaartBestemmingOpenen("Gent",{bron:"vakantie",titel:"Mijn reis"});expect(luisteren).toHaveBeenCalledOnce();expect(kaartContextLezen()).toEqual({adres:"Gent",bron:"vakantie",titel:"Mijn reis"});expect(kaartContextLezen()).toBeNull();
 expect(localStorage.getItem("Gent")).toBeNull();window.removeEventListener("kaart-openen",luisteren);
});
it("wist beide richtingen van de appverbinding bij een sessiewissel",()=>{
 kaartBestemmingOpenen("Eigen adres",{bron:"verblijf"});agendaPlekOpenen("Privéplek",{lat:52,lon:5});window.dispatchEvent(new Event("assistent-sessie"));expect(kaartContextLezen()).toBeNull();expect(agendaPlekLezen()).toBeNull();
});
it("maakt alleen een voorstel voor de agenda met het exacte kaartpunt",()=>{
 expect(agendaKaartplek("Mijn plek",{lat:52.09,lon:5.12})).toEqual({titel:"Mijn plek",locatie:"52.090000, 5.120000",kaartpunt:{lat:52.09,lon:5.12}});
 expect(agendaKaartplek("",{lat:52,lon:5})).toBeNull();agendaPlekOpenen("Plek",{lat:52,lon:5});expect(agendaPlekLezen()?.kaartpunt).toEqual({lat:52,lon:5});expect(agendaPlekLezen()).toBeNull();
});
it("tekent een schematische lijn zonder privélabels en zonder lange omweg over de datumgrens",()=>{
 const r=routeSchets({lat:0,lon:179},{lat:0,lon:-179});expect(r.features[0].geometry.coordinates).toEqual([[179,0],[181,0]]);expect(r.features[0].properties).toEqual({soort:"schematisch"});expect(routeSchets(null,{lat:0,lon:0}).features).toEqual([]);
});
it("volgt de echte app-themakeuze, inclusief automatische systeemstand",()=>{
 document.documentElement.dataset.thema="licht";expect(kaartDonker(document.documentElement,true)).toBe(false);
 document.documentElement.dataset.thema="donker";expect(kaartDonker(document.documentElement,false)).toBe(true);
 delete document.documentElement.dataset.thema;expect(kaartDonker(document.documentElement,true)).toBe(true);
});
it("past alleen passende vectorlagen aan en laat tekst en bronvermelding intact",()=>{
 expect(eigenKaartkleur("water","fill",false)?.kleur).toBe("#b9ddf1");expect(eigenKaartkleur("street-label","symbol",false)).toBeNull();expect(eigenKaartkleur("building","fill",true)?.eigenschap).toBe("fill-color");
});
