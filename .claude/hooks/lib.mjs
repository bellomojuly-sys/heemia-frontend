import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

export async function readHookInput() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  if (!raw.trim()) throw new Error('Input JSON del hook mancante')
  return JSON.parse(raw)
}

export function getProjectRoot(input) {
  const configured = process.env.CLAUDE_PROJECT_DIR?.trim()
  if (configured) return path.resolve(configured)

  const cwd = path.resolve(input.cwd || process.cwd())
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error('Il hook non è stato avviato dentro un repository Git')
  return path.resolve(result.stdout.trim())
}

export function git(root, args, options = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  })
}

function nulList(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label}: ${result.stderr?.trim() || 'comando Git fallito'}`)
  }
  return result.stdout.split('\0').filter(Boolean)
}

export function listDirtyFiles(root) {
  const files = new Set([
    ...nulList(git(root, ['diff', '--name-only', '--no-renames', '-z', '--']), 'git diff'),
    ...nulList(git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z', '--']), 'git diff --cached'),
    ...nulList(git(root, ['ls-files', '--others', '--exclude-standard', '-z']), 'git ls-files'),
  ])
  return [...files].map((file) => file.replaceAll(path.sep, '/')).sort()
}

function fingerprint(root, relativePath) {
  const absolute = path.join(root, relativePath)
  let stat
  try {
    stat = fs.lstatSync(absolute)
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing'
    throw error
  }

  if (stat.isSymbolicLink()) return `symlink:${fs.readlinkSync(absolute)}`
  if (stat.isDirectory()) return `directory:${stat.mode}`
  if (!stat.isFile()) return `other:${stat.mode}:${stat.size}`

  const hash = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
  return `file:${stat.mode}:${stat.size}:${hash}`
}

export function snapshotDirty(root) {
  const files = {}
  for (const relativePath of listDirtyFiles(root)) {
    files[relativePath] = fingerprint(root, relativePath)
  }
  return files
}

export function changedPaths(current, reference = {}) {
  const all = new Set([...Object.keys(current), ...Object.keys(reference)])
  return [...all].filter((file) => current[file] !== reference[file]).sort()
}

export function snapshotSignature(files) {
  const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  return crypto.createHash('sha256').update(JSON.stringify(ordered)).digest('hex')
}

function safeSessionId(input) {
  return String(input.session_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function getStatePath(input) {
  const base = process.env.HEEMIA_HOOK_STATE_DIR?.trim()
    ? path.resolve(process.env.HEEMIA_HOOK_STATE_DIR)
    : path.join(os.tmpdir(), 'heemia-claude-hooks')
  fs.mkdirSync(base, { recursive: true, mode: 0o700 })
  return path.join(base, `${safeSessionId(input)}.json`)
}

export function readState(input) {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(input), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export function writeState(input, state) {
  const statePath = getStatePath(input)
  const temporary = `${statePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, statePath)
  fs.chmodSync(statePath, 0o600)
}

export function loadProjectEnv(root) {
  const environment = { ...process.env }
  const envPath = path.join(root, 'server', '.env')
  if (!fs.existsSync(envPath)) return environment

  try {
    const requireFromServer = createRequire(path.join(root, 'server', 'package.json'))
    const dotenv = requireFromServer('dotenv')
    const parsed = dotenv.parse(fs.readFileSync(envPath))
    for (const [key, value] of Object.entries(parsed)) {
      if (environment[key] === undefined) environment[key] = value
    }
  } catch {
    // Se dotenv o node_modules non sono disponibili, i comandi successivi produrranno
    // un errore esplicito. Il contenuto del file non viene mai stampato.
  }
  return environment
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeout ?? 300_000,
    cwd: options.cwd,
    env: options.env,
  })

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (result.error?.code === 'ETIMEDOUT') {
    return { ok: false, output: `Timeout dopo ${Math.round((options.timeout ?? 300_000) / 1000)} secondi` }
  }
  if (result.error) return { ok: false, output: result.error.message }
  return { ok: result.status === 0, output }
}

export function conciseOutput(output, limit = 3000) {
  const text = String(output || 'Nessun dettaglio prodotto').trim()
  return text.length <= limit ? text : `${text.slice(0, limit)}\n… output troncato`
}

export function isTextFile(absolutePath) {
  let buffer
  try {
    buffer = fs.readFileSync(absolutePath)
  } catch {
    return false
  }
  return !buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0)
}

export function inspectUntrackedText(root, relativePaths) {
  const problems = []
  for (const relativePath of relativePaths) {
    const absolute = path.join(root, relativePath)
    if (!isTextFile(absolute)) continue
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      if (/[ \t]+$/.test(line)) problems.push(`${relativePath}:${index + 1}: spazi finali`)
      if (/^(<{7}|={7}|>{7})(?:\s|$)/.test(line)) problems.push(`${relativePath}:${index + 1}: marcatore di conflitto Git`)
    })
  }
  return problems
}

export async function localPostgresStatus(environment) {
  const raw = environment.DATABASE_URL
  if (!raw) return { available: false, reason: 'DATABASE_URL non disponibile' }

  let url
  try {
    url = new URL(raw)
  } catch {
    return { available: false, reason: 'DATABASE_URL non è un URL valido' }
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (!localHosts.has(url.hostname)) {
    return { available: false, reason: 'DATABASE_URL non punta a PostgreSQL locale: test automatici saltati per sicurezza' }
  }

  const port = Number(url.port || 5432)
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: url.hostname.replace(/^\[|\]$/g, ''), port })
    const finish = (available, reason) => {
      socket.destroy()
      resolve({ available, reason })
    }
    socket.setTimeout(1200)
    socket.once('connect', () => finish(true, 'PostgreSQL locale raggiungibile'))
    socket.once('timeout', () => finish(false, `PostgreSQL locale non risponde sulla porta ${port}`))
    socket.once('error', () => finish(false, `PostgreSQL locale non raggiungibile sulla porta ${port}`))
  })
}
