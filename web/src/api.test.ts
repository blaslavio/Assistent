import { afterEach, describe, expect, it, vi } from "vitest";
import { alsIk, bijwerken, inloggen, rpc, uitloggen } from "./api";

const reactie = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

afterEach(async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reactie(true)));
  await uitloggen();
  vi.unstubAllGlobals();
});

describe("veilige gedeelde opslag", () => {
  it("bewaart een ongewijzigde basis en schrijft alleen via versiecontrole", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reactie({ token: "sessie", naam: "alice" }))
      .mockResolvedValueOnce(reactie({ data: { volgend_id: 2, taken: [{ id: 1, titel: "Vooraf", klaar: false }] } }))
      .mockResolvedValueOnce(reactie({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await inloggen("alice", "test-only", "", false);
    await bijwerken(g => { g.taken.push({ id: 2, titel: "Nieuw", klaar: false }); });
    const [url, verzoek] = fetcher.mock.calls[2];
    const inhoud = JSON.parse(verzoek.body);
    expect(url).toContain("mijn_gegevens_veilig_bewaren");
    expect(inhoud.p_basis.taken).toHaveLength(1);
    expect(inhoud.p_data.taken).toHaveLength(2);
    expect(inhoud.p_basis.contacten).toEqual([]);
  });

  it("herhaalt een wijziging niet na een conflict", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reactie({ token: "sessie" }))
      .mockResolvedValueOnce(reactie({ data: {} })).mockResolvedValueOnce(reactie({ conflict: true }));
    vi.stubGlobal("fetch", fetcher);
    await inloggen("alice", "test-only", "", false);
    await expect(bijwerken(g => { g.volgend_id++; })).rejects.toThrow("elders gewijzigd");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("laat parameters de accountidentiteit niet vervangen", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reactie({ token: "sessie", naam: "alice" }))
      .mockResolvedValueOnce(reactie({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await inloggen("alice", "test-only", "", false);
    await alsIk("mijn_gegevens", { p_naam: "bob", p_wachtwoord: "anders" });
    const inhoud = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(inhoud.p_naam).toBe("alice");
    expect(inhoud.p_wachtwoord).toBe("sessie");
  });

  it("verwerpt een laat antwoord nadat het account is gewisseld", async () => {
    let afronden!: (r: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(reactie({ token: "alice" }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { afronden = resolve; }))
      .mockResolvedValueOnce(reactie({ token: "bob" }));
    vi.stubGlobal("fetch", fetcher);
    await inloggen("alice", "test-only", "", false);
    const wachtend = bijwerken(g => { g.volgend_id++; });
    await inloggen("bob", "test-only", "", false);
    afronden(reactie({ data: {} }));
    await expect(wachtend).rejects.toThrow("account is intussen gewijzigd");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

});

describe("haperende verbinding", () => {
  it("probeert een lezende functie één keer opnieuw, een schrijvende niet", async () => {
    const lezen = vi.fn().mockRejectedValueOnce(new TypeError("Load failed")).mockResolvedValueOnce(reactie({ ok: 1 }));
    vi.stubGlobal("fetch", lezen);
    expect(await rpc("mijn_gegevens")).toEqual({ ok: 1 });
    expect(lezen).toHaveBeenCalledTimes(2);
    const schrijven = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    vi.stubGlobal("fetch", schrijven);
    await expect(rpc("taak_toevoegen")).rejects.toMatchObject({ status: 0 });
    expect(schrijven).toHaveBeenCalledTimes(1);
  });

  it("zegt in gewone taal wat er misging", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(rpc("iets")).rejects.toThrow(/storing/);
  });
});
