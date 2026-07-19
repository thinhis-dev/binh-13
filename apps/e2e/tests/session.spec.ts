import { expect, test } from '@playwright/test'
import { uniqueName } from '../helpers/names'
import { clearSession, createGuestSession } from '../helpers/session'

test.describe('guest session lifecycle', () => {
  test('create guest session', async ({ page }, testInfo) => {
    const name = uniqueName('Sess', testInfo)
    await createGuestSession(page, name)
    await expect(page.getByRole('button', { name: 'Create Room' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Join Room' })).toBeVisible()
  })

  test('session persists across reload', async ({ page }, testInfo) => {
    const name = uniqueName('Sess', testInfo)
    await createGuestSession(page, name)

    await page.reload()

    await expect(page.getByText(`Welcome back, ${name}`)).toBeVisible()
  })

  test('clear session via Change', async ({ page }, testInfo) => {
    const name = uniqueName('Sess', testInfo)
    await createGuestSession(page, name)

    await clearSession(page)

    await page.reload()
    await expect(page.locator('#player-name')).toBeVisible()
    await expect(page.getByText(`Welcome back, ${name}`)).not.toBeVisible()
  })

  test('empty name rejected — Start stays disabled', async ({ page }) => {
    await page.goto('/')
    const start = page.getByRole('button', { name: 'Start', exact: true })

    await expect(start).toBeDisabled()

    await page.locator('#player-name').fill('   ')
    await expect(start).toBeDisabled()
  })
})
