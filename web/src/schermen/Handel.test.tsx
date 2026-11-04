import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {Handel,isEten} from "./Handel";
const m=vi.hoisted(()=>({zoeken:vi.fn(),rpc:vi.fn()}));
vi.mock("../lib/winkelen",async o=>({...await o<object>(),zoeken:m.zoeken,productFoto:async()=>null}));
vi.mock("../api",async o=>({...await o<object>(),rpc:m.rpc}));
const p=(id:number,titel:string,extra={})=>({sleutel:`m${id}`,bron:"marktplaats",id,titel,prijs:10,omschrijving:"",verkoper:"Sanne",levering:["ophalen"],betaalwijzen:[],voorraad:null,foto:false,...extra});
beforeEach(()=>{vi.clearAllMocks();m.zoeken.mockResolvedValue([p(1,"Jas")]);m.rpc.mockResolvedValue([{adres:"pizza-roma",naam:"Pizzeria Roma",producten:4},{adres:"fietsen",naam:"Fietsenwinkel",producten:2}]);});
afterEach(cleanup);
it("herkent eetzaken aan naam en omschrijving",()=>{
 expect(isEten({naam:"Bakkerij De Korf"})).toBe(true);expect(isEten({naam:"Fietsenwinkel"})).toBe(false);
});
it("verandert het hele scherm per soort, zonder categorieënblok",async()=>{
 const {container}=render(<Handel bestel={vi.fn()} verkoop={vi.fn()}/>);
 await screen.findByRole("list",{name:"Te koop"});expect(screen.queryByText("Categorieën")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Diensten",pressed:false}));
 expect(container.querySelector('[data-soort="diensten"]')).toBeTruthy();
 await screen.findByRole("list",{name:"Diensten"});expect(screen.getByPlaceholderText("Wat moet er gebeuren?")).toBeTruthy();
 await waitFor(()=>expect(m.zoeken).toHaveBeenLastCalledWith("",expect.objectContaining({bron:"diensten"})));
 fireEvent.click(screen.getByRole("button",{name:"Eten",pressed:false}));
 const zaken=await screen.findByRole("list",{name:"Eetzaken"});
 expect(zaken.textContent).toContain("Pizzeria Roma");expect(zaken.textContent).not.toContain("Fietsenwinkel");
 fireEvent.click(screen.getByRole("button",{name:"Winkels",pressed:false}));await screen.findByRole("list",{name:"Producten"});
});
