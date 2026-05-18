import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'

const socketUrl
  = import.meta.env.VITE_SOCKET_URL
    ?? (import.meta.env.DEV ? 'http://localhost:8080' : '')

export const socket: Socket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket'],
} as Parameters<typeof io>[1])

export function ensureSocketConnected() {
  if (!socket.connected && !socket.active) {
    socket.connect()
  }
}
