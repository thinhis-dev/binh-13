import type { Card, RoundResult } from '@binh-13/shared'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'
import Game from '../Game'

function makeCard(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit }
}

const dummyCards: Card[] = [
  makeCard('A', 'S'),
  makeCard('K', 'S'),
  makeCard('Q', 'S'),
  makeCard('J', 'S'),
  makeCard('T', 'S'),
  makeCard('9', 'H'),
  makeCard('8', 'H'),
  makeCard('7', 'H'),
  makeCard('6', 'H'),
  makeCard('5', 'H'),
  makeCard('4', 'D'),
  makeCard('3', 'D'),
  makeCard('2', 'D'),
]

function renderGame(initialPath = '/room/ABCDEF/game') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/room/:code/game" element={<Game />} />
        <Route
          path="/room/:code/result"
          element={<div data-testid="result">Result</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('game page', () => {
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

  it('shows waiting message when hand is empty', () => {
    renderGame()
    expect(screen.getByText(/Waiting for cards/)).toBeInTheDocument()
  })

  it('auto-navigates to result page when result is set', () => {
    const result = {
      group1: {
        result: 'p1',
        p1Hand: 'Pair',
        p2Hand: 'High Card',
        p1Foul: false,
        p2Foul: false,
      },
      group2: {
        result: 'p1',
        p1Hand: 'Pair',
        p2Hand: 'High Card',
        p1Foul: false,
        p2Foul: false,
      },
      group3: {
        result: 'p1',
        p1Hand: 'Pair',
        p2Hand: 'High Card',
        p1Foul: false,
        p2Foul: false,
      },
      winner: 'p1',
      p1Score: 3,
      p2Score: 0,
      p1Foul: false,
      p2Foul: false,
      arrangements: {
        p1: {
          playerId: 1,
          group1: dummyCards.slice(0, 5),
          group2: dummyCards.slice(5, 10),
          group3: dummyCards.slice(10, 13),
        },
        p2: {
          playerId: 2,
          group1: dummyCards.slice(0, 5),
          group2: dummyCards.slice(5, 10),
          group3: dummyCards.slice(10, 13),
        },
      },
    } as RoundResult

    useGameStore.getState().setResult(result)
    renderGame()

    expect(screen.getByTestId('result')).toBeInTheDocument()
  })

  it('renders GameBoard when hand has cards and no result', () => {
    useGameStore.getState().setHand(dummyCards)
    renderGame()

    // GameBoard renders card buttons from initialCards
    expect(screen.queryByText(/Waiting for cards/)).not.toBeInTheDocument()
  })
})
