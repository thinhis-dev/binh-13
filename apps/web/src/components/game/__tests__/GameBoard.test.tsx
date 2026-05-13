import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameBoard } from '@/components/game/GameBoard'
import { MOCK_HAND } from '@/lib/mockCards'
import { RANK_LABEL, SUIT_LABEL } from '@/lib/cards'
import { socket } from '@/lib/socket'
import { useSessionStore } from '@/stores/sessionStore'
import { useGameStore } from '@/stores/gameStore'

function cardName(card: (typeof MOCK_HAND)[number]) {
  return `${RANK_LABEL[card.rank]} of ${SUIT_LABEL[card.suit]}`
}

async function assignCardToGroup(
  user: ReturnType<typeof userEvent.setup>,
  cardIndex: number,
  label: string,
) {
  await user.click(
    screen.getByRole('button', { name: cardName(MOCK_HAND[cardIndex]) }),
  )
  await user.click(screen.getAllByLabelText(`Empty ${label} slot`)[0])
}

describe('GameBoard', () => {
  beforeEach(() => {
    useSessionStore.getState().setSession(1, 'Alice')
    useSessionStore.getState().setRoom('ABCDEF')
    useGameStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useSessionStore.getState().clearSession()
    useGameStore.getState().reset()
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

  it('emits game:submit via socket on submit', async () => {
    const user = userEvent.setup()
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

    await user.click(
      screen.getByRole('button', { name: /submit arrangement/i }),
    )

    expect(socket.emit).toHaveBeenCalledWith('game:submit', {
      playerId: 1,
      code: 'ABCDEF',
      arrangement: {
        group1: MOCK_HAND.slice(0, 5),
        group2: MOCK_HAND.slice(5, 10),
        group3: MOCK_HAND.slice(10, 13),
      },
    })
  })
})
