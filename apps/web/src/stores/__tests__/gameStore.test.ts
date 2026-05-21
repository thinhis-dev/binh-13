import type { Room, RoundResult } from '@binh-13/shared'
import { DEFAULT_ROOM_SETTINGS } from '@binh-13/shared'
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

describe('gameStore - settings', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it('settings starts as null', () => {
    expect(useGameStore.getState().settings).toBeNull()
  })

  it('setSettings updates settings state', () => {
    useGameStore.getState().setSettings(DEFAULT_ROOM_SETTINGS)
    expect(useGameStore.getState().settings).toEqual(DEFAULT_ROOM_SETTINGS)
  })

  it('setSettings with partial override merges correctly when called with full object', () => {
    const customSettings = {
      ...DEFAULT_ROOM_SETTINGS,
      timerSeconds: 120,
      allowFoul: false,
    }
    useGameStore.getState().setSettings(customSettings)
    expect(useGameStore.getState().settings?.timerSeconds).toBe(120)
    expect(useGameStore.getState().settings?.allowFoul).toBe(false)
    expect(useGameStore.getState().settings?.autoStart).toBe(true)
  })

  it('setRoom with settings updates settings from room.settings', () => {
    const roomWithSettings: Room = {
      ...room,
      settings: {
        ...DEFAULT_ROOM_SETTINGS,
        showHandStrength: false,
      },
    }
    useGameStore.getState().setRoom(roomWithSettings)
    expect(useGameStore.getState().settings).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      showHandStrength: false,
    })
  })

  it('setRoom without settings field leaves settings unchanged', () => {
    useGameStore.getState().setSettings(DEFAULT_ROOM_SETTINGS)
    // room without settings field
    useGameStore.getState().setRoom(room)
    // settings should remain as previously set (not reset to null by setRoom alone)
    expect(useGameStore.getState().settings).toEqual(DEFAULT_ROOM_SETTINGS)
  })

  it('settings resets to null on reset()', () => {
    useGameStore.getState().setSettings(DEFAULT_ROOM_SETTINGS)
    useGameStore.getState().reset()
    expect(useGameStore.getState().settings).toBeNull()
  })
})

describe('gameStore - rematch state', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it('rematchRequested starts as false', () => {
    expect(useGameStore.getState().rematchRequested).toBe(false)
  })

  it('rematchOpponentRequested starts as false', () => {
    expect(useGameStore.getState().rematchOpponentRequested).toBe(false)
  })

  it('rematchCancelledReason starts as null', () => {
    expect(useGameStore.getState().rematchCancelledReason).toBeNull()
  })

  it('setRematchRequested(true) sets rematchRequested to true', () => {
    useGameStore.getState().setRematchRequested(true)
    expect(useGameStore.getState().rematchRequested).toBe(true)
  })

  it('setRematchOpponentRequested(true) sets rematchOpponentRequested to true', () => {
    useGameStore.getState().setRematchOpponentRequested(true)
    expect(useGameStore.getState().rematchOpponentRequested).toBe(true)
  })

  it('setRematchCancelledReason stores the reason', () => {
    useGameStore.getState().setRematchCancelledReason('declined')
    expect(useGameStore.getState().rematchCancelledReason).toBe('declined')

    useGameStore.getState().setRematchCancelledReason('left')
    expect(useGameStore.getState().rematchCancelledReason).toBe('left')

    useGameStore.getState().setRematchCancelledReason('disconnected')
    expect(useGameStore.getState().rematchCancelledReason).toBe('disconnected')
  })

  it('reset() clears all rematch state fields', () => {
    useGameStore.getState().setRematchRequested(true)
    useGameStore.getState().setRematchOpponentRequested(true)
    useGameStore.getState().setRematchCancelledReason('declined')

    useGameStore.getState().reset()

    expect(useGameStore.getState().rematchRequested).toBe(false)
    expect(useGameStore.getState().rematchOpponentRequested).toBe(false)
    expect(useGameStore.getState().rematchCancelledReason).toBeNull()
  })
})
