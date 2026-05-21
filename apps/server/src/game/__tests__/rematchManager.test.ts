import { afterEach, describe, expect, it } from 'vitest'
import {
  addRematchRequest,
  clearRematch,
  getRematchRequests,
  hasRematchRequest,
  isRematchReady,
} from '../rematchManager'

const CODE = 'ROOM01'
const P1 = 1
const P2 = 2

afterEach(() => {
  clearRematch(CODE)
  clearRematch('OTHER1')
})

describe('rematchManager', () => {
  it('addRematchRequest stores playerId for a room', () => {
    addRematchRequest(CODE, P1)
    expect(hasRematchRequest(CODE, P1)).toBe(true)
  })

  it('adding same player twice is idempotent — set size stays 1', () => {
    addRematchRequest(CODE, P1)
    addRematchRequest(CODE, P1)
    expect(getRematchRequests(CODE).size).toBe(1)
  })

  it('isRematchReady returns false with only 1 request', () => {
    addRematchRequest(CODE, P1)
    expect(isRematchReady(CODE, [P1, P2])).toBe(false)
  })

  it('isRematchReady returns true when both players have requested', () => {
    addRematchRequest(CODE, P1)
    addRematchRequest(CODE, P2)
    expect(isRematchReady(CODE, [P1, P2])).toBe(true)
  })

  it('clearRematch removes all requests for a room', () => {
    addRematchRequest(CODE, P1)
    addRematchRequest(CODE, P2)
    clearRematch(CODE)
    expect(getRematchRequests(CODE).size).toBe(0)
    expect(hasRematchRequest(CODE, P1)).toBe(false)
    expect(hasRematchRequest(CODE, P2)).toBe(false)
  })

  it('operations on a non-existent room do not throw', () => {
    const UNKNOWN = 'XXXXXX'
    expect(() => hasRematchRequest(UNKNOWN, P1)).not.toThrow()
    expect(() => isRematchReady(UNKNOWN, [P1, P2])).not.toThrow()
    expect(() => clearRematch(UNKNOWN)).not.toThrow()
    expect(() => getRematchRequests(UNKNOWN)).not.toThrow()
    expect(hasRematchRequest(UNKNOWN, P1)).toBe(false)
    expect(isRematchReady(UNKNOWN, [P1, P2])).toBe(false)
    expect(getRematchRequests(UNKNOWN).size).toBe(0)
  })

  it('tracks multiple rooms independently', () => {
    addRematchRequest(CODE, P1)
    addRematchRequest('OTHER1', P2)

    expect(hasRematchRequest(CODE, P1)).toBe(true)
    expect(hasRematchRequest(CODE, P2)).toBe(false)
    expect(hasRematchRequest('OTHER1', P1)).toBe(false)
    expect(hasRematchRequest('OTHER1', P2)).toBe(true)

    clearRematch(CODE)
    expect(hasRematchRequest('OTHER1', P2)).toBe(true)
  })

  it('getRematchRequests returns empty set for unknown room', () => {
    const result = getRematchRequests('UNKNWN')
    expect(result.size).toBe(0)
  })

  it('isRematchReady returns false for empty room', () => {
    expect(isRematchReady(CODE, [P1, P2])).toBe(false)
  })
})
