import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import { uniqueName } from '../helpers/names'
import { createGuestSession } from '../helpers/session'

interface PlayerFixtures {
  p1: Page
  p2: Page
}

/**
 * Two isolated browser contexts (not tabs) — the guest/auth session persists in zustand
 * under localStorage key `binh13-session`, and two tabs in one context would share it.
 */
export const test = base.extend<PlayerFixtures>({
  p1: async ({ browser }, use, testInfo) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await createGuestSession(page, uniqueName('P1', testInfo))
    await use(page)
    await context.close()
  },
  p2: async ({ browser }, use, testInfo) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await createGuestSession(page, uniqueName('P2', testInfo))
    await use(page)
    await context.close()
  },
})

export { expect } from '@playwright/test'
