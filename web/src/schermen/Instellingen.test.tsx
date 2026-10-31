import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import Instellingen from "./Instellingen";
import type {Staat} from "../App";
vi.mock("./Profiel",()=>({useEigenFoto:()=>[null],Profiel:()=>null}));
afterEach(cleanup);
const staat={gebruiker:{id:2,naam:"alice"},data:{taken:[],afspraken:[],volgend_id:1}} as Staat;
const props={staat,vernieuw:vi.fn(),terug:vi.fn(),opUitgelogd:vi.fn(),setStaat:vi.fn(),vraag:vi.fn()};
it("toont vijf groepen en verbergt hun onderliggende keuzes tot openen",()=>{
 render(<Instellingen {...props}/>);expect(screen.queryByText("Portefeuille, markten en volglijst")).toBeNull();
 for(const n of ["Account en privacy","App en assistent","Planning en koppelingen","Geldzaken","Mijn apps"])expect(screen.getByText(n)).toBeTruthy();
 fireEvent.click(screen.getByText("Geldzaken"));expect(screen.getByText("Budget")).toBeTruthy();expect(screen.getByText("Betalingen")).toBeTruthy();expect(screen.queryByText("Boekingspagina")).toBeNull();
});
it("vindt verborgen functies en navigatie zonder eerst een groep te openen",()=>{
 render(<Instellingen {...props}/>);fireEvent.change(screen.getByRole("searchbox"),{target:{value:"evenement"}});expect(screen.getByText("Evenementen")).toBeTruthy();
 fireEvent.change(screen.getByRole("searchbox"),{target:{value:"onvindbaar-123"}});expect(screen.getByRole("status").textContent).toContain("Niets gevonden");
});

it("zet persoonlijke opties eerst en houdt werkopties ingeklapt maar vindbaar",()=>{
 render(<Instellingen {...props}/>);const zakelijk=screen.getByText("Zakelijke opties");expect(zakelijk.closest("details")?.open).toBe(false);
 expect(screen.getByText("Mijn apps").compareDocumentPosition(zakelijk)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 fireEvent.click(zakelijk);expect(screen.getByText("Rooster, klanten en boekhouding")).toBeTruthy();
 fireEvent.change(screen.getByRole("searchbox"),{target:{value:"boekingspagina"}});expect(screen.getByText("Boekingspagina")).toBeTruthy();
});
