import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Projecten from "./Projecten";
import { overzicht, type Gesprek } from "../lib/chat";
import { huidigeSessie } from "../api";
vi.mock("../lib/chat",()=>({overzicht:vi.fn()}));vi.mock("../api",()=>({huidigeSessie:vi.fn()}));
const staat={gebruiker:{id:1,naam:"Alice"},data:{taken:[],afspraken:[],volgend_id:1}};
const kamer=(id:number,naam:string,status:"lid"|"verzoek"="lid"):Gesprek=>({id,naam,status,soort:"groep",leden:[],ongelezen:0});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(huidigeSessie).mockReturnValue({naam:"Alice",token:"test"});});afterEach(cleanup);
it("toont alleen geaccepteerde gesprekken en opent de gekozen werkruimte",async()=>{
 vi.mocked(overzicht).mockResolvedValue({gesprekken:[kamer(7,"Ontwerp"),kamer(8,"Nog niet", "verzoek")],communities:[]});const open=vi.fn();render(<Projecten staat={staat} open={open} naarChat={vi.fn()}/>);await screen.findByText("Ontwerp");expect(screen.queryByText("Nog niet")).toBeNull();fireEvent.click(screen.getByText("Open werkruimte"));expect(open).toHaveBeenCalledWith(7);expect(overzicht).toHaveBeenCalledTimes(1);expect(overzicht).toHaveBeenCalledWith(false);
});
it("helpt beginnen zonder een verzonnen project te tonen",async()=>{
 vi.mocked(overzicht).mockResolvedValue({gesprekken:[],communities:[]});const chat=vi.fn();render(<Projecten staat={staat} open={vi.fn()} naarChat={chat}/>);fireEvent.click(await screen.findByText("Open Chat"));expect(chat).toHaveBeenCalled();
});
it("toont zes werkruimtes en laat zoeken in de hele lijst",async()=>{
 vi.mocked(overzicht).mockResolvedValue({gesprekken:Array.from({length:8},(_,i)=>kamer(i+1,`Werkruimte ${i+1}`)),communities:[]});render(<Projecten staat={staat} open={vi.fn()} naarChat={vi.fn()}/>);await screen.findByText("Werkruimte 1");expect(screen.getAllByText("Open werkruimte")).toHaveLength(6);fireEvent.change(screen.getByLabelText("Zoek een werkruimte"),{target:{value:"Werkruimte 8"}});expect(screen.getByText("Werkruimte 8")).toBeTruthy();expect(screen.getAllByText("Open werkruimte")).toHaveLength(1);
});
it("toont geen vertraagd resultaat na een accountwissel",async()=>{
 let klaar!:(v:Awaited<ReturnType<typeof overzicht>>)=>void;vi.mocked(overzicht).mockImplementation(()=>new Promise(r=>{klaar=r;}));render(<Projecten staat={staat} open={vi.fn()} naarChat={vi.fn()}/>);vi.mocked(huidigeSessie).mockReturnValue({naam:"Bob",token:"anders"});klaar({gesprekken:[kamer(7,"PRIVE ALICE")],communities:[]});await waitFor(()=>expect(screen.queryByRole("status")).toBeNull());expect(screen.queryByText("PRIVE ALICE")).toBeNull();
});
it("biedt opnieuw proberen bij een storing",async()=>{
 vi.mocked(overzicht).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({gesprekken:[kamer(7,"Hersteld")],communities:[]});render(<Projecten staat={staat} open={vi.fn()} naarChat={vi.fn()}/>);fireEvent.click(await screen.findByText("Opnieuw proberen"));await screen.findByText("Hersteld");
});
