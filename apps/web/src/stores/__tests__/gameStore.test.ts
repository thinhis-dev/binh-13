import { beforeEach, describe, expect, it } from 'vitest'
import type { Room, RoundResult } from '@binh-13/shared'
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
})
