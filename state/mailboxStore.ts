import * as fs from 'node:fs'
import * as path from 'node:path'
import type { MailboxMessage } from '../types.js'
import { unreadMailboxMessages } from '../messageLifecycle.js'
import { ensureDir, readJsonFile, withFileLock, writeJsonFile } from './fsStore.js'
import { getMailboxPath } from './paths.js'

// ---------------------------------------------------------------------------
// File-backed mailbox primitives. Each member gets one append-only JSON array
// guarded by its own lock file.
// ---------------------------------------------------------------------------

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
  return unreadMailboxMessages(mailbox)
}

function markMailboxMessages(
  teamName: string,
  memberName: string,
  ids: string[],
  field: 'deliveredAt' | 'readAt',
): void {
  if (ids.length === 0) return
  withMailboxLock(teamName, memberName, mailboxPath => {
    const mailbox = readMailboxFile(mailboxPath)
    const now = Date.now()
    const idSet = new Set(ids)
    let changed = false
    for (const item of mailbox) {
      if (!item[field] && idSet.has(item.id)) {
        item[field] = now
        changed = true
      }
    }
    if (changed) {
      writeJsonFile(mailboxPath, mailbox)
    }
  })
}

export function markMailboxMessagesDelivered(
  teamName: string,
  memberName: string,
  ids: string[],
): void {
  markMailboxMessages(teamName, memberName, ids, 'deliveredAt')
}

export function markMailboxMessagesRead(
  teamName: string,
  memberName: string,
  ids: string[],
): void {
  markMailboxMessages(teamName, memberName, ids, 'readAt')
}
