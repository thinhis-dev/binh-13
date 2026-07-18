import jwt from 'jsonwebtoken'
import { logger } from '../lib/logger'

const TOKEN_EXPIRY = '365d'
const DEV_SECRET_FALLBACK = 'dev-secret'

interface PlayerTokenPayload {
  playerId: number
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    logger.warn('JWT_SECRET is not set — using an insecure development fallback. Set JWT_SECRET in production.')
    return DEV_SECRET_FALLBACK
  }
  return secret
}

export function signPlayerToken(playerId: number): string {
  return jwt.sign({ playerId } satisfies PlayerTokenPayload, getSecret(), { expiresIn: TOKEN_EXPIRY })
}

export function verifyPlayerToken(token: string): number | null {
  if (!token)
    return null

  try {
    const decoded = jwt.verify(token, getSecret())
    if (typeof decoded === 'object' && decoded !== null && typeof (decoded as PlayerTokenPayload).playerId === 'number') {
      return (decoded as PlayerTokenPayload).playerId
    }
    return null
  }
  catch {
    return null
  }
}
