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

  it('persists the token alongside playerId/name', () => {
    useSessionStore.getState().setSession(7, 'Binh', 'jwt-token-value')

    expect(useSessionStore.getState().token).toBe('jwt-token-value')
    expect(localStorage.getItem('binh13-session')).toContain('"token":"jwt-token-value"')
  })

  it('keeps the existing token when setSession is called without one', () => {
    useSessionStore.getState().setSession(7, 'Binh', 'jwt-token-value')
    useSessionStore.getState().setSession(7, 'Binh Updated')

    expect(useSessionStore.getState().token).toBe('jwt-token-value')
  })

  it('clears the token on clearSession', () => {
    useSessionStore.getState().setSession(7, 'Binh', 'jwt-token-value')
    useSessionStore.getState().clearSession()

    expect(useSessionStore.getState().token).toBeNull()
  })
})
