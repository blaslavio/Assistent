import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProjectArchiefCatalogus from "./ProjectArchiefCatalogus";
import { projectArchiefBestanden, projectArchiefGegevens, projectArchiefLijst } from "../lib/chat";
import { werkruimte } from "../lib/project";
vi.mock("../lib/chat",()=>({versturen:vi.fn(),projectArchiefBestanden:vi.fn(),projectArchiefGegevens:vi.fn(),projectArchiefLijst:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("ontdekt en herstelt een bestand zonder chatgeschiedenis en bewaart oorspronkelijke auteurs",async()=>{
  const id="00000000-0000-4000-8000-000000000001";
  vi.mocked(projectArchiefBestanden).mockResolvedValue({bestanden:[{bestand:id,laatst:"2026-10-29",aantal:1}]});
  vi.mocked(projectArchiefLijst).mockResolvedValue({versies:[{id:7,afzender:2,aangemaakt:"2026-10-29"}]});
  vi.mocked(projectArchiefGegevens).mockResolvedValue({titel:"Hersteld.md",tekst:"Oud werk",auteurs:[2,3],herkomstOnbekend:true});
  const geopend=vi.fn();render(<ProjectArchiefCatalogus gesprek={987} schrijven geopend={geopend}/>);
  fireEvent.click(screen.getByText("Bestanden terugvinden in het aparte archief"));fireEvent.click(screen.getByText("Gearchiveerde bestanden ophalen"));
  fireEvent.click(await screen.findByText("Laatste versie bekijken"));await screen.findByText("Oud werk");expect(geopend).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Bevestig herstel als nieuw projectbestand"));await waitFor(()=>expect(geopend).toHaveBeenCalledTimes(1));
  const nieuw=werkruimte(987).bestanden.get(geopend.mock.calls[0][0])!;expect(nieuw.id).not.toBe(id);expect(nieuw.inhoud).toBe("Oud werk");expect(nieuw.bronAuteurs).toEqual([2,3]);expect(nieuw.onbekendeHerkomst).toBe(true);
});
