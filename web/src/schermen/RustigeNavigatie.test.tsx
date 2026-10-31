import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import HoofdNavigatie, { dokVan } from "./HoofdNavigatie";
import ProjectNavigatie from "./ProjectNavigatie";
afterEach(cleanup);
it("toont drie plekken onderin, Mijn dag, Chat en Werkruimte",()=>{
 const kies=vi.fn();render(<HoofdNavigatie actief="vandaag" kies={kies}/>);const knoppen=screen.getAllByRole("button");expect(knoppen.map(k=>k.textContent)).toEqual(["Mijn dag","Chat","Werkruimte"]);
 fireEvent.click(screen.getByRole("button",{name:"Werkruimte"}));expect(kies).toHaveBeenCalledWith("projecten");
});
it("houdt de hoofdplekken vast bij oude of onbekende dokvoorkeuren",()=>{
 expect(dokVan(["chat","projecten","vandaag"])).toEqual(["vandaag","chat","projecten"]);
 expect(dokVan(["onzin"])).toEqual(["vandaag","chat","projecten"]);
 expect(dokVan(undefined)).toEqual(["vandaag","chat","projecten"]);
});
it("houdt projectfuncties doorzoekbaar en sluit Meer na een keuze",()=>{
 const kies=vi.fn();render(<ProjectNavigatie deel="Overzicht" kies={kies} wijzigingen={2}/>);expect(screen.getAllByRole("button")).toHaveLength(4);expect(screen.queryByRole("button",{name:"Planning"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Meer projectmogelijkheden"}));fireEvent.change(screen.getByLabelText("Zoek een projectfunctie"),{target:{value:"plan"}});expect(screen.queryByRole("button",{name:"Werkdruk"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Planning"}));expect(kies).toHaveBeenCalledWith("Wanneer");expect(screen.queryByLabelText("Zoek een projectfunctie")).toBeNull();
});
it("sluit Meer met Escape en geeft toetsenbordfocus terug",()=>{
 render(<ProjectNavigatie deel="Overzicht" kies={vi.fn()} wijzigingen={0}/>);const meer=screen.getByRole("button",{name:"Meer projectmogelijkheden"});fireEvent.click(meer);const zoek=screen.getByLabelText("Zoek een projectfunctie");zoek.focus();fireEvent.keyDown(zoek,{key:"Escape"});expect(document.activeElement).toBe(meer);expect(within(screen.getByRole("navigation",{name:"Projectonderdelen"})).queryByLabelText("Zoek een projectfunctie")).toBeNull();
});
