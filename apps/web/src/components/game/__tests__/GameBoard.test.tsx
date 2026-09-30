import type { Card } from '@binh-13/shared'
import { DEFAULT_ROOM_SETTINGS, EVENTS } from '@binh-13/shared'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameBoard } from '@/components/game/GameBoard'
import { sortCards } from '@/lib/cards'
import { DEAL_ORDER_STORAGE_KEY } from '@/lib/dealOrder'
import { MOCK_HAND } from '@/lib/mockCards'
import { socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

function hand(ids: string): Card[] {
  return ids.split(' ').map(id => ({
    id,
    rank: id[0] as Card['rank'],
    suit: id[1] as Card['suit'],
  }))
}

function rowCardIds(groupKey: string) {
  return within(screen.getByTestId(`group-row-${groupKey}`))
    .getAllByTestId('playing-card')
    .map(card => card.getAttribute('data-card-id'))
}

// Deliberately unsorted: Back high card, Middle high card, no foul.
const DEALT = [...MOCK_HAND].reverse()

describe('gameBoard', () => {
  beforeEach(() => {
    useSessionStore.getState().setSession(1, 'Alice')
    useSessionStore.getState().setRoom('ABCDEF')
    useGameStore.getState().reset()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useSessionStore.getState().clearSession()
    useGameStore.getState().reset()
    localStorage.clear()
  })

  it('deals the cards into rows shown as a pyramid: Front, Middle, Back', () => {
    render(<GameBoard initialCards={DEALT} />)

    const rows = screen.getAllByTestId(/^group-row-/).map(row => row.dataset.testid)
    expect(rows).toEqual(['group-row-group3', 'group-row-group2', 'group-row-group1'])
    expect(rowCardIds('group1')).toEqual(DEALT.slice(0, 5).map(c => c.id))
    expect(rowCardIds('group2')).toEqual(DEALT.slice(5, 10).map(c => c.id))
    expect(rowCardIds('group3')).toEqual(DEALT.slice(10, 13).map(c => c.id))
    expect(screen.queryByTestId('hand-area')).toBeNull()
  })

  it('enables submit at the deal for a deal without a foul and emits the rows', async () => {
    const user = userEvent.setup()
    render(<GameBoard initialCards={MOCK_HAND} />)

    const submit = screen.getByRole('button', { name: /submit arrangement/i })
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(socket.emit).toHaveBeenCalledWith('game:submit', {
      playerId: 1,
      code: 'ABCDEF',
      arrangement: {
        group1: MOCK_HAND.slice(0, 5),
        group2: MOCK_HAND.slice(5, 10),
        group3: MOCK_HAND.slice(10, 13),
      },
    })
    expect(submit).toBeDisabled()
  })

  it('disables submit and shows the warning for a deal with a foul', () => {
    render(<GameBoard initialCards={hand('AS KH 9D 7C 3S QS QH QD 5C 2D JS TH 4C')} />)

    expect(screen.getByText(/possible foul/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit arrangement/i })).toBeDisabled()
  })

  it('disables submit after the timer expires', () => {
    useGameStore.getState().setTimerExpired(true)
    render(<GameBoard initialCards={MOCK_HAND} />)

    expect(screen.getByRole('button', { name: /submit arrangement/i })).toBeDisabled()
  })

  it('sorts the cards inside each row when Sort is clicked', async () => {
    const user = userEvent.setup()
    render(<GameBoard initialCards={DEALT} />)

    await user.click(screen.getByRole('button', { name: 'Sort' }))

    expect(rowCardIds('group1')).toEqual(sortCards(DEALT.slice(0, 5)).map(c => c.id))
    expect(rowCardIds('group3')).toEqual(sortCards(DEALT.slice(10, 13)).map(c => c.id))
  })

  it('deals in sorted order when the stored preference is sorted', () => {
    localStorage.setItem(DEAL_ORDER_STORAGE_KEY, 'sorted')
    render(<GameBoard initialCards={DEALT} />)

    expect(rowCardIds('group1')).toEqual(sortCards(DEALT).slice(0, 5).map(c => c.id))
    expect(screen.getByRole('switch', { name: 'Sorted deal' })).toBeChecked()
  })

  it('stores the Sorted deal switch but keeps the current rows', async () => {
    const user = userEvent.setup()
    render(<GameBoard initialCards={DEALT} />)

    const toggle = screen.getByRole('switch', { name: 'Sorted deal' })
    expect(toggle).toHaveAccessibleDescription(/next deal/i)
    await user.click(toggle)

    expect(localStorage.getItem(DEAL_ORDER_STORAGE_KEY)).toBe('sorted')
    expect(rowCardIds('group1')).toEqual(DEALT.slice(0, 5).map(c => c.id))
  })

  it('shows the hand name of each row, and hides them when the room hides hand strength', () => {
    const { unmount } = render(<GameBoard initialCards={MOCK_HAND} />)
    expect(within(screen.getByTestId('group-row-group1')).getByText('Straight')).toBeInTheDocument()
    unmount()

    useGameStore.getState().setSettings({ ...DEFAULT_ROOM_SETTINGS, showHandStrength: false })
    render(<GameBoard initialCards={MOCK_HAND} />)
    expect(screen.queryByTestId('row-hand-name')).toBeNull()
  })

  it('enables submit for a fouled board with an instant win, and says that it overrides the foul', () => {
    // Middle (straight flush) beats Back (flush): a foul, but Three flushes.
    render(<GameBoard initialCards={hand('9S 7S 6S 4S 2S 9H 8H 7H 6H 5H KD TD 9D')} />)

    expect(screen.getByText(/possible foul/i)).toHaveTextContent(/instant win overrides the foul/i)
    expect(screen.getByRole('button', { name: /submit arrangement/i })).toBeEnabled()
    expect(screen.getByTestId('instant-win-badge')).toHaveTextContent('Three flushes (3 thung)')
  })

  it('shows the instant-win badge for a Dragon deal', () => {
    render(<GameBoard initialCards={MOCK_HAND} />)

    expect(screen.getByTestId('instant-win-badge')).toHaveTextContent('Dragon (Sanh rong)')
  })

  it('shows no instant-win badge for an ordinary board', () => {
    render(<GameBoard initialCards={hand('AS KH 9D 7C 3S QS QH QD 5C 2D JS TH 4C')} />)

    expect(screen.queryByTestId('instant-win-badge')).toBeNull()
  })

  describe('draft and hint', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function draftEmits() {
      return vi.mocked(socket.emit).mock.calls.filter(([event]) => event === EVENTS.GAME_DRAFT)
    }

    it('sends no draft for the deal itself', () => {
      render(<GameBoard initialCards={DEALT} />)

      act(() => vi.advanceTimersByTime(1000))

      expect(draftEmits()).toHaveLength(0)
    })

    it('sends one draft with the current board 300 ms after the last change', () => {
      render(<GameBoard initialCards={DEALT} />)

      fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
      act(() => vi.advanceTimersByTime(200))
      fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
      act(() => vi.advanceTimersByTime(299))
      expect(draftEmits()).toHaveLength(0)

      act(() => vi.advanceTimersByTime(1))
      expect(draftEmits()).toEqual([[EVENTS.GAME_DRAFT, {
        playerId: 1,
        code: 'ABCDEF',
        arrangement: {
          group1: sortCards(DEALT.slice(0, 5)),
          group2: sortCards(DEALT.slice(5, 10)),
          group3: sortCards(DEALT.slice(10, 13)),
        },
      }]])
    })

    it('sends no draft after submit', () => {
      render(<GameBoard initialCards={DEALT} />)

      fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
      fireEvent.click(screen.getByRole('button', { name: /submit arrangement/i }))
      act(() => vi.advanceTimersByTime(1000))

      expect(draftEmits()).toHaveLength(0)
    })

    it('asks for a hint and fills the board with the reply', () => {
      render(<GameBoard initialCards={DEALT} />)

      fireEvent.click(screen.getByRole('button', { name: 'Hint' }))
      expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_HINT_REQUEST, { playerId: 1, code: 'ABCDEF' })

      const hint = {
        group1: MOCK_HAND.slice(0, 5),
        group2: MOCK_HAND.slice(5, 10),
        group3: MOCK_HAND.slice(10, 13),
      }
      act(() => useGameStore.getState().setHint(hint))

      expect(rowCardIds('group1')).toEqual(hint.group1.map(c => c.id))
      expect(rowCardIds('group2')).toEqual(hint.group2.map(c => c.id))
      expect(rowCardIds('group3')).toEqual(hint.group3.map(c => c.id))
      expect(useGameStore.getState().hint).toBeNull()

      act(() => vi.advanceTimersByTime(300))
      expect(draftEmits()).toHaveLength(1)
    })

    it('disables Hint after submit and after the timer expires', () => {
      const { unmount } = render(<GameBoard initialCards={MOCK_HAND} />)
      fireEvent.click(screen.getByRole('button', { name: /submit arrangement/i }))
      expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled()
      unmount()

      useGameStore.getState().reset()
      useGameStore.getState().setTimerExpired(true)
      render(<GameBoard initialCards={MOCK_HAND} />)
      expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled()
    })

    it('says that the board was auto-arranged at timeout, not forfeited', () => {
      useGameStore.getState().setTimerExpired(true)
      render(<GameBoard initialCards={MOCK_HAND} />)

      expect(screen.getByText(/auto-arranged and submitted/i)).toBeInTheDocument()
      expect(screen.queryByText(/forfeit/i)).toBeNull()
    })
  })
})
