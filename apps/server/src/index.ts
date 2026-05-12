import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { Server as SocketServer } from 'socket.io'
import { initDb } from './db'
import { createAdaptorServer } from '@hono/node-server'
import { registerRoomEvents } from './rooms/roomEvents'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
)

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

// Initialize database
initDb()

// Create HTTP server from Hono app (shared with Socket.io)
const httpServer = createAdaptorServer({ fetch: app.fetch })

const io = new SocketServer(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
} as ConstructorParameters<typeof SocketServer>[1])

registerRoomEvents(io)

const PORT = parseInt(process.env.PORT ?? '8080', 10)

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
