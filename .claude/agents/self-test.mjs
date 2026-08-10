import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const agentsDir = path.dirname(fileURLToPath(import.meta.url))
const expected = new Set(['persistence-reviewer', 'security-rbac-reviewer'])
const discovered = new Set()

for (const filename of fs.readdirSync(agentsDir).filter((name) => name.endsWith('.md'))) {
  const content = fs.readFileSync(path.join(agentsDir, filename), 'utf8')
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1]
  assert.ok(frontmatter, `${filename}: frontmatter mancante`)

  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  assert.ok(expected.has(name), `${filename}: nome inatteso`)
  assert.ok(!discovered.has(name), `${filename}: nome duplicato`)
  discovered.add(name)

  assert.match(frontmatter, /^description:\s*.+$/m, `${filename}: description mancante`)
  assert.match(frontmatter, /^tools:\s*Read, Grep, Glob$/m, `${filename}: tools non strettamente read-only`)
  assert.doesNotMatch(frontmatter, /^(?:memory|mcpServers|permissionMode):/m, `${filename}: capacità aggiuntiva non consentita`)
  assert.doesNotMatch(frontmatter, /\b(?:Write|Edit|Bash|Agent)\b/, `${filename}: strumento mutante presente`)
  assert.match(content, /P0.*P3/s, `${filename}: priorità finding mancanti`)
  assert.match(content, /file e riga/, `${filename}: evidenza file-riga mancante`)
}

assert.deepEqual(discovered, expected)
process.stdout.write('Subagent Heemia: configurazione read-only valida\n')
