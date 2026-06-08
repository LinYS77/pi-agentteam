import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TeamIdentity } from '../core/teamIdentity.js'
import { buildNewTeamIdentity } from '../core/teamIdentity.js'
import type { TeamMember, TeamState } from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import { readJsonFile, writeJsonFile, withFileLock } from './fsStore.js'
import {
  getTeamDir,
  getTeamsDir,
  getTeamStatePath,
  getWorkerSessionsDir,
  isWorkerSessionFileForTeam,
  sanitizeName,
} from './paths.js'
import { mergeTeamStates, normalizeTeamState } from './merge.js'
import { migrateTaskNotesToHistory, teamHasLegacyTaskNotes } from './taskHistoryMigration.js'
import { clearSessionContext } from './sessionBinding.js'
import { validateOrQuarantineTeam, validatePersistedTeamState } from './validation.js'
import { writeTeamPanelProjection } from './panelProjectionStore.js'

// ---------------------------------------------------------------------------
// Team state persistence and in-memory member mutations.
// Public callers should prefer updateTeamState() for read-modify-write paths.
// writeTeamState() is retained for backwards-compatible stale-writer merging.
// ---------------------------------------------------------------------------

export function createInitialTeamState(input: {
  teamName: string
  description?: string
  leaderSessionFile?: string
  leaderCwd: string
  identity?: TeamIdentity
  storageName?: string
}): TeamState {
  const now = Date.now()
  const teamName = sanitizeName(input.storageName ?? input.teamName)
  let identity = input.identity
  try {
    identity = identity ?? buildNewTeamIdentity({ rawName: input.teamName, cwd: input.leaderCwd })
  } catch {
    identity = undefined
  }
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
    identity,
    description: input.description,
    createdAt: now,
    leaderSessionFile: input.leaderSessionFile,
    leaderCwd: input.leaderCwd,
    members: {
      [TEAM_LEAD]: leader,
    },
    tasks: {},
    events: [],
    taskReports: {},
    taskEvents: {},
    taskMessageRefs: {},
    planRuns: {},
    planRunEvents: {},
    nextTaskSeq: 1,
    nextTaskReportSeq: 1,
    nextTaskEventSeq: 1,
    nextTaskMessageRefSeq: 1,
    nextPlanRunSeq: 1,
    nextPlanRunEventSeq: 1,
    revision: 0,
    memberTombstones: {},
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function teamContentKey(state: TeamState): string {
  const normalized = normalizeTeamState(state)
  const { revision: _revision, ...content } = normalized
  return stableSerialize(content)
}

function cloneTeamState(state: TeamState): TeamState {
  return normalizeTeamState(JSON.parse(JSON.stringify(state)) as TeamState)
}

function migrateLegacyTaskNotesIfNeeded(state: unknown): TeamState {
  return teamHasLegacyTaskNotes(state)
    ? migrateTaskNotesToHistory(state).team
    : normalizeTeamState(state as TeamState)
}

function assertWritableTeamState(state: TeamState): void {
  const reasons = validatePersistedTeamState(state, 'team.json')
  if (reasons.length === 0) return
  const first = reasons[0]!
  throw new Error(`Unsupported vNext team state write for ${state.name}: ${first.code} at ${first.path}`)
}

function ensureLeaderMemberShape(merged: TeamState): void {
  if (!merged.leaderSessionFile) return

  const existingLeader = merged.members[TEAM_LEAD] ?? {
    name: TEAM_LEAD,
    role: 'leader',
    cwd: merged.leaderCwd,
    sessionFile: merged.leaderSessionFile,
    status: 'idle' as const,
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

export function readTeamState(teamName: string): TeamState | null {
  if (validateOrQuarantineTeam(teamName)) return null
  const rawState = readJsonFile<unknown>(getTeamStatePath(teamName))
  if (!rawState) return null
  const migrated = migrateLegacyTaskNotesIfNeeded(rawState)
  if (teamHasLegacyTaskNotes(rawState)) {
    writeTeamState(migrated)
  }
  return migrated
}

export function writeTeamState(state: TeamState): void {
  const input = migrateLegacyTaskNotesIfNeeded(state)
  if (validateOrQuarantineTeam(input.name)) {
    throw new Error(`Team ${input.name} was quarantined because persisted state is unsupported by vNext`)
  }
  assertWritableTeamState(input)
  const statePath = getTeamStatePath(input.name)
  withFileLock(statePath, () => {
    const current = readJsonFile<TeamState>(statePath)
    let merged = normalizeTeamState(input)
    const currentState = current ? migrateLegacyTaskNotesIfNeeded(current) : null
    merged = currentState ? mergeTeamStates(currentState, merged) : {
      ...merged,
      revision: (merged.revision ?? 0) + 1,
    }

    ensureLeaderMemberShape(merged)
    assertWritableTeamState(merged)
    writeJsonFile(statePath, merged)
    writeTeamPanelProjection(merged)
    Object.assign(state, merged)
  })
}

export function updateTeamState(
  teamName: string,
  updater: (team: TeamState) => void | TeamState,
): TeamState | null {
  if (validateOrQuarantineTeam(teamName)) return null
  const statePath = getTeamStatePath(teamName)
  return withFileLock(statePath, () => {
    const current = readJsonFile<TeamState>(statePath)
    if (!current) return null

    const normalizedCurrent = migrateLegacyTaskNotesIfNeeded(current)
    let next = cloneTeamState(normalizedCurrent)
    const replacement = updater(next)
    if (replacement) next = replacement
    next = normalizeTeamState(next)
    ensureLeaderMemberShape(next)
    assertWritableTeamState(next)

    if (teamContentKey(next) === teamContentKey(normalizedCurrent)) {
      return normalizedCurrent
    }

    next.revision = (normalizedCurrent.revision ?? 0) + 1
    writeJsonFile(statePath, next)
    writeTeamPanelProjection(next)
    return next
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

export function findTeamByProjectSlug(projectKey: string, slug: string): TeamState | null {
  return listTeams().find(team => team.identity?.projectKey === projectKey && team.identity?.slug === slug) ?? null
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
  patch: Partial<Pick<TeamMember, 'status' | 'lastWakeReason' | 'lastError' | 'cwd' | 'paneId' | 'windowTarget' | 'bootPrompt' | 'bridgeAvailable' | 'bridgeVersion' | 'bridgeLastSeenAt' | 'bridgeLastDeliveryAt' | 'bridgeLastError' | 'bridgeWorkRequestedAt' | 'bridgeWorkRequestCount' | 'bridgeWorkRequestMessageIds' | 'bridgeWorkRequestBootPrompt'>>,
): TeamState {
  const existing = state.members[memberName]
  if (!existing) return state
  const changed = Object.entries(patch).some(
    ([key, value]) => existing[key as keyof typeof existing] !== value,
  )
  if (!changed) return state
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
    if (task.owner === memberName && task.status !== 'done') {
      task.owner = undefined
      task.status = 'open'
      task.updatedAt = removedAt
      const eventId = `TE${String(state.nextTaskEventSeq).padStart(4, '0')}`
      state.nextTaskEventSeq += 1
      state.taskEvents[eventId] = {
        id: eventId,
        taskId: task.id,
        type: 'owner_removed',
        by: TEAM_LEAD,
        at: removedAt,
        summary: `Owner ${memberName} removed from team; task returned to open`,
        data: { source: 'member_removal', memberName },
      }
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
        if (!isWorkerSessionFileForTeam(entry, teamName)) continue
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
