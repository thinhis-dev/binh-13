import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameBoard } from '@/components/game/GameBoard'
import { MOCK_HAND } from '@/lib/mockCards'
import { RANK_LABEL, SUIT_LABEL } from '@/lib/cards'

function cardName(card: (typeof MOCK_HAND)[number]) {
  return `${RANK_LABEL[card.rank]} of ${SUIT_LABEL[card.suit]}`
}

async function assignCardToGroup(user: ReturnType<typeof userEvent.setup>, cardIndex: number, label: string) {
  await user.click(screen.getByRole('button', { name: cardName(MOCK_HAND[cardIndex]) }))
  await user.click(screen.getAllByLabelText(`Empty ${label} slot`)[0])
}

describe('GameBoard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps submit disabled until all groups are full', async () => {
    const user = userEvent.setup()
    render(<GameBoard initialCards={MOCK_HAND} />)

    const submit = screen.getByRole('button', { name: /submit arrangement/i })
    expect(submit).toBeDisabled()

    for (let index = 0; index < 5; index += 1) {
      await assignCardToGroup(user, index, 'Back (5)')
    }
    for (let index = 5; index < 10; index += 1) {
      await assignCardToGroup(user, index, 'Middle (5)')
    }
    for (let index = 10; index < 13; index += 1) {
      await assignCardToGroup(user, index, 'Front (3)')
    }

    expect(submit).toBeEnabled()
  })

  it('logs the full arrangement on submit', async () => {
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    render(<GameBoard initialCards={MOCK_HAND} />)

    for (let index = 0; index < 5; index += 1) {
      await assignCardToGroup(user, index, 'Back (5)')
    }
    for (let index = 5; index < 10; index += 1) {
      await assignCardToGroup(user, index, 'Middle (5)')
    }
    for (let index = 10; index < 13; index += 1) {
      await assignCardToGroup(user, index, 'Front (3)')
    }

    await user.click(screen.getByRole('button', { name: /submit arrangement/i }))

    expect(consoleSpy).toHaveBeenCalledWith({
      group1: MOCK_HAND.slice(0, 5),
      group2: MOCK_HAND.slice(5, 10),
      group3: MOCK_HAND.slice(10, 13),
    })
  })
})
