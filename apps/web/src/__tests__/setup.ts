import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { vi } from 'vitest'

afterEach(() => {
  cleanup()
})

vi.mock('@/lib/socket', () => ({
  socket: {
    active: false,
    connected: false,
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  ensureSocketConnected: vi.fn(),
}))
