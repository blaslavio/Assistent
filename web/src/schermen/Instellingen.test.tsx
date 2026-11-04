import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import Instellingen from "./Instellingen";
import type {Staat} from "../App";
vi.mock("./Profiel",()=>({useEigenFoto:()=>[null],Profiel:()=>null}));
afterEach(cleanup);
const staat={gebruiker:{id:2,naam:"alice"},data:{taken:[],afspraken:[],volgend_id:1}} as Staat;
const props={staat,vernieuw:vi.fn(),terug:vi.fn(),opUitgelogd:vi.fn(),setStaat:vi.fn(),vraag:vi.fn()};
it("toont alleen echte instellingen in vier korte groepen, zonder extra tik",()=>{
 render(<Instellingen {...props}/>);
 for(const n of ["Account en privacy","App en assistent","Betalen en afspraken","Hulp"])expect(screen.getByRole("heading",{name:n})).toBeTruthy();
 for(const n of ["Account","Privacy en beveiliging","Weergave","Assistent","Mail","Thuis","Betalingen","Boekingspagina","Idee of probleem"])expect(screen.getByRole("button",{name:new RegExp(`^${n}`)})).toBeTruthy();
 for(const n of ["Mijn apps","Geldzaken","Budget","Kaart en routes"])expect(screen.queryByText(n)).toBeNull();
});
it("vindt apps en verborgen functies via de zoekbalk",()=>{
 render(<Instellingen {...props}/>);fireEvent.change(screen.getByRole("searchbox"),{target:{value:"evenement"}});expect(screen.getByText("Evenementen")).toBeTruthy();
 fireEvent.change(screen.getByRole("searchbox"),{target:{value:"budget"}});expect(screen.getByText("Budget")).toBeTruthy();
 fireEvent.change(screen.getByRole("searchbox"),{target:{value:"onvindbaar-123"}});expect(screen.getByRole("status").textContent).toContain("Niets gevonden");
});
