import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProjectWerkruimte from "./ProjectWerkruimte";
import { bestandMaken } from "../lib/project";
import { versturen } from "../lib/chat";

const sessie = vi.hoisted(() => ({ naam: "test", token: "test-only" }));
vi.mock("../api", () => ({ huidigeSessie: () => sessie }));
vi.mock("../lib/chat", () => ({ versturen: vi.fn().mockResolvedValue({ id: 1 }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("maakt vanuit de chat een bewerkbaar gedeeld bestand en bevestigt delen pas na opslag", async () => {
  render(<ProjectWerkruimte gesprek={9001} regels={[]} schrijven verdwijnend={false} beginOpen />);
  fireEvent.change(screen.getByLabelText("Naam nieuw projectbestand"), { target: { value: "projectplan.md" } });
  fireEvent.click(screen.getByRole("button", { name: "Bestand maken en delen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "projectplan.md" }), { target: { value: "Samen aan het plan" } });
  expect(screen.getByRole("status").textContent).toContain("wachten nog");
  fireEvent.click(screen.getByRole("button", { name: "Nu delen / opnieuw proberen" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Delen bevestigd"));
  expect(versturen).toHaveBeenCalledWith(9001, expect.objectContaining({ t: "project", titel: "projectplan.md", versie: 1 }));
});

it("biedt in een alleen-lezen kanaal geen schrijf- of importacties", () => {
  const bestand = bestandMaken(9002, "notities.txt", "Alleen lezen");
  render(<ProjectWerkruimte gesprek={9002} regels={[]} schrijven={false} verdwijnend={false} beginOpen />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: bestand.id } });
  expect((screen.getByRole("textbox", { name: "notities.txt" }) as HTMLTextAreaElement).readOnly).toBe(true);
  expect(screen.queryByRole("button", { name: "Bestand maken en delen" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Nu delen / opnieuw proberen" })).toBeNull();
});

it("blokkeert het delen bij verdwijnende berichten", () => {
  render(<ProjectWerkruimte gesprek={9003} regels={[]} schrijven verdwijnend beginOpen />);
  expect(screen.getByRole("alert").textContent).toContain("verdwijnende berichten uit");
  expect(screen.queryByRole("button", { name: "Bestand maken en delen" })).toBeNull();
  expect(versturen).not.toHaveBeenCalled();
});
