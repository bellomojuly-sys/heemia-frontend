import path from 'node:path'
import { getProjectRoot, git, readHookInput } from './lib.mjs'

const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
])

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }))
}

function relativeInside(root, filePath) {
  const absolute = path.resolve(filePath)
  const relative = path.relative(root, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative.replaceAll(path.sep, '/')
}

function trackedMigration(root, relativePath) {
  if (!/^server\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(relativePath)) return false
  return git(root, ['ls-files', '--error-unmatch', '--', relativePath]).status === 0
}

function pathReason(root, relativePath) {
  const segments = relativePath.split('/')
  const basename = segments.at(-1)

  if (segments.includes('.git')) return 'Modifica bloccata: i file interni di .git non si editano direttamente.'
  if (/^\.env(?:\.|$)/.test(basename) && !/^\.env(?:\.[^.]+)*\.example$/.test(basename) && basename !== '.env.example') {
    return 'Modifica bloccata: i file .env possono contenere credenziali. Usa il pannello Render o un intervento locale esplicito di Giulia.'
  }
  if (LOCKFILES.has(basename)) {
    return `Modifica bloccata: ${basename} deve cambiare solo attraverso il package manager.`
  }
  if (relativePath === 'server/prisma/migrations/migration_lock.toml') {
    return 'Modifica bloccata: migration_lock.toml è gestito da Prisma.'
  }
  if (trackedMigration(root, relativePath)) {
    return 'Modifica bloccata: una migrazione Prisma già versionata non si riscrive. Crea una nuova migrazione correttiva.'
  }
  return null
}

function looksMutating(command) {
  return /(?:^|[;&|]\s*)(?:rm|mv|cp|install|truncate|touch|chmod|chown)\b|\bsed\s+-i\b|\bperl\s+-pi\b|(?:^|[^<])>{1,2}|\btee\b/i.test(command)
}

function bashReason(root, command) {
  if (!looksMutating(command)) return null

  if (/(?:^|[\s'"/])\.git(?:\/|[\s'"]|$)/.test(command)) {
    return 'Comando bloccato: non modificare direttamente la directory .git.'
  }

  const withoutExamples = command.replaceAll('.env.example', '')
  if (/(?:^|[\s'"/])\.env(?:\.[\w-]+)?(?:[\s'"/]|$)/.test(withoutExamples)) {
    return 'Comando bloccato: non scrivere file .env tramite Bash.'
  }

  for (const lockfile of LOCKFILES) {
    if (command.includes(lockfile)) {
      return `Comando bloccato: ${lockfile} deve cambiare solo attraverso il package manager.`
    }
  }

  const tracked = git(root, ['ls-files', 'server/prisma/migrations/*/migration.sql'])
  if (tracked.status === 0) {
    for (const migration of tracked.stdout.split('\n').filter(Boolean)) {
      const directory = path.posix.dirname(migration)
      if (command.includes(migration) || command.includes(directory)) {
        return 'Comando bloccato: non riscrivere o rimuovere una migrazione Prisma già versionata.'
      }
    }
  }
  return null
}

try {
  const input = await readHookInput()
  const root = getProjectRoot(input)
  let reason = null

  if (input.tool_name === 'Edit' || input.tool_name === 'Write') {
    const relativePath = relativeInside(root, input.tool_input?.file_path || '')
    if (relativePath) reason = pathReason(root, relativePath)
  } else if (input.tool_name === 'Bash') {
    reason = bashReason(root, String(input.tool_input?.command || ''))
  }

  if (reason) deny(reason)
} catch (error) {
  process.stderr.write(`Protezione file Heemia non eseguibile: ${error.message}\n`)
  process.exit(2)
}
