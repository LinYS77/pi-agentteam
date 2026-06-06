export type FsProfileEventKind = 'lock' | 'read' | 'parse' | 'write'

export type TmuxProfileInput = {
  command: string
  args?: string[]
  durationMs: number
  ok: boolean
  error?: string
}

type FsStoreProfileSummary = {
  lockCount: number
  totalLockMs: number
  readCount: number
  totalReadMs: number
  bytesRead: number
  parseCount: number
  totalParseMs: number
  writeCount: number
  totalWriteMs: number
  bytesWritten: number
  events: Array<{
    kind: FsProfileEventKind
    durationMs: number
    bytes?: number
    path?: string
  }>
}

type TmuxProfileSummary = {
  commandCount: number
  successCount: number
  failureCount: number
  totalDurationMs: number
  commandNames: string[]
  events: Array<{
    kind: 'command'
    command: string
    args: string[]
    durationMs: number
    ok: boolean
    error?: string
  }>
}

export type ProfilingSummary = {
  enabled: boolean
  fsStore: FsStoreProfileSummary
  tmux: TmuxProfileSummary
}

function emptyFsStoreSummary(): FsStoreProfileSummary {
  return {
    lockCount: 0,
    totalLockMs: 0,
    readCount: 0,
    totalReadMs: 0,
    bytesRead: 0,
    parseCount: 0,
    totalParseMs: 0,
    writeCount: 0,
    totalWriteMs: 0,
    bytesWritten: 0,
    events: [],
  }
}

function emptyTmuxSummary(): TmuxProfileSummary {
  return {
    commandCount: 0,
    successCount: 0,
    failureCount: 0,
    totalDurationMs: 0,
    commandNames: [],
    events: [],
  }
}

const summary: Omit<ProfilingSummary, 'enabled'> = {
  fsStore: emptyFsStoreSummary(),
  tmux: emptyTmuxSummary(),
}

export function isProfilingEnabled(): boolean {
  return process.env.PI_AGENTTEAM_PROFILE === '1'
}

export function resetProfiling(): void {
  summary.fsStore = emptyFsStoreSummary()
  summary.tmux = emptyTmuxSummary()
}

function cloneSummary(): Omit<ProfilingSummary, 'enabled'> {
  return {
    fsStore: {
      ...summary.fsStore,
      events: summary.fsStore.events.map(event => ({ ...event })),
    },
    tmux: {
      ...summary.tmux,
      commandNames: [...summary.tmux.commandNames],
      events: summary.tmux.events.map(event => ({ ...event, args: [...event.args] })),
    },
  }
}

export function readProfilingSummary(): ProfilingSummary {
  return {
    enabled: isProfilingEnabled(),
    ...cloneSummary(),
  }
}

function safeDurationMs(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0
}

function safeBytes(bytes: number | undefined): number {
  return Number.isFinite(bytes) && (bytes ?? 0) >= 0 ? bytes ?? 0 : 0
}

export function recordFsStoreEvent(input: {
  kind: FsProfileEventKind
  durationMs: number
  bytes?: number
  path?: string
}): void {
  if (!isProfilingEnabled()) return
  const durationMs = safeDurationMs(input.durationMs)
  const bytes = safeBytes(input.bytes)
  summary.fsStore.events.push({
    kind: input.kind,
    durationMs,
    ...(input.bytes !== undefined ? { bytes } : {}),
    ...(input.path ? { path: input.path } : {}),
  })
  if (input.kind === 'lock') {
    summary.fsStore.lockCount += 1
    summary.fsStore.totalLockMs += durationMs
  } else if (input.kind === 'read') {
    summary.fsStore.readCount += 1
    summary.fsStore.totalReadMs += durationMs
    summary.fsStore.bytesRead += bytes
  } else if (input.kind === 'parse') {
    summary.fsStore.parseCount += 1
    summary.fsStore.totalParseMs += durationMs
  } else if (input.kind === 'write') {
    summary.fsStore.writeCount += 1
    summary.fsStore.totalWriteMs += durationMs
    summary.fsStore.bytesWritten += bytes
  }
}

export function recordTmuxCommand(input: TmuxProfileInput): void {
  if (!isProfilingEnabled()) return
  const durationMs = safeDurationMs(input.durationMs)
  const args = input.args ? [...input.args] : []
  summary.tmux.commandCount += 1
  summary.tmux.totalDurationMs += durationMs
  if (input.ok) summary.tmux.successCount += 1
  else summary.tmux.failureCount += 1
  if (!summary.tmux.commandNames.includes(input.command)) {
    summary.tmux.commandNames.push(input.command)
  }
  summary.tmux.events.push({
    kind: 'command',
    command: input.command,
    args,
    durationMs,
    ok: input.ok,
    ...(input.error ? { error: input.error } : {}),
  })
}
