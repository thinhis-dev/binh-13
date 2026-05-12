import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '../sessionStore'

describe('sessionStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useSessionStore.getState().clearSession()
  })

  it('stores session and room data', () => {
    useSessionStore.getState().setSession(7, 'Binh')
    useSessionStore.getState().setRoom('ABC123')

    expect(useSessionStore.getState()).toMatchObject({
      playerId: 7,
      name: 'Binh',
      roomCode: 'ABC123',
    })
    expect(localStorage.getItem('binh13-session')).toContain('"playerId":7')
    expect(localStorage.getItem('binh13-session')).toContain('"roomCode":"ABC123"')
  })

  it('clears persisted session state', () => {
    useSessionStore.getState().setSession(7, 'Binh')
    useSessionStore.getState().setRoom('ABC123')
    useSessionStore.getState().clearSession()

    expect(useSessionStore.getState()).toMatchObject({
      playerId: null,
      name: null,
      roomCode: null,
    })
  })
})
