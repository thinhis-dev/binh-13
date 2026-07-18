const WINDOW_MS = 60_000
const MAX_ATTEMPTS = 5

const failures = new Map<string, number[]>()

function recentFailures(key: string): number[] {
  const now = Date.now()
  const timestamps = (failures.get(key) ?? []).filter(t => now - t < WINDOW_MS)
  failures.set(key, timestamps)
  return timestamps
}

export function recordFailure(key: string): void {
  const timestamps = recentFailures(key)
  timestamps.push(Date.now())
  failures.set(key, timestamps)
}

export function isRateLimited(key: string): boolean {
  return recentFailures(key).length >= MAX_ATTEMPTS
}

export function resetAttempts(key: string): void {
  failures.delete(key)
}
