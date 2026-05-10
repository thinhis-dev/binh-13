import { create } from 'zustand'
import type { Card, PlayerArrangement, Room, RoundResult } from '@binh-13/shared'

type GameState = {
  room: Room | null
  hand: Card[]
  arrangement: Partial<PlayerArrangement> | null
  result: RoundResult | null
  timerSeconds: number
  setRoom: (room: Room) => void
  setHand: (hand: Card[]) => void
  setArrangement: (arrangement: Partial<PlayerArrangement>) => void
  setResult: (result: RoundResult) => void
  setTimer: (seconds: number) => void
  reset: () => void
}

const initialState = {
  room: null,
  hand: [],
  arrangement: null,
  result: null,
  timerSeconds: 0,
}

export const useGameStore = create<GameState>()((set) => ({
  ...initialState,
  setRoom: (room) => set({ room }),
  setHand: (hand) => set({ hand }),
  setArrangement: (arrangement) => set({ arrangement }),
  setResult: (result) => set({ result }),
  setTimer: (timerSeconds) => set({ timerSeconds }),
  reset: () => set(initialState),
}))
