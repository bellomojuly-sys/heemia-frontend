import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const config = JSON.parse(await fs.promises.readFile(path.join(projectRoot, '.mcp.json'), 'utf8'))
const playwright = config.mcpServers?.['playwright-local']
assert.equal(playwright?.command, 'npx')
assert.ok(playwright.args.includes('--isolated'))
assert.ok(playwright.args.includes('webkit'))

const localServer = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><html><body><main><h1>Heemia MCP self-test</h1></main></body></html>')
})
await new Promise((resolve, reject) => {
  localServer.once('error', reject)
  localServer.listen(0, '127.0.0.1', resolve)
})
const address = localServer.address()
assert.equal(typeof address, 'object')

const child = spawn(playwright.command, playwright.args, {
  cwd: projectRoot,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
})
let stderr = ''
child.stderr.on('data', (chunk) => { stderr += chunk })

const pending = new Map()
let buffer = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  while (buffer.includes('\n')) {
    const newline = buffer.indexOf('\n')
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
  }
})

let nextId = 1
function request(method, params = {}) {
  const id = nextId
  nextId += 1
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timeout MCP per ${method}. ${stderr.trim()}`))
    }, 45_000)
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value) },
      reject: (error) => { clearTimeout(timer); reject(error) },
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
}

try {
  await request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'heemia-mcp-self-test', version: '1.0.0' },
  })
  notify('notifications/initialized')

  const tools = await request('tools/list')
  const names = new Set(tools.tools.map((tool) => tool.name))
  assert.ok(names.has('browser_navigate'))
  assert.ok(names.has('browser_snapshot'))

  const navigation = await request('tools/call', {
    name: 'browser_navigate',
    arguments: { url: `http://127.0.0.1:${address.port}` },
  })
  assert.notEqual(navigation.isError, true)
  const navigationText = JSON.stringify(navigation.content)
  if (!/Heemia MCP self-test/.test(navigationText)) {
    const snapshotReference = navigationText.match(/\[Snapshot\]\(([^)]+)\)/)?.[1]
    assert.ok(snapshotReference, 'La navigazione non ha restituito uno snapshot')
    const snapshotPath = path.resolve(projectRoot, snapshotReference)
    const outputRoot = path.resolve('/tmp/heemia-playwright-mcp')
    assert.ok(snapshotPath.startsWith(`${outputRoot}${path.sep}`), 'Snapshot MCP fuori dalla directory temporanea prevista')
    assert.match(await fs.promises.readFile(snapshotPath, 'utf8'), /Heemia MCP self-test/)
  }

  await request('tools/call', { name: 'browser_close', arguments: {} })
  process.stdout.write(`Playwright MCP: WebKit operativo, ${names.size} strumenti disponibili\n`)
} finally {
  child.stdin.end()
  child.kill('SIGTERM')
  localServer.close()
}
