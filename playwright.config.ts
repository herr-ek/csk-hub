import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3107",
    trace: "off",
    ignoreHTTPSErrors: true,
    launchOptions: { args: ["--host-resolver-rules=MAP client.example.com 127.0.0.1"] }
  },
  webServer: {
    command: "bun run test/oidc-browser-server.ts",
    url: "http://localhost:3107/login",
    reuseExistingServer: false,
    timeout: 120_000
  }
})
