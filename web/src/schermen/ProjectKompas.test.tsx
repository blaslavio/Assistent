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
 expect(screen.getByText("Ontwerpen")).toBeTruthy();expect(screen.getByText(/30 minuten · Alice/)).toBeTruthy();fireEvent.click(screen.getByText("Tijd controleren"));expect(open).toHaveBeenCalledWith("Wanneer",doel.actie.sleutel);
});
it("kiest geen route wanneer twee aanpakken naast elkaar bestaan",()=>{
 const doel=f(nieuwFeit("actie","Pagina maken"),1),plannen=[2,3].map(n=>f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:doel.actie.sleutel,stappen:[stap]}),n));
 render(<ProjectKompas feiten={[doel,...plannen]} namen={new Map()} ik={1} vandaag={false} open={vi.fn()}/>);expect(screen.getByText(/2 actuele aanpakken/)).toBeTruthy();expect(screen.queryByText("Ontwerpen")).toBeNull();
});
