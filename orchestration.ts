import { TEAM_LEAD } from './internalTypes.js'
import { fileBackedStateRepository, type RepositoryLeaderCoordinationProjection } from './state/repository.js'
import type { TeamState } from './internalTypes.js'

export type ContextMessage = { role: string; content: unknown }

function blockedTaskIds(team: TeamState): string[] {
  return Object.values(team.tasks)
    .filter(task => task.status === 'blocked')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(task => task.id)
}

export type LeaderCoordinationSnapshot = RepositoryLeaderCoordinationProjection

function fallbackLeaderCoordinationSnapshot(team: TeamState): LeaderCoordinationSnapshot {
  const blockedIds = blockedTaskIds(team)
  return {
    teamName: team.name,
    blockedCount: blockedIds.length,
    blockedTaskIds: blockedIds,
    unreadCount: 0,
    latestUnreadMessageId: '',
    waitingReportCount: 0,
    waitingReportTaskIds: [],
    latestWaitingReportTaskId: '',
    planRunAttentionCount: 0,
    planRunAttention: [],
    latestPlanRunAttentionId: '',
  }
}

export function buildLeaderCoordinationSnapshot(team: TeamState): LeaderCoordinationSnapshot {
  return fileBackedStateRepository.readLeaderCoordinationProjection(team.name) ?? fallbackLeaderCoordinationSnapshot(team)
}

function compactTaskIdList(taskIds: string[], limit = 8): string {
  if (taskIds.length === 0) return '-'
  const shown = taskIds.slice(0, limit)
  const hidden = taskIds.length - shown.length
  return hidden > 0 ? `${shown.join(',')} (+${hidden} more)` : shown.join(',')
}

function compactPlanRunDigestLine(item: LeaderCoordinationSnapshot['planRunAttention'][number]): string {
  const pause = item.pauseReason ? ` pauseReason=${item.pauseReason}` : ''
  const report = item.latestReportId ? ` report=${item.latestReportId}` : ''
  const watchdog = item.watchdog ? ` watchdog=${item.watchdog.state} needsNudge=${item.watchdog.needsNudge}` : ''
  return `${item.planRunId} step ${item.stepNumber} ${item.status}/${item.stepStatus} task=${item.taskId}${pause}${report}${watchdog}; next: ${item.nextAction}`
}

function buildLeaderDigest(team: TeamState, snapshot: LeaderCoordinationSnapshot): string {
  const latestLine = snapshot.latestUnreadMessageId
    ? `Latest unread message id: ${snapshot.latestUnreadMessageId}`
    : 'Latest unread message id: none'
  const waitingReportLines = snapshot.waitingReportCount > 0
    ? [
        `- report watchdog waiting_for_report count: ${snapshot.waitingReportCount}`,
        `- report watchdog waiting_for_report tasks: ${compactTaskIdList(snapshot.waitingReportTaskIds)}`,
        `- suggested action: agentteam_task action=nudge_report taskId=${snapshot.latestWaitingReportTaskId}`,
      ]
    : ['- report watchdog waiting_for_report count: 0']
  const planRunLines = snapshot.planRunAttentionCount > 0
    ? [
        `- PlanRun attention count: ${snapshot.planRunAttentionCount}`,
        ...snapshot.planRunAttention.slice(0, 3).map(item => `- PlanRun attention: ${compactPlanRunDigestLine(item)}`),
      ]
    : ['- PlanRun attention count: 0']
  return [
    `Leader coordination digest for team ${team.name}:`,
    `- blocked task count: ${snapshot.blockedCount}`,
    `- unread leader mailbox count: ${snapshot.unreadCount}`,
    `- ${latestLine}`,
    ...waitingReportLines,
    ...planRunLines,
  ].join('\n')
}

function messageContainsMarker(message: ContextMessage, marker: string): boolean {
  if (message.role !== 'user') return false
  const content = message.content
  if (typeof content === 'string') {
    return content.includes(marker)
  }
  if (!Array.isArray(content)) return false
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue
    const text = (part as { text?: unknown })['text']
    if (typeof text === 'string' && text.includes(marker)) {
      return true
    }
  }
  return false
}

export function computeLeaderDigestKey(
  team: TeamState,
  coordination?: LeaderCoordinationSnapshot,
): string {
  const snapshot = coordination ?? buildLeaderCoordinationSnapshot(team)
  const planRunKey = snapshot.planRunAttention.map(item => `${item.planRunId}:${item.status}:${item.stepIndex}:${item.taskId}:${item.pauseReason ?? ''}:${item.latestReportId ?? ''}:${item.watchdog?.state ?? ''}:${item.watchdog?.needsNudge ?? ''}`).join(',')
  return `${team.name}|blocked:${snapshot.blockedCount}|blockedIds:${snapshot.blockedTaskIds.join(',')}|unread:${snapshot.unreadCount}|latest:${snapshot.latestUnreadMessageId}|waitingReports:${snapshot.waitingReportCount}|waitingReportIds:${snapshot.waitingReportTaskIds.join(',')}|planRuns:${snapshot.planRunAttentionCount}|planRunItems:${planRunKey}`
}

function computeBlockedDeltaSummary(team: TeamState): {
  blockedCount: number
  blockedFingerprints: string[]
  summary: string
} {
  const ids = blockedTaskIds(team)
  return {
    blockedCount: ids.length,
    blockedFingerprints: ids,
    summary: ids.length > 0 ? `Blocked tasks: ${ids.length}` : 'No blocked tasks right now.',
  }
}

export function maybeInjectLeaderOrchestrationContext(
  event: { messages: ContextMessage[] },
  input: {
    team: TeamState | null
    memberName: string | null
    state: {
      lastDigestKey: string
      lastDigestAt: number
      lastBlockedCount: number
      lastBlockedFingerprints: string[]
    }
  },
): {
  injected?: { messages: ContextMessage[] }
  digestKey: string
  digestAt: number
  blockedCount: number
  blockedFingerprints: string[]
} {
  const { team, memberName, state } = input
  if (!team || memberName !== TEAM_LEAD) {
    return {
      digestKey: state.lastDigestKey,
      digestAt: state.lastDigestAt,
      blockedCount: state.lastBlockedCount,
      blockedFingerprints: state.lastBlockedFingerprints,
    }
  }

  const marker = '[agentteam-orchestration-digest]'
  const alreadyPresent = event.messages.some(message => messageContainsMarker(message, marker))
  const coordination = buildLeaderCoordinationSnapshot(team)
  const digestKey = computeLeaderDigestKey(team, coordination)
  const blocked = computeBlockedDeltaSummary(team)
  const now = Date.now()

  const hasActionableWork = coordination.blockedCount > 0 || coordination.unreadCount > 0 || coordination.waitingReportCount > 0 || coordination.planRunAttentionCount > 0
  if (!hasActionableWork) {
    return {
      digestKey,
      digestAt: state.lastDigestAt,
      blockedCount: blocked.blockedCount,
      blockedFingerprints: blocked.blockedFingerprints,
    }
  }

  const ACTIONABLE_REMINDER_INTERVAL_MS = 10 * 60 * 1000
  const shouldInject =
    !alreadyPresent &&
    (digestKey !== state.lastDigestKey || now - state.lastDigestAt >= ACTIONABLE_REMINDER_INTERVAL_MS)

  if (!shouldInject) {
    return {
      digestKey: state.lastDigestKey,
      digestAt: state.lastDigestAt,
      blockedCount: state.lastBlockedCount,
      blockedFingerprints: state.lastBlockedFingerprints,
    }
  }

  const digest = buildLeaderDigest(team, coordination)
  return {
    injected: {
      messages: [
        ...event.messages,
        {
          role: 'user',
          content: `${marker}\n${digest}`,
        },
      ],
    },
    digestKey,
    digestAt: now,
    blockedCount: blocked.blockedCount,
    blockedFingerprints: blocked.blockedFingerprints,
  }
}
