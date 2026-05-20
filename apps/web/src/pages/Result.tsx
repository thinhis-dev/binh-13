import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ResultGroupDisplay } from '@/components/game/ResultGroupDisplay'
import { Button } from '@/components/ui/button'
import { useSocket } from '@/hooks/useSocket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

type PlayerSide = 'p1' | 'p2'

const GROUP_LABELS = ['Back (5)', 'Middle (5)', 'Front (3)'] as const

export default function Result() {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()
  const result = useGameStore(s => s.result)
  const playerId = useSessionStore(s => s.playerId)
  const { leaveRoom } = useSocket()
  const reset = useGameStore(s => s.reset)

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
    if (playerId && code)
      leaveRoom(playerId, code)
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

  const groups = [result.group1, result.group2, result.group3] as const

  const myArrangement = result.arrangements[mySide]
  const opponentArrangement = result.arrangements[opponentSide]

  const groupCards = [
    {
      myCards: myArrangement.group1,
      opponentCards: opponentArrangement.group1,
    },
    {
      myCards: myArrangement.group2,
      opponentCards: opponentArrangement.group2,
    },
    {
      myCards: myArrangement.group3,
      opponentCards: opponentArrangement.group3,
    },
  ] as const

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 p-4">
      {/* Winner / Loser banner */}
      <div className="text-center">
        {result.surrendered
          ? (
              result.surrenderedBy === playerId
                ? (
                    <h1 className="text-3xl font-bold text-red-500">You Surrendered</h1>
                  )
                : (
                    <h1 className="text-3xl font-bold text-green-600">
                      Opponent Surrendered — You Win! 🎉
                    </h1>
                  )
            )
          : isDraw
            ? (
                <h1 className="text-3xl font-bold text-yellow-600">Draw!</h1>
              )
            : didWin
              ? (
                  <h1 className="text-3xl font-bold text-green-600">You Win! 🎉</h1>
                )
              : (
                  <h1 className="text-3xl font-bold text-red-500">You Lose</h1>
                )}

        {isFoul && !result.surrendered && (
          <p className="mt-1 text-sm text-red-500">
            Your arrangement fouled (middle stronger than back).
          </p>
        )}
        {opponentFoul && !result.surrendered && (
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

      {/* Group-by-group breakdown — hidden on surrender */}
      {!result.surrendered && (
        <div className="w-full space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Group Breakdown
          </h2>
          {groups.map((group, i) => (
            <ResultGroupDisplay
              key={i}
              groupLabel={GROUP_LABELS[i]}
              comparison={group}
              myCards={groupCards[i].myCards}
              opponentCards={groupCards[i].opponentCards}
              mySide={mySide}
            />
          ))}
        </div>
      )}

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
