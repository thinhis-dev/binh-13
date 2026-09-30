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

/** Dealing waits for both players to mark themselves ready, so a join always lands on the lobby. */
export async function joinRoom(page: Page, code: string) {
  await page.getByRole('button', { name: 'Join Room' }).click()
  await page.locator('#room-code').fill(code)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`))
}

/** Marks this player ready in the lobby and waits until the server confirms it. */
export async function readyUp(page: Page) {
  await page.getByRole('button', { name: 'Ready', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel Ready' })).toBeVisible()
}

export async function leaveRoom(page: Page) {
  await page.getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL('/')
}

/** Owner-only: opens Room Settings and flips Auto-start off, so both players being ready does not race into dealing. */
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

/** Full room setup, both players ready, then wait for both to auto-navigate to the game page (default autoStart: true). */
export async function startGameForBoth(p1: Page, p2: Page): Promise<string> {
  const code = await setupRoom(p1, p2)
  await readyUp(p1)
  await readyUp(p2)
  await expect(p1).toHaveURL(new RegExp(`/room/${code}/game$`))
  await expect(p2).toHaveURL(new RegExp(`/room/${code}/game$`))
  return code
}
