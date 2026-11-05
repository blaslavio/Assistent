// Samenhang: een gebruiker beweegt tussen Mijn dag, Chat, Handel, Werkruimte en de assistent zonder iets kwijt te raken.
import { expect, test, type Page } from "@playwright/test";
import { nepserver } from "./nepserver";

// Zoals op een telefoon: eerst het toetsenbord weg (de menubalk verbergt zich tijdens typen), dan onderin tikken.
// Het blok Taken is dicht zolang er nog geen taken zijn; open het als dat zo is.
const takenOpen = async (page: Page) => {
  const veld = page.getByPlaceholder("Nieuwe taak");
  if (!(await veld.isVisible())) await page.getByText(/^Taken ·/).click();
  return veld;
};

const dock = async (page: Page, naam: string) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole("navigation", { name: "Hoofdmenu" }).getByRole("button", { name: new RegExp(`^${naam}`) }).click();
};

test("een nieuwe taak blijft staan na wisselen van scherm en na opnieuw openen", async ({ page }) => {
  const nep = await nepserver(page);
  await page.goto("/");
  await (await takenOpen(page)).fill("Offerte sturen");
  await page.getByRole("button", { name: "Taak voorbereiden" }).click();
  await page.getByRole("button", { name: "Bevestigen" }).click();
  await expect(page.getByRole("checkbox", { name: "Offerte sturen" })).toBeVisible();
  await expect.poll(() => (nep.data.taken as { titel: string }[]).map((t) => t.titel)).toContain("Offerte sturen");
  await dock(page, "Chat");
  await dock(page, "Werkruimte");
  await dock(page, "Mijn dag");
  await expect(page.getByRole("checkbox", { name: "Offerte sturen" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Offerte sturen" })).toBeVisible();
});

test("de agenda van vandaag staat op Mijn dag en in de agenda", async ({ page }) => {
  await nepserver(page);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Agenda vandaag" }).getByText("Lunch met Mo")).toBeVisible();
  await page.getByRole("navigation", { name: "Mijn dag bekijken" }).getByRole("button", { name: "Agenda" }).click();
  await expect(page.getByRole("button", { name: /^Lunch met Mo 12:00/ })).toBeVisible();
});

test("wat je typt blijft staan als je even naar een ander scherm gaat", async ({ page }) => {
  await nepserver(page);
  await page.goto("/");
  await (await takenOpen(page)).fill("Half getypt");
  await dock(page, "Chat");
  await page.getByRole("searchbox", { name: "Zoek een gesprek" }).fill("Mo");
  await dock(page, "Werkruimte");
  await page.getByRole("searchbox", { name: "Zoek in werkruimte" }).fill("bud");
  await dock(page, "Mijn dag");
  await expect(page.getByPlaceholder("Nieuwe taak")).toHaveValue("Half getypt");
  await dock(page, "Chat");
  await expect(page.getByRole("searchbox", { name: "Zoek een gesprek" })).toHaveValue("Mo");
  await dock(page, "Werkruimte");
  await expect(page.getByRole("searchbox", { name: "Zoek in werkruimte" })).toHaveValue("bud");
});

test("iets kopen in Handel gaat naar de assistent met het juiste product, en terug kan gewoon", async ({ page }) => {
  await nepserver(page);
  await page.goto("/");
  await dock(page, "Chat");
  await page.getByRole("button", { name: "Handel", exact: true }).click();
  await page.getByRole("button", { name: "Tweedehands", exact: true }).click();
  await page.getByRole("list", { name: "Te koop" }).getByRole("button", { name: /Wollen winterjas/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kopen" }).click();
  await expect(page.getByText("Ik wil Wollen winterjas kopen.").first()).toBeVisible();
});

test("elke soort in Handel heeft een eigen scherm", async ({ page }) => {
  await nepserver(page);
  await page.goto("/");
  await dock(page, "Chat");
  await page.getByRole("button", { name: "Handel", exact: true }).click();
  await page.getByRole("button", { name: "Diensten", exact: true }).click();
  await expect(page.getByRole("list", { name: "Diensten" }).getByText("Bijles wiskunde")).toBeVisible();
  await page.getByRole("button", { name: "Eten", exact: true }).click();
  await expect(page.getByRole("list", { name: "Eetzaken" }).getByText("Pizzeria Roma")).toBeVisible();
});

test("zoeken bovenin kan je vraag meteen aan de assistent geven", async ({ page }) => {
  await nepserver(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Zoeken in de app" }).click();
  await page.getByPlaceholder("Zoek in de app of vraag iets").fill("Wat staat er vandaag");
  await page.getByRole("button", { name: /Vraag de assistent/ }).click();
  await expect(page.getByText("Wat staat er vandaag").first()).toBeVisible();
});

test("een app in Werkruimte openen en terug naar het overzicht", async ({ page }) => {
  await nepserver(page);
  await page.goto("/");
  await dock(page, "Werkruimte");
  await page.getByRole("region", { name: "Privé" }).getByRole("button", { name: /^Notities/ }).click();
  await expect(page.getByRole("heading", { name: "Notities" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Werkruimte", exact: true }).click();
  await expect(page.getByRole("region", { name: "Privé" })).toBeVisible();
});

test("er komen geen schermfouten voor bij een rondje door de app", async ({ page }) => {
  const fouten: string[] = [];
  page.on("pageerror", (e) => fouten.push(e.message));
  await nepserver(page);
  await page.goto("/");
  for (const naam of ["Chat", "Werkruimte", "Mijn dag"]) await dock(page, naam);
  await page.getByRole("button", { name: "Profiel en instellingen" }).click();
  await expect(page.getByRole("heading", { name: "Instellingen" })).toBeVisible();
  expect(fouten).toEqual([]);
});

test("een afspraak uit de agenda staat meteen op Mijn dag en blijft bewaard", async ({ page }) => {
  const nep = await nepserver(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Mijn dag bekijken" }).getByRole("button", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Nieuwe afspraak" }).click();
  await page.getByLabel("Titel").fill("Tandarts");
  await page.getByRole("button", { name: "Hele dag" }).click();
  await page.getByRole("button", { name: "Opslaan" }).click();
  await expect.poll(() => (nep.data.afspraken as { titel: string }[]).map((a) => a.titel)).toContain("Tandarts");
  await page.getByRole("navigation", { name: "Mijn dag bekijken" }).getByRole("button", { name: "Vandaag" }).click();
  await expect(page.getByRole("region", { name: "Agenda vandaag" }).getByText("Tandarts")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Agenda vandaag" }).getByText("Tandarts")).toBeVisible();
});

test("terug van betalen opent meteen de bevestiging met winkel, producten en totaal", async ({ page }) => {
  await nepserver(page);
  await page.goto("/?betaald=42");
  const bon = page.getByRole("dialog", { name: /^Bestelling 000-042/ });
  await expect(bon).toBeVisible();
  await expect(bon.getByText("Bedankt voor je bestelling!")).toBeVisible();
  await expect(bon.getByText("Afhaaladres")).toBeVisible();
  await expect(bon.getByRole("list", { name: "Producten" })).toContainText("Pizza funghi");
  await expect(bon).toContainText("€ 22,00");
  await bon.getByRole("button", { name: "Sluiten" }).click();
  await expect(bon).toBeHidden();
  await page.getByRole("button", { name: "Bekijk bon" }).click();
  await expect(page.getByRole("dialog", { name: /^Bestelling/ })).toBeVisible();
});
