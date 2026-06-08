import * as fs from 'node:fs'
import type { SessionTeamContext, TeamState } from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import { readJsonFile, writeJsonFile } from './fsStore.js'
import { getSessionContextPath } from './paths.js'

export type TeamStateReader = (teamName: string) => TeamState | null
export type TeamLister = () => TeamState[]

// ---------------------------------------------------------------------------
// Session <-> team/member binding cache and repair logic.
// This module is dependency-injected with team readers to avoid a circular
// import between session binding and the team store facade.
// ---------------------------------------------------------------------------

let readTeamStateRef: TeamStateReader | null = null
let listTeamsRef: TeamLister | null = null

export function configureSessionBindingStore(input: {
  readTeamState: TeamStateReader
  listTeams: TeamLister
}): void {
  readTeamStateRef = input.readTeamState
  listTeamsRef = input.listTeams
}

function ensureConfigured(): void {
  if (readTeamStateRef && listTeamsRef) return
  throw new Error('session binding store not configured; call initializeStateStores() before deriving session bindings')
}

function readTeamState(teamName: string): TeamState | null {
  ensureConfigured()
  return readTeamStateRef!(teamName)
}

function listTeams(): TeamState[] {
  ensureConfigured()
  return listTeamsRef!()
}

function emptySessionContext(): SessionTeamContext {
  return { teamName: null, memberName: null }
}

function optionalStringFieldOk(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string'
}

function isReadableSessionContext(value: SessionTeamContext | null): value is SessionTeamContext {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SessionTeamContext>
  const teamNameOk = candidate.teamName === null || typeof candidate.teamName === 'string'
  const memberNameOk = candidate.memberName === null || typeof candidate.memberName === 'string'
  return teamNameOk &&
    memberNameOk &&
    optionalStringFieldOk(candidate.teamId) &&
    optionalStringFieldOk(candidate.projectKey) &&
    optionalStringFieldOk(candidate.identityKey) &&
    optionalStringFieldOk(candidate.teamSlug)
}

function addScopedFieldsFromTeam(context: SessionTeamContext): SessionTeamContext {
  if (!context.teamName || !context.memberName) return context
  try {
    const team = findTeamForSessionContext(context)
    if (!team?.identity) return context
    defineScopedContextField(context, 'teamId', team.identity.teamId)
    defineScopedContextField(context, 'projectKey', team.identity.projectKey)
    defineScopedContextField(context, 'identityKey', `${team.identity.projectKey}:${team.identity.slug}`)
    defineScopedContextField(context, 'teamSlug', team.identity.slug)
  } catch {
    // Keep readSessionContext usable before store configuration; validation/derive will enrich later.
  }
  return context
}

function toRuntimeSessionContext(context: SessionTeamContext): SessionTeamContext {
  const runtimeContext: SessionTeamContext = {
    teamName: context.teamName,
    memberName: context.memberName,
  }
  defineScopedContextField(runtimeContext, 'teamId', context.teamId ?? undefined)
  defineScopedContextField(runtimeContext, 'projectKey', context.projectKey ?? undefined)
  defineScopedContextField(runtimeContext, 'identityKey', context.identityKey ?? undefined)
  defineScopedContextField(runtimeContext, 'teamSlug', context.teamSlug ?? undefined)
  return runtimeContext
}

function materializeSessionContextForWrite(context: SessionTeamContext): SessionTeamContext {
  return {
    teamName: context.teamName,
    memberName: context.memberName,
    ...(context.teamId ? { teamId: context.teamId } : {}),
    ...(context.projectKey ? { projectKey: context.projectKey } : {}),
    ...(context.identityKey ? { identityKey: context.identityKey } : {}),
    ...(context.teamSlug ? { teamSlug: context.teamSlug } : {}),
  }
}

function readSessionContextFile(filePath: string): SessionTeamContext | null {
  try {
    const parsed = readJsonFile<SessionTeamContext>(filePath)
    return isReadableSessionContext(parsed) ? addScopedFieldsFromTeam(toRuntimeSessionContext(parsed)) : null
  } catch {
    return null
  }
}

function removePathBestEffort(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true })
  } catch {
    // ignore ENAMETOOLONG and any other filesystem cleanup failure
  }
}

export function readSessionContext(sessionFile: string): SessionTeamContext {
  const hashed = readSessionContextFile(getSessionContextPath(sessionFile))
  if (hashed) return hashed

  return emptySessionContext()
}

export function writeSessionContext(
  sessionFile: string,
  context: SessionTeamContext,
): void {
  writeJsonFile(getSessionContextPath(sessionFile), materializeSessionContextForWrite(context))
  invalidateSessionContextCache(sessionFile)
}

export function clearSessionContext(sessionFile: string): void {
  removePathBestEffort(getSessionContextPath(sessionFile))
  invalidateSessionContextCache(sessionFile)
}

function defineScopedContextField(
  context: SessionTeamContext,
  key: keyof Pick<SessionTeamContext, 'teamId' | 'projectKey' | 'identityKey' | 'teamSlug'>,
  value: string | undefined,
): void {
  if (!value) return
  Object.defineProperty(context, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  })
}

export function buildSessionContextForTeam(
  team: TeamState,
  memberName: string,
): SessionTeamContext {
  const context: SessionTeamContext = {
    teamName: team.name,
    memberName,
  }
  defineScopedContextField(context, 'teamId', team.identity?.teamId)
  defineScopedContextField(context, 'projectKey', team.identity?.projectKey)
  defineScopedContextField(context, 'identityKey', team.identity ? `${team.identity.projectKey}:${team.identity.slug}` : undefined)
  defineScopedContextField(context, 'teamSlug', team.identity?.slug)
  return context
}

function identityKeyForTeam(team: TeamState): string | undefined {
  return team.identity ? `${team.identity.projectKey}:${team.identity.slug}` : undefined
}

function teamMatchesSessionContext(team: TeamState, context: SessionTeamContext): boolean {
  if (context.teamId && team.identity?.teamId !== context.teamId && team.name !== context.teamId) return false
  if (context.projectKey && team.identity?.projectKey !== context.projectKey) return false
  if (context.teamSlug && team.identity?.slug !== context.teamSlug) return false
  if (context.identityKey && identityKeyForTeam(team) !== context.identityKey) return false
  return true
}

function readNamedTeamForSessionContext(context: SessionTeamContext): TeamState | null {
  if (!context.teamName) return null
  const named = readTeamState(context.teamName)
  if (!named) return null
  return teamMatchesSessionContext(named, context) ? named : null
}

function findTeamForSessionContext(context: SessionTeamContext): TeamState | null {
  const named = readNamedTeamForSessionContext(context)
  if (named) return named
  if (context.teamId) {
    const byId = listTeams().find(team => team.identity?.teamId === context.teamId || team.name === context.teamId)
    if (byId) return byId
  }
  if (context.projectKey && (context.teamSlug || context.teamName)) {
    const slug = context.teamSlug ?? context.teamName
    const byProjectSlug = listTeams().find(team => team.identity?.projectKey === context.projectKey && team.identity?.slug === slug)
    if (byProjectSlug) return byProjectSlug
  }
  if (context.identityKey) {
    const byIdentityKey = listTeams().find(team => identityKeyForTeam(team) === context.identityKey)
    if (byIdentityKey) return byIdentityKey
  }
  return context.teamName ? readTeamState(context.teamName) : null
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
  const team = findTeamForSessionContext(context)
  if (!team) return false
  return matchesSessionBinding(team, sessionFile, context.memberName)
}

function findSessionBinding(sessionFile: string): SessionTeamContext {
  const matches: Array<{
    team: TeamState
    memberName: string
    priority: number
    createdAt: number
  }> = []

  for (const team of listTeams()) {
    if (matchesSessionBinding(team, sessionFile, TEAM_LEAD)) {
      matches.push({
        team,
        memberName: TEAM_LEAD,
        priority: 2,
        createdAt: team.createdAt,
      })
    }
    for (const member of Object.values(team.members)) {
      if (member.name === TEAM_LEAD) continue
      if (member.sessionFile !== sessionFile) continue
      matches.push({
        team,
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
  return buildSessionContextForTeam(match.team, match.memberName)
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
    context: emptySessionContext(),
    source: (cached.teamName || cached.memberName ? 'cleared' : 'none') as 'cleared' | 'none',
  }
  sessionContextCache.set(sessionFile, { result, at: now })
  return result
}
