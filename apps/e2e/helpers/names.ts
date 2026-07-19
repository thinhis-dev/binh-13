import type { TestInfo } from '@playwright/test'

/**
 * DB wipes on every server start but is shared across a whole test run, so
 * every guest name / username must be unique per test to avoid collisions.
 * The `#player-name` input has `maxLength={20}` — keep well under that or the
 * browser silently truncates the value and later "Welcome back, X" assertions
 * won't match what was actually typed.
 */
export function uniqueName(prefix: string, testInfo: TestInfo): string {
  const suffix = `${testInfo.workerIndex}${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
  return `${prefix}${suffix}`.slice(0, 20)
}

/**
 * Registered usernames are constrained server-side to `^[a-z0-9_]{3,20}$`
 * (lowercase letters, digits, underscore only) — no hyphens like uniqueName.
 */
export function uniqueUsername(prefix: string, testInfo: TestInfo): string {
  const raw = `${prefix}${testInfo.workerIndex}_${Date.now() % 1_000_000}${Math.floor(Math.random() * 100)}`
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
}
