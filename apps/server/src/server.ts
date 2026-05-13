import { createAdaptorServer } from '@hono/node-server'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { Server as SocketServer } from 'socket.io'
import { initDb } from './db'
import { logger } from './lib/logger'
import { registerRoomEvents } from './rooms/roomEvents'
import { registerGameEvents } from './game/gameEvents'

export function createRealtimeServer() {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: 'http://localhost:5173',
      credentials: true,
    }),
  )

  app.use('*', async (c, next) => {
    const startedAt = Date.now()
    await next()

    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - startedAt,
      },
      'http',
    )
  })

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  )

  initDb()

  const httpServer = createAdaptorServer({ fetch: app.fetch })
  const io = new SocketServer(httpServer, {
    cors: {
      origin: 'http://localhost:5173',
      credentials: true,
    },
  } as ConstructorParameters<typeof SocketServer>[1])

  registerRoomEvents(io)
  registerGameEvents(io)

  return { app, httpServer, io }
}
