import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  changedPaths,
  getProjectRoot,
  listDirtyFiles,
  readState,
  snapshotDirty,
} from '../../../hooks/lib.mjs'
import { formatReport, verifyFiles } from '../../../hooks/verification.mjs'

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`)
  process.stderr.write('Uso: node verify.mjs --session <id> -- [file o directory ...]\n')
  process.exit(2)
}

function parseArguments(argv) {
  const separator = argv.indexOf('--')
  const options = separator === -1 ? argv : argv.slice(0, separator)
  const paths = separator === -1 ? [] : argv.slice(separator + 1)
  let sessionId = null
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] !== '--session' || !options[index + 1]) usage(`Argomento non riconosciuto: ${options[index]}`)
    sessionId = options[index + 1]
    index += 1
  }
  return { paths, sessionId }
}

function normalizeScope(root, requested, dirty) {
  const selected = new Set()
  for (const item of requested) {
    const absolute = path.resolve(root, item)
    const relative = path.relative(root, absolute).replaceAll(path.sep, '/')
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
      usage(`Percorso fuori dal repository o non valido: ${item}`)
    }
    const matches = dirty.filter((file) => file === relative || file.startsWith(`${relative.replace(/\/$/, '')}/`))
    if (matches.length === 0) usage(`Il percorso non contiene modifiche Git correnti: ${item}`)
    matches.forEach((file) => selected.add(file))
  }
  return [...selected].sort()
}

const scriptPath = fileURLToPath(import.meta.url)
const fallbackRoot = path.resolve(path.dirname(scriptPath), '..', '..', '..', '..')
const root = getProjectRoot({ cwd: process.env.CLAUDE_PROJECT_DIR || fallbackRoot })
const { paths: requestedPaths, sessionId } = parseArguments(process.argv.slice(2))
const dirty = listDirtyFiles(root)

let files
if (requestedPaths.length > 0) {
  files = normalizeScope(root, requestedPaths, dirty)
} else {
  if (!sessionId) usage('Nessun percorso e nessuna sessione specificati')
  const state = readState({ session_id: sessionId })
  if (!state || path.resolve(state.projectRoot) !== root) {
    usage('Baseline della sessione non disponibile: specificare uno o più percorsi')
  }
  const current = snapshotDirty(root)
  files = changedPaths(current, state.lastVerified || state.baseline || {})
  if (files.length === 0) {
    process.stdout.write('Nessuna modifica successiva all’ultima baseline/verifica.\n')
    process.exit(0)
  }
}

const result = await verifyFiles(root, files)
process.stdout.write(`${formatReport(result)}\n`)
process.exit(result.allRequiredPassed ? 0 : 1)
