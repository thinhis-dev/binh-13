import { test as base, expect } from '@playwright/test'
import { test } from '../fixtures/players'
import { uniqueName } from '../helpers/names'
import { createRoom, disableAutoStart, joinRoom, leaveRoom, startGameForBoth } from '../helpers/room'
import { errorBanner, handCards } from '../helpers/selectors'
import { createGuestSession } from '../helpers/session'

test.describe('rooms', () => {
  test('create room', async ({ p1 }) => {
    const code = await createRoom(p1)

    expect(code).toMatch(/^[A-Z0-9]{6}$/)
    await expect(p1.getByTestId('room-code')).toHaveText(code)
    await expect(p1.getByText('Waiting...')).toBeVisible()
  })

  test('join room shows both players', async ({ p1, p2 }) => {
    // Auto-start would deal instantly once p2 joins — disable it so the lobby state is observable.
    const code = await createRoom(p1)
    await disableAutoStart(p1)
    await joinRoom(p2, code)

    await expect(p1.getByText('Waiting...')).not.toBeVisible()
    await expect(p2.getByText('Waiting...')).not.toBeVisible()
  })

  test('leave room', async ({ p1, p2 }) => {
    const code = await createRoom(p1)
    await disableAutoStart(p1)
    await joinRoom(p2, code)

    await leaveRoom(p2)

    // Leaving marks the seat disconnected rather than freeing it (reconnect support) —
    // the seat still shows the player's name, now with a "Disconnected" status.
    await expect(p1.getByText('Disconnected')).toBeVisible()
    await expect(p1).toHaveURL(new RegExp(`/room/${code}$`))
  })

  test('auto-start deals both players in', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    await expect(handCards(p1)).toHaveCount(13)
    await expect(handCards(p2)).toHaveCount(13)
  })

  test('manual start requires the owner to click Start Game', async ({ p1, p2 }) => {
    const code = await createRoom(p1)
    await disableAutoStart(p1)
    await joinRoom(p2, code)

    await expect(p2.getByText('Waiting for the room owner to start the game')).toBeVisible()
    await expect(p1.getByRole('button', { name: 'Start Game' })).toBeVisible()

    await p1.getByRole('button', { name: 'Start Game' }).click()

    await expect(p1).toHaveURL(new RegExp(`/room/${code}/game$`))
    await expect(p2).toHaveURL(new RegExp(`/room/${code}/game$`))
  })
})

base.describe('rooms — invalid code', () => {
  base('joining a nonexistent code shows an error and does not navigate', async ({ page }, testInfo) => {
    await createGuestSession(page, uniqueName('Bad', testInfo))

    await page.getByRole('button', { name: 'Join Room' }).click()
    await page.locator('#room-code').fill('ZZZZZZ')
    await page.getByRole('button', { name: 'Join', exact: true }).click()

    await expect(errorBanner(page)).toContainText('Room not found')
    await expect(page).toHaveURL('/')
  })
})
