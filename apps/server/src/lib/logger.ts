import pino from 'pino'

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProduction = nodeEnv === 'production'
const shouldPrettyPrint = !isProduction && nodeEnv !== 'test'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  ...(shouldPrettyPrint && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
})

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context)
}
