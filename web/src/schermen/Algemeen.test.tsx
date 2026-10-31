import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AlgemeenScherm, weergaveToepassen } from "./Algemeen";
afterEach(()=>{cleanup();weergaveToepassen({});});
it("begint lichtblauw en licht, en respecteert expliciet donker of automatisch",()=>{
 weergaveToepassen({});expect(document.documentElement.dataset.thema).toBe("licht");expect(document.documentElement.dataset.kleur).toBe("hemel");
 weergaveToepassen({thema:"donker",stijl:{kleur:"zeegroen"}});expect(document.documentElement.dataset.thema).toBe("donker");expect(document.documentElement.dataset.kleur).toBe("zeegroen");
 weergaveToepassen({thema:"auto"});expect(document.documentElement.dataset.thema).toBeUndefined();
});
it("bundelt extra weergavekeuzes en bewaart pas na een bewuste keuze",()=>{
 const bewaar=vi.fn();render(<AlgemeenScherm inst={{}} bewaar={bewaar}/>);
 for(const tekst of ["Vorm en ruimte","Tekst en leesbaarheid","Startpagina en navigatie","Bij de assistent"])expect(screen.getByText(tekst).closest("details")?.open).toBe(false);
 expect(bewaar).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Lichtblauw"}));expect(bewaar).toHaveBeenCalledOnce();
});
