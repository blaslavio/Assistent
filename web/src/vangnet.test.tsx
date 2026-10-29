import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue(null) }));
vi.mock("./api", () => ({ rpc }));
beforeEach(() => { vi.resetModules(); rpc.mockClear(); });
it("stuurt geen foutinhoud, stack, apparaatkenmerken of vrije context naar de server", async () => {
  const { foutMelden } = await import("./vangnet");
  const fout = new TypeError("privébericht alice@example.org secret-token");
  fout.stack = "https://app.test/?token=secret";
  foutMelden(fout, "chat");
  expect(rpc).toHaveBeenCalledWith("app_fout_melden", { p_tekst: "clientfout\nplek: chat\nsoort: TypeError" });
  fout.name = "privénaam";
  foutMelden(fout, "privécontext");
  expect(rpc).toHaveBeenLastCalledWith("app_fout_melden", { p_tekst: "clientfout\nplek: onbekend\nsoort: Error" });
});
it("begrenst foutmeldingen tot vijf per geladen app", async () => {
  const { foutMelden } = await import("./vangnet");
  for (let n = 0; n < 20; n++) foutMelden("privéwaarde", "venster");
  expect(rpc).toHaveBeenCalledTimes(5);
});
it("toont herstelacties zonder ruwe foutinhoud", async () => {
  const { Vangnet } = await import("./vangnet");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  function Kapot(): never { throw new Error("privé-inhoud"); }
  try {
    render(<Vangnet naam="app"><Kapot /></Vangnet>);
    expect(screen.getByRole("alert").textContent).not.toContain("privé-inhoud");
    expect(screen.getByRole("button", { name: "Opnieuw proberen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "App herladen" })).toBeTruthy();
  } finally { log.mockRestore(); }
});
