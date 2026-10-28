import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BelLaag from "./Bellen";
import { ophangen, dempen } from "../lib/bellen";

const bel = vi.hoisted(() => ({ id: "test-call", gesprek: 42, naam: "Projectpartner", video: true, fase: "verbonden", begin: Date.now() }));
const stand = vi.hoisted(() => ({ bel, binnen: null, melding: "" }));
vi.mock("../lib/bellen", () => ({ belStaat: () => stand, belVolgen: () => () => {},
  ophangen: vi.fn(), dempen: vi.fn(), beeldUit: vi.fn(), meldingWeg: vi.fn(), opnemen: vi.fn(), weigeren: vi.fn() }));
vi.mock("../rondje", () => ({ Rondje: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("opent het project terwijl het gesprek blijft lopen en de bediening beschikbaar blijft", () => {
  const naarProject = vi.fn();
  render(<BelLaag naarProject={naarProject} />);
  fireEvent.click(screen.getByRole("button", { name: "Samen aan project werken" }));
  expect(naarProject).toHaveBeenCalledWith(42);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("complementary", { name: "Gesprek tijdens samenwerken" })).toBeTruthy();
  expect(ophangen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Dempen" })); expect(dempen).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Groot beeld" }));
  expect(screen.getByRole("dialog", { name: "Gesprek" })).toBeTruthy();
});
