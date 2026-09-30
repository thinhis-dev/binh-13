import { expect, test } from '../fixtures/players'
import { playFullRound } from '../helpers/arrange'
import {
  acceptRematchButton,
  boardCards,
  declineRematchButton,
  rematchButton,
  rematchCancelledNotice,
  rematchOpponentBanner,
  rematchWaitingIndicator,
  roundResult,
  skipRevealButton,
} from '../helpers/selectors'

test.describe('result & rematch', () => {
  test('reveals the rows one by one; Skip shows three group rows and the verdict (win/loss not asserted)', async ({ p1, p2 }) => {
    await playFullRound(p1, p2)

    for (const page of [p1, p2]) {
      await expect(roundResult(page)).toBeVisible()
      // An instant-win deal (rare) shows everything at once, without a Skip button.
      if (await skipRevealButton(page).count() > 0) {
        await expect(roundResult(page)).not.toContainText(/You Win|You Lose|Draw!/)
        await skipRevealButton(page).click()
      }
      await expect(roundResult(page)).toContainText(/You Win|You Lose|Draw!/)
      const groupMarkers = page.locator('[aria-label="Won"], [aria-label="Lost"], [aria-label="Draw"]')
      await expect(groupMarkers).toHaveCount(3)
    }
  })

  test('rematch — request, accept, both land back in a fresh game', async ({ p1, p2 }) => {
    const code = await playFullRound(p1, p2)

    await rematchButton(p1).click()
    await expect(rematchWaitingIndicator(p1)).toBeVisible()
    await expect(rematchOpponentBanner(p2)).toBeVisible()

    await acceptRematchButton(p2).click()

    await expect(p1).toHaveURL(new RegExp(`/room/${code}/game$`))
    await expect(p2).toHaveURL(new RegExp(`/room/${code}/game$`))
    await expect(boardCards(p1)).toHaveCount(13)
    await expect(boardCards(p2)).toHaveCount(13)
  })

  test('rematch — decline shows the requester a cancelled notice', async ({ p1, p2 }) => {
    await playFullRound(p1, p2)

    await rematchButton(p1).click()
    await expect(rematchOpponentBanner(p2)).toBeVisible()
    await declineRematchButton(p2).click()

    await expect(rematchCancelledNotice(p1)).toContainText('Opponent declined rematch')
  })

  test('leaving from result cancels a pending rematch for the other player', async ({ p1, p2 }) => {
    await playFullRound(p1, p2)

    // handleRematchOnPlayerExit only emits a cancellation if a rematch request was in
    // flight — request one first so there's something for p2 leaving to actually cancel.
    await rematchButton(p1).click()
    await expect(rematchOpponentBanner(p2)).toBeVisible()

    await p2.getByRole('button', { name: 'Leave' }).click()

    await expect(p2).toHaveURL('/')
    await expect(rematchCancelledNotice(p1)).toContainText('Opponent left the room')
  })
})
