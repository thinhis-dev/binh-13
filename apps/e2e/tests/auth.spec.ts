import { expect, test } from '@playwright/test'
import { uniqueName, uniqueUsername } from '../helpers/names'
import { errorBanner } from '../helpers/selectors'
import {
  clearSession,
  createGuestSession,
  expectLoginError,
  loginAsRegistered,
  registerAccount,
} from '../helpers/session'

const TEST_PASSWORD = 'e2e-test-pass-1'

test.describe('claimable accounts', () => {
  test('register on Profile', async ({ page }, testInfo) => {
    await createGuestSession(page, uniqueName('Reg', testInfo))
    const username = uniqueUsername('reguser', testInfo)

    await registerAccount(page, username, TEST_PASSWORD)
  })

  test('login from a fresh context replaces the identity', async ({ page, browser }, testInfo) => {
    const username = uniqueUsername('login', testInfo)
    await createGuestSession(page, uniqueName('Login', testInfo))
    await registerAccount(page, username, TEST_PASSWORD)

    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()
    await loginAsRegistered(freshPage, username, TEST_PASSWORD)
    await expect(freshPage.getByText(`Welcome back,`)).toBeVisible()
    await freshContext.close()
  })

  test('wrong password is rejected', async ({ page }, testInfo) => {
    const username = uniqueUsername('wrongpw', testInfo)
    await createGuestSession(page, uniqueName('Wrong', testInfo))
    await registerAccount(page, username, TEST_PASSWORD)
    await clearSession(page)

    await loginAsRegistered(page, username, 'not-the-password')

    await expectLoginError(page, 'Invalid username or password')
  })

  test('duplicate username is rejected', async ({ page, browser }, testInfo) => {
    const username = uniqueUsername('dup', testInfo)
    await createGuestSession(page, uniqueName('DupA', testInfo))
    await registerAccount(page, username, TEST_PASSWORD)

    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    await createGuestSession(otherPage, uniqueName('DupB', testInfo))
    await otherPage.goto('/profile')
    await otherPage.locator('#register-username').fill(username)
    await otherPage.locator('#register-password').fill(TEST_PASSWORD)
    await otherPage.getByRole('button', { name: 'Claim account' }).click()

    await expect(errorBanner(otherPage)).toContainText('Username is already taken')
    await otherContext.close()
  })

  // Home's "Sign in" form only renders while logged out, so a guest session must be cleared
  // before login is reachable through the UI — this can't exercise replaceSession's
  // room-clearing path with a *still-active* guest session, only the clear-then-login path.
  test('login after clearing a guest session shows the registered identity', async ({ page }, testInfo) => {
    const guestName = uniqueName('GuestA', testInfo)
    const username = uniqueUsername('replace', testInfo)

    // Register B's credentials from a throwaway session first.
    await createGuestSession(page, uniqueName('SetupB', testInfo))
    await registerAccount(page, username, TEST_PASSWORD)
    await clearSession(page)

    // Now start as guest A, then sign in as B — login should replace the identity.
    await createGuestSession(page, guestName)
    await clearSession(page)
    await loginAsRegistered(page, username, TEST_PASSWORD)

    await expect(page.getByText(`Welcome back,`)).toBeVisible()
    await expect(page.getByText(guestName, { exact: true })).not.toBeVisible()
  })
})
