import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import GlobaalZoek from "./GlobaalZoek";
import * as naar from "../lib/naar";
afterEach(cleanup);
it("vindt ook de apps uit Werkruimte, zodat één zoekveld genoeg is",()=>{
 const spy=vi.spyOn(naar,"naar").mockImplementation(()=>{});const sluit=vi.fn();
 render(<GlobaalZoek sluit={sluit}/>);fireEvent.change(screen.getByRole("searchbox"),{target:{value:"budget"}});
 fireEvent.click(screen.getByRole("button",{name:"Budget"}));expect(spy).toHaveBeenCalledWith({tab:"projecten",onderdeel:"budget"});expect(sluit).toHaveBeenCalled();
});
