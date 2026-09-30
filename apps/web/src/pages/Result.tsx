import { INSTANT_WIN_NAME } from '@binh-13/shared'
import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ResultGroupDisplay } from '@/components/game/ResultGroupDisplay'
import { Button } from '@/components/ui/button'
import { useRevealSteps } from '@/hooks/useRevealSteps'
import { useSocket } from '@/hooks/useSocket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

type PlayerSide = 'p1' | 'p2'

const GROUP_LABELS = ['Back (5)', 'Middle (5)', 'Front (3)'] as const

/** The reveal shows Front (index 2) first, then Middle (1), then Back (0). */
function isGroupRevealed(groupIndex: number, revealedSteps: number) {
  return revealedSteps >= GROUP_LABELS.length - groupIndex
}

export default function Result() {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()
  const result = useGameStore(s => s.result)
  const hand = useGameStore(s => s.hand)
  const playerId = useSessionStore(s => s.playerId)
  const rematchRequested = useGameStore(s => s.rematchRequested)
  const rematchOpponentRequested = useGameStore(s => s.rematchOpponentRequested)
  const rematchCancelledReason = useGameStore(s => s.rematchCancelledReason)
  const setRematchRequested = useGameStore(s => s.setRematchRequested)
  const setRematchCancelledReason = useGameStore(s => s.setRematchCancelledReason)
  const { leaveRoom, requestRematch, declineRematch } = useSocket()
  const reset = useGameStore(s => s.reset)
  // A surrender or an instant win decides the round without the rows, so it shows at once.
  const showAtOnce = Boolean(result?.surrendered || result?.p1InstantWin || result?.p2InstantWin)
  const { revealed, done: revealDone, skip: skipReveal } = useRevealSteps(GROUP_LABELS.length, showAtOnce)

  const mySide: PlayerSide = useMemo(
    () => (result?.arrangements.p1.playerId === playerId ? 'p1' : 'p2'),
    [result, playerId],
  )
  const opponentSide: PlayerSide = mySide === 'p1' ? 'p2' : 'p1'

  const didWin = result?.winner === mySide
  const isDraw = result?.winner === 'draw'
  const isFoul = mySide === 'p1' ? result?.p1Foul : result?.p2Foul
  const opponentFoul = opponentSide === 'p1' ? result?.p1Foul : result?.p2Foul
  // Results stored before instant wins existed have no such field, so ?? null.
  const myInstantWin = (mySide === 'p1' ? result?.p1InstantWin : result?.p2InstantWin) ?? null
  const opponentInstantWin = (opponentSide === 'p1' ? result?.p1InstantWin : result?.p2InstantWin) ?? null

  // When a new game starts after rematch (reset clears result, then GAME_DEALT sets hand),
  // navigate to the game page.
  useEffect(() => {
    if (hand.length > 0 && !result) {
      navigate(`/room/${code}/game`, { replace: true })
    }
  }, [hand, result, navigate, code])

  const handleRematch = useCallback(() => {
    if (!playerId || !code)
      return
    setRematchRequested(true)
    setRematchCancelledReason(null)
    requestRematch(playerId, code)
  }, [playerId, code, requestRematch, setRematchRequested, setRematchCancelledReason])

  const handleAcceptRematch = useCallback(() => {
    if (!playerId || !code)
      return
    setRematchRequested(true)
    setRematchCancelledReason(null)
    requestRematch(playerId, code)
  }, [playerId, code, requestRematch, setRematchRequested, setRematchCancelledReason])

  const handleDeclineRematch = useCallback(() => {
    if (!playerId || !code)
      return
    declineRematch(playerId, code)
  }, [playerId, code, declineRematch])

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

  // The running score counts the revealed rows. After the last step it is the final score.
  const revealedGroups = groups.filter((_, i) => isGroupRevealed(i, revealed))
  const myScore = revealDone
    ? (mySide === 'p1' ? result.p1Score : result.p2Score)
    : revealedGroups.filter(group => group.result === mySide).length
  const opponentScore = revealDone
    ? (opponentSide === 'p1' ? result.p1Score : result.p2Score)
    : revealedGroups.filter(group => group.result === opponentSide).length

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

  const opponentLeft
    = rematchCancelledReason === 'left' || rematchCancelledReason === 'disconnected'

  return (
    <div data-testid="round-result" className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 p-4">
      {/* Winner / Loser banner, after the last reveal step */}
      {!revealDone && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Revealing the rows: Front, Middle, Back…</p>
          <Button size="sm" variant="outline" onClick={skipReveal}>
            Skip
          </Button>
        </div>
      )}
      {revealDone && (
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

          {myInstantWin && (
            <p className="mt-1 text-sm font-semibold text-amber-700">
              {`${INSTANT_WIN_NAME[myInstantWin]}: instant win`}
            </p>
          )}
          {opponentInstantWin && (
            <p className="mt-1 text-sm font-semibold text-amber-700">
              {`Opponent ${INSTANT_WIN_NAME[opponentInstantWin]}: instant win`}
            </p>
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
      )}

      {/* Score summary */}
      <div className="flex items-center gap-4 rounded-lg bg-muted/50 px-6 py-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">You</p>
          <p data-testid="my-score" className="text-2xl font-bold">
            {myScore}
          </p>
        </div>
        <span className="text-muted-foreground">—</span>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Opponent</p>
          <p data-testid="opponent-score" className="text-2xl font-bold">
            {opponentScore}
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
              revealed={isGroupRevealed(i, revealed)}
            />
          ))}
        </div>
      )}

      {/* Rematch cancellation notice */}
      {rematchCancelledReason && (
        <p
          data-testid="rematch-cancelled-notice"
          className="rounded-md bg-yellow-50 px-4 py-2 text-sm text-yellow-800"
        >
          {rematchCancelledReason === 'declined'
            ? 'Opponent declined rematch'
            : 'Opponent left the room'}
        </p>
      )}

      {/* Opponent wants rematch banner */}
      {rematchOpponentRequested && !rematchRequested && (
        <div
          data-testid="rematch-opponent-banner"
          className="flex w-full flex-col items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
        >
          <p className="text-sm font-medium text-blue-800">
            Opponent wants a rematch!
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAcceptRematch}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={handleDeclineRematch}>
              Decline
            </Button>
          </div>
        </div>
      )}

      {/* Rematch / Leave */}
      <div className="flex gap-3">
        {!opponentLeft && !rematchOpponentRequested && (
          rematchRequested
            ? (
                <Button disabled aria-label="Waiting for opponent">
                  Waiting for opponent…
                </Button>
              )
            : (
                <Button onClick={handleRematch}>Rematch</Button>
              )
        )}
        <Button variant="outline" onClick={handleLeave}>
          Leave
        </Button>
      </div>
    </div>
  )
}
