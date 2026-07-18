import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  playerId: number | null
  name: string | null
  roomCode: string | null
  token: string | null
  avatar: string | null
  username: string | null
  setSession: (playerId: number, name: string, token?: string) => void
  setRoom: (code: string | null) => void
  setAvatar: (avatar: string) => void
  setUsername: (username: string | null) => void
  /** Fully replaces the active identity (e.g. on AUTH_LOGIN) and clears any active room. */
  replaceSession: (playerId: number, name: string, avatar: string, token: string) => void
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
      username: null,
      setSession: (playerId, name, token) => set({ playerId, name, token: token ?? get().token }),
      setRoom: roomCode => set({ roomCode }),
      setAvatar: avatar => set({ avatar }),
      setUsername: username => set({ username }),
      replaceSession: (playerId, name, avatar, token) =>
        set({ playerId, name, avatar, token, roomCode: null, username: null }),
      clearSession: () =>
        set({ playerId: null, name: null, roomCode: null, token: null, avatar: null, username: null }),
    }),
    { name: 'binh13-session' },
  ),
)
