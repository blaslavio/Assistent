import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProjectRegie from "./ProjectRegie";
import { projectRegelsVers, versturen } from "../lib/chat";
import { nieuwFeit, PROJECT_SCOPE } from "../lib/projectregie";
import { projectHulp } from "../lib/assistent";
import type { Regel } from "../lib/chat";
import { Werkbestand, type ProjectBericht } from "../lib/project";

vi.mock("../lib/chat", () => ({ versturen: vi.fn().mockResolvedValue({ id: 11 }), projectRegelsVers: vi.fn() }));
const sessie = vi.hoisted(() => ({ naam: "Alice", token: "test-only" }));
vi.mock("../api", async origineel => ({ ...await origineel<object>(), huidigeSessie: () => sessie }));
vi.mock("../lib/assistent", () => ({ projectHulp: vi.fn().mockResolvedValue("Een voorstel") }));
const leden = [{ id: 1, naam: "Alice", status: "lid", gelezen_tot: 0, ontvangen_tot: 0 }, { id: 2, naam: "Bob", status: "lid", gelezen_tot: 0, ontvangen_tot: 0 }];
const basis = () => ({ gesprek: 72, ik: 1, leden, regels: [] as Regel[], bestanden: new Map(), schrijven: true, aiMogelijk: true, vernieuw: vi.fn().mockResolvedValue(undefined), bronOpenen: vi.fn() });
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });
function kiesDeel(naam:string){
 const label=naam==="Voorstel"?"Toevoegen":naam==="Bord"?"Stappen":naam;
 if(!screen.queryByRole("button",{name:label}))fireEvent.click(screen.getByRole("button",{name:"Meer projectmogelijkheden"}));
 fireEvent.click(screen.getByRole("button",{name:label}));
}


it("deelt kennis pas na een controleerbaar voorstel en bevestiging", async () => {
  render(<ProjectRegie {...basis()} />);
  kiesDeel("Voorstel");
  fireEvent.change(screen.getByLabelText("Projecttekst"), { target: { value: "We werken met kleine stappen." } });
  fireEvent.click(screen.getByRole("button", { name: "Maak controleerbaar projectvoorstel" }));
  expect(versturen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Bevestig en deel met project" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Bevestigd gedeeld"));
  expect(versturen).toHaveBeenCalledWith(72, expect.objectContaining({ soort: "kennis", bron: { soort: "eigen" } }));
});

it("houdt dezelfde project-ID vast na een verloren antwoord", async () => {
  vi.mocked(versturen).mockRejectedValueOnce(new Error("Verloren antwoord")).mockResolvedValueOnce({ id: 11 });
  render(<ProjectRegie {...basis()} />);
  kiesDeel("Voorstel");
  fireEvent.change(screen.getByLabelText("Projecttekst"), { target: { value: "Een besluit" } });
  fireEvent.click(screen.getByRole("button", { name: "Maak controleerbaar projectvoorstel" }));
  fireEvent.click(screen.getByRole("button", { name: "Bevestig en deel met project" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("niet bevestigd"));
  fireEvent.click(screen.getByRole("button", { name: "Dezelfde projectopdracht opnieuw proberen" }));
  await waitFor(() => expect(versturen).toHaveBeenCalledTimes(2));
  expect(vi.mocked(versturen).mock.calls[0][1]).toEqual(vi.mocked(versturen).mock.calls[1][1]);
});

it("maakt van een chatbron een voorstel en weigert een inmiddels verdwenen bron", async () => {
  render(<ProjectRegie {...basis()} bronVoorstel={{ soort: "bericht", id: 7 }} />);
  fireEvent.change(screen.getByLabelText("Projecttekst"), { target: { value: "Besluit uit verdwenen bericht" } });
  fireEvent.click(screen.getByRole("button", { name: "Maak controleerbaar projectvoorstel" }));
  fireEvent.click(screen.getByRole("button", { name: "Bevestig en deel met project" }));
  expect(screen.getByRole("alert").textContent).toContain("bron is gewijzigd of ontbreekt");
  expect(versturen).not.toHaveBeenCalled();
});

it("oefent met taakverdeling zonder netwerk- of opslaghandeling", () => {
  const p = basis(); p.regels = [{ id: 5, afzender: 1, tijd: new Date().toISOString(), weg: false, bericht: nieuwFeit("actie", "Maak ontwerp", { soort: "eigen" }, { minuten: 30 }) }];
  render(<ProjectRegie {...p} />);
  kiesDeel("Oefenen");
  fireEvent.click(screen.getByRole("button", { name: "Verken taakverdeling" }));
  expect(screen.getByText(/Maak ontwerp · 30 min/)).toBeTruthy(); expect(versturen).not.toHaveBeenCalled();
});

it("blokkeert AI zonder de benodigde toestemming", () => {
  render(<ProjectRegie {...basis()} staat={{ gebruiker: { id: 1, naam: "Alice" }, data: { taken: [], afspraken: [], volgend_id: 1 } }} />);
  kiesDeel("Assistent");
  fireEvent.click(screen.getByLabelText("Bevestigde projectkennis meenemen"));
  fireEvent.click(screen.getByRole("button", { name: "Maak gecontroleerd AI-voorbeeld" }));
  expect(screen.getByRole("alert").textContent).toContain("toestemming"); expect(versturen).not.toHaveBeenCalled();
});

it("markeert wijzigingen pas na een expliciete bezoekmarkering", () => {
  const p = basis(); p.regels = [{ id: 9, afzender: 1, tijd: new Date().toISOString(), weg: false, bericht: nieuwFeit("kennis", "Doel") }];
  render(<ProjectRegie {...p} />);
  kiesDeel("Wijzigingen (1)");
  fireEvent.click(screen.getByRole("button", { name: "Markeer bijgewerkt tot hier" }));
  expect(screen.getByText("Geopend: Wijzigingen (0)")).toBeTruthy(); expect(versturen).not.toHaveBeenCalled();
});

it("controleert intrekken opnieuw vlak voor een AI-aanvraag", async () => {
  const p = basis();
  const row = (bericht: Regel["bericht"], id: number, afzender = 1): Regel => ({ id, afzender, tijd: new Date().toISOString(), weg: false, bericht });
  p.regels = [row(nieuwFeit("kennis", "Doel"), 10), ...[1, 2].map(id => row(nieuwFeit("toestemming", "Akkoord", { soort: "eigen" }, { doel: PROJECT_SCOPE, keuze: "tekst", leden: [1, 2] }), 20 + id, id))];
  vi.mocked(projectRegelsVers).mockResolvedValue({ regels: [...p.regels, row(nieuwFeit("toestemming", "Ingetrokken", { soort: "eigen" }, { doel: PROJECT_SCOPE, keuze: "geen", leden: [1, 2] }), 30, 2)],
    gesprek: { id: 72, soort: "groep", leden, status: "lid", ongelezen: 0 } });
  render(<ProjectRegie {...p} staat={{ gebruiker: { id: 1, naam: "Alice" }, data: { taken: [], afspraken: [], volgend_id: 1 } }} />);
  kiesDeel("Assistent");
  fireEvent.click(screen.getByLabelText("Bevestigde projectkennis meenemen"));
  fireEvent.click(screen.getByRole("button", { name: "Maak gecontroleerd AI-voorbeeld" }));
  fireEvent.click(screen.getByLabelText("Dit voorbeeld mag één keer naar de AI-provider"));
  fireEvent.click(screen.getByRole("button", { name: "Vraag alleen projectadvies" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("toestemming"));
  expect(projectHulp).not.toHaveBeenCalled();
});

it("geeft de gekozen werkstand daadwerkelijk een andere volgorde en bewaart die per apparaat", () => {
  const p = basis(); p.regels = ["kennis", "vraag", "besluit"].map((s, i) => ({ id: i + 1, afzender: 1, tijd: new Date().toISOString(), weg: false,
    bericht: nieuwFeit(s as "kennis" | "vraag" | "besluit", "Onderwerp " + s) }));
  render(<ProjectRegie {...p} />);
  fireEvent.click(screen.getByRole("button",{name:"Notities, besluiten en acties (3)"}));
  expect(screen.getAllByRole("article")[0].textContent).toContain("Onderwerp vraag");
  fireEvent.change(screen.getByLabelText("Mijn werkstand"), { target: { value: "Ondernemen" } });
  expect(screen.getAllByRole("article")[0].textContent).toContain("Onderwerp besluit");
  fireEvent.change(screen.getByLabelText("Mijn werkstand"), { target: { value: "Vandaag" } });
  expect(screen.queryAllByRole("article")).toHaveLength(0);
  expect(localStorage.getItem("assistent.projectwerkstand.Alice.72")).toBe("Vandaag");
});

it("neemt ook echte bestandsberichten op in de wijzigingen sinds een bezoek", async () => {
  const b = new Werkbestand("00000000-0000-4000-8000-000000000001", "ontwerp.md"); b.maakLeeg();
  let bericht!: ProjectBericht; await b.verstuur(async x => { bericht = x; });
  const p = basis(); p.bestanden.set(b.id, b); p.regels = [{ id: 12, afzender: 2, tijd: new Date().toISOString(), weg: false, bericht }];
  const openen = vi.fn(); render(<ProjectRegie {...p} bestandOpenen={openen} />);
  kiesDeel("Wijzigingen (1)");
  expect(screen.getByText("Bestandsbericht: ontwerp.md")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open dit bestand" })); expect(openen).toHaveBeenCalledWith(b.id);
  b.doc.destroy();
});
it("pauzeert project-AI zonder toestemming te omzeilen en bewaart de pauze bij heropenen",()=>{
 const p=basis();p.gesprek=8923;const r=render(<ProjectRegie {...p}/>);
 fireEvent.click(screen.getByText("Project-AI pauzeren"));kiesDeel("Assistent");
 expect((screen.getByText("Maak gecontroleerd AI-voorbeeld") as HTMLButtonElement).disabled).toBe(true);
 expect(projectHulp).not.toHaveBeenCalled();r.unmount();render(<ProjectRegie {...p}/>);expect(screen.getByText("Project-AI hervatten")).toBeTruthy();
 fireEvent.click(screen.getByText("Project-AI hervatten"));
});
it("trekt eerdere toestemming eerst in voor compatibele oude clients bij een korte nieuwe toestemming",async()=>{
 render(<ProjectRegie {...basis()}/>);kiesDeel("Privacy");fireEvent.click(screen.getByText("Tekst toestaan"));
 expect(versturen).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Bevestig en deel met project"));await waitFor(()=>expect(versturen).toHaveBeenCalledTimes(2));
 const berichten=vi.mocked(versturen).mock.calls.map(c=>c[1]);expect(berichten[0]).toMatchObject({soort:"toestemming",keuze:"geen"});expect(berichten[0]).not.toHaveProperty("geldigMinuten");expect(berichten[1]).toMatchObject({keuze:"tekst",geldigMinuten:60});
});
it("weigert een bordstatus als de aanpak tussen preview en delen is vervangen",async()=>{
 const p=basis(),root=nieuwFeit("actie","Ontwerp maken"),stap={id:crypto.randomUUID(),titel:"Ontwerpen",klaarAls:"Goedgekeurd",minuten:30,eigenaar:1,alternatief:"Samen",afhankelijkVan:[]};
 const plan=nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:root.sleutel,stappen:[stap]});
 const row=(bericht:Regel["bericht"],id:number):Regel=>({id,bericht,afzender:1,tijd:new Date().toISOString(),weg:false});p.regels=[row(root,1),row(plan,2)];
 const nieuw=nieuwFeit("aanpak","Vervangen route",{soort:"eigen"},{doel:root.sleutel,vervangt:plan.sleutel,stappen:[stap]});
 vi.mocked(projectRegelsVers).mockResolvedValue({regels:[...p.regels,row(nieuw,3)],gesprek:{id:72,soort:"groep",leden,status:"lid",ongelezen:0}});
 render(<ProjectRegie {...p}/>);kiesDeel("Bord");fireEvent.change(screen.getByLabelText("Aanpak op het bord"),{target:{value:plan.sleutel}});fireEvent.click(screen.getByText("Naar bezig voorbereiden"));expect(versturen).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Bevestig en deel met project"));await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("vervangen"));expect(versturen).not.toHaveBeenCalled();
});
it("biedt een rustige start en geeft een te bevestigen voorstel direct focus",()=>{
 render(<ProjectRegie {...basis()}/>);expect(screen.queryByRole("button",{name:"Werkdruk"})).toBeNull();expect(screen.queryByRole("article")).toBeNull();fireEvent.click(screen.getByText("Begin met een doel"));expect((screen.getByLabelText("Soort voorstel") as HTMLSelectElement).value).toBe("actie");fireEvent.change(screen.getByLabelText("Projecttekst"),{target:{value:"Een rustig project starten"}});fireEvent.click(screen.getByText("Maak controleerbaar projectvoorstel"));expect(document.activeElement).toBe(screen.getByRole("region",{name:"Projectvoorstel controleren"}));expect(versturen).not.toHaveBeenCalled();
});
