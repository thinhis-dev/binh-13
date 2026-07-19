import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { errorBanner } from './selectors'

export async function createGuestSession(page: Page, name: string) {
  await page.goto('/')
  await page.locator('#player-name').fill(name)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText(`Welcome back, ${name}`)).toBeVisible()
}

/** "Change" only exists on Home — navigate there first regardless of current page. */
export async function clearSession(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Change' }).click()
  await expect(page.locator('#player-name')).toBeVisible()
}

export async function registerAccount(page: Page, username: string, password: string) {
  await page.goto('/profile')
  await page.locator('#register-username').fill(username)
  await page.locator('#register-password').fill(password)
  await page.getByRole('button', { name: 'Claim account' }).click()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()
}

/** Opens the Home page's Sign in form and submits credentials — only visible while logged out. */
export async function loginAsRegistered(page: Page, username: string, password: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.locator('#login-username').fill(username)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

export async function expectLoginError(page: Page, message: string) {
  await expect(errorBanner(page)).toContainText(message)
  await expect(page.locator('#player-name')).toBeVisible()
}
