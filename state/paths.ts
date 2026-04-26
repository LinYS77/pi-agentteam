import * as os from 'node:os'
import * as path from 'node:path'
import { ensureDir } from './fsStore.js'

// ---------------------------------------------------------------------------
// Path layout helpers for agentteam's on-disk state.
// ---------------------------------------------------------------------------

export function sanitizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
}

export function getAgentTeamRoot(): string {
  const override = process.env.PI_AGENTTEAM_HOME?.trim()
  const root = override
    ? path.resolve(override)
    : path.join(os.homedir(), '.pi', 'agent', 'agentteam')
  ensureDir(root)
  return root
}

export function getConfigPath(): string {
  return path.join(getAgentTeamRoot(), 'config.json')
}

export function getTeamsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'teams')
  ensureDir(dir)
  return dir
}

export function getTeamDir(teamName: string): string {
  const dir = path.join(getTeamsDir(), sanitizeName(teamName))
  ensureDir(dir)
  return dir
}

export function getTeamStatePath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'state.json')
}

export function getMailboxDir(teamName: string): string {
  const dir = path.join(getTeamDir(teamName), 'mailboxes')
  ensureDir(dir)
  return dir
}

export function getMailboxPath(teamName: string, memberName: string): string {
  return path.join(getMailboxDir(teamName), `${sanitizeName(memberName)}.json`)
}

export function getSessionsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'session-bindings')
  ensureDir(dir)
  return dir
}

export function getWorkerSessionsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'worker-sessions')
  ensureDir(dir)
  return dir
}

export function sanitizeSessionFile(sessionFile: string): string {
  return Buffer.from(sessionFile).toString('base64url')
}

export function getSessionContextPath(sessionFile: string): string {
  return path.join(getSessionsDir(), `${sanitizeSessionFile(sessionFile)}.json`)
}
