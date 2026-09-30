import { useCallback, useEffect, useState } from 'react'

/** Time between two reveal steps on the result page. */
export const REVEAL_STEP_MS = 5000

/**
 * Reveals `steps` items one at a time, one every REVEAL_STEP_MS. `skip` reveals all of them
 * at once. With `showAll`, everything shows from the start. The timer stops on unmount.
 */
export function useRevealSteps(steps: number, showAll: boolean) {
  const [revealed, setRevealed] = useState(showAll ? steps : 0)
  const done = revealed >= steps

  useEffect(() => {
    if (done)
      return
    const timer = setTimeout(() => setRevealed(count => count + 1), REVEAL_STEP_MS)
    return () => clearTimeout(timer)
  }, [done, revealed])

  const skip = useCallback(() => setRevealed(steps), [steps])

  return { revealed, done, skip }
}
