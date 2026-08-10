import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const targetPath = path.join(projectRoot, 'src', 'App.tsx')
const targetUri = pathToFileURL(targetPath).href
const child = spawn('typescript-language-server', ['--stdio'], {
  cwd: projectRoot,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
})

let stderr = ''
child.stderr.on('data', (chunk) => { stderr += chunk })
let buffer = Buffer.alloc(0)
let nextId = 1
const pending = new Map()

function send(message) {
  const body = JSON.stringify(message)
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

function respondToServer(message) {
  if (message.method === 'workspace/configuration') {
    send({ jsonrpc: '2.0', id: message.id, result: (message.params?.items || []).map(() => ({})) })
  } else {
    send({ jsonrpc: '2.0', id: message.id, result: null })
  }
}

function handleMessage(message) {
  if (message.method && message.id !== undefined) {
    respondToServer(message)
    return
  }
  if (message.id === undefined || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  clearTimeout(request.timer)
  if (message.error) request.reject(new Error(JSON.stringify(message.error)))
  else request.resolve(message.result)
}

child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  while (true) {
    const separator = buffer.indexOf('\r\n\r\n')
    if (separator === -1) return
    const header = buffer.subarray(0, separator).toString('utf8')
    const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1])
    if (!Number.isFinite(length)) throw new Error(`Header LSP non valido: ${header}`)
    const bodyStart = separator + 4
    if (buffer.length < bodyStart + length) return
    const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8')
    buffer = buffer.subarray(bodyStart + length)
    handleMessage(JSON.parse(body))
  }
})

function request(method, params = {}) {
  const id = nextId
  nextId += 1
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timeout LSP per ${method}. ${stderr.trim()}`))
    }, 30_000)
    pending.set(id, { reject, resolve, timer })
    send({ jsonrpc: '2.0', id, method, params })
  })
}

function notify(method, params = {}) {
  send({ jsonrpc: '2.0', method, params })
}

try {
  const initialized = await request('initialize', {
    processId: process.pid,
    clientInfo: { name: 'heemia-lsp-self-test', version: '1.0.0' },
    rootUri: pathToFileURL(projectRoot).href,
    workspaceFolders: [{ uri: pathToFileURL(projectRoot).href, name: 'Heemia' }],
    capabilities: {
      workspace: { configuration: true, workspaceFolders: true },
      textDocument: { documentSymbol: {} },
    },
  })
  assert.ok(initialized.capabilities?.textDocumentSync)
  notify('initialized')

  notify('textDocument/didOpen', {
    textDocument: {
      uri: targetUri,
      languageId: 'typescriptreact',
      version: 1,
      text: fs.readFileSync(targetPath, 'utf8'),
    },
  })
  const symbols = await request('textDocument/documentSymbol', { textDocument: { uri: targetUri } })
  assert.ok(Array.isArray(symbols) && symbols.length > 0, 'Nessun simbolo TypeScript restituito per src/App.tsx')

  await request('shutdown')
  notify('exit')
  process.stdout.write(`TypeScript LSP: operativo, ${symbols.length} simboli rilevati in src/App.tsx\n`)
} finally {
  for (const item of pending.values()) clearTimeout(item.timer)
  child.stdin.end()
  child.kill('SIGTERM')
}
