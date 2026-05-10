import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SessionState = {
  playerId: string | null
  token: string | null
  name: string | null
  setSession: (playerId: string, token: string, name: string) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      playerId: null,
      token: null,
      name: null,
      setSession: (playerId, token, name) => set({ playerId, token, name }),
      clearSession: () => set({ playerId: null, token: null, name: null }),
    }),
    { name: 'binh13-session' },
  ),
)
