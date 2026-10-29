import { beforeEach, expect, it, vi } from "vitest";
import { eigenDienstBewijzen } from "./projectdiensten";
import { lijst } from "./bestellingen";
import { mijnPagina } from "./gasten";
import { alsIk, huidigeSessie } from "../api";
vi.mock("./bestellingen",()=>({lijst:vi.fn()}));vi.mock("./gasten",()=>({mijnPagina:vi.fn()}));vi.mock("../api",()=>({alsIk:vi.fn(),huidigeSessie:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(huidigeSessie).mockReturnValue({naam:"Alice",token:"test"});});
it("leest geen diensten als alleen tijd of stapresultaten nodig zijn",async()=>{
 expect(await eigenDienstBewijzen()).toEqual({bewijzen:[],fouten:[]});expect(lijst).not.toHaveBeenCalled();expect(mijnPagina).not.toHaveBeenCalled();expect(alsIk).not.toHaveBeenCalled();
});
it("leest uitsluitend gevraagde diensten en kopieert geen namen of bedragen",async()=>{
 vi.mocked(lijst).mockResolvedValue([{id:42,status:"betaald",betaalwijze:"app",rol:"koper",ander_id:2,ander:"PRIVE",bedrag:150,titel:"PRIVE",levering:"digitaal",bijgewerkt:"2026-10-29"}]);
 const r=await eigenDienstBewijzen(["betaling","betaling"]);expect(lijst).toHaveBeenCalledTimes(1);expect(mijnPagina).not.toHaveBeenCalled();expect(alsIk).not.toHaveBeenCalled();expect(JSON.stringify(r)).not.toContain("PRIVE");expect(r.bewijzen[0]).toMatchObject({id:42,status:"betaald"});
});
it("verzint geen bewijs bij storing en weigert resultaten na accountwisseling",async()=>{
 vi.mocked(lijst).mockRejectedValueOnce(new Error("niet bereikbaar"));expect(await eigenDienstBewijzen(["betaling"])).toEqual({bewijzen:[],fouten:["Betaalstatus niet bereikbaar."]});
 vi.mocked(lijst).mockImplementationOnce(async()=>{vi.mocked(huidigeSessie).mockReturnValue({naam:"Bob",token:"anders"});return [];});await expect(eigenDienstBewijzen(["betaling"])).rejects.toThrow("Account");
});
