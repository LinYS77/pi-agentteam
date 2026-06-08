import * as crypto from 'node:crypto'
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

export function getQuarantineRoot(): string {
  const dir = path.join(getAgentTeamRoot(), '_quarantine')
  ensureDir(dir)
  return dir
}

export function getTeamDir(teamName: string): string {
  const dir = path.join(getTeamsDir(), sanitizeName(teamName))
  ensureDir(dir)
  return dir
}

export function getTeamStatePath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'team.json')
}

export function getMailboxDir(teamName: string): string {
  const dir = path.join(getTeamDir(teamName), 'inboxes')
  ensureDir(dir)
  return dir
}

export function getMailboxPath(teamName: string, memberName: string): string {
  return path.join(getMailboxDir(teamName), `${sanitizeName(memberName)}.json`)
}

export function getMailboxProjectionPath(teamName: string, memberName: string): string {
  return path.join(getMailboxDir(teamName), `${sanitizeName(memberName)}.panel.json`)
}

export function getTeamPanelProjectionPath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'team-panel.json')
}

export function getRuntimeStatePath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'runtime.json')
}

export function getOutboxStatePath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'outbox.json')
}

export function getOutboxDiagnosticsPath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'outbox-diagnostics.json')
}

export function getSessionsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'sessions')
  ensureDir(dir)
  return dir
}

export function getWorkerSessionsDir(): string {
  const dir = path.join(getAgentTeamRoot(), 'worker-sessions')
  ensureDir(dir)
  return dir
}

export function hashSessionFile(sessionFile: string): string {
  return crypto.createHash('sha256').update(sessionFile).digest('hex')
}

export function getSessionContextPath(sessionFile: string): string {
  return path.join(getSessionsDir(), `session-${hashSessionFile(sessionFile)}.json`)
}

function readablePathPrefix(value: string, maxLength: number): string {
  const sanitized = sanitizeName(value).replace(/^-+|-+$/g, '') || 'item'
  return sanitized.slice(0, maxLength).replace(/[-._]+$/g, '') || 'item'
}

export function getWorkerSessionFilePrefix(teamName: string): string {
  return `worker-${readablePathPrefix(teamName, 32)}-`
}

export function getWorkerSessionPath(teamName: string, workerName: string): string {
  const key = `${teamName}\n${workerName}`
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)
  const workerPrefix = readablePathPrefix(workerName, 32)
  return path.join(getWorkerSessionsDir(), `${getWorkerSessionFilePrefix(teamName)}${workerPrefix}-${hash}.jsonl`)
}

export function isWorkerSessionFileForTeam(fileName: string, teamName: string): boolean {
  const basename = path.basename(fileName)
  if (!basename.startsWith(getWorkerSessionFilePrefix(teamName))) return false
  return /^worker-.+-[0-9a-f]{24}\.jsonl$/.test(basename)
}
