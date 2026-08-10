import fs from 'node:fs'
import path from 'node:path'
import {
  conciseOutput,
  git,
  inspectUntrackedText,
  loadProjectEnv,
  localPostgresStatus,
  runCommand,
} from './lib.mjs'

function matchesAny(files, patterns) {
  return files.some((file) => patterns.some((pattern) => pattern.test(file)))
}

export function classifyFiles(files) {
  return {
    frontend: matchesAny(files, [
      /^src\//,
      /^index\.html$/,
      /^package(?:-lock)?\.json$/,
      /^tsconfig(?:\.[^.]+)?\.json$/,
      /^vite\.config\.[cm]?[jt]s$/,
    ]),
    backend: matchesAny(files, [
      /^server\/src\//,
      /^server\/test\//,
      /^server\/package(?:-lock)?\.json$/,
      /^server\/tsconfig\.json$/,
    ]),
    prisma: matchesAny(files, [
      /^server\/prisma\/schema\.prisma$/,
      /^server\/prisma\/migrations\//,
    ]),
  }
}

function trackedFiles(root, files) {
  return files.filter((file) => git(root, ['ls-files', '--error-unmatch', '--', file]).status === 0)
}

function untrackedFiles(root, files) {
  return files.filter((file) => {
    if (!fs.existsSync(path.join(root, file))) return false
    return git(root, ['ls-files', '--error-unmatch', '--', file]).status !== 0
  })
}

function redact(output, environment) {
  let safe = String(output || '')
  const sensitiveName = /(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|COOKIE|CREDENTIAL)/i
  for (const [name, value] of Object.entries(environment)) {
    if (sensitiveName.test(name) && typeof value === 'string' && value.length >= 4) {
      safe = safe.split(value).join(`[${name} nascosto]`)
    }
  }
  return safe.replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s'"`]+/gi, '[URL database nascosto]')
}

function runCheck(checks, label, command, args, options, environment) {
  const result = runCommand(command, args, options)
  const safeResult = { ...result, output: redact(result.output, environment) }
  checks.push({ label, ...safeResult })
  return safeResult.ok
}

export async function verifyFiles(root, files) {
  const normalizedFiles = [...new Set(files)].sort()
  const scope = classifyFiles(normalizedFiles)
  const checks = []
  const warnings = []
  const environment = loadProjectEnv(root)
  let allRequiredPassed = true

  const tracked = trackedFiles(root, normalizedFiles)
  if (tracked.length > 0) {
    allRequiredPassed = runCheck(
      checks,
      'git diff --check',
      'git',
      ['-C', root, 'diff', '--check', '--', ...tracked],
      { cwd: root, timeout: 60_000, env: environment },
      environment,
    ) && allRequiredPassed
    allRequiredPassed = runCheck(
      checks,
      'git diff --cached --check',
      'git',
      ['-C', root, 'diff', '--cached', '--check', '--', ...tracked],
      { cwd: root, timeout: 60_000, env: environment },
      environment,
    ) && allRequiredPassed
  }

  const textProblems = inspectUntrackedText(root, untrackedFiles(root, normalizedFiles))
  checks.push({
    label: 'file nuovi: whitespace e conflitti',
    ok: textProblems.length === 0,
    output: textProblems.join('\n'),
  })
  allRequiredPassed = textProblems.length === 0 && allRequiredPassed

  if (scope.prisma) {
    allRequiredPassed = runCheck(
      checks,
      'Prisma validate',
      'npx',
      ['prisma', 'validate'],
      { cwd: path.join(root, 'server'), timeout: 120_000, env: environment },
      environment,
    ) && allRequiredPassed
  }

  if (scope.backend || scope.prisma) {
    allRequiredPassed = runCheck(
      checks,
      'Backend typecheck',
      'npm',
      ['run', 'typecheck'],
      { cwd: path.join(root, 'server'), timeout: 180_000, env: environment },
      environment,
    ) && allRequiredPassed
  }

  if (scope.frontend) {
    allRequiredPassed = runCheck(
      checks,
      'Frontend lint',
      'npm',
      ['run', 'lint'],
      { cwd: root, timeout: 180_000, env: environment },
      environment,
    ) && allRequiredPassed
    allRequiredPassed = runCheck(
      checks,
      'Frontend build',
      'npm',
      ['run', 'build'],
      { cwd: root, timeout: 300_000, env: environment },
      environment,
    ) && allRequiredPassed
  }

  if (scope.backend || scope.prisma) {
    const postgres = await localPostgresStatus(environment)
    if (postgres.available) {
      allRequiredPassed = runCheck(
        checks,
        'Backend test',
        'npm',
        ['test'],
        { cwd: path.join(root, 'server'), timeout: 300_000, env: environment },
        environment,
      ) && allRequiredPassed
    } else {
      warnings.push(postgres.reason)
    }
  }

  return { allRequiredPassed, checks, files: normalizedFiles, scope, warnings }
}

export function formatFailures(result) {
  return result.checks
    .filter((check) => !check.ok)
    .map((check) => `- ${check.label}\n${conciseOutput(check.output)}`)
    .join('\n\n')
}

export function formatReport(result) {
  const scope = [
    result.scope.frontend && 'frontend',
    result.scope.backend && 'backend',
    result.scope.prisma && 'Prisma',
  ].filter(Boolean).join(', ') || 'documentazione/configurazione'
  const checks = result.checks
    .map((check) => `${check.ok ? 'PASS' : 'FAIL'}  ${check.label}${check.output && !check.ok ? `\n${conciseOutput(check.output)}` : ''}`)
    .join('\n')
  const warnings = result.warnings.length > 0
    ? `\n\nAVVISI\n${result.warnings.map((warning) => `- ${warning}`).join('\n')}`
    : ''
  return `Scope: ${scope}\nFile: ${result.files.length}\n\n${checks}${warnings}`
}
