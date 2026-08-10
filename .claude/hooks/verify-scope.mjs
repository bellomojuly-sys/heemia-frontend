import {
  changedPaths,
  getProjectRoot,
  readHookInput,
  readState,
  snapshotDirty,
  snapshotSignature,
  writeState,
} from './lib.mjs'
import { formatFailures, verifyFiles } from './verification.mjs'

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
}

try {
  const input = await readHookInput()
  const root = getProjectRoot(input)
  const state = readState(input) || {
    version: 1,
    projectRoot: root,
    baseline: {},
    lastVerified: {},
    lastFailureSignature: null,
  }
  const current = snapshotDirty(root)
  const reference = state.lastVerified || state.baseline || {}
  const changed = changedPaths(current, reference)
  if (changed.length === 0) process.exit(0)

  const signature = snapshotSignature(current)
  if (input.stop_hook_active && state.lastFailureSignature === signature) {
    process.stdout.write(JSON.stringify({
      systemMessage: 'Hook Heemia: i controlli automatici risultano ancora falliti e il worktree non è cambiato. La sessione viene lasciata terminare per evitare un ciclo infinito; il limite deve essere dichiarato nel riepilogo.',
    }))
    process.exit(0)
  }

  const result = await verifyFiles(root, changed)

  if (!result.allRequiredPassed) {
    state.lastFailureSignature = signature
    state.lastFailureAt = new Date().toISOString()
    writeState(input, state)
    const failures = formatFailures(result)
    block(`Controlli automatici Heemia falliti sui file cambiati dall'ultimo controllo:\n\n${failures}`)
    process.exit(0)
  }

  state.lastVerified = current
  state.lastVerifiedAt = new Date().toISOString()
  state.lastFailureSignature = null
  writeState(input, state)

  if (result.warnings.length > 0) {
    process.stdout.write(JSON.stringify({
      systemMessage: `Hook Heemia: controlli statici superati, ma ${result.warnings.join('; ')}. I test database non sono stati dichiarati superati.`,
    }))
  }
} catch (error) {
  block(`Hook di verifica Heemia non eseguibile: ${error.message}`)
}
