import type { Room } from '@binh-13/shared'
import { DEFAULT_ROOM_SETTINGS, EVENTS } from '@binh-13/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'
import Lobby from '../Lobby'

function renderLobby(path = '/room/ABCDEF') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/room/:code" element={<Lobby />} />
        <Route path="/" element={<div data-testid="home">Home</div>} />
        <Route path="/room/:code/game" element={<div data-testid="game">Game</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const baseRoom: Room = {
  code: 'ABCDEF',
  status: 'waiting',
  createdBy: 1,
  players: [{ id: 1, name: 'Alice', seat: 1, connected: true }],
  settings: DEFAULT_ROOM_SETTINGS,
}

describe('lobby page - settings', () => {
  beforeEach(() => {
    useSessionStore.getState().setSession(1, 'Alice')
    useSessionStore.getState().setRoom('ABCDEF')
    useGameStore.getState().reset()
    useGameStore.getState().setRoom(baseRoom)
    vi.mocked(socket.on).mockReset()
    vi.mocked(socket.off).mockReset()
    vi.mocked(socket.emit).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useSessionStore.getState().clearSession()
    useGameStore.getState().reset()
  })

  it('shows Settings button when user is the room owner', () => {
    renderLobby()
    expect(
      screen.getByRole('button', { name: /settings/i }),
    ).toBeInTheDocument()
  })

  it('does NOT show Settings button when user is not the owner', () => {
    // Change the room createdBy to someone else
    useGameStore.getState().setRoom({
      ...baseRoom,
      createdBy: 99,
    })
    renderLobby()
    expect(
      screen.queryByRole('button', { name: /settings/i }),
    ).not.toBeInTheDocument()
  })

  it('shows read-only settings summary for non-owner', () => {
    useGameStore.getState().setRoom({
      ...baseRoom,
      createdBy: 99,
    })
    renderLobby()
    // Should show a settings summary section
    expect(screen.getByText(/game settings/i)).toBeInTheDocument()
  })

  it('shows read-only settings summary for owner too (below seats)', () => {
    renderLobby()
    // The settings summary is always visible
    expect(screen.getByText(/game settings/i)).toBeInTheDocument()
  })

  it('settings summary reflects the room settings', () => {
    useGameStore.getState().setRoom({
      ...baseRoom,
      settings: {
        ...DEFAULT_ROOM_SETTINGS,
        timerSeconds: 0,
        allowFoul: false,
      },
    })
    renderLobby()
    // Should show unlimited timer indicator
    expect(screen.getByText(/unlimited/i)).toBeInTheDocument()
  })

  it('listens for ROOM_SETTINGS_UPDATED and updates store settings', () => {
    renderLobby()

    const onCalls = vi.mocked(socket.on).mock.calls
    const settingsUpdatedHandler = onCalls.find(
      ([event]) => event === EVENTS.ROOM_SETTINGS_UPDATED,
    )?.[1] as ((payload: { settings: typeof DEFAULT_ROOM_SETTINGS }) => void) | undefined

    expect(settingsUpdatedHandler).toBeDefined()

    settingsUpdatedHandler!({
      settings: { ...DEFAULT_ROOM_SETTINGS, timerSeconds: 300 },
    })

    expect(useGameStore.getState().settings?.timerSeconds).toBe(300)
  })

  it('opens Settings modal when Settings button is clicked', () => {
    renderLobby()
    const settingsButton = screen.getByRole('button', { name: /settings/i })
    fireEvent.click(settingsButton)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

const twoPlayerRoom: Room = {
  code: 'ABCDEF',
  status: 'waiting',
  createdBy: 1,
  players: [
    { id: 1, name: 'Alice', seat: 1, connected: true },
    { id: 2, name: 'Bob', seat: 2, connected: true },
  ],
  settings: DEFAULT_ROOM_SETTINGS,
}

describe('lobby page - autoStart behavior', () => {
  beforeEach(() => {
    useSessionStore.getState().setSession(1, 'Alice')
    useSessionStore.getState().setRoom('ABCDEF')
    useGameStore.getState().reset()
    vi.mocked(socket.on).mockReset()
    vi.mocked(socket.off).mockReset()
    vi.mocked(socket.emit).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useSessionStore.getState().clearSession()
    useGameStore.getState().reset()
  })

  it('shows "start automatically" message when autoStart is on and both players ready', () => {
    useGameStore.getState().setRoom(twoPlayerRoom)
    renderLobby()
    expect(screen.getByText(/will start automatically/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start game/i })).not.toBeInTheDocument()
  })

  it('shows "Start Game" button for owner when autoStart is off and both players ready', () => {
    useGameStore.getState().setRoom({
      ...twoPlayerRoom,
      settings: { ...DEFAULT_ROOM_SETTINGS, autoStart: false },
    })
    renderLobby()
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument()
    expect(screen.getByText(/start the game when you're ready/i)).toBeInTheDocument()
  })

  it('shows "Waiting for owner" message for non-owner when autoStart is off', () => {
    useSessionStore.getState().setSession(2, 'Bob')
    useGameStore.getState().setRoom({
      ...twoPlayerRoom,
      settings: { ...DEFAULT_ROOM_SETTINGS, autoStart: false },
    })
    renderLobby()
    expect(screen.queryByRole('button', { name: /start game/i })).not.toBeInTheDocument()
    expect(screen.getByText(/waiting for the room owner to start/i)).toBeInTheDocument()
  })

  it('emits GAME_START when owner clicks Start Game button', () => {
    useGameStore.getState().setRoom({
      ...twoPlayerRoom,
      settings: { ...DEFAULT_ROOM_SETTINGS, autoStart: false },
    })
    renderLobby()
    fireEvent.click(screen.getByRole('button', { name: /start game/i }))
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_START, {
      playerId: 1,
      code: 'ABCDEF',
    })
  })

  it('does not show Start Game button when only 1 player in room', () => {
    useGameStore.getState().setRoom({
      ...baseRoom,
      settings: { ...DEFAULT_ROOM_SETTINGS, autoStart: false },
    })
    renderLobby()
    expect(screen.queryByRole('button', { name: /start game/i })).not.toBeInTheDocument()
  })
})
