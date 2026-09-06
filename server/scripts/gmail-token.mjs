#!/usr/bin/env node
// Ottiene il refresh token di Gmail e lo scrive in server/.env — Fase 15.1, punto 2.
//
// Perché esiste. Degli otto valori che servono alle integrazioni, sette si copiano da una
// pagina web. Il refresh token no: nasce solo da un consenso dato dall'account aziendale
// dentro il browser, e la procedura manuale (OAuth Playground, redirect URI da registrare,
// codice da scambiare a mano) è il punto in cui ci si perde. Qui la parte tecnica la fa lo
// script: si apre una pagina, si accede con l'account Heemia, si accetta, ed è fatto.
//
//     cd 04_Claude_Code/server && node scripts/gmail-token.mjs
//
// Il token **non viene stampato a schermo**: viene scritto direttamente in `server/.env`.
// Un segreto che compare nel terminale finisce negli screenshot e nella cronologia della
// shell. Per copiarlo su Render si apre il file e si copia quella riga.
//
// Serve un client OAuth di tipo **Applicazione desktop** (Integrazioni_Setup §2): è il solo
// tipo che accetta `http://localhost` come indirizzo di ritorno, che è ciò che permette a
// questo script di ricevere il consenso senza registrare nulla da nessuna parte.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV = path.join(RADICE, '.env')
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const PORTA = 53682

function leggiEnv() {
  if (!fs.existsSync(ENV)) {
    esci(`Non trovo il file ${ENV}.\nDeve esistere prima: è lì che stanno già le altre impostazioni del server.`)
  }
  const valori = {}
  for (const riga of fs.readFileSync(ENV, 'utf8').split('\n')) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) valori[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return valori
}

/** Scrive (o sostituisce) una riga di .env, conservando tutto il resto del file. */
function scriviEnv(nome, valore) {
  const testo = fs.readFileSync(ENV, 'utf8')
  const righe = testo.split('\n')
  const i = righe.findIndex((r) => new RegExp(`^\\s*${nome}\\s*=`).test(r))
  if (i >= 0) righe[i] = `${nome}=${valore}`
  else righe.push(`${nome}=${valore}`)
  fs.copyFileSync(ENV, `${ENV}.backup`)
  fs.writeFileSync(ENV, righe.join('\n'))
}

function esci(messaggio) {
  console.error(`\n✖ ${messaggio}\n`)
  process.exit(1)
}

const env = leggiEnv()
const clientId = env.GOOGLE_CLIENT_ID
const clientSecret = env.GOOGLE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  esci(
    'In server/.env mancano GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.\n' +
      'Vanno compilati prima: sono i due valori che Google mostra quando si crea il client OAuth\n' +
      '(procedura in 03_Technical_Specification/Integrazioni_Setup.md §2, punti 1-5).',
  )
}

const redirect = `http://localhost:${PORTA}`
// `state` casuale: se arrivasse una risposta che non porta questo valore, non è la nostra.
const state = crypto.randomBytes(16).toString('hex')
const url =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPE,
    // `offline` è ciò che fa nascere il refresh token; `consent` obbliga Google a
    // restituirlo anche se l'account aveva già autorizzato l'app in passato — senza,
    // la seconda volta tornerebbe solo un accesso temporaneo e lo script fallirebbe.
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

const pagina = (titolo, testo) =>
  `<!doctype html><meta charset="utf-8"><title>${titolo}</title>` +
  `<body style="font-family:system-ui;max-width:34rem;margin:6rem auto;line-height:1.6">` +
  `<h1 style="font-size:1.25rem">${titolo}</h1><p>${testo}</p></body>`

const server = http.createServer(async (req, res) => {
  const richiesta = new URL(req.url, redirect)
  if (richiesta.pathname !== '/') {
    res.writeHead(404).end()
    return
  }
  const codice = richiesta.searchParams.get('code')
  const errore = richiesta.searchParams.get('error')

  if (errore || !codice) {
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
    res.end(pagina('Autorizzazione non completata', `Google ha risposto: <code>${errore ?? 'nessun codice'}</code>. Puoi chiudere questa pagina e rilanciare lo script.`))
    server.close()
    esci(`Autorizzazione non completata (${errore ?? 'nessun codice ricevuto'}). Nulla è stato scritto.`)
  }
  if (richiesta.searchParams.get('state') !== state) {
    res.writeHead(400).end()
    server.close()
    esci('La risposta ricevuta non corrisponde alla richiesta partita da questo script: nulla è stato scritto.')
  }

  // Scambio del codice con i token veri. Da qui in poi non si stampa più niente di sensibile.
  const risposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codice,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  }).catch((e) => esci(`Non riesco a contattare Google: ${e.message}`))

  const dati = await risposta.json()
  if (!risposta.ok || !dati.refresh_token) {
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' })
    res.end(pagina('Qualcosa non ha funzionato', 'Torna al terminale: c&#39;è scritto cosa è andato storto.'))
    server.close()
    esci(
      dati.refresh_token === undefined && risposta.ok
        ? 'Google non ha restituito il refresh token. Succede quando l\'account aveva già autorizzato questa app:\n' +
            'vai su https://myaccount.google.com/permissions, rimuovi l\'app dall\'elenco e rilancia lo script.'
        : `Google ha rifiutato lo scambio: ${dati.error_description ?? dati.error ?? risposta.status}.\n` +
            'Controlla che GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET in server/.env siano quelli del client OAuth\n' +
            'di tipo "Applicazione desktop".',
    )
  }

  scriviEnv('GOOGLE_REFRESH_TOKEN', dati.refresh_token)
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(pagina('Fatto ✓', 'Il collegamento con Gmail è attivo. Puoi chiudere questa pagina e tornare al terminale.'))
  server.close()

  console.log('\n✓ Refresh token ottenuto e scritto in server/.env (riga GOOGLE_REFRESH_TOKEN).')
  console.log('  Non è stato stampato qui apposta: è un segreto, e il terminale si conserva.')
  console.log('  Copia di sicurezza del file precedente: server/.env.backup\n')
  console.log('Restano due cose:')
  console.log('  1. riavviare il server di sviluppo, se è acceso (non rilegge .env da solo);')
  console.log('  2. copiare la stessa riga nelle variabili di Render, servizio heemia-api,')
  console.log('     altrimenti l\'invio funziona solo in locale e non nell\'app che usate.\n')
})

server.listen(PORTA, () => {
  console.log('\nSto per aprire il browser sulla pagina di consenso di Google.')
  console.log('Accedi con l\'account aziendale Heemia e premi "Continua".\n')
  console.log('Se compare "Google non ha verificato questa app": è previsto — è la vostra app,')
  console.log('usata solo da voi. Premi "Avanzate" e poi "Apri Heemia (non sicuro)".\n')
  console.log('Se il browser non si apre da solo, incolla questo indirizzo:\n')
  console.log(url + '\n')
  spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
})

// Se nessuno completa il consenso, lo script non resta acceso per sempre.
setTimeout(() => {
  console.error('\n✖ Nessuna risposta entro 5 minuti. Nulla è stato scritto: rilancia quando vuoi.\n')
  server.close()
  process.exit(1)
}, 5 * 60_000).unref()
