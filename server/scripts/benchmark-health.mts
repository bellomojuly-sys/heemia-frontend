// Benchmark locale ripetibile della Fase 19. Attraversa l'intera app Fastify e la query
// PostgreSQL di /health tramite inject, così misura il percorso applicativo senza mescolare
// latenza internet o prestazioni del portatile con quelle di Render.
import { performance } from 'node:perf_hooks'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/core/prisma.js'

const richieste = Number(process.env.BENCHMARK_REQUESTS ?? 200)
const concorrenza = Number(process.env.BENCHMARK_CONCURRENCY ?? 20)
const sogliaP95Ms = Number(process.env.BENCHMARK_MAX_P95_MS ?? 100)

if (!Number.isInteger(richieste) || richieste < 1 || richieste > 250) {
  throw new Error('BENCHMARK_REQUESTS deve essere un intero fra 1 e 250 (il limite globale è 300/minuto).')
}
if (!Number.isInteger(concorrenza) || concorrenza < 1 || concorrenza > richieste) {
  throw new Error('BENCHMARK_CONCURRENCY deve essere un intero fra 1 e BENCHMARK_REQUESTS.')
}
if (!Number.isFinite(sogliaP95Ms) || sogliaP95Ms <= 0) {
  throw new Error('BENCHMARK_MAX_P95_MS deve essere un numero positivo.')
}

const app = await buildApp()
await app.ready()

try {
  // Warm-up: inizializza pool Prisma e plugin Fastify prima della misura.
  for (let i = 0; i < 10; i += 1) {
    const warm = await app.inject({ method: 'GET', url: '/health', remoteAddress: `127.0.1.${i + 1}` })
    if (warm.statusCode !== 200) throw new Error(`Warm-up /health fallito: HTTP ${warm.statusCode}`)
  }

  const durate: number[] = []
  let errori = 0
  let prossimo = 0
  const inizio = performance.now()

  async function worker(indice: number) {
    while (true) {
      const corrente = prossimo
      prossimo += 1
      if (corrente >= richieste) return
      const t0 = performance.now()
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        // Un IP per worker evita che una prova più grande venga confusa col rate limiting,
        // che ha una verifica dedicata nei test HTTP.
        remoteAddress: `127.0.2.${indice + 1}`,
      })
      durate.push(performance.now() - t0)
      if (response.statusCode !== 200) errori += 1
    }
  }

  await Promise.all(Array.from({ length: concorrenza }, (_, i) => worker(i)))
  const totaleMs = performance.now() - inizio
  durate.sort((a, b) => a - b)
  const percentile = (p: number) => durate[Math.min(durate.length - 1, Math.ceil(durate.length * p) - 1)]
  const report = {
    richieste,
    concorrenza,
    errori,
    richiesteAlSecondo: Number((richieste / (totaleMs / 1000)).toFixed(1)),
    mediaMs: Number((durate.reduce((somma, valore) => somma + valore, 0) / durate.length).toFixed(2)),
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    p99Ms: Number(percentile(0.99).toFixed(2)),
    sogliaP95Ms,
  }
  console.log(JSON.stringify(report, null, 2))

  if (errori > 0) throw new Error(`Benchmark fallito: ${errori} risposte non erano HTTP 200.`)
  if (report.p95Ms > sogliaP95Ms) {
    throw new Error(`Benchmark fallito: p95 ${report.p95Ms} ms oltre la soglia ${sogliaP95Ms} ms.`)
  }
} finally {
  await app.close()
  await prisma.$disconnect()
}
