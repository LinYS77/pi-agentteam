import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { ensureMailbox } from '../state/mailboxStore.js'
import { getMailboxPath } from '../state/paths.js'
import { getSessionFile } from '../session.js'
import { TEAM_LEAD } from '../internalTypes.js'
import {
  createLeaderMailboxSignalRuntime,
  type LeaderMailboxSignalItem,
} from './leaderMailboxSignalRuntime.js'
import { watchFileDebounced } from './watchFileDebounced.js'
import type { DebouncedFileWatcher } from './watchFileDebounced.js'

export type LeaderMailboxProjectionWatcher = {
  stop: () => void
}

export type LeaderMailboxProjectionItem = LeaderMailboxSignalItem

export type AttachedLeaderSessionContext = {
  context: { teamName: string | null; memberName: string | null }
  source: 'cached' | 'derived' | 'cleared' | 'none'
}

export type LeaderProjectionServiceDeps = {
  attachCurrentSessionIfNeeded(ctx: ExtensionContext): AttachedLeaderSessionContext
  deliverLeaderMailbox(ctx: ExtensionContext): LeaderMailboxProjectionItem[]
}

export type LeaderProjectionService = {
  runMailboxSync: (ctx: ExtensionContext) => void
  startLeaderMailboxProjectionWatcher: (ctx: ExtensionContext, attached?: AttachedLeaderSessionContext) => LeaderMailboxProjectionWatcher | null
  stopLeaderMailboxProjectionWatcher: (ctx: ExtensionContext) => void
  resetMailboxSyncKey: () => void
}

const LEADER_MAILBOX_WATCH_DEBOUNCE_MS = 150
const LEADER_MAILBOX_WATCH_RETRY_MS = 1_000

function leaderProjectionWatcherKey(sessionFile: string, teamName: string): string {
  return JSON.stringify([sessionFile, teamName])
}

export function createLeaderProjectionService(pi: ExtensionAPI, deps: LeaderProjectionServiceDeps): LeaderProjectionService {
  const signalRuntime = createLeaderMailboxSignalRuntime({ nativeSender: pi })
  const leaderProjectionWatchers = new Map<string, LeaderMailboxProjectionWatcher>()

  function runMailboxSync(ctx: ExtensionContext): void {
    const unread = deps.deliverLeaderMailbox(ctx)
    if (unread.length === 0) return
    const result = signalRuntime.sync(unread)
    if (result.projectedCount > 0) ctx.ui.notify(`agentteam: ${result.projectedCount} new teammate message(s)${result.attentionCount > 0 ? '; bounded leader attention requested' : ''}`, 'info')
  }

  function startLeaderMailboxProjectionWatcher(
    ctx: ExtensionContext,
    attached = deps.attachCurrentSessionIfNeeded(ctx),
  ): LeaderMailboxProjectionWatcher | null {
    const { teamName, memberName } = attached.context
    if (!teamName || memberName !== TEAM_LEAD) return null

    const sessionFile = getSessionFile(ctx)
    const key = leaderProjectionWatcherKey(sessionFile, teamName)
    const existing = leaderProjectionWatchers.get(key)
    if (existing) return existing

    ensureMailbox(teamName, TEAM_LEAD)
    const mailboxPath = getMailboxPath(teamName, TEAM_LEAD)
    let fileWatcher: DebouncedFileWatcher | null = null
    const controller: LeaderMailboxProjectionWatcher = {
      stop() {
        fileWatcher?.stop()
        fileWatcher = null
        leaderProjectionWatchers.delete(key)
      },
    }
    leaderProjectionWatchers.set(key, controller)
    fileWatcher = watchFileDebounced(mailboxPath, {
      debounceMs: LEADER_MAILBOX_WATCH_DEBOUNCE_MS,
      retryMs: LEADER_MAILBOX_WATCH_RETRY_MS,
      onChange: () => runMailboxSync(ctx),
    })
    return controller
  }

  function stopLeaderMailboxProjectionWatcher(ctx: ExtensionContext): void {
    const sessionFile = getSessionFile(ctx)
    for (const [key, watcher] of [...leaderProjectionWatchers.entries()]) {
      let parsed: unknown
      try {
        parsed = JSON.parse(key)
      } catch {
        parsed = null
      }
      if (!Array.isArray(parsed) || parsed[0] !== sessionFile) continue
      watcher.stop()
    }
  }

  function resetMailboxSyncKey(): void {
    signalRuntime.resetVolatileState()
  }

  return {
    runMailboxSync,
    startLeaderMailboxProjectionWatcher,
    stopLeaderMailboxProjectionWatcher,
    resetMailboxSyncKey,
  }
}
