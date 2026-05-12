import { afterEach, describe, expect, it, vi } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV
const originalLogLevel = process.env.LOG_LEVEL

describe('logger', () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv

    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL
    } else {
      process.env.LOG_LEVEL = originalLogLevel
    }

    vi.resetModules()
  })

  it('uses the development default outside production', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.LOG_LEVEL
    vi.resetModules()

    const { logger } = await import('../logger')

    expect(logger.level).toBe('debug')
  })

  it('defaults to development when NODE_ENV is unset', async () => {
    delete process.env.NODE_ENV
    delete process.env.LOG_LEVEL
    vi.resetModules()

    const { logger } = await import('../logger')

    expect(logger.level).toBe('debug')
  })

  it('uses the production default and honors an explicit log level', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'warn'
    vi.resetModules()

    const { logger, createChildLogger } = await import('../logger')

    expect(logger.level).toBe('warn')
    expect(createChildLogger({ roomCode: 'ABC123' })).toBeDefined()
  })

  it('falls back to info in production without an override', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.LOG_LEVEL
    vi.resetModules()

    const { logger } = await import('../logger')

    expect(logger.level).toBe('info')
  })
})
