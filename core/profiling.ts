export type FsProfileEventKind = 'lock' | 'read' | 'parse' | 'write'

export type ProfileAttribution = {
  caller?: string
  category?: string
}

export type TmuxProfileInput = ProfileAttribution & {
  command: string
  args?: string[]
  durationMs: number
  ok: boolean
  error?: string
}

type FsStoreProfileEvent = ProfileAttribution & {
  kind: FsProfileEventKind
  operation: FsProfileEventKind
  durationMs: number
  lockWaitMs?: number
  readMs?: number
  parseMs?: number
  writeMs?: number
  bytes?: number
  path?: string
  callSite: string
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
  stateReadCount: number
  stateWriteCount: number
  mailboxProjectionReadCount: number
  teamStateReadCount: number
  events: FsStoreProfileEvent[]
}

type TmuxProfileSummary = {
  commandCount: number
  successCount: number
  failureCount: number
  totalDurationMs: number
  commandNames: string[]
  events: Array<ProfileAttribution & {
    kind: 'command'
    command: string
    args: string[]
    durationMs: number
    ok: boolean
    error?: string
  }>
}

export type PanelProfileMode = 'attached' | 'global'

export type PanelReadModelProfileCounts = {
  teamCount?: number
  taskCount?: number
  memberCount?: number
  mailboxProjectionCount?: number
  orphanPaneCount?: number
}

export type PanelProfileEventKind = 'dataLoad' | 'readModelBuild'

export type PanelProfileInput = ProfileAttribution & PanelReadModelProfileCounts & {
  kind: PanelProfileEventKind
  mode: PanelProfileMode
  durationMs: number
}

type PanelProfileSummary = {
  dataLoadCount: number
  readModelBuildCount: number
  totalDataLoadMs: number
  totalReadModelBuildMs: number
  lastMode?: PanelProfileMode
  byMode: Record<PanelProfileMode, {
    dataLoadCount: number
    readModelBuildCount: number
  }>
  lastCounts: PanelReadModelProfileCounts
  events: Array<PanelProfileInput>
}

export type ProfilingSummary = {
  enabled: boolean
  fsStore: FsStoreProfileSummary
  tmux: TmuxProfileSummary
  panel: PanelProfileSummary
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
    stateReadCount: 0,
    stateWriteCount: 0,
    mailboxProjectionReadCount: 0,
    teamStateReadCount: 0,
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

function emptyPanelSummary(): PanelProfileSummary {
  return {
    dataLoadCount: 0,
    readModelBuildCount: 0,
    totalDataLoadMs: 0,
    totalReadModelBuildMs: 0,
    byMode: {
      attached: { dataLoadCount: 0, readModelBuildCount: 0 },
      global: { dataLoadCount: 0, readModelBuildCount: 0 },
    },
    lastCounts: {},
    events: [],
  }
}

const summary: Omit<ProfilingSummary, 'enabled'> = {
  fsStore: emptyFsStoreSummary(),
  tmux: emptyTmuxSummary(),
  panel: emptyPanelSummary(),
}

export function isProfilingEnabled(): boolean {
  return process.env.PI_AGENTTEAM_PROFILE === '1'
}

export function resetProfiling(): void {
  summary.fsStore = emptyFsStoreSummary()
  summary.tmux = emptyTmuxSummary()
  summary.panel = emptyPanelSummary()
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
    panel: {
      ...summary.panel,
      byMode: {
        attached: { ...summary.panel.byMode.attached },
        global: { ...summary.panel.byMode.global },
      },
      lastCounts: { ...summary.panel.lastCounts },
      events: summary.panel.events.map(event => ({ ...event })),
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

function safeCount(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function safeProfileText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function safePathHint(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\?.*$/, '')
}

function profileCategoryFromPath(filePath?: string): string {
  if (!filePath) return 'state:unknown'
  if (filePath.endsWith('/team.json') || filePath.endsWith('\\team.json')) return 'state:team'
  if (filePath.includes('/inboxes/') || filePath.includes('\\inboxes\\')) return 'state:mailboxProjection'
  if (filePath.endsWith('/runtime.json') || filePath.endsWith('\\runtime.json')) return 'state:runtime'
  if (filePath.endsWith('/outbox.json') || filePath.endsWith('\\outbox.json')) return 'state:outbox'
  if (filePath.endsWith('/outbox-diagnostics.json') || filePath.endsWith('\\outbox-diagnostics.json')) return 'state:outboxDiagnostics'
  return 'state:file'
}

function incrementFsRepositoryCounters(kind: FsProfileEventKind, category: string): void {
  if (kind === 'read') {
    summary.fsStore.stateReadCount += 1
    if (category === 'state:mailboxProjection') summary.fsStore.mailboxProjectionReadCount += 1
    if (category === 'state:team') summary.fsStore.teamStateReadCount += 1
  } else if (kind === 'write') {
    summary.fsStore.stateWriteCount += 1
  }
}

function panelCounts(input: PanelReadModelProfileCounts): PanelReadModelProfileCounts {
  return {
    ...(input.teamCount !== undefined ? { teamCount: safeCount(input.teamCount) } : {}),
    ...(input.taskCount !== undefined ? { taskCount: safeCount(input.taskCount) } : {}),
    ...(input.memberCount !== undefined ? { memberCount: safeCount(input.memberCount) } : {}),
    ...(input.mailboxProjectionCount !== undefined ? { mailboxProjectionCount: safeCount(input.mailboxProjectionCount) } : {}),
    ...(input.orphanPaneCount !== undefined ? { orphanPaneCount: safeCount(input.orphanPaneCount) } : {}),
  }
}

export function recordFsStoreEvent(input: ProfileAttribution & {
  kind: FsProfileEventKind
  durationMs: number
  lockWaitMs?: number
  readMs?: number
  parseMs?: number
  writeMs?: number
  bytes?: number
  path?: string
  callSite?: string
}): void {
  if (!isProfilingEnabled()) return
  const durationMs = safeDurationMs(input.durationMs)
  const bytes = safeBytes(input.bytes)
  const category = safeProfileText(input.category, profileCategoryFromPath(input.path))
  const caller = safeProfileText(input.caller, 'state.fsStore')
  const lockWaitMs = input.lockWaitMs !== undefined ? safeDurationMs(input.lockWaitMs) : undefined
  const readMs = input.readMs !== undefined ? safeDurationMs(input.readMs) : undefined
  const parseMs = input.parseMs !== undefined ? safeDurationMs(input.parseMs) : undefined
  const writeMs = input.writeMs !== undefined ? safeDurationMs(input.writeMs) : undefined
  summary.fsStore.events.push({
    kind: input.kind,
    operation: input.kind,
    durationMs,
    caller,
    category,
    callSite: safeProfileText(input.callSite, caller),
    ...(lockWaitMs !== undefined ? { lockWaitMs } : {}),
    ...(readMs !== undefined ? { readMs } : {}),
    ...(parseMs !== undefined ? { parseMs } : {}),
    ...(writeMs !== undefined ? { writeMs } : {}),
    ...(input.bytes !== undefined ? { bytes } : {}),
    ...(safePathHint(input.path) ? { path: safePathHint(input.path) } : {}),
  })
  incrementFsRepositoryCounters(input.kind, category)
  if (input.kind === 'lock') {
    summary.fsStore.lockCount += 1
    summary.fsStore.totalLockMs += lockWaitMs ?? durationMs
  } else if (input.kind === 'read') {
    summary.fsStore.readCount += 1
    summary.fsStore.totalReadMs += readMs ?? durationMs
    summary.fsStore.bytesRead += bytes
  } else if (input.kind === 'parse') {
    summary.fsStore.parseCount += 1
    summary.fsStore.totalParseMs += parseMs ?? durationMs
  } else if (input.kind === 'write') {
    summary.fsStore.writeCount += 1
    summary.fsStore.totalWriteMs += writeMs ?? durationMs
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
    caller: safeProfileText(input.caller, 'tmux.client'),
    category: safeProfileText(input.category, 'runtime:tmux'),
    ...(input.error ? { error: input.error } : {}),
  })
}

export function recordPanelProfileEvent(input: PanelProfileInput): void {
  if (!isProfilingEnabled()) return
  const durationMs = safeDurationMs(input.durationMs)
  const counts = panelCounts(input)
  const event: PanelProfileInput = {
    kind: input.kind,
    mode: input.mode,
    durationMs,
    caller: safeProfileText(input.caller, input.kind === 'dataLoad' ? 'teamPanel.dataSource' : 'teamPanel.readModel'),
    category: safeProfileText(input.category, input.kind === 'dataLoad' ? 'panel:dataLoad' : 'panel:readModel'),
    ...counts,
  }
  summary.panel.events.push(event)
  summary.panel.lastMode = input.mode
  summary.panel.lastCounts = counts
  const modeSummary = summary.panel.byMode[input.mode]
  if (input.kind === 'dataLoad') {
    summary.panel.dataLoadCount += 1
    summary.panel.totalDataLoadMs += durationMs
    modeSummary.dataLoadCount += 1
  } else {
    summary.panel.readModelBuildCount += 1
    summary.panel.totalReadModelBuildMs += durationMs
    modeSummary.readModelBuildCount += 1
  }
}
