import * as fs from 'node:fs'
import * as path from 'node:path'
import type {
  MailboxMessage,
  SessionTeamContext,
  TeamEvent,
  TeamMember,
  TeamMessageType,
  TeamState,
  TeamTask,
  TeamTaskNote,
} from './types.js'
import { TEAM_LEAD } from './types.js'

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

const LOCK_TIMEOUT_MS = 8000
const LOCK_RETRY_MS = 25
const STALE_LOCK_MS = 5 * 60_000

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
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

function withFileLock<T>(filePath: string, fn: () => T, timeoutMs = LOCK_TIMEOUT_MS): T {
  const release = acquireFileLock(filePath, timeoutMs)
  try {
    return fn()
  } finally {
    release()
  }
}

function getAgentTeamRoot(): string {
  const root = path.join(path.dirname(__filename), 'data')
  ensureDir(root)
  return root
}

export function getTeamsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'teams')
  ensureDir(dir)
  return dir
}

export function sanitizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
}

function getTeamDir(teamName: string): string {
  const dir = path.join(getTeamsDir(), sanitizeName(teamName))
  ensureDir(dir)
  return dir
}

export function getTeamStatePath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'state.json')
}

function getMailboxDir(teamName: string): string {
  const dir = path.join(getTeamDir(teamName), 'mailboxes')
  ensureDir(dir)
  return dir
}

export function getMailboxPath(teamName: string, memberName: string): string {
  return path.join(getMailboxDir(teamName), `${sanitizeName(memberName)}.json`)
}

function getSessionsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'sessions')
  ensureDir(dir)
  return dir
}

export function getWorkerSessionsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'worker-sessions')
  ensureDir(dir)
  return dir
}

function sanitizeSessionFile(sessionFile: string): string {
  return Buffer.from(sessionFile).toString('base64url')
}

function getSessionContextPath(sessionFile: string): string {
  return path.join(getSessionsDir(), `${sanitizeSessionFile(sessionFile)}.json`)
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath))
  const payload = `${JSON.stringify(value, null, 2)}\n`
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    fs.writeFileSync(tempPath, payload, 'utf8')
    fs.renameSync(tempPath, filePath)
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

export function readSessionContext(sessionFile: string): SessionTeamContext {
  return (
    readJsonFile<SessionTeamContext>(getSessionContextPath(sessionFile)) ?? {
      teamName: null,
      memberName: null,
    }
  )
}

export function writeSessionContext(
  sessionFile: string,
  context: SessionTeamContext,
): void {
  writeJsonFile(getSessionContextPath(sessionFile), context)
  invalidateSessionContextCache(sessionFile)
}

export function clearSessionContext(sessionFile: string): void {
  const p = getSessionContextPath(sessionFile)
  try {
    fs.rmSync(p, { force: true })
  } catch {
    // ignore
  }
  invalidateSessionContextCache(sessionFile)
}

function matchesSessionBinding(
  team: TeamState,
  sessionFile: string,
  memberName: string,
): boolean {
  if (memberName === TEAM_LEAD) {
    return (
      team.leaderSessionFile === sessionFile ||
      team.members[TEAM_LEAD]?.sessionFile === sessionFile
    )
  }
  return team.members[memberName]?.sessionFile === sessionFile
}

function isSessionContextValid(
  sessionFile: string,
  context: SessionTeamContext,
): boolean {
  if (!context.teamName || !context.memberName) return false
  const team = readTeamState(context.teamName)
  if (!team) return false
  return matchesSessionBinding(team, sessionFile, context.memberName)
}

function findSessionBinding(sessionFile: string): SessionTeamContext {
  const matches: Array<{
    teamName: string
    memberName: string
    priority: number
    createdAt: number
  }> = []

  for (const team of listTeams()) {
    if (matchesSessionBinding(team, sessionFile, TEAM_LEAD)) {
      matches.push({
        teamName: team.name,
        memberName: TEAM_LEAD,
        priority: 2,
        createdAt: team.createdAt,
      })
    }
    for (const member of Object.values(team.members)) {
      if (member.name === TEAM_LEAD) continue
      if (member.sessionFile !== sessionFile) continue
      matches.push({
        teamName: team.name,
        memberName: member.name,
        priority: 1,
        createdAt: member.createdAt,
      })
    }
  }

  matches.sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt)
  const match = matches[0]
  if (!match) {
    return { teamName: null, memberName: null }
  }
  return {
    teamName: match.teamName,
    memberName: match.memberName,
  }
}

const SESSION_CACHE_TTL_MS = 2000
const sessionContextCache = new Map<string, {
  result: { context: SessionTeamContext; source: 'cached' | 'derived' | 'cleared' | 'none' }
  at: number
}>()

export function invalidateSessionContextCache(sessionFile?: string): void {
  if (sessionFile) {
    sessionContextCache.delete(sessionFile)
  } else {
    sessionContextCache.clear()
  }
}

export function ensureAttachedSessionContext(
  sessionFile: string,
): { context: SessionTeamContext; source: 'cached' | 'derived' | 'cleared' | 'none' } {
  const now = Date.now()
  const hit = sessionContextCache.get(sessionFile)
  if (hit && now - hit.at < SESSION_CACHE_TTL_MS) {
    return hit.result
  }

  const cached = readSessionContext(sessionFile)
  if (isSessionContextValid(sessionFile, cached)) {
    const result = { context: cached, source: 'cached' as const }
    sessionContextCache.set(sessionFile, { result, at: now })
    return result
  }

  const derived = findSessionBinding(sessionFile)
  if (derived.teamName && derived.memberName) {
    writeSessionContext(sessionFile, derived)
    const result = { context: derived, source: 'derived' as const }
    sessionContextCache.set(sessionFile, { result, at: now })
    return result
  }

  clearSessionContext(sessionFile)
  const result = {
    context: { teamName: null, memberName: null } as SessionTeamContext,
    source: (cached.teamName || cached.memberName ? 'cleared' : 'none') as 'cleared' | 'none',
  }
  sessionContextCache.set(sessionFile, { result, at: now })
  return result
}

export function createInitialTeamState(input: {
  teamName: string
  description?: string
  leaderSessionFile?: string
  leaderCwd: string
}): TeamState {
  const now = Date.now()
  const teamName = sanitizeName(input.teamName)
  const leader: TeamMember = {
    name: TEAM_LEAD,
    role: 'leader',
    cwd: input.leaderCwd,
    sessionFile: input.leaderSessionFile ?? '',
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  }
  return {
    version: 1,
    name: teamName,
    description: input.description,
    createdAt: now,
    leaderSessionFile: input.leaderSessionFile,
    leaderCwd: input.leaderCwd,
    members: {
      [TEAM_LEAD]: leader,
    },
    tasks: {},
    events: [],
    nextTaskSeq: 1,
    revision: 0,
    memberTombstones: {},
  }
}

function normalizeTeamState(state: TeamState): TeamState {
  return {
    ...state,
    revision: Number.isFinite(state.revision) ? Number(state.revision) : 0,
    memberTombstones: { ...(state.memberTombstones ?? {}) },
    events: [...(state.events ?? [])],
  }
}

function pickLatestEntity<T extends { updatedAt: number }>(
  current: T | undefined,
  incoming: T | undefined,
  options?: {
    currentRevision?: number
    incomingRevision?: number
    mergeEqual?: (currentEntity: T, incomingEntity: T) => T
  },
): T | undefined {
  if (!current) return incoming
  if (!incoming) return current
  if (incoming.updatedAt > current.updatedAt) return incoming
  if (current.updatedAt > incoming.updatedAt) return current

  const currentRevision = options?.currentRevision ?? 0
  const incomingRevision = options?.incomingRevision ?? 0
  if (incomingRevision > currentRevision) return incoming
  if (currentRevision > incomingRevision) return current

  return options?.mergeEqual ? options.mergeEqual(current, incoming) : incoming
}

function taskNoteFingerprint(note: TeamTaskNote): string {
  return [
    note.at,
    note.author,
    note.text,
    note.threadId ?? '',
    note.messageType ?? '',
    note.requestId ?? '',
    note.linkedMessageId ?? '',
  ].join('|')
}

function mergeTaskNotes(currentNotes: TeamTaskNote[], incomingNotes: TeamTaskNote[]): TeamTaskNote[] {
  const seen = new Set<string>()
  const merged: TeamTaskNote[] = []
  const ordered = [...currentNotes, ...incomingNotes]
    .slice()
    .sort((a, b) => a.at - b.at || a.author.localeCompare(b.author) || a.text.localeCompare(b.text))

  for (const note of ordered) {
    const key = taskNoteFingerprint(note)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(note)
  }
  return merged
}

function mergeTaskStates(currentTask: TeamTask, incomingTask: TeamTask): TeamTask {
  return {
    ...currentTask,
    ...incomingTask,
    notes: mergeTaskNotes(currentTask.notes, incomingTask.notes),
    updatedAt: Math.max(currentTask.updatedAt, incomingTask.updatedAt),
  }
}

function mergeTeamEvents(currentEvents: TeamEvent[], incomingEvents: TeamEvent[]): TeamEvent[] {
  const byId = new Map<string, TeamEvent>()
  for (const event of [...currentEvents, ...incomingEvents]) {
    const existing = byId.get(event.id)
    if (!existing || event.at >= existing.at) {
      byId.set(event.id, event)
    }
  }
  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

function mergeTeamStates(current: TeamState, incoming: TeamState): TeamState {
  const currentState = normalizeTeamState(current)
  const incomingState = normalizeTeamState(incoming)

  const tombstones: Record<string, number> = { ...currentState.memberTombstones }
  for (const [name, at] of Object.entries(incomingState.memberTombstones)) {
    const existing = tombstones[name]
    if (existing === undefined || at > existing) {
      tombstones[name] = at
    }
  }

  const members: TeamState['members'] = {}
  const memberNames = new Set([
    ...Object.keys(currentState.members),
    ...Object.keys(incomingState.members),
  ])
  for (const name of memberNames) {
    const chosen = pickLatestEntity(currentState.members[name], incomingState.members[name], {
      currentRevision: currentState.revision,
      incomingRevision: incomingState.revision,
    })
    if (!chosen) continue
    const removedAt = tombstones[name]
    if (removedAt !== undefined && chosen.updatedAt <= removedAt) continue
    members[name] = chosen
  }

  const tasks: TeamState['tasks'] = {}
  const taskIds = new Set([
    ...Object.keys(currentState.tasks),
    ...Object.keys(incomingState.tasks),
  ])
  for (const taskId of taskIds) {
    const chosen = pickLatestEntity(
      currentState.tasks[taskId],
      incomingState.tasks[taskId],
      {
        currentRevision: currentState.revision,
        incomingRevision: incomingState.revision,
        mergeEqual: mergeTaskStates,
      },
    )
    if (chosen) tasks[taskId] = chosen
  }

  const merged: TeamState = {
    ...currentState,
    ...incomingState,
    name: incomingState.name,
    description: incomingState.description ?? currentState.description,
    createdAt: Math.min(currentState.createdAt, incomingState.createdAt),
    leaderSessionFile: incomingState.leaderSessionFile ?? currentState.leaderSessionFile,
    leaderCwd: incomingState.leaderCwd || currentState.leaderCwd,
    members,
    tasks,
    events: mergeTeamEvents(currentState.events ?? [], incomingState.events ?? []),
    nextTaskSeq: Math.max(currentState.nextTaskSeq, incomingState.nextTaskSeq),
    revision: Math.max(currentState.revision ?? 0, incomingState.revision ?? 0) + 1,
    memberTombstones: tombstones,
  }

  delete merged.memberTombstones?.[TEAM_LEAD]

  if (!merged.members[TEAM_LEAD]) {
    merged.members[TEAM_LEAD] = {
      name: TEAM_LEAD,
      role: 'leader',
      cwd: merged.leaderCwd,
      sessionFile: merged.leaderSessionFile ?? '',
      status: 'idle',
      createdAt: merged.createdAt,
      updatedAt: Date.now(),
    }
  }

  return merged
}

export function readTeamState(teamName: string): TeamState | null {
  const state = readJsonFile<TeamState>(getTeamStatePath(teamName))
  return state ? normalizeTeamState(state) : null
}

export function writeTeamState(state: TeamState): void {
  const statePath = getTeamStatePath(state.name)
  withFileLock(statePath, () => {
    const current = readJsonFile<TeamState>(statePath)
    let merged = normalizeTeamState(state)
    merged = current ? mergeTeamStates(current, merged) : {
      ...merged,
      revision: (merged.revision ?? 0) + 1,
    }

    if (merged.leaderSessionFile) {
      const existingLeader = merged.members[TEAM_LEAD] ?? {
        name: TEAM_LEAD,
        role: 'leader',
        cwd: merged.leaderCwd,
        sessionFile: merged.leaderSessionFile,
        status: 'idle',
        createdAt: merged.createdAt,
        updatedAt: Date.now(),
      }
      const leaderShapeChanged =
        existingLeader.role !== 'leader' ||
        existingLeader.cwd !== merged.leaderCwd ||
        existingLeader.sessionFile !== merged.leaderSessionFile
      merged.members[TEAM_LEAD] = {
        ...existingLeader,
        name: TEAM_LEAD,
        role: 'leader',
        cwd: merged.leaderCwd,
        sessionFile: merged.leaderSessionFile,
        updatedAt: leaderShapeChanged ? Date.now() : existingLeader.updatedAt,
      }
    }

    writeJsonFile(statePath, merged)
    Object.assign(state, merged)
  })
}

export function listTeams(): TeamState[] {
  const dir = getTeamsDir()
  const results: TeamState[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const state = readTeamState(entry.name)
    if (state) results.push(state)
  }
  results.sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name))
  return results
}

export function upsertMember(
  state: TeamState,
  member: Omit<TeamMember, 'createdAt' | 'updatedAt'>,
): TeamState {
  const now = Date.now()
  const existing = state.members[member.name]
  state.members[member.name] = {
    ...member,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  if (state.memberTombstones) {
    delete state.memberTombstones[member.name]
  }
  return state
}

export function updateMemberStatus(
  state: TeamState,
  memberName: string,
  patch: Partial<Pick<TeamMember, 'status' | 'lastWakeReason' | 'lastError' | 'cwd' | 'bootPrompt'>>,
): TeamState {
  const existing = state.members[memberName]
  if (!existing) return state
  state.members[memberName] = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  }
  return state
}

export function removeMember(state: TeamState, memberName: string): TeamState {
  const removedAt = Date.now()
  delete state.members[memberName]
  state.memberTombstones = {
    ...(state.memberTombstones ?? {}),
    [memberName]: removedAt,
  }
  for (const task of Object.values(state.tasks)) {
    if (task.owner === memberName && task.status !== 'completed') {
      task.owner = undefined
      task.status = 'pending'
      task.updatedAt = removedAt
      task.notes.push({
        at: removedAt,
        author: TEAM_LEAD,
        text: `Owner ${memberName} removed from team; task returned to pending`,
      })
    }
  }
  return state
}

export function deleteTeamState(teamName: string): void {
  const team = readTeamState(teamName)
  if (team) {
    for (const member of Object.values(team.members)) {
      if (member.sessionFile) {
        clearSessionContext(member.sessionFile)
        if (member.name !== TEAM_LEAD) {
          try {
            fs.rmSync(member.sessionFile, { force: true })
          } catch {
            // ignore
          }
        }
      }
    }
    if (team.leaderSessionFile) clearSessionContext(team.leaderSessionFile)
  }

  for (const dir of [getWorkerSessionsDir()]) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.startsWith(`${sanitizeName(teamName)}-`)) continue
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
      }
    } catch {
      // ignore
    }
  }

  try {
    fs.rmSync(getTeamDir(teamName), { recursive: true, force: true })
  } catch {
    // ignore
  }
}

export function createTask(
  state: TeamState,
  input: { title: string; description: string; blockedBy?: string[] },
): TeamTask {
  const now = Date.now()
  const id = `T${String(state.nextTaskSeq).padStart(3, '0')}`
  state.nextTaskSeq += 1
  const task: TeamTask = {
    id,
    title: input.title,
    description: input.description,
    status: input.blockedBy && input.blockedBy.length > 0 ? 'blocked' : 'pending',
    owner: undefined,
    blockedBy: input.blockedBy ?? [],
    notes: [],
    createdAt: now,
    updatedAt: now,
  }
  state.tasks[id] = task
  return task
}

export function appendTaskNote(
  task: TeamTask,
  author: string,
  text: string,
  extra?: {
    threadId?: string
    messageType?: TeamMessageType
    requestId?: string
    linkedMessageId?: string
    metadata?: Record<string, unknown>
  },
): TeamTaskNote {
  const note: TeamTaskNote = {
    at: Date.now(),
    author,
    text,
    threadId: extra?.threadId,
    messageType: extra?.messageType,
    requestId: extra?.requestId,
    linkedMessageId: extra?.linkedMessageId,
    metadata: extra?.metadata,
  }
  task.notes.push(note)
  task.updatedAt = note.at
  return note
}

const TEAM_EVENT_LIMIT = 300

export function appendTeamEvent(
  team: TeamState,
  input: {
    type: string
    by: string
    text: string
    metadata?: Record<string, unknown>
  },
): TeamEvent {
  const event: TeamEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    type: input.type,
    by: input.by,
    text: input.text,
    metadata: input.metadata,
  }
  const next = [...(team.events ?? []), event]
  team.events = next.length > TEAM_EVENT_LIMIT ? next.slice(next.length - TEAM_EVENT_LIMIT) : next
  return event
}

function ensureMailboxFile(mailboxPath: string): void {
  ensureDir(path.dirname(mailboxPath))
  if (fs.existsSync(mailboxPath)) return
  try {
    fs.writeFileSync(mailboxPath, '[]\n', { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code !== 'EEXIST') throw error
  }
}

function readMailboxFile(mailboxPath: string): MailboxMessage[] {
  return readJsonFile<MailboxMessage[]>(mailboxPath) ?? []
}

function withMailboxLock<T>(teamName: string, memberName: string, fn: (mailboxPath: string) => T): T {
  const mailboxPath = getMailboxPath(teamName, memberName)
  return withFileLock(mailboxPath, () => {
    ensureMailboxFile(mailboxPath)
    return fn(mailboxPath)
  })
}

export function ensureMailbox(teamName: string, memberName: string): void {
  withMailboxLock(teamName, memberName, () => undefined)
}

export function readMailbox(teamName: string, memberName: string): MailboxMessage[] {
  const mailboxPath = getMailboxPath(teamName, memberName)
  ensureMailboxFile(mailboxPath)
  return readMailboxFile(mailboxPath)
}

export function pushMailboxMessage(
  teamName: string,
  memberName: string,
  message: Omit<MailboxMessage, 'id' | 'createdAt'>,
): MailboxMessage {
  return withMailboxLock(teamName, memberName, mailboxPath => {
    const mailbox = readMailboxFile(mailboxPath)
    const next: MailboxMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      ...message,
    }
    mailbox.push(next)
    writeJsonFile(mailboxPath, mailbox)
    return next
  })
}

export function peekUnreadMailbox(
  teamName: string,
  memberName: string,
): MailboxMessage[] {
  const mailbox = readMailbox(teamName, memberName)
  return mailbox.filter(m => !m.readAt)
}

export function markMailboxMessagesRead(
  teamName: string,
  memberName: string,
  ids: string[],
): void {
  if (ids.length === 0) return
  withMailboxLock(teamName, memberName, mailboxPath => {
    const mailbox = readMailboxFile(mailboxPath)
    const now = Date.now()
    const idSet = new Set(ids)
    let changed = false
    for (const item of mailbox) {
      if (!item.readAt && idSet.has(item.id)) {
        item.readAt = now
        changed = true
      }
    }
    if (changed) {
      writeJsonFile(mailboxPath, mailbox)
    }
  })
}

