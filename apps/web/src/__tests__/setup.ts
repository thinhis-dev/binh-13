import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

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
