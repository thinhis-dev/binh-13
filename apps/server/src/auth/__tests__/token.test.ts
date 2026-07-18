import { Buffer } from 'node:buffer'
import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signPlayerToken, verifyPlayerToken } from '../token'

describe('token', () => {
  const originalSecret = process.env.JWT_SECRET

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret'
  })

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret
  })

  it('signs a token and verifies it back to the same playerId', () => {
    const token = signPlayerToken(42)
    expect(verifyPlayerToken(token)).toBe(42)
  })

  it('rejects a tampered payload', () => {
    const token = signPlayerToken(1)
    const [header, , signature] = token.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ playerId: 999 })).toString('base64url')
    const tampered = `${header}.${forgedPayload}.${signature}`

    expect(verifyPlayerToken(tampered)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const foreignToken = jwt.sign({ playerId: 7 }, 'a-different-secret', { expiresIn: '365d' })
    expect(verifyPlayerToken(foreignToken)).toBeNull()
  })

  it('rejects a malformed string', () => {
    expect(verifyPlayerToken('not-a-jwt-at-all')).toBeNull()
    expect(verifyPlayerToken('')).toBeNull()
  })

  it('rejects an expired token', () => {
    const expired = jwt.sign({ playerId: 3 }, 'test-secret', { expiresIn: '-1s' })
    expect(verifyPlayerToken(expired)).toBeNull()
  })

  it('never throws, even on garbage input', () => {
    expect(() => verifyPlayerToken(undefined as unknown as string)).not.toThrow()
    expect(() => verifyPlayerToken(null as unknown as string)).not.toThrow()
    expect(verifyPlayerToken(undefined as unknown as string)).toBeNull()
  })
})
