import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import HoofdNavigatie from "./HoofdNavigatie";
import ProjectNavigatie from "./ProjectNavigatie";
afterEach(cleanup);
it("biedt drie vaste ingangen en houdt overige schermen bereikbaar via Meer",()=>{
 const kies=vi.fn();render(<HoofdNavigatie actief="vandaag" kies={kies}/>);expect(screen.getAllByRole("button")).toHaveLength(4);expect(screen.queryByRole("button",{name:"Agenda"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Projecten"}));expect(kies).toHaveBeenCalledWith("projecten");fireEvent.click(screen.getByRole("button",{name:"Meer onderdelen"}));fireEvent.click(screen.getByRole("button",{name:"Agenda"}));expect(kies).toHaveBeenCalledWith("agenda");expect(screen.queryByRole("button",{name:"Agenda"})).toBeNull();
});
it("houdt projectfuncties doorzoekbaar en sluit Meer na een keuze",()=>{
 const kies=vi.fn();render(<ProjectNavigatie deel="Overzicht" kies={kies} wijzigingen={2}/>);expect(screen.getAllByRole("button")).toHaveLength(4);expect(screen.queryByRole("button",{name:"Planning"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Meer projectmogelijkheden"}));fireEvent.change(screen.getByLabelText("Zoek een projectfunctie"),{target:{value:"plan"}});expect(screen.queryByRole("button",{name:"Werkdruk"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Planning"}));expect(kies).toHaveBeenCalledWith("Wanneer");expect(screen.queryByLabelText("Zoek een projectfunctie")).toBeNull();
});
it("sluit Meer met Escape en geeft toetsenbordfocus terug",()=>{
 render(<ProjectNavigatie deel="Overzicht" kies={vi.fn()} wijzigingen={0}/>);const meer=screen.getByRole("button",{name:"Meer projectmogelijkheden"});fireEvent.click(meer);const zoek=screen.getByLabelText("Zoek een projectfunctie");zoek.focus();fireEvent.keyDown(zoek,{key:"Escape"});expect(document.activeElement).toBe(meer);expect(within(screen.getByRole("navigation",{name:"Projectonderdelen"})).queryByLabelText("Zoek een projectfunctie")).toBeNull();
});
