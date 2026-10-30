import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProjectKompas from "./ProjectKompas";
import { nieuwFeit, type Feit } from "../lib/projectregie";
const f=(actie:Feit["actie"],bericht:number):Feit=>({actie,bericht,afzender:1,tijd:"2026-10-29T08:00:00Z"});
const stap={id:"00000000-0000-4000-8000-000000000001",titel:"Ontwerpen",klaarAls:"Voorbeeld goedgekeurd",minuten:30,eigenaar:1,alternatief:"Samen bespreken",afhankelijkVan:[]};
afterEach(cleanup);
it("toont doel, volgende stap en eigenaar en opent de juiste controle",()=>{
 const doel=f(nieuwFeit("actie","Boekingspagina maken"),1),plan=f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:doel.actie.sleutel,stappen:[stap]}),2),open=vi.fn();
 render(<ProjectKompas feiten={[doel,plan]} namen={new Map([[1,"Alice"]])} ik={1} vandaag={false} open={open}/>);
 expect(screen.getByText("Ontwerpen")).toBeTruthy();expect(screen.getByText(/30 minuten · Alice/)).toBeTruthy();fireEvent.click(screen.getByText("Meer bij dit doel"));fireEvent.click(screen.getByText("Tijd controleren"));expect(open).toHaveBeenCalledWith("Wanneer",doel.actie.sleutel);
});
it("kiest geen route wanneer twee aanpakken naast elkaar bestaan",()=>{
 const doel=f(nieuwFeit("actie","Pagina maken"),1),plannen=[2,3].map(n=>f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:doel.actie.sleutel,stappen:[stap]}),n));
 render(<ProjectKompas feiten={[doel,...plannen]} namen={new Map()} ik={1} vandaag={false} open={vi.fn()}/>);expect(screen.getByText(/2 actuele aanpakken/)).toBeTruthy();expect(screen.queryByText("Ontwerpen")).toBeNull();
});
it("beperkt het eerste overzicht tot drie doelen zonder de rest te verliezen",()=>{
 const doelen=Array.from({length:5},(_,i)=>f(nieuwFeit("actie",`Doel ${i+1}`),i+1));render(<ProjectKompas feiten={doelen} namen={new Map()} ik={1} vandaag={false} open={vi.fn()}/>);expect(screen.queryByText("Doel: Doel 5")).toBeNull();fireEvent.click(screen.getByText("Bekijk alle 5 doelen"));expect(screen.getByText("Doel: Doel 5")).toBeTruthy();fireEvent.click(screen.getByText("Toon drie doelen"));expect(screen.queryByText("Doel: Doel 5")).toBeNull();
});
it("biedt resultaatcontrole in plaats van een volgende stap bij een afgeronde aanpak",()=>{
 const doel=f(nieuwFeit("actie","Pagina afronden"),1),plan=f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:doel.actie.sleutel,stappen:[stap]}),2),klaar=f(nieuwFeit("stapstatus","Resultaat gecontroleerd",{soort:"eigen"},{doel:plan.actie.sleutel,stap:stap.id,keuze:"klaar"}),3),open=vi.fn();render(<ProjectKompas feiten={[doel,plan,klaar]} namen={new Map()} ik={1} vandaag={false} open={open}/>);expect(screen.queryByText("Volgende stap bekijken")).toBeNull();fireEvent.click(screen.getByText("Resultaat bekijken"));expect(open).toHaveBeenCalledWith("Hoe",doel.actie.sleutel);
});
