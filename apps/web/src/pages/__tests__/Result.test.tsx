import type { Card, PlayerArrangement, RoundResult } from '@binh-13/shared'
import { EVENTS } from '@binh-13/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'
import Result from '../Result'

// ─── Test data ───────────────────────────────────────────────────────────────

function makeCard(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit }
}

const dummyGroup1: PlayerArrangement['group1'] = [
  makeCard('A', 'S'),
  makeCard('K', 'S'),
  makeCard('Q', 'S'),
  makeCard('J', 'S'),
  makeCard('T', 'S'),
]
const dummyGroup2: PlayerArrangement['group2'] = [
  makeCard('9', 'H'),
  makeCard('8', 'H'),
  makeCard('7', 'H'),
  makeCard('6', 'H'),
  makeCard('5', 'H'),
]
const dummyGroup3: PlayerArrangement['group3'] = [
  makeCard('4', 'D'),
  makeCard('3', 'D'),
  makeCard('2', 'D'),
]

function makeResult(overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    group1: {
      result: 'p1',
      p1Hand: 'Royal Flush',
      p2Hand: 'Straight Flush',
      p1Foul: false,
      p2Foul: false,
    },
    group2: {
      result: 'p2',
      p1Hand: 'Straight',
      p2Hand: 'Flush',
      p1Foul: false,
      p2Foul: false,
    },
    group3: {
      result: 'p1',
      p1Hand: 'High Card',
      p2Hand: 'High Card',
      p1Foul: false,
      p2Foul: false,
    },
    winner: 'p1',
    p1Score: 2,
    p2Score: 1,
    p1Foul: false,
    p2Foul: false,
    arrangements: {
      p1: {
        playerId: 1,
        group1: dummyGroup1,
        group2: dummyGroup2,
        group3: dummyGroup3,
      },
      p2: {
        playerId: 2,
        group1: dummyGroup1,
        group2: dummyGroup2,
        group3: dummyGroup3,
      },
    },
    ...overrides,
  }
}

function renderResult(initialPath = '/room/ABCDEF/result') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/room/:code/result" element={<Result />} />
        <Route
          path="/room/:code"
          element={<div data-testid="lobby">Lobby</div>}
        />
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('result page', () => {
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

  it('shows "No result available" when store has no result', () => {
    renderResult()
    expect(screen.getByText('No result available.')).toBeInTheDocument()
  })

  it('shows "You Win!" when current player wins', () => {
    useGameStore.getState().setResult(makeResult({ winner: 'p1' }))
    renderResult()
    expect(screen.getByText(/You Win/)).toBeInTheDocument()
  })

  it('shows "You Lose" when current player loses', () => {
    useGameStore.getState().setResult(makeResult({ winner: 'p2' }))
    renderResult()
    expect(screen.getByText('You Lose')).toBeInTheDocument()
  })

  it('shows "Draw!" on a draw', () => {
    useGameStore.getState().setResult(makeResult({ winner: 'draw' }))
    renderResult()
    expect(screen.getByText('Draw!')).toBeInTheDocument()
  })

  it('shows foul message when current player fouls', () => {
    useGameStore
      .getState()
      .setResult(makeResult({ p1Foul: true, winner: 'p2' }))
    renderResult()
    expect(screen.getByText(/Your arrangement fouled/)).toBeInTheDocument()
  })

  it('shows opponent foul message when opponent fouls', () => {
    useGameStore
      .getState()
      .setResult(makeResult({ p2Foul: true, winner: 'p1' }))
    renderResult()
    expect(screen.getByText(/Opponent fouled/)).toBeInTheDocument()
  })

  it('shows correct scores for the current player', () => {
    useGameStore.getState().setResult(makeResult({ p1Score: 2, p2Score: 1 }))
    renderResult()

    const scores = screen.getAllByText(/^[0-3]$/)
    // "You" score = 2, "Opponent" score = 1
    expect(scores.map(el => el.textContent)).toContain('2')
    expect(scores.map(el => el.textContent)).toContain('1')
  })

  it('renders all three group breakdown rows', () => {
    useGameStore.getState().setResult(makeResult())
    renderResult()

    expect(screen.getByText('Back (5)')).toBeInTheDocument()
    expect(screen.getByText('Middle (5)')).toBeInTheDocument()
    expect(screen.getByText('Front (3)')).toBeInTheDocument()
  })

  it('shows hand descriptions in group breakdown', () => {
    useGameStore.getState().setResult(makeResult())
    renderResult()

    // p1 is "You" (playerId=1), p2 is "Opp"
    expect(screen.getByText('Royal Flush')).toBeInTheDocument()
    expect(screen.getByText('Straight Flush')).toBeInTheDocument()
  })

  it('shows ✓ for won groups and ✗ for lost groups', () => {
    useGameStore.getState().setResult(makeResult())
    renderResult()

    const icons = screen.getAllByText(/^[✓✗]$/)
    // group1=p1 win (✓), group2=p2 win (✗), group3=p1 win (✓)
    expect(icons.map(el => el.textContent)).toEqual(['✓', '✗', '✓'])
  })

  it('clicking Rematch emits GAME_REMATCH_REQUEST and shows waiting state', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Rematch' }))

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_REQUEST, {
      playerId: 1,
      code: 'ABCDEF',
    })
    expect(screen.getByRole('button', { name: 'Waiting for opponent' })).toBeInTheDocument()
  })

  it('clicking Rematch sets rematchRequested in store', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Rematch' }))

    expect(useGameStore.getState().rematchRequested).toBe(true)
  })

  it('navigates to home on Leave click', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('emits room:leave on Leave click', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(socket.emit).toHaveBeenCalledWith('room:leave', {
      playerId: 1,
      code: 'ABCDEF',
    })
  })

  it('shows correct side when current player is p2', () => {
    // Set session to playerId=2
    useSessionStore.getState().setSession(2, 'Bob')
    useGameStore.getState().setResult(makeResult({ winner: 'p1' }))
    renderResult()

    // p2 loses when winner is p1
    expect(screen.getByText('You Lose')).toBeInTheDocument()
  })

  // ─── Visual card display ────────────────────────────────────────────────────

  it('displays cards for all three groups when result exists (26 cards total)', () => {
    useGameStore.getState().setResult(makeResult())
    renderResult()

    // 5+5 (group1) + 5+5 (group2) + 3+3 (group3) = 26 playing-card elements
    expect(screen.getAllByTestId('playing-card')).toHaveLength(26)
  })

  it('cards in a winning group have green highlight', () => {
    useGameStore.getState().setResult(
      makeResult({
        group1: {
          result: 'p1',
          p1Hand: 'Royal Flush',
          p2Hand: 'Straight Flush',
          p1Foul: false,
          p2Foul: false,
        },
      }),
    )
    renderResult()

    // Royal flush = all 5 highlighted green for p1
    const greenCards = document.querySelectorAll('[class*="ring-green-500"]')
    expect(greenCards.length).toBeGreaterThan(0)
  })

  it('cards in a losing group have red highlight', () => {
    useGameStore.getState().setResult(
      makeResult({
        group2: {
          result: 'p2',
          p1Hand: 'Straight',
          p2Hand: 'Flush',
          p1Foul: false,
          p2Foul: false,
        },
      }),
    )
    renderResult()

    // p1 loses group2 → p1 cards in group2 are red-highlighted
    const redCards = document.querySelectorAll('[class*="ring-red-500"]')
    expect(redCards.length).toBeGreaterThan(0)
  })

  it('renders "You" and "Opponent" labels for each group', () => {
    useGameStore.getState().setResult(makeResult())
    renderResult()

    // 3 groups × 1 label each + 1 from the score summary = 4 total
    const youLabels = screen.getAllByText('You')
    const opponentLabels = screen.getAllByText('Opponent')
    expect(youLabels).toHaveLength(4)
    expect(opponentLabels).toHaveLength(4)
  })

  it('both players hand descriptions are visible for each group', () => {
    useGameStore.getState().setResult(makeResult())
    renderResult()

    expect(screen.getByText('Royal Flush')).toBeInTheDocument()
    expect(screen.getByText('Straight Flush')).toBeInTheDocument()
  })

  it('foul player groups all show red highlight on their cards', () => {
    const foulResult = makeResult({
      winner: 'p2',
      p1Foul: true,
      p2Foul: false,
      p1Score: 0,
      p2Score: 3,
      group1: {
        result: 'p2',
        p1Hand: 'Foul',
        p2Hand: 'Straight Flush',
        p1Foul: true,
        p2Foul: false,
      },
      group2: {
        result: 'p2',
        p1Hand: 'Foul',
        p2Hand: 'Flush',
        p1Foul: true,
        p2Foul: false,
      },
      group3: {
        result: 'p2',
        p1Hand: 'Foul',
        p2Hand: 'High Card',
        p1Foul: true,
        p2Foul: false,
      },
    })
    useGameStore.getState().setResult(foulResult)
    renderResult()

    // p1 (current player) fouls — all their groups lost → red highlights
    const redCards = document.querySelectorAll('[class*="ring-red-500"]')
    expect(redCards.length).toBeGreaterThan(0)

    // All 3 groups show ✗ for the fouling player
    const lostIcons = screen.getAllByLabelText('Lost')
    expect(lostIcons).toHaveLength(3)
  })

  it('opponent foul groups all show green highlight for winner', () => {
    const foulResult = makeResult({
      winner: 'p1',
      p1Foul: false,
      p2Foul: true,
      p1Score: 3,
      p2Score: 0,
      group1: {
        result: 'p1',
        p1Hand: 'Royal Flush',
        p2Hand: 'Foul',
        p1Foul: false,
        p2Foul: true,
      },
      group2: {
        result: 'p1',
        p1Hand: 'Straight',
        p2Hand: 'Foul',
        p1Foul: false,
        p2Foul: true,
      },
      group3: {
        result: 'p1',
        p1Hand: 'High Card',
        p2Hand: 'Foul',
        p1Foul: false,
        p2Foul: true,
      },
    })
    useGameStore.getState().setResult(foulResult)
    renderResult()

    // p1 (current player) wins all 3 groups → green highlights
    const greenCards = document.querySelectorAll('[class*="ring-green-500"]')
    expect(greenCards.length).toBeGreaterThan(0)

    // All 3 groups show ✓ for the winner
    const wonIcons = screen.getAllByLabelText('Won')
    expect(wonIcons).toHaveLength(3)
  })

  it('cards are sorted within each group display (highest rank first)', () => {
    // Use unsorted cards in the arrangement
    const unsortedGroup1: PlayerArrangement['group1'] = [
      makeCard('3', 'S'),
      makeCard('A', 'S'),
      makeCard('7', 'H'),
      makeCard('K', 'D'),
      makeCard('9', 'C'),
    ]
    const unsortedGroup3: PlayerArrangement['group3'] = [
      makeCard('2', 'D'),
      makeCard('Q', 'H'),
      makeCard('5', 'C'),
    ]

    useGameStore.getState().setResult(
      makeResult({
        arrangements: {
          p1: {
            playerId: 1,
            group1: unsortedGroup1,
            group2: dummyGroup2,
            group3: unsortedGroup3,
          },
          p2: {
            playerId: 2,
            group1: dummyGroup1,
            group2: dummyGroup2,
            group3: dummyGroup3,
          },
        },
      }),
    )
    renderResult()

    // All 26 cards should be rendered
    const allCards = screen.getAllByTestId('playing-card')
    expect(allCards.length).toBe(26)

    // Check the first group's "You" row: should be sorted A, K, 9, 7, 3
    // The first 5 playing-card elements belong to p1's group1 (sorted)
    expect(allCards[0]).toHaveAttribute('aria-label', 'A of Spades')
    expect(allCards[1]).toHaveAttribute('aria-label', 'K of Diamonds')
    expect(allCards[4]).toHaveAttribute('aria-label', '3 of Spades')
  })

  // ─── Surrender result display ───────────────────────────────────────────────

  it('shows "You Surrendered" banner when current player surrendered', () => {
    useGameStore.getState().setResult(
      makeResult({
        winner: 'p2',
        p1Score: 0,
        p2Score: 3,
        surrendered: true,
        surrenderedBy: 1, // playerId 1 = current player (Alice)
      }),
    )
    renderResult()
    expect(screen.getByText(/you surrendered/i)).toBeInTheDocument()
  })

  it('shows "Opponent Surrendered" banner when opponent surrendered', () => {
    useGameStore.getState().setResult(
      makeResult({
        winner: 'p1',
        p1Score: 3,
        p2Score: 0,
        surrendered: true,
        surrenderedBy: 2, // playerId 2 = opponent
      }),
    )
    renderResult()
    expect(screen.getByText(/opponent surrendered/i)).toBeInTheDocument()
  })

  it('hides group breakdown when result is a surrender', () => {
    useGameStore.getState().setResult(
      makeResult({
        winner: 'p2',
        surrendered: true,
        surrenderedBy: 1,
      }),
    )
    renderResult()
    expect(screen.queryByText('Group Breakdown')).not.toBeInTheDocument()
  })

  it('still shows Rematch and Leave buttons on a surrender result', () => {
    useGameStore.getState().setResult(
      makeResult({
        winner: 'p2',
        surrendered: true,
        surrenderedBy: 1,
      }),
    )
    renderResult()
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
  })
})

// ─── Rematch UI tests ────────────────────────────────────────────────────────

describe('result page - rematch flow', () => {
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

  it('default state: "Rematch" button is visible', () => {
    useGameStore.getState().setResult(makeResult())
    renderResult()
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument()
  })

  it('after clicking Rematch, button shows "Waiting for opponent…" and is disabled', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Rematch' }))

    const waitingBtn = screen.getByRole('button', { name: 'Waiting for opponent' })
    expect(waitingBtn).toBeInTheDocument()
    expect(waitingBtn).toBeDisabled()
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_REQUEST, {
      playerId: 1,
      code: 'ABCDEF',
    })
  })

  it('opponent requested: banner appears with Accept/Decline buttons', () => {
    useGameStore.getState().setResult(makeResult())
    useGameStore.getState().setRematchOpponentRequested(true)
    renderResult()

    expect(screen.getByTestId('rematch-opponent-banner')).toBeInTheDocument()
    expect(screen.getByText('Opponent wants a rematch!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
  })

  it('clicking Accept emits GAME_REMATCH_REQUEST', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    useGameStore.getState().setRematchOpponentRequested(true)
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_REQUEST, {
      playerId: 1,
      code: 'ABCDEF',
    })
  })

  it('clicking Decline emits GAME_REMATCH_DECLINED', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    useGameStore.getState().setRematchOpponentRequested(true)
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Decline' }))

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_DECLINED, {
      playerId: 1,
      code: 'ABCDEF',
    })
  })

  it('gAME_REMATCH_CANCELLED with reason "declined" shows "Opponent declined rematch"', () => {
    useGameStore.getState().setResult(makeResult())
    // The cancel handler resets rematchRequested to false and sets the reason
    useGameStore.getState().setRematchCancelledReason('declined')
    renderResult()

    expect(screen.getByTestId('rematch-cancelled-notice')).toBeInTheDocument()
    expect(screen.getByText('Opponent declined rematch')).toBeInTheDocument()
    // Rematch button should be visible again (rematchRequested was reset to false)
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument()
  })

  it('gAME_REMATCH_CANCELLED with reason "left" shows "Opponent left the room" and hides Rematch button', () => {
    useGameStore.getState().setResult(makeResult())
    useGameStore.getState().setRematchCancelledReason('left')
    renderResult()

    expect(screen.getByText('Opponent left the room')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rematch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /waiting/i })).not.toBeInTheDocument()
  })

  it('gAME_REMATCH_CANCELLED with reason "disconnected" also hides Rematch button', () => {
    useGameStore.getState().setResult(makeResult())
    useGameStore.getState().setRematchCancelledReason('disconnected')
    renderResult()

    expect(screen.getByText('Opponent left the room')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rematch' })).not.toBeInTheDocument()
  })

  it('leave button still works during pending rematch', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    useGameStore.getState().setRematchRequested(true)
    renderResult()

    // Waiting button visible
    expect(screen.getByRole('button', { name: 'Waiting for opponent' })).toBeInTheDocument()

    // Leave still works
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.ROOM_LEAVE, {
      playerId: 1,
      code: 'ABCDEF',
    })
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('banner is hidden when current player has also requested (both requested)', () => {
    useGameStore.getState().setResult(makeResult())
    useGameStore.getState().setRematchOpponentRequested(true)
    useGameStore.getState().setRematchRequested(true)
    renderResult()

    expect(screen.queryByTestId('rematch-opponent-banner')).not.toBeInTheDocument()
  })
})
