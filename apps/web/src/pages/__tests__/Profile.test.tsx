import { EVENTS } from '@binh-13/shared'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { socket } from '@/lib/socket'
import { useSessionStore } from '@/stores/sessionStore'
import Profile from '../Profile'

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  )
}

function findHandler(event: string) {
  return vi.mocked(socket.on).mock.calls.find(([e]) => e === event)?.[1] as
    | ((...args: unknown[]) => void)
    | undefined
}

describe('profile page', () => {
  beforeEach(() => {
    useSessionStore.getState().setSession(7, 'Binh', 'token-value')
    vi.mocked(socket.on).mockReset()
    vi.mocked(socket.off).mockReset()
    vi.mocked(socket.emit).mockReset()
  })

  afterEach(() => {
    useSessionStore.getState().clearSession()
  })

  it('requests the profile on mount', () => {
    renderProfile()
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.PROFILE_GET, { playerId: 7 })
  })

  it('renders stats received from PROFILE_DATA', () => {
    renderProfile()
    const handler = findHandler(EVENTS.PROFILE_DATA)

    act(() => {
      handler?.({
        playerId: 7,
        name: 'Binh',
        avatar: 'default',
        createdAt: Date.now(),
        stats: { games: 6, wins: 2, losses: 3, draws: 1, fouls: 1, sweeps: 1 },
      })
    })

    expect(screen.getByText('6')).toBeInTheDocument() // games
    expect(screen.getByText('2')).toBeInTheDocument() // wins
    expect(screen.getByText('3')).toBeInTheDocument() // losses
  })

  it('editing the name and saving emits PROFILE_UPDATE', () => {
    renderProfile()

    const input = screen.getByLabelText('Name')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.PROFILE_UPDATE, {
      playerId: 7,
      name: 'New Name',
      avatar: 'default',
    })
  })

  it('marks the current avatar as selected and clicking another emits PROFILE_UPDATE', () => {
    renderProfile()
    const handler = findHandler(EVENTS.PROFILE_DATA)
    act(() => {
      handler?.({
        playerId: 7,
        name: 'Binh',
        avatar: 'default',
        createdAt: Date.now(),
        stats: { games: 0, wins: 0, losses: 0, draws: 0, fouls: 0, sweeps: 0 },
      })
    })

    const defaultAvatarBtn = screen.getByRole('button', { name: /default/i })
    expect(defaultAvatarBtn).toHaveAttribute('aria-pressed', 'true')

    const foxAvatarBtn = screen.getByRole('button', { name: /fox/i })
    fireEvent.click(foxAvatarBtn)

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.PROFILE_UPDATE, {
      playerId: 7,
      name: 'Binh',
      avatar: 'fox',
    })
  })

  it('updates the session store when PROFILE_UPDATED is received', () => {
    renderProfile()
    const handler = findHandler(EVENTS.PROFILE_UPDATED)

    act(() => {
      handler?.({ name: 'Renamed', avatar: 'panda' })
    })

    expect(useSessionStore.getState().name).toBe('Renamed')
    expect(useSessionStore.getState().avatar).toBe('panda')
  })

  describe('claim account', () => {
    function loadProfileWithUsername(username: string | null) {
      renderProfile()
      const handler = findHandler(EVENTS.PROFILE_DATA)
      act(() => {
        handler?.({
          playerId: 7,
          name: 'Binh',
          avatar: 'default',
          createdAt: Date.now(),
          username,
          stats: { games: 0, wins: 0, losses: 0, draws: 0, fouls: 0, sweeps: 0 },
        })
      })
    }

    it('shows a "Claim your account" register form when no username is set', () => {
      loadProfileWithUsername(null)
      expect(screen.getByText(/claim your account/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    })

    it('submitting the register form emits AUTH_REGISTER', () => {
      loadProfileWithUsername(null)

      fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice_dev' } })
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /claim account/i }))

      expect(socket.emit).toHaveBeenCalledWith(EVENTS.AUTH_REGISTER, {
        playerId: 7,
        username: 'alice_dev',
        password: 'password123',
      })
    })

    it('shows "Signed in as {username}" once a username is set', () => {
      loadProfileWithUsername('alice_dev')
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument()
      expect(screen.getByText('alice_dev')).toBeInTheDocument()
      expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument()
    })

    it('aUTH_REGISTERED switches the view to "Signed in as"', () => {
      loadProfileWithUsername(null)
      const handler = findHandler(EVENTS.AUTH_REGISTERED)

      act(() => {
        handler?.({ username: 'alice_dev' })
      })

      expect(screen.getByText(/signed in as/i)).toBeInTheDocument()
      expect(useSessionStore.getState().username).toBe('alice_dev')
    })
  })
})
