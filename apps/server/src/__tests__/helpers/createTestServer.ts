import type { AddressInfo } from 'node:net'
import { closeDb } from '../../db'
import { createRealtimeServer } from '../../server'

export async function createTestServer() {
  const { httpServer, io } = createRealtimeServer()

  await new Promise<void>((resolve) => {
    httpServer.listen(0, resolve)
  })

  const address = httpServer.address() as AddressInfo

  return {
    port: address.port,
    async closeServer() {
      await new Promise<void>((resolve) => {
        io.close(() => resolve())
      })

      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error)
              return
            }

            resolve()
          })
        })
      }

      closeDb()
    },
  }
}
