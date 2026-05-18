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
