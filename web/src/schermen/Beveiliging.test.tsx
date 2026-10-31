import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Beveiliging } from "./Beveiliging";
import { tweeStapStarten,apparaatVergeten } from "../lib/beveiliging";
vi.mock("../lib/beveiliging",async o=>({...await o<object>(),beveiliging:async()=>({twee_stap:false,herstelcodes_over:0,sessies:[{apparaat:"iPhone",aangemaakt:"2030-01-01",laatst:"2030-01-01",deze:true}],inlogs:[],mislukt_recent:0}),apparaten:async()=>[{id:1,naam:"iPhone",laatst:"2030-01-01"}],tweeStapStarten:vi.fn(),apparaatVergeten:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("legt beveiliging eenvoudig uit en laat alleen gekozen details zien zonder instellingen te wijzigen",async()=>{
 render(<Beveiliging gebruiker={{id:1,naam:"test",email:"test@example.org"}}/>);
 const extra=await screen.findByText("Extra controle bij aanmelden"),apparaten=screen.getByText("Je apparaten en aanmeldingen");
 expect(extra.closest("details")?.open).toBe(false);expect(apparaten.closest("details")?.open).toBe(false);
 fireEvent.click(apparaten);expect(screen.getByText(/Meerdere regels met ‘iPhone’/)).toBeTruthy();expect(screen.getByRole("heading",{name:"Nu ingelogd"})).toBeTruthy();
 expect(tweeStapStarten).not.toHaveBeenCalled();expect(apparaatVergeten).not.toHaveBeenCalled();
});
