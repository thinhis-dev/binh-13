import { Buffer } from 'node:buffer'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt')
      return false

    const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts
    const N = Number(nRaw)
    const r = Number(rRaw)
    const p = Number(pRaw)
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p))
      return false

    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    if (salt.length === 0 || expected.length === 0)
      return false

    const actual = scryptSync(password, salt, expected.length, { N, r, p })
    return timingSafeEqual(actual, expected)
  }
  catch {
    return false
  }
}
