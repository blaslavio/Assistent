import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import HoofdNavigatie, { dokVan } from "./HoofdNavigatie";
import ProjectNavigatie from "./ProjectNavigatie";
afterEach(cleanup);
it("toont drie plekken onderin, standaard Vandaag, Agenda en Chat",()=>{
 const kies=vi.fn();render(<HoofdNavigatie actief="vandaag" kies={kies}/>);const knoppen=screen.getAllByRole("button");expect(knoppen.map(k=>k.textContent)).toEqual(["Vandaag","Agenda","Chat"]);
 fireEvent.click(screen.getByRole("button",{name:"Agenda"}));expect(kies).toHaveBeenCalledWith("agenda");
});
it("houdt zich aan de eigen keuze en vult onbekende keuzes aan",()=>{
 expect(dokVan(["chat","projecten","vandaag"])).toEqual(["vandaag","chat","projecten"]);
 expect(dokVan(["onzin"])).toEqual(["vandaag","agenda","chat"]);
 expect(dokVan(undefined)).toEqual(["vandaag","agenda","chat"]);
});
it("houdt projectfuncties doorzoekbaar en sluit Meer na een keuze",()=>{
 const kies=vi.fn();render(<ProjectNavigatie deel="Overzicht" kies={kies} wijzigingen={2}/>);expect(screen.getAllByRole("button")).toHaveLength(4);expect(screen.queryByRole("button",{name:"Planning"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Meer projectmogelijkheden"}));fireEvent.change(screen.getByLabelText("Zoek een projectfunctie"),{target:{value:"plan"}});expect(screen.queryByRole("button",{name:"Werkdruk"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Planning"}));expect(kies).toHaveBeenCalledWith("Wanneer");expect(screen.queryByLabelText("Zoek een projectfunctie")).toBeNull();
});
it("sluit Meer met Escape en geeft toetsenbordfocus terug",()=>{
 render(<ProjectNavigatie deel="Overzicht" kies={vi.fn()} wijzigingen={0}/>);const meer=screen.getByRole("button",{name:"Meer projectmogelijkheden"});fireEvent.click(meer);const zoek=screen.getByLabelText("Zoek een projectfunctie");zoek.focus();fireEvent.keyDown(zoek,{key:"Escape"});expect(document.activeElement).toBe(meer);expect(within(screen.getByRole("navigation",{name:"Projectonderdelen"})).queryByLabelText("Zoek een projectfunctie")).toBeNull();
});
