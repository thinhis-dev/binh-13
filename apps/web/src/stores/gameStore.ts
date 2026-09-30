import type {
  BoardArrangement,
  Card,
  PlayerArrangement,
  Room,
  RoomSettings,
  RoundResult,
} from '@binh-13/shared'
import { create } from 'zustand'

interface GameState {
  room: Room | null
  hand: Card[]
  arrangement: Partial<PlayerArrangement> | null
  result: RoundResult | null
  /** The last game:hint reply. The game board applies it once, then clears it. */
  hint: BoardArrangement | null
  settings: RoomSettings | null
  timerSeconds: number
  timerExpired: boolean
  opponentSubmitted: boolean
  submitted: boolean
  rematchRequested: boolean
  rematchOpponentRequested: boolean
  rematchCancelledReason: 'declined' | 'disconnected' | 'left' | null
  setRoom: (room: Room) => void
  setHand: (hand: Card[]) => void
  setArrangement: (arrangement: Partial<PlayerArrangement>) => void
  setResult: (result: RoundResult) => void
  setHint: (hint: BoardArrangement | null) => void
  setSettings: (settings: RoomSettings) => void
  setTimer: (seconds: number) => void
  setTimerExpired: (v: boolean) => void
  setOpponentSubmitted: (v: boolean) => void
  setSubmitted: (v: boolean) => void
  setRematchRequested: (v: boolean) => void
  setRematchOpponentRequested: (v: boolean) => void
  setRematchCancelledReason: (reason: 'declined' | 'disconnected' | 'left' | null) => void
  reset: () => void
}

const initialState = {
  room: null,
  hand: [],
  arrangement: null,
  result: null,
  hint: null as BoardArrangement | null,
  settings: null,
  timerSeconds: 0,
  timerExpired: false,
  opponentSubmitted: false,
  submitted: false,
  rematchRequested: false,
  rematchOpponentRequested: false,
  rematchCancelledReason: null as 'declined' | 'disconnected' | 'left' | null,
}

export const useGameStore = create<GameState>()(set => ({
  ...initialState,
  setRoom: room => set(state => ({
    room,
    // If room has settings, update settings too
    settings: room.settings ?? state.settings,
  })),
  setHand: hand => set({ hand }),
  setArrangement: arrangement => set({ arrangement }),
  setResult: result => set({ result }),
  setHint: hint => set({ hint }),
  setSettings: settings => set({ settings }),
  setTimer: timerSeconds => set({ timerSeconds }),
  setTimerExpired: timerExpired => set({ timerExpired }),
  setOpponentSubmitted: opponentSubmitted => set({ opponentSubmitted }),
  setSubmitted: submitted => set({ submitted }),
  setRematchRequested: rematchRequested => set({ rematchRequested }),
  setRematchOpponentRequested: rematchOpponentRequested => set({ rematchOpponentRequested }),
  setRematchCancelledReason: rematchCancelledReason => set({ rematchCancelledReason }),
  reset: () => set(initialState),
}))
