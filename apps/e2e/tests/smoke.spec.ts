import { expect, test } from '@playwright/test'

test('web app loads and server is reachable', async ({ page, request }) => {
  const health = await request.get('http://localhost:8080/health')
  expect(health.ok()).toBe(true)

  await page.goto('/')
  await expect(page.locator('#player-name')).toBeVisible()
})
