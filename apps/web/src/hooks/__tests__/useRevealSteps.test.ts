import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVEAL_STEP_MS, useRevealSteps } from '../useRevealSteps'

describe('useRevealSteps', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reveals one step every REVEAL_STEP_MS until all steps show', () => {
    const { result } = renderHook(() => useRevealSteps(3, false))
    expect(result.current.revealed).toBe(0)
    expect(result.current.done).toBe(false)

    act(() => vi.advanceTimersByTime(REVEAL_STEP_MS - 1))
    expect(result.current.revealed).toBe(0)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.revealed).toBe(1)
    act(() => vi.advanceTimersByTime(REVEAL_STEP_MS))
    expect(result.current.revealed).toBe(2)
    act(() => vi.advanceTimersByTime(REVEAL_STEP_MS))
    expect(result.current.revealed).toBe(3)
    expect(result.current.done).toBe(true)

    act(() => vi.advanceTimersByTime(REVEAL_STEP_MS * 3))
    expect(result.current.revealed).toBe(3)
  })

  it('skip reveals everything at once', () => {
    const { result } = renderHook(() => useRevealSteps(3, false))

    act(() => result.current.skip())

    expect(result.current.revealed).toBe(3)
    expect(result.current.done).toBe(true)
  })

  it('starts fully revealed when showAll is true', () => {
    const { result } = renderHook(() => useRevealSteps(3, true))

    expect(result.current.revealed).toBe(3)
    expect(result.current.done).toBe(true)
  })

  it('runs no timer after unmount', () => {
    const { unmount } = renderHook(() => useRevealSteps(3, false))
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
