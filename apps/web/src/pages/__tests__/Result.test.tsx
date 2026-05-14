import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, PlayerArrangement, RoundResult } from '@binh-13/shared'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'
import { socket } from '@/lib/socket'
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

describe('Result page', () => {
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
    expect(scores.map((el) => el.textContent)).toContain('2')
    expect(scores.map((el) => el.textContent)).toContain('1')
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
    expect(icons.map((el) => el.textContent)).toEqual(['✓', '✗', '✓'])
  })

  it('navigates to lobby on Rematch click', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Rematch' }))

    expect(screen.getByTestId('lobby')).toBeInTheDocument()
  })

  it('resets game store on Rematch click', async () => {
    const user = userEvent.setup()
    useGameStore.getState().setResult(makeResult())
    renderResult()

    await user.click(screen.getByRole('button', { name: 'Rematch' }))

    expect(useGameStore.getState().result).toBeNull()
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
})
