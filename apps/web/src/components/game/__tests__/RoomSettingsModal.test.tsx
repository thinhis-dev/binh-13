import type { RoomSettings } from '@binh-13/shared'
import { DEFAULT_ROOM_SETTINGS, EVENTS } from '@binh-13/shared'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomSettingsModal } from '@/components/game/RoomSettingsModal'
import { socket } from '@/lib/socket'

const defaultProps = {
  settings: DEFAULT_ROOM_SETTINGS,
  code: 'ABCDEF',
  playerId: 1,
}

describe('roomSettingsModal', () => {
  beforeEach(() => {
    vi.mocked(socket.emit).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Settings trigger button', () => {
    render(<RoomSettingsModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('opens modal on trigger click and shows all settings', () => {
    render(<RoomSettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/game settings/i)).toBeInTheDocument()
    expect(screen.getByText(/timer/i)).toBeInTheDocument()
    expect(screen.getByText(/auto-start/i)).toBeInTheDocument()
    expect(screen.getByText(/allow foul/i)).toBeInTheDocument()
    expect(screen.getByText(/show hand strength/i)).toBeInTheDocument()
    expect(screen.getByText(/reveal on submit/i)).toBeInTheDocument()
  })

  it('displays correct default values for all settings', () => {
    render(<RoomSettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const dialog = screen.getByRole('dialog')

    // autoStart = true → its switch should be checked
    const autoStartSwitch = within(dialog).getByRole('switch', {
      name: /auto-start/i,
    })
    expect(autoStartSwitch).toBeChecked()

    // allowFoul = true → checked
    const allowFoulSwitch = within(dialog).getByRole('switch', {
      name: /allow foul/i,
    })
    expect(allowFoulSwitch).toBeChecked()

    // showHandStrength = true → checked
    const showStrengthSwitch = within(dialog).getByRole('switch', {
      name: /show hand strength/i,
    })
    expect(showStrengthSwitch).toBeChecked()

    // revealOnSubmit = false → not checked
    const revealSwitch = within(dialog).getByRole('switch', {
      name: /reveal on submit/i,
    })
    expect(revealSwitch).not.toBeChecked()
  })

  it('emits ROOM_SETTINGS_UPDATE when allowFoul switch is toggled', () => {
    render(<RoomSettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const dialog = screen.getByRole('dialog')
    const allowFoulSwitch = within(dialog).getByRole('switch', {
      name: /allow foul/i,
    })

    fireEvent.click(allowFoulSwitch)

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: 1,
      code: 'ABCDEF',
      settings: { allowFoul: false },
    })
  })

  it('emits ROOM_SETTINGS_UPDATE when autoStart switch is toggled', () => {
    render(<RoomSettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const dialog = screen.getByRole('dialog')
    const autoStartSwitch = within(dialog).getByRole('switch', {
      name: /auto-start/i,
    })

    fireEvent.click(autoStartSwitch)

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: 1,
      code: 'ABCDEF',
      settings: { autoStart: false },
    })
  })

  it('emits ROOM_SETTINGS_UPDATE with new timerSeconds when timer select changes', () => {
    render(<RoomSettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    // Native <select> is a combobox role
    const timerSelect = screen.getByRole('combobox', { name: /timer/i })
    fireEvent.change(timerSelect, { target: { value: '120' } })

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: 1,
      code: 'ABCDEF',
      settings: { timerSeconds: 120 },
    })
  })

  it('reflects custom settings passed as props', () => {
    const customSettings: RoomSettings = {
      ...DEFAULT_ROOM_SETTINGS,
      timerSeconds: 30,
      allowFoul: false,
      revealOnSubmit: true,
    }
    render(
      <RoomSettingsModal
        settings={customSettings}
        code="ABCDEF"
        playerId={1}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const dialog = screen.getByRole('dialog')

    const allowFoulSwitch = within(dialog).getByRole('switch', {
      name: /allow foul/i,
    })
    expect(allowFoulSwitch).not.toBeChecked()

    const revealSwitch = within(dialog).getByRole('switch', {
      name: /reveal on submit/i,
    })
    expect(revealSwitch).toBeChecked()
  })
})
