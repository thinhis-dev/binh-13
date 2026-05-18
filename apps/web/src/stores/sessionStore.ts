import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  playerId: number | null
  name: string | null
  roomCode: string | null
  setSession: (playerId: number, name: string) => void
  setRoom: (code: string | null) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    set => ({
      playerId: null,
      name: null,
      roomCode: null,
      setSession: (playerId, name) => set({ playerId, name }),
      setRoom: roomCode => set({ roomCode }),
      clearSession: () => set({ playerId: null, name: null, roomCode: null }),
    }),
    { name: 'binh13-session' },
  ),
)
