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

run('hook e protezioni', 'node', ['.claude/hooks/self-test.mjs'])
run('skill scope-aware', 'node', [
  '.claude/skills/verify-heemia-change/scripts/verify.mjs',
  '--',
  '.claude',
  '.mcp.json',
  'CLAUDE.md',
])
run('subagent read-only', 'node', ['.claude/agents/self-test.mjs'])
run('TypeScript LSP', 'node', ['.claude/lsp/self-test.mjs'])
run('Playwright MCP WebKit', 'node', ['.claude/mcp/self-test.mjs'])

process.stdout.write('Setup Claude Code Heemia: self-test completo superato\n')
