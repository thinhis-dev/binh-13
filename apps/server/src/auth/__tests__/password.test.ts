import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('password', () => {
  it('hash → verify roundtrip succeeds for the correct password', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('verify fails for the wrong password', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(verifyPassword('wrong password', stored)).toBe(false)
  })

  it('two hashes of the same password differ (random salt)', () => {
    const a = hashPassword('same password')
    const b = hashPassword('same password')
    expect(a).not.toBe(b)
    expect(verifyPassword('same password', a)).toBe(true)
    expect(verifyPassword('same password', b)).toBe(true)
  })

  it('is scrypt-formatted', () => {
    const stored = hashPassword('anything')
    expect(stored.startsWith('scrypt$')).toBe(true)
    expect(stored.split('$')).toHaveLength(6)
  })

  it('verify never throws on a tampered/malformed stored value', () => {
    expect(() => verifyPassword('x', 'not-a-real-hash')).not.toThrow()
    expect(verifyPassword('x', 'not-a-real-hash')).toBe(false)

    expect(() => verifyPassword('x', 'scrypt$bad$part$count')).not.toThrow()
    expect(verifyPassword('x', 'scrypt$bad$part$count')).toBe(false)

    expect(() => verifyPassword('x', '')).not.toThrow()
    expect(verifyPassword('x', '')).toBe(false)

    const stored = hashPassword('real')
    const tampered = `${stored.slice(0, -4)}!!!!`
    expect(() => verifyPassword('real', tampered)).not.toThrow()
  })
})
