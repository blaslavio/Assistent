import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./Feed", () => ({ Berichten: () => null, Schrijven: () => null, Feed: () => null }));
vi.mock("./ClubAgenda", () => ({ ClubAgenda: () => <p>club-agenda</p> }));
vi.mock("./Cursussen", () => ({ Cursussen: () => <p>cursussen-lijst</p> }));
vi.mock("./CommunityBeheer", () => ({ CommunityBeheer: () => <p>beheer-scherm</p> }));
vi.mock("./ModeratieMenu", () => ({ default: () => null }));
vi.mock("../lib/chat", async (o) => ({ ...await o<object>(), community: vi.fn(async () => ({ code_aan: false, deelnemers: [] })) }));
import { CommunityScherm } from "./ChatCommunity";
import type { Community } from "../lib/chat";
afterEach(cleanup);

const c: Community = { id: 3, naam: "Boksclub", omschrijving: "", rol: "eigenaar", status: "lid", leden: 12,
  kanalen: [{ id: 9, naam: "algemeen", ongelezen: 2, alleen_beheer: false, laatst: "" } as Community["kanalen"][number]] };

it("opent een community als eigen app met kanalen, agenda, cursussen, leden en beheer", () => {
  const openKanaal = vi.fn();
  render(<CommunityScherm c={c} openKanaal={openKanaal} vernieuw={async () => {}} terug={() => {}} />);
  fireEvent.click(screen.getByText("algemeen"));
  expect(openKanaal).toHaveBeenCalledWith(9);
  for (const [knop, inhoud] of [["Agenda", "club-agenda"], ["Cursussen", "cursussen-lijst"], ["Meer", "beheer-scherm"]]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${knop}`) }));
    expect(screen.getByText(inhoud)).toBeTruthy();
  }
});
