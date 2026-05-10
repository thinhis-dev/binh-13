import { createAdaptorServer } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Server as SocketServer } from 'socket.io'
import { initDb } from './db'

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
})

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

const PORT = parseInt(process.env.PORT ?? '8080', 10)

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
