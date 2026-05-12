import { logger } from './lib/logger'
import { createRealtimeServer } from './server'

const PORT = parseInt(process.env.PORT ?? '8080', 10)
const { httpServer } = createRealtimeServer()

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server running')
})

process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandledRejection')
})
