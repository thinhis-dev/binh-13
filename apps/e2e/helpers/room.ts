import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { roomCode } from './selectors'

export async function createRoom(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Create Room' }).click()
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/)
  const code = await roomCode(page).textContent()
  if (!code)
    throw new Error('createRoom: room-code element has no text')
  return code
}

/**
 * With the default autoStart:true settings, dealing fires the instant the 2nd player joins,
 * so the URL may already have moved on to `/room/{code}/game` by the time we can observe it —
 * only assert we landed *in the room*, not that we're still specifically on the lobby.
 */
export async function joinRoom(page: Page, code: string) {
  await page.getByRole('button', { name: 'Join Room' }).click()
  await page.locator('#room-code').fill(code)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/room/${code}(/game)?$`))
}

export async function leaveRoom(page: Page) {
  await page.getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL('/')
}

/** Owner-only: opens Room Settings and flips Auto-start off, so joining the 2nd player does not race into dealing. */
export async function disableAutoStart(ownerPage: Page) {
  await ownerPage.getByRole('button', { name: 'Settings' }).click()
  await ownerPage.getByRole('switch', { name: 'Auto-start' }).click()
  await ownerPage.getByRole('button', { name: 'Close' }).click()
}

/** p1 creates, p2 joins. Returns the room code. Does not wait for dealing. */
export async function setupRoom(p1: Page, p2: Page): Promise<string> {
  const code = await createRoom(p1)
  await joinRoom(p2, code)
  return code
}

/** Full room setup + wait for both to auto-navigate to the game page (default autoStart: true). */
export async function startGameForBoth(p1: Page, p2: Page): Promise<string> {
  const code = await setupRoom(p1, p2)
  await expect(p1).toHaveURL(new RegExp(`/room/${code}/game$`))
  await expect(p2).toHaveURL(new RegExp(`/room/${code}/game$`))
  return code
}
