import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_DAN_API_URL: process.env.NEXT_PUBLIC_DAN_API_URL ?? "http://127.0.0.1:2284" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
