import { EVENTS } from '@binh-13/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { socket } from '@/lib/socket'
import { useSessionStore } from '@/stores/sessionStore'
import Home from '../Home'

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )
}

describe('home page - clear session', () => {
  beforeEach(() => {
    useSessionStore.getState().setSession(42, 'Alice')
    vi.mocked(socket.on).mockReset()
    vi.mocked(socket.off).mockReset()
    vi.mocked(socket.emit).mockReset()
  })

  afterEach(() => {
    useSessionStore.getState().clearSession()
  })

  it('shows "Not {name}? Change" link when session exists', () => {
    renderHome()
    expect(screen.getByText(/Not Alice\?/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change/i })).toBeInTheDocument()
  })

  it('does not show the link when no session exists', () => {
    useSessionStore.getState().clearSession()
    renderHome()
    expect(screen.queryByText(/Not .+\? Change/)).not.toBeInTheDocument()
  })

  it('emits SESSION_DESTROY when clicking Change', () => {
    renderHome()
    const changeBtn = screen.getByRole('button', { name: /Change/i })
    fireEvent.click(changeBtn)

    expect(socket.emit).toHaveBeenCalledWith(
      EVENTS.SESSION_DESTROY,
      { playerId: 42 },
    )
  })

  it('clears session store when SESSION_DESTROYED is received', () => {
    renderHome()

    // Find the SESSION_DESTROYED handler registered via socket.on
    const onCalls = vi.mocked(socket.on).mock.calls
    const destroyedHandler = onCalls.find(
      ([event]) => event === EVENTS.SESSION_DESTROYED,
    )?.[1] as (() => void) | undefined

    expect(destroyedHandler).toBeDefined()

    // Simulate receiving SESSION_DESTROYED
    destroyedHandler!()

    const state = useSessionStore.getState()
    expect(state.playerId).toBeNull()
    expect(state.name).toBeNull()
  })
})

describe('home page - sign in', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSession()
    vi.mocked(socket.on).mockReset()
    vi.mocked(socket.off).mockReset()
    vi.mocked(socket.emit).mockReset()
  })

  afterEach(() => {
    useSessionStore.getState().clearSession()
  })

  it('shows a "Sign in" link when there is no active session', () => {
    renderHome()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('clicking "Sign in" reveals a login form; submitting emits AUTH_LOGIN', () => {
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice_dev' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }))

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.AUTH_LOGIN, {
      username: 'alice_dev',
      password: 'password123',
    })
  })

  it('AUTH_LOGGED_IN replaces the session with the logged-in identity', () => {
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    const onCalls = vi.mocked(socket.on).mock.calls
    const loggedInHandler = onCalls.find(([event]) => event === EVENTS.AUTH_LOGGED_IN)?.[1] as
      | ((payload: { playerId: number, name: string, avatar: string, token: string }) => void)
      | undefined

    loggedInHandler?.({ playerId: 99, name: 'Other Account', avatar: 'panda', token: 'new-token' })

    const state = useSessionStore.getState()
    expect(state.playerId).toBe(99)
    expect(state.name).toBe('Other Account')
    expect(state.token).toBe('new-token')
  })
})
