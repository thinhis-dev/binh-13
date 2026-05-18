import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameBoard } from '@/components/game/GameBoard'
import { RANK_LABEL, RANK_VALUE, SUIT_LABEL } from '@/lib/cards'
import { MOCK_HAND } from '@/lib/mockCards'
import { socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

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

describe('gameBoard', () => {
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

  it('sorts the hand when the Sort button is clicked', async () => {
    const user = userEvent.setup()
    render(<GameBoard initialCards={MOCK_HAND} />)

    await user.click(screen.getByRole('button', { name: /sort/i }))

    // After sorting, cards in the HandArea must appear in descending rank/suit order.
    // Query all card buttons by their aria-labels and verify order.
    const cards = screen
      .getAllByTestId('playing-card')
      .map(el => el.getAttribute('aria-label') ?? '')

    // Verify the first rendered card is the highest (AS) and last is the lowest
    expect(cards[0]).toMatch(/a of spades/i)
    expect(cards[cards.length - 1]).toMatch(/2 of spades/i)
  })

  it('sort button is wired: hand cards are sorted by rank desc after click', async () => {
    const user = userEvent.setup()
    render(<GameBoard initialCards={MOCK_HAND} />)

    await user.click(screen.getByRole('button', { name: /sort/i }))

    // Collect the rendered card buttons from the hand area only
    const handArea = screen.getByTestId('hand-area')
    const cardButtons = Array.from(
      handArea.querySelectorAll('[data-testid="playing-card"]'),
    )

    // Extract rank from aria-label ("A of Spades" → rank index from RANK_VALUE)
    const rankPattern = /^(\S+) of/i
    const renderedRanks = cardButtons.map((btn) => {
      const label = btn.getAttribute('aria-label') ?? ''
      const match = rankPattern.exec(label)
      const rankLabel = match?.[1] ?? ''
      // Map display rank back to internal rank key
      const rankEntry = Object.entries(RANK_LABEL).find(
        ([, v]) => v.toLowerCase() === rankLabel.toLowerCase(),
      )
      return rankEntry
        ? RANK_VALUE[rankEntry[0] as keyof typeof RANK_VALUE]
        : -1
    })

    for (let i = 1; i < renderedRanks.length; i++) {
      expect(renderedRanks[i]).toBeLessThanOrEqual(renderedRanks[i - 1])
    }
  })
})
