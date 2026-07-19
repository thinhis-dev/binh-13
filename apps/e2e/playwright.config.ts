import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The server is a shared singleton (one SQLite DB, one Socket.io instance) but rooms are
  // isolated by code and player/usernames are unique per test, so parallel workers are safe.
  // better-sqlite3 is synchronous and blocks the server's single event loop per query, so
  // too many concurrent workers queue up DB/socket round-trips faster than assertions can
  // tolerate — cap workers and give assertions more headroom rather than uncapping locally.
  workers: process.env.CI ? 2 : 4,
  // Several specs run a full round (deal -> arrange -> submit -> GAME_RESULT) concurrently;
  // under 4 parallel workers that's up to 8 pages hitting the single synchronous-SQLite
  // server's event loop at once, and 10s occasionally wasn't enough headroom for the queue
  // to drain. Retries (CI only) are the safety net for the rare non-deterministic leftover.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @binh-13/server dev',
      url: 'http://localhost:8080/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @binh-13/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
