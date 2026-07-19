import type { PlayerProfile, PlayerStats } from '@binh-13/shared'
import { AVATARS, EVENTS } from '@binh-13/shared'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSocket } from '@/hooks/useSocket'
import { socket } from '@/lib/socket'
import { useSessionStore } from '@/stores/sessionStore'

const STAT_LABELS: Array<{ key: keyof PlayerStats, label: string }> = [
  { key: 'games', label: 'Games' },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
  { key: 'draws', label: 'Draws' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'sweeps', label: 'Sweeps' },
]

export default function Profile() {
  const { getProfile, updateProfile, register } = useSocket()
  const playerId = useSessionStore(state => state.playerId)
  const storedName = useSessionStore(state => state.name)
  const setSession = useSessionStore(state => state.setSession)
  const setStoredAvatar = useSessionStore(state => state.setAvatar)
  const username = useSessionStore(state => state.username)
  const setUsername = useSessionStore(state => state.setUsername)

  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [avatar, setAvatar] = useState('default')
  const [name, setName] = useState(storedName ?? '')
  const [error, setError] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')

  useEffect(() => {
    if (playerId)
      getProfile(playerId)
  }, [playerId, getProfile])

  useEffect(() => {
    const handleProfileData = (payload: PlayerProfile) => {
      setStats(payload.stats)
      setAvatar(payload.avatar)
      setName(payload.name)
      setUsername(payload.username)
    }
    const handleAuthRegistered = (payload: { username: string }) => {
      setUsername(payload.username)
      setError('')
    }
    const handleProfileUpdated = (payload: { name: string, avatar: string }) => {
      setName(payload.name)
      setAvatar(payload.avatar)
      setError('')
      if (playerId)
        setSession(playerId, payload.name)
      setStoredAvatar(payload.avatar)
    }
    const handleError = (payload: { message: string }) => {
      setError(payload.message)
    }

    socket.on(EVENTS.PROFILE_DATA, handleProfileData)
    socket.on(EVENTS.PROFILE_UPDATED, handleProfileUpdated)
    socket.on(EVENTS.AUTH_REGISTERED, handleAuthRegistered)
    socket.on(EVENTS.ERROR, handleError)

    return () => {
      socket.off(EVENTS.PROFILE_DATA, handleProfileData)
      socket.off(EVENTS.PROFILE_UPDATED, handleProfileUpdated)
      socket.off(EVENTS.AUTH_REGISTERED, handleAuthRegistered)
      socket.off(EVENTS.ERROR, handleError)
    }
  }, [playerId, setSession, setStoredAvatar, setUsername])

  function handleSave() {
    if (!playerId)
      return
    setError('')
    updateProfile(playerId, { name: name.trim(), avatar })
  }

  function handleSelectAvatar(next: string) {
    if (!playerId)
      return
    setAvatar(next)
    setError('')
    updateProfile(playerId, { name: name.trim(), avatar: next })
  }

  function handleRegister() {
    if (!playerId)
      return
    setError('')
    register(playerId, registerUsername.trim(), registerPassword)
  }

  if (!playerId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">No active session.</p>
        <Link className="underline" to="/">Back home</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-center">Profile</h1>

        {error && (
          <div data-testid="error-banner" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="profile-name">
            Name
          </label>
          <input
            id="profile-name"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={20}
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <Button className="w-full" type="button" onClick={handleSave}>
            Save
          </Button>
        </div>

        <div className="space-y-3">
          <span className="block text-sm font-medium">Avatar</span>
          <div className="grid grid-cols-3 gap-2">
            {AVATARS.map(candidate => (
              <button
                key={candidate}
                type="button"
                aria-pressed={avatar === candidate}
                onClick={() => handleSelectAvatar(candidate)}
                className={`h-14 rounded-md border text-xs capitalize transition-colors ${
                  avatar === candidate
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-input hover:bg-accent'
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-input p-4">
          {username
            ? (
                <p className="text-sm text-muted-foreground">
                  Signed in as
                  {' '}
                  <span className="font-medium text-foreground">{username}</span>
                </p>
              )
            : (
                <>
                  <span className="block text-sm font-medium">Claim your account</span>
                  <p className="text-xs text-muted-foreground">
                    Play the same identity across devices. Forgotten passwords can't be
                    recovered — it's a game account.
                  </p>
                  <label className="block text-sm font-medium" htmlFor="register-username">
                    Username
                  </label>
                  <input
                    id="register-username"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={registerUsername}
                    onChange={event => setRegisterUsername(event.target.value)}
                  />
                  <label className="block text-sm font-medium" htmlFor="register-password">
                    Password
                  </label>
                  <input
                    id="register-password"
                    type="password"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={registerPassword}
                    onChange={event => setRegisterPassword(event.target.value)}
                  />
                  <Button className="w-full" type="button" onClick={handleRegister}>
                    Claim account
                  </Button>
                </>
              )}
        </div>

        <div className="space-y-3">
          <span className="block text-sm font-medium">Stats</span>
          <div className="grid grid-cols-3 gap-3 text-center">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="rounded-md border border-input p-3">
                <div className="text-2xl font-bold">{stats ? stats[key] : '-'}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <Link className="block text-center text-sm underline text-muted-foreground" to="/">
          Back home
        </Link>
      </div>
    </div>
  )
}
