import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { GroupComparison } from '@binh-13/shared'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useSocket } from '@/hooks/useSocket'

type PlayerSide = 'p1' | 'p2'

const GROUP_LABELS = ['Back (5)', 'Middle (5)', 'Front (3)'] as const

function resultIcon(
  group: GroupComparison,
  mySide: PlayerSide,
): { icon: string; color: string } {
  if (group.result === mySide) return { icon: '✓', color: 'text-green-600' }
  if (group.result === 'draw')
    return { icon: '—', color: 'text-muted-foreground' }
  return { icon: '✗', color: 'text-red-500' }
}

export default function Result() {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()
  const result = useGameStore((s) => s.result)
  const playerId = useSessionStore((s) => s.playerId)
  const { leaveRoom } = useSocket()
  const reset = useGameStore((s) => s.reset)

  const mySide: PlayerSide = useMemo(
    () => (result?.arrangements.p1.playerId === playerId ? 'p1' : 'p2'),
    [result, playerId],
  )
  const opponentSide: PlayerSide = mySide === 'p1' ? 'p2' : 'p1'

  const didWin = result?.winner === mySide
  const isDraw = result?.winner === 'draw'
  const isFoul = mySide === 'p1' ? result?.p1Foul : result?.p2Foul
  const opponentFoul = opponentSide === 'p1' ? result?.p1Foul : result?.p2Foul

  const handleRematch = useCallback(() => {
    reset()
    navigate(`/room/${code}`)
  }, [reset, navigate, code])

  const handleLeave = useCallback(() => {
    if (playerId && code) leaveRoom(playerId, code)
    reset()
    navigate('/')
  }, [playerId, code, leaveRoom, reset, navigate])

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">No result available.</p>
      </div>
    )
  }

  const groups: GroupComparison[] = [
    result.group1,
    result.group2,
    result.group3,
  ]

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 p-4">
      {/* Winner / Loser banner */}
      <div className="text-center">
        {isDraw ? (
          <h1 className="text-3xl font-bold text-yellow-600">Draw!</h1>
        ) : didWin ? (
          <h1 className="text-3xl font-bold text-green-600">You Win! 🎉</h1>
        ) : (
          <h1 className="text-3xl font-bold text-red-500">You Lose</h1>
        )}

        {isFoul && (
          <p className="mt-1 text-sm text-red-500">
            Your arrangement fouled (middle stronger than back).
          </p>
        )}
        {opponentFoul && (
          <p className="mt-1 text-sm text-green-600">
            Opponent fouled — auto-loss for them.
          </p>
        )}
      </div>

      {/* Score summary */}
      <div className="flex items-center gap-4 rounded-lg bg-muted/50 px-6 py-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">You</p>
          <p className="text-2xl font-bold">
            {mySide === 'p1' ? result.p1Score : result.p2Score}
          </p>
        </div>
        <span className="text-muted-foreground">—</span>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Opponent</p>
          <p className="text-2xl font-bold">
            {opponentSide === 'p1' ? result.p1Score : result.p2Score}
          </p>
        </div>
      </div>

      {/* Group-by-group breakdown */}
      <div className="w-full space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Group Breakdown
        </h2>
        {groups.map((group, i) => {
          const { icon, color } = resultIcon(group, mySide)
          const myHand = mySide === 'p1' ? group.p1Hand : group.p2Hand
          const theirHand = opponentSide === 'p1' ? group.p1Hand : group.p2Hand
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className={`font-bold ${color}`}>{icon}</span>
                <span className="text-sm font-medium">{GROUP_LABELS[i]}</span>
              </div>
              <div className="text-right text-xs">
                <p>
                  You: <span className="font-medium">{myHand}</span>
                </p>
                <p className="text-muted-foreground">
                  Opp: <span className="font-medium">{theirHand}</span>
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rematch / Leave */}
      <div className="flex gap-3">
        <Button onClick={handleRematch}>Rematch</Button>
        <Button variant="outline" onClick={handleLeave}>
          Leave
        </Button>
      </div>
    </div>
  )
}
