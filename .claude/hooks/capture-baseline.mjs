import {
  getProjectRoot,
  readHookInput,
  readState,
  snapshotDirty,
  writeState,
} from './lib.mjs'

try {
  const input = await readHookInput()
  const existing = readState(input)
  const source = input.source || 'startup'

  // Resume e compaction non aprono un nuovo perimetro: conservano l'ultima verifica.
  if (existing && (source === 'resume' || source === 'compact')) process.exit(0)

  const root = getProjectRoot(input)
  const snapshot = snapshotDirty(root)
  writeState(input, {
    version: 1,
    projectRoot: root,
    capturedAt: new Date().toISOString(),
    source,
    baseline: snapshot,
    lastVerified: snapshot,
    lastFailureSignature: null,
  })
} catch (error) {
  process.stdout.write(JSON.stringify({
    systemMessage: `Hook Heemia: impossibile registrare il perimetro iniziale (${error.message}).`,
  }))
}
