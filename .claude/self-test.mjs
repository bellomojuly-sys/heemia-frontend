import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    encoding: 'utf8',
    timeout: 180_000,
  })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  assert.equal(result.status, 0, `${label} fallito:\n${output || result.error?.message}`)
  process.stdout.write(`PASS  ${label}${output ? `\n${output}\n` : '\n'}`)
}

const settings = JSON.parse(fs.readFileSync(path.join(projectRoot, '.claude', 'settings.json'), 'utf8'))
const mcp = JSON.parse(fs.readFileSync(path.join(projectRoot, '.mcp.json'), 'utf8'))
assert.equal(settings.enabledPlugins?.['typescript-lsp@claude-plugins-official'], true)
assert.equal(mcp.mcpServers?.['github-readonly']?.headers?.['X-MCP-Readonly'], 'true')
process.stdout.write('PASS  configurazioni JSON e vincoli principali\n')

function runExpectingRefusal(label, command, args, expected) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    encoding: 'utf8',
    timeout: 180_000,
  })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  assert.equal(result.status, 2, `${label}: atteso un rifiuto, ottenuto stato ${result.status}\n${output}`)
  assert.match(output, expected, `${label}: rifiuto senza il messaggio atteso\n${output}`)
  process.stdout.write(`PASS  ${label}\n`)
}

run('hook e protezioni', 'node', ['.claude/hooks/self-test.mjs'])

// Che la skill verifichi davvero lo scope richiesto lo dimostra `hooks/self-test.mjs`, che
// si crea una modifica temporanea e controlla entrambe le direzioni. Qui resta il caso che
// non dipende dal worktree: senza percorsi e senza baseline la skill si ferma e lo dice,
// invece di verificare a caso tutto il dirty tree.
runExpectingRefusal(
  'skill scope-aware',
  'node',
  ['.claude/skills/verify-heemia-change/scripts/verify.mjs'],
  /Nessun percorso e nessuna sessione specificati/,
)
runExpectingRefusal(
  'skill scope-aware: baseline assente',
  'node',
  ['.claude/skills/verify-heemia-change/scripts/verify.mjs', '--session', 'sessione-inesistente-self-test'],
  /Baseline della sessione non disponibile/,
)
run('subagent read-only', 'node', ['.claude/agents/self-test.mjs'])
run('TypeScript LSP', 'node', ['.claude/lsp/self-test.mjs'])
run('Playwright MCP WebKit', 'node', ['.claude/mcp/self-test.mjs'])

process.stdout.write('Setup Claude Code Heemia: self-test completo superato\n')
