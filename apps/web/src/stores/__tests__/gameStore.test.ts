import type { Room, RoundResult } from '@binh-13/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'

const room: Room = {
  code: 'ABC123',
  status: 'waiting',
  createdBy: 1,
  players: [],
}

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it('updates each store slice and resets them', () => {
    const result = {
      winner: 'draw',
    } as RoundResult

    useGameStore.getState().setRoom(room)
    useGameStore.getState().setHand([{ id: 'AS', rank: 'A', suit: 'S' }])
    useGameStore.getState().setArrangement({ playerId: 1 })
    useGameStore.getState().setResult(result)
    useGameStore.getState().setTimer(45)

    expect(useGameStore.getState()).toMatchObject({
      room,
      hand: [{ id: 'AS', rank: 'A', suit: 'S' }],
      arrangement: { playerId: 1 },
      result,
      timerSeconds: 45,
    })

    useGameStore.getState().reset()

    expect(useGameStore.getState()).toMatchObject({
      room: null,
      hand: [],
      arrangement: null,
      result: null,
      timerSeconds: 0,
    })
  })

  it('tracks opponentSubmitted and submitted flags', () => {
    expect(useGameStore.getState().opponentSubmitted).toBe(false)
    expect(useGameStore.getState().submitted).toBe(false)

    useGameStore.getState().setOpponentSubmitted(true)
    expect(useGameStore.getState().opponentSubmitted).toBe(true)

    useGameStore.getState().setSubmitted(true)
    expect(useGameStore.getState().submitted).toBe(true)

    useGameStore.getState().reset()
    expect(useGameStore.getState().opponentSubmitted).toBe(false)
    expect(useGameStore.getState().submitted).toBe(false)
  })
})
