import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AgendaNavigatie from "./AgendaNavigatie";
afterEach(cleanup);
it("bundelt de agenda in drie ingangen en houdt alle extra onderdelen onder hun kopje bereikbaar",()=>{
 const kies=vi.fn();render(<AgendaNavigatie actief={null} kies={kies} tellingen={{taken:2,mail:3}}/>);
 expect(screen.getAllByRole("button")).toHaveLength(3);expect(screen.queryByRole("button",{name:"Vakantie en verblijf"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Meer agenda-opties"}));expect(screen.getByRole("heading",{name:"Plannen en organiseren"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Vakantie en verblijf"}));expect(kies).toHaveBeenCalledWith("vakanties");expect(screen.queryByRole("searchbox")).toBeNull();
});
it("zoekt ook op verhuur en sluit met Escape naar de knop die het menu opende",()=>{
 render(<AgendaNavigatie actief="vakanties" kies={vi.fn()}/>);const meer=screen.getByRole("button",{name:"Meer agenda-opties"});fireEvent.click(meer);
 const zoek=screen.getByRole("searchbox");fireEvent.change(zoek,{target:{value:"verhuren"}});expect(screen.getByRole("button",{name:"Vakantie en verblijf"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Mail"})).toBeNull();
 zoek.focus();fireEvent.keyDown(zoek,{key:"Escape"});expect(document.activeElement).toBe(meer);expect(within(screen.getByRole("navigation")).queryByRole("searchbox")).toBeNull();
});
it("toont een lege zoekuitkomst en laat dagelijkse Taken direct openen",()=>{
 const kies=vi.fn();render(<AgendaNavigatie actief="mail" kies={kies}/>);fireEvent.click(screen.getByRole("button",{name:"Meer agenda-opties"}));fireEvent.change(screen.getByRole("searchbox"),{target:{value:"onbekend123"}});expect(screen.getByRole("status").textContent).toContain("Geen onderdeel");
 fireEvent.click(screen.getByRole("button",{name:"Taken"}));expect(kies).toHaveBeenCalledWith("taken");expect(screen.queryByRole("searchbox")).toBeNull();
});
