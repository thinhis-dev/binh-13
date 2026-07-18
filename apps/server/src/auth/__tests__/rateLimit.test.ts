import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRateLimited, recordFailure, resetAttempts } from '../rateLimit'

describe('rateLimit', () => {
  const key = 'ip-127.0.0.1:username-alice'

  beforeEach(() => {
    vi.useFakeTimers()
    resetAttempts(key)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to 5 failures within the window', () => {
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key)).toBe(false)
      recordFailure(key)
    }
  })

  it('blocks the 6th failure within 60s', () => {
    for (let i = 0; i < 5; i++)
      recordFailure(key)

    expect(isRateLimited(key)).toBe(true)
  })

  it('unblocks after the 60s window passes', () => {
    for (let i = 0; i < 5; i++)
      recordFailure(key)
    expect(isRateLimited(key)).toBe(true)

    vi.advanceTimersByTime(60_001)

    expect(isRateLimited(key)).toBe(false)
  })

  it('tracks different keys independently', () => {
    for (let i = 0; i < 5; i++)
      recordFailure(key)
    expect(isRateLimited(key)).toBe(true)
    expect(isRateLimited('a-different-key')).toBe(false)
  })

  it('resetAttempts clears the counter', () => {
    for (let i = 0; i < 5; i++)
      recordFailure(key)
    expect(isRateLimited(key)).toBe(true)

    resetAttempts(key)

    expect(isRateLimited(key)).toBe(false)
  })
})
