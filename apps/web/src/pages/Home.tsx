import axios from 'axios'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type HealthResponse = {
  status: string
  timestamp: string
}

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [serverError, setServerError] = useState(false)

  useEffect(() => {
    axios
      .get<HealthResponse>('/api/health')
      .then((res) => setHealth(res.data))
      .catch(() => setServerError(true))
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold tracking-tight">Binh 13</h1>
        <p className="text-muted-foreground">Chinese Poker · 2 players · Real-time</p>
      </div>

      <div className="text-sm text-muted-foreground">
        {serverError && <span className="text-destructive">⚠ Server offline</span>}
        {!serverError && !health && <span>Connecting to server…</span>}
        {health && (
          <span className="text-green-600">
            ✓ Server ok — {new Date(health.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex gap-4">
        <Button>Create Room</Button>
        <Button variant="outline">Join Room</Button>
      </div>
    </div>
  )
}
