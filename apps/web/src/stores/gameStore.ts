import type {
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
  settings: RoomSettings | null
  timerSeconds: number
  timerExpired: boolean
  opponentSubmitted: boolean
  submitted: boolean
  setRoom: (room: Room) => void
  setHand: (hand: Card[]) => void
  setArrangement: (arrangement: Partial<PlayerArrangement>) => void
  setResult: (result: RoundResult) => void
  setSettings: (settings: RoomSettings) => void
  setTimer: (seconds: number) => void
  setTimerExpired: (v: boolean) => void
  setOpponentSubmitted: (v: boolean) => void
  setSubmitted: (v: boolean) => void
  reset: () => void
}

const initialState = {
  room: null,
  hand: [],
  arrangement: null,
  result: null,
  settings: null,
  timerSeconds: 0,
  timerExpired: false,
  opponentSubmitted: false,
  submitted: false,
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
  setSettings: settings => set({ settings }),
  setTimer: timerSeconds => set({ timerSeconds }),
  setTimerExpired: timerExpired => set({ timerExpired }),
  setOpponentSubmitted: opponentSubmitted => set({ opponentSubmitted }),
  setSubmitted: submitted => set({ submitted }),
  reset: () => set(initialState),
}))
