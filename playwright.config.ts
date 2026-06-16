import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3010);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  outputDir: "output/playwright",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    env: {
      AUTH_DEBUG_BYPASS: "true",
      AUTH_DEBUG_EMAIL: "debug.alignerr@alignerr.com",
      AUTH_DEBUG_NAME: "Debug User",
      AUTH0_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      AUTH0_DOMAIN: "example.us.auth0.com",
      AUTH0_CLIENT_ID: "debug-client-id",
      AUTH0_CLIENT_SECRET: "debug-client-secret",
      NEXT_PUBLIC_SUPABASE_URL: "https://debug.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "debug-service-role-key"
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL
  }
});
