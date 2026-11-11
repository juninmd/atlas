import { defineConfig } from '@playwright/test'
// Roda contra o build estatico (pnpm build:site antes). CHROMIUM_PATH aponta para um Chromium ja instalado.
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4188', headless: true, trace: 'retain-on-failure', launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
  webServer: { command: 'pnpm exec vite preview --port 4188 --strictPort', url: 'http://127.0.0.1:4188', reuseExistingServer: !process.env.CI },
})
