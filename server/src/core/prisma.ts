import { PrismaClient } from '@prisma/client'

// Client Prisma unico riusato in tutta l'app (evita di aprire troppe connessioni).
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})
