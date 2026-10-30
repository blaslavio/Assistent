import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ClubAgenda} from "./ClubAgenda";
import type {Community} from "../lib/chat";
const m=vi.hoisted(()=>({agenda:vi.fn(),weg:vi.fn()}));
vi.mock("../lib/club",async o=>({...await o<object>(),agenda:m.agenda,mijnAfwezig:async()=>[],weg:m.weg}));
const c={id:1,naam:"Groep",rol:"eigenaar",status:"lid",kanalen:[]} as unknown as Community;
beforeEach(()=>{vi.clearAllMocks();m.agenda.mockResolvedValue({rol:"eigenaar",afwezig:[],activiteiten:[{id:3,titel:"Feest",soort:"evenement",start:"2030-01-01T10:00Z",einde:"2030-01-01T12:00Z",plaats:"",notitie:"",uitslag:"",mag_bewerken:true,antwoorden:[],taken:[],vervoer:[]}]});});
afterEach(cleanup);
it("houdt de evenementpagina open en meldt het als verwijderen mislukt",async()=>{
 m.weg.mockRejectedValue(new Error("Geen verbinding"));render(<ClubAgenda c={c} beginSoort="evenement"/>);
 fireEvent.click(await screen.findByText("Feest"));fireEvent.click(screen.getByRole("button",{name:"Weghalen"}));expect(m.weg).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Alleen deze"}));await screen.findByText(/nog niet als verwijderd bevestigd/);expect(screen.getByRole("dialog")).toBeTruthy();
});
it("verwijdert alleen na de bevestiging en sluit na serverantwoord",async()=>{
 m.weg.mockResolvedValue({ok:true});render(<ClubAgenda c={c}/>);fireEvent.click(await screen.findByText("Feest"));fireEvent.click(screen.getByRole("button",{name:"Weghalen"}));fireEvent.click(screen.getByRole("button",{name:"Alleen deze"}));await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(m.weg).toHaveBeenCalledWith(3);
});
