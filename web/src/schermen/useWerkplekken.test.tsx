import {act,renderHook,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {useWerkplekken} from "./useWerkplekken";
import {bijwerken,type Gegevens} from "../api";
const account=vi.hoisted(()=>({sessie:{naam:"eerste",token:"fixture"}}));
vi.mock("../api",async o=>({...await o<object>(),huidigeSessie:()=>account.sessie,bijwerken:vi.fn()}));
it("voert recent bijwerken na elkaar uit en gebruikt een laat antwoord niet in een ander account",async()=>{
 const data:Gegevens={taken:[],afspraken:[],volgend_id:1},setStaat=vi.fn();let klaar!:(g:Gegevens)=>void;
 vi.mocked(bijwerken).mockImplementationOnce(async f=>{f(data);return new Promise(r=>{klaar=r;});});
 const {result}=renderHook(()=>useWerkplekken({gebruiker:{id:1,naam:"eerste"},data},setStaat));act(()=>{result.current({soort:"app",app:"notities"});result.current({soort:"app",app:"documenten"});});await waitFor(()=>expect(bijwerken).toHaveBeenCalledOnce());
 account.sessie={naam:"ander",token:"nieuw"};await act(async()=>klaar(data));await act(async()=>{await Promise.resolve();});expect(setStaat).not.toHaveBeenCalled();expect(bijwerken).toHaveBeenCalledOnce();
});
