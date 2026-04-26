import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ensureMailbox,
  getMailboxPath,
  getTeamStatePath,
} from './state.js'
import type { TeamState } from './types.js'
import { TEAM_LEAD } from './types.js'

const ensuredMailboxCache = new Set<string>()

function mailboxEnsureKey(teamName: string, memberName: string): string {
  return `${teamName}:${memberName}`
}

export function invalidateMailboxEnsureCache(teamName?: string): void {
  if (!teamName) {
    ensuredMailboxCache.clear()
    return
  }
  const prefix = `${teamName}:`
  for (const key of ensuredMailboxCache) {
    if (key.startsWith(prefix)) {
      ensuredMailboxCache.delete(key)
    }
  }
}

export function ensureTeamStorageReady(team: TeamState): void {
  const statePath = getTeamStatePath(team.name)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })

  const memberNames = [TEAM_LEAD, ...Object.values(team.members)
    .map(member => member.name)
    .filter(name => name !== TEAM_LEAD)]
  const validKeys = new Set(memberNames.map(memberName => mailboxEnsureKey(team.name, memberName)))

  const prefix = `${team.name}:`
  for (const key of ensuredMailboxCache) {
    if (key.startsWith(prefix) && !validKeys.has(key)) {
      ensuredMailboxCache.delete(key)
    }
  }

  for (const memberName of memberNames) {
    const key = mailboxEnsureKey(team.name, memberName)
    const mailboxPath = getMailboxPath(team.name, memberName)
    if (ensuredMailboxCache.has(key) && fs.existsSync(mailboxPath)) {
      continue
    }
    ensureMailbox(team.name, memberName)
    ensuredMailboxCache.add(key)
  }
}
