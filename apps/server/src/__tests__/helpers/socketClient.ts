import { io, type Socket } from 'socket.io-client'

export function createSocketClient(port: number): Socket {
  return io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  })
}

export function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 2_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handleEvent)
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeoutMs)

    function handleEvent(payload: T) {
      clearTimeout(timer)
      socket.off(event, handleEvent)
      resolve(payload)
    }

    socket.on(event, handleEvent)
  })
}
