import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const TEAM_LEAD = 'team-lead'

export type TeamIdentity = {
  teamId: string
  projectKey: string
  displayName: string
  slug: string
  legacyName?: string
}

export type TeamIdentitySource = {
  name: string
  identity?: TeamIdentity
  leaderCwd?: string
}

export type BuildNewTeamIdentityInput = {
  rawName: string
  cwd: string
}

function hashPart(value: string, length = 16): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length)
}

function normalizeProjectSource(cwd: string): string {
  const resolved = path.resolve(String(cwd || '.'))
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

export function slugifyNewTeamName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
}

function isSafeNewTeamSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(slug)
}

export function deriveProjectKey(cwd: string): string {
  const source = normalizeProjectSource(cwd)
  return `project-${hashPart(source, 16)}`
}

export function buildNewTeamIdentity(input: BuildNewTeamIdentityInput): TeamIdentity {
  const displayName = String(input.rawName ?? '').trim()
  const slug = slugifyNewTeamName(displayName)
  if (!slug) {
    throw new Error('Team name cannot be empty after normalization')
  }
  if (!isSafeNewTeamSlug(slug)) {
    throw new Error('Team name must normalize to a safe ASCII slug that starts and ends with a letter or digit')
  }
  const projectKey = deriveProjectKey(input.cwd)
  const teamId = `team-${hashPart(`${projectKey}\0${slug}`, 16)}`
  return {
    teamId,
    projectKey,
    displayName,
    slug,
  }
}

export function effectiveTeamIdentity(team: TeamIdentitySource): TeamIdentity {
  if (team.identity) return team.identity
  const legacyName = team.name
  const projectSource = team.leaderCwd?.trim() || legacyName
  return {
    teamId: `legacy-team-${hashPart(legacyName, 16)}`,
    projectKey: `legacy-project-${hashPart(projectSource, 16)}`,
    displayName: legacyName,
    slug: legacyName,
    legacyName,
  }
}
