// Tests die als gebruiker door de hele app lopen, met een nepserver in plaats van Supabase (er gaat niets naar productie).
// Draaien: npm run e2e. Lokaal met een eigen Chromium: PW_CHROMIUM=/pad/naar/chromium npm run e2e
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 45_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5183/",
    viewport: { width: 390, height: 844 },
    locale: "nl-NL",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: { command: "npx vite --port 5183 --strictPort", url: "http://localhost:5183/", reuseExistingServer: true, timeout: 60_000 },
});
