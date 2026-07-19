import { expect, test } from '../fixtures/players'
import { assignArrangementByClick, computeValidArrangement, readHandCardIds, submitArrangement } from '../helpers/arrange'
import { startGameForBoth } from '../helpers/room'
import { surrenderDialog, surrenderTriggerButton } from '../helpers/selectors'

test.describe('surrender', () => {
  test('confirm dialog — Cancel keeps the round going', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    await surrenderTriggerButton(p1).click()
    await expect(surrenderDialog(p1)).toBeVisible()
    await expect(surrenderDialog(p1).getByText('Surrender?')).toBeVisible()

    await surrenderDialog(p1).getByRole('button', { name: 'Cancel' }).click()
    await expect(surrenderDialog(p1)).not.toBeVisible()
    await expect(p1).toHaveURL(/\/game$/)
  })

  test('confirming surrender ends the round for both players', async ({ p1, p2 }) => {
    const code = await startGameForBoth(p1, p2)

    await surrenderTriggerButton(p1).click()
    await surrenderDialog(p1).getByRole('button', { name: 'Surrender', exact: true }).click()

    await expect(p1).toHaveURL(new RegExp(`/room/${code}/result$`))
    await expect(p2).toHaveURL(new RegExp(`/room/${code}/result$`))
    await expect(p1.getByText('You Surrendered')).toBeVisible()
    await expect(p2.getByText('Opponent Surrendered', { exact: false })).toBeVisible()
  })

  test('surrender is disabled after submitting an arrangement', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const arrangement = computeValidArrangement(await readHandCardIds(p1))
    await assignArrangementByClick(p1, arrangement)
    await submitArrangement(p1)

    await expect(surrenderTriggerButton(p1)).toBeDisabled()
  })
})
