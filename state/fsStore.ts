import * as fs from 'node:fs'
import * as path from 'node:path'
import { recordFsStoreEvent } from '../core/profiling.js'

const FS_STORE_PROFILE_CALLER = 'state.fsStore'

function profileCategoryForPath(filePath: string): string {
  if (filePath.endsWith('/team.json') || filePath.endsWith('\\team.json')) return 'state:team'
  if (filePath.includes('/inboxes/') || filePath.includes('\\inboxes\\')) return 'state:mailboxProjection'
  if (filePath.endsWith('/runtime.json') || filePath.endsWith('\\runtime.json')) return 'state:runtime'
  if (filePath.endsWith('/outbox.json') || filePath.endsWith('\\outbox.json')) return 'state:outbox'
  if (filePath.endsWith('/outbox-diagnostics.json') || filePath.endsWith('\\outbox-diagnostics.json')) return 'state:outboxDiagnostics'
  return 'state:file'
}

// ---------------------------------------------------------------------------
// Generic file-system primitives shared by the state submodules.
// ---------------------------------------------------------------------------

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

const LOCK_TIMEOUT_MS = 8000
const LOCK_RETRY_MS = 5
const STALE_LOCK_MS = 5 * 60_000

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000
}

function profileCallSite(): string {
  const stack = new Error().stack?.split('\n').slice(2) ?? []
  const frame = stack
    .map(line => line.trim())
    .find(line => line && !line.includes('profileCallSite') && !line.includes('recordFsStoreOperation'))
  if (!frame) return FS_STORE_PROFILE_CALLER
  return frame.replace(process.cwd(), '<cwd>')
}

function recordFsStoreOperation(input: {
  kind: 'lock' | 'read' | 'parse' | 'write'
  durationMs: number
  lockWaitMs?: number
  readMs?: number
  parseMs?: number
  writeMs?: number
  bytes?: number
  path: string
  callSite: string
}): void {
  recordFsStoreEvent({
    kind: input.kind,
    durationMs: input.durationMs,
    lockWaitMs: input.lockWaitMs,
    readMs: input.readMs,
    parseMs: input.parseMs,
    writeMs: input.writeMs,
    bytes: input.bytes,
    path: input.path,
    callSite: input.callSite,
    caller: FS_STORE_PROFILE_CALLER,
    category: profileCategoryForPath(input.path),
  })
}

function getLockPath(filePath: string): string {
  return `${filePath}.lock`
}

function clearStaleLock(lockPath: string): void {
  try {
    const stat = fs.statSync(lockPath)
    if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
      fs.rmSync(lockPath, { force: true })
    }
  } catch {
    // ignore
  }
}

function acquireFileLock(filePath: string, timeoutMs = LOCK_TIMEOUT_MS): () => void {
  ensureDir(path.dirname(filePath))
  const lockPath = getLockPath(filePath)
  const startedAt = Date.now()

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx')
      try {
        fs.writeFileSync(fd, `${process.pid}\n${Date.now()}\n`, 'utf8')
      } catch {
        // ignore metadata write errors
      }
      return () => {
        try {
          fs.closeSync(fd)
        } catch {
          // ignore
        }
        try {
          fs.rmSync(lockPath, { force: true })
        } catch {
          // ignore
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code !== 'EEXIST') {
        throw error
      }
      clearStaleLock(lockPath)
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out acquiring file lock: ${lockPath}`)
      }
      sleep(LOCK_RETRY_MS)
    }
  }
}

export function withFileLock<T>(filePath: string, fn: () => T, timeoutMs = LOCK_TIMEOUT_MS): T {
  const startedAt = nowMs()
  const callSite = profileCallSite()
  const release = acquireFileLock(filePath, timeoutMs)
  const lockWaitMs = nowMs() - startedAt
  try {
    return fn()
  } finally {
    release()
    recordFsStoreOperation({ kind: 'lock', durationMs: lockWaitMs, lockWaitMs, path: filePath, callSite })
  }
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const callSite = profileCallSite()
    const readStartedAt = nowMs()
    const payload = fs.readFileSync(filePath, 'utf8')
    const bytes = Buffer.byteLength(payload, 'utf8')
    const readMs = nowMs() - readStartedAt
    recordFsStoreOperation({ kind: 'read', durationMs: readMs, readMs, bytes, path: filePath, callSite })
    const parseStartedAt = nowMs()
    const parsed = JSON.parse(payload) as T
    const parseMs = nowMs() - parseStartedAt
    recordFsStoreOperation({ kind: 'parse', durationMs: parseMs, parseMs, bytes, path: filePath, callSite })
    return parsed
  } catch {
    return null
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath))
  const payload = `${JSON.stringify(value, null, 2)}\n`
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const callSite = profileCallSite()
  const writeStartedAt = nowMs()
  try {
    fs.writeFileSync(tempPath, payload, 'utf8')
    fs.renameSync(tempPath, filePath)
    const writeMs = nowMs() - writeStartedAt
    recordFsStoreOperation({ kind: 'write', durationMs: writeMs, writeMs, bytes: Buffer.byteLength(payload, 'utf8'), path: filePath, callSite })
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true })
      }
    } catch {
      // ignore
    }
  }
}
