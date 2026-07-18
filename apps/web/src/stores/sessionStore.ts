import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  playerId: number | null
  name: string | null
  roomCode: string | null
  token: string | null
  avatar: string | null
  setSession: (playerId: number, name: string, token?: string) => void
  setRoom: (code: string | null) => void
  setAvatar: (avatar: string) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      playerId: null,
      name: null,
      roomCode: null,
      token: null,
      avatar: null,
      setSession: (playerId, name, token) => set({ playerId, name, token: token ?? get().token }),
      setRoom: roomCode => set({ roomCode }),
      setAvatar: avatar => set({ avatar }),
      clearSession: () => set({ playerId: null, name: null, roomCode: null, token: null, avatar: null }),
    }),
    { name: 'binh13-session' },
  ),
)
