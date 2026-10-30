import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { bijwerken, type Staat } from "../api";
import Vakanties from "./Vakanties";
vi.mock("../api",async origineel=>({...await origineel<object>(),bijwerken:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const init=():Staat=>({gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}});
function Scherm(){const [s,set]=useState(init);return <Vakanties staat={s} setStaat={set}/>;}
function invullen(){
 fireEvent.click(screen.getByText("Nieuwe vakantie plannen"));
 for(const [label,value] of [["Naam van je vakantie","Zomer"],["Bestemming (plaats en land)","Gent"],["Aankomst","2030-05-01"],["Vertrek / terugreisdag","2030-05-05"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole("button",{name:"Plan controleren"}));
}
it("laat het plan controleren, bewaart pas na bevestiging en doet geen boeking",async()=>{
 const g=init().data;vi.mocked(bijwerken).mockImplementation(async f=>{f(g);return structuredClone(g);});render(<Scherm/>);invullen();
 expect(bijwerken).not.toHaveBeenCalled();expect(screen.getByRole("region",{name:"Controleer je vakantieplan"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Plan bewaren"}));await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("opgeslagen"));
 expect(g.afspraken).toHaveLength(0);expect(g.vakanties).toHaveLength(1);
 fireEvent.click(screen.getByText("Plan bijstellen, kaart en agenda"));
 fireEvent.click(screen.getByRole("button",{name:"Bevestig: in mijn agenda zetten"}));await waitFor(()=>expect(g.afspraken).toHaveLength(1));
});
it("behoudt dezelfde planopdracht bij een verloren opslagantwoord",async()=>{
 const g=init().data;vi.mocked(bijwerken).mockImplementationOnce(async f=>{f(g);throw new Error("Antwoord verloren");}).mockImplementation(async f=>{f(g);return structuredClone(g);});
 render(<Scherm/>);invullen();fireEvent.click(screen.getByRole("button",{name:"Plan bewaren"}));await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
 expect(screen.getByRole("button",{name:"Plan bewaren"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Plan bewaren"}));await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("opgeslagen"));
 expect(g.vakanties).toHaveLength(1);
});
