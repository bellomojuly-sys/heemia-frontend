import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { classifyFiles } from './verification.mjs'

const hooksDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(hooksDir, '..', '..')
const protectScript = path.join(hooksDir, 'protect-files.mjs')
const verifySkillScript = path.join(projectRoot, '.claude', 'skills', 'verify-heemia-change', 'scripts', 'verify.mjs')

function invoke(script, input, extraEnv = {}) {
  const result = spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot, ...extraEnv },
    input: JSON.stringify({
      session_id: 'heemia-hook-self-test',
      cwd: projectRoot,
      permission_mode: 'default',
      ...input,
    }),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || `Hook terminato con stato ${result.status}`)
  return result.stdout.trim()
}

function expectDenied(name, input) {
  const output = invoke(protectScript, input)
  assert.ok(output, `${name}: il hook non ha prodotto una decisione`)
  const parsed = JSON.parse(output)
  assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'deny', `${name}: scrittura non bloccata`)
}

function expectAllowed(name, input) {
  assert.equal(invoke(protectScript, input), '', `${name}: operazione sicura bloccata`)
}

expectDenied('server/.env', {
  tool_name: 'Write',
  tool_input: { file_path: path.join(projectRoot, 'server', '.env'), content: 'secret' },
})
expectAllowed('.env.example', {
  tool_name: 'Edit',
  tool_input: { file_path: path.join(projectRoot, '.env.example'), old_string: 'A', new_string: 'B' },
})
expectDenied('package-lock diretto', {
  tool_name: 'Edit',
  tool_input: { file_path: path.join(projectRoot, 'package-lock.json'), old_string: 'A', new_string: 'B' },
})
expectDenied('migrazione versionata', {
  tool_name: 'Edit',
  tool_input: {
    file_path: path.join(projectRoot, 'server', 'prisma', 'migrations', '20260722204300_init', 'migration.sql'),
    old_string: 'A',
    new_string: 'B',
  },
})
expectAllowed('migrazione nuova', {
  tool_name: 'Write',
  tool_input: {
    file_path: path.join(projectRoot, 'server', 'prisma', 'migrations', '20990101000000_test', 'migration.sql'),
    content: '-- nuova',
  },
})
expectAllowed('package manager', {
  tool_name: 'Bash',
  tool_input: { command: 'npm install zod' },
})
expectAllowed('lettura env', {
  tool_name: 'Bash',
  tool_input: { command: 'sed -n 1,20p server/.env' },
})
expectDenied('scrittura env Bash', {
  tool_name: 'Bash',
  tool_input: { command: 'printf secret > server/.env' },
})
expectDenied('migrazione versionata Bash', {
  tool_name: 'Bash',
  tool_input: { command: "sed -i '' 's/old/new/' server/prisma/migrations/20260722204300_init/migration.sql" },
})

const settings = JSON.parse(fs.readFileSync(path.join(projectRoot, '.claude', 'settings.json'), 'utf8'))
assert.ok(settings.hooks?.SessionStart)
assert.ok(settings.hooks?.PreToolUse)
assert.ok(settings.hooks?.Stop)

assert.deepEqual(classifyFiles(['src/App.tsx']), { frontend: true, backend: false, prisma: false })
assert.deepEqual(classifyFiles(['server/src/app.ts']), { frontend: false, backend: true, prisma: false })
assert.deepEqual(classifyFiles(['server/prisma/schema.prisma']), { frontend: false, backend: false, prisma: true })

for (const skillName of ['verify-heemia-change', 'render-deploy-check']) {
  const skill = fs.readFileSync(path.join(projectRoot, '.claude', 'skills', skillName, 'SKILL.md'), 'utf8')
  assert.match(skill, /^---\n[\s\S]*?disable-model-invocation: true\n---\n/)
}

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heemia-hook-self-test-'))
try {
  const hookEnv = { HEEMIA_HOOK_STATE_DIR: stateDir }
  const sessionInput = {
    hook_event_name: 'SessionStart',
    source: 'startup',
  }
  assert.equal(invoke(path.join(hooksDir, 'capture-baseline.mjs'), sessionInput, hookEnv), '')
  assert.equal(invoke(path.join(hooksDir, 'verify-scope.mjs'), {
    hook_event_name: 'Stop',
    stop_hook_active: false,
  }, hookEnv), '')
} finally {
  fs.rmSync(stateDir, { recursive: true, force: true })
}

const manualVerification = spawnSync(process.execPath, [verifySkillScript, '--', '.claude', 'CLAUDE.md'], {
  cwd: projectRoot,
  env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
  encoding: 'utf8',
})
assert.equal(manualVerification.status, 0, manualVerification.stderr || manualVerification.stdout)
assert.match(manualVerification.stdout, /Scope: documentazione\/configurazione/)

console.log('Hook Heemia: self-test superato')
