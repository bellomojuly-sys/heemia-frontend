import { buildApp } from './app.js'
import { config } from './core/config.js'
import { prisma } from './core/prisma.js'

async function main() {
  const app = await buildApp()
  const close = async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGINT', close)
  process.on('SIGTERM', close)

  await app.listen({ port: config.port, host: '0.0.0.0' })
  app.log.info(`Heemia API in ascolto su ${config.appBaseUrl}`)
}

main().catch((err) => {
  console.error('Avvio backend fallito:', err)
  process.exit(1)
})
