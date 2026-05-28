import { getBridgeLease } from '../../state/bridgeStore.js'
import { peekUnreadMailbox } from '../../state/mailboxStore.js'
import { updateMemberStatus, updateTeamState } from '../../state/teamStore.js'
import { decideMessagePolicy } from '../../core/messagePolicy.js'
import { isMessageType, isTaskReportType } from '../../core/publicModel.js'
import { parsePersistedMessageType } from '../../protocol.js'
import { TEAM_LEAD } from '../../internalTypes.js'
import type {
  TeamMessageType,
  TeamMessageWakeHint,
  TeamState,
} from '../../internalTypes.js'
import type { DeliveryResult } from '../../app/deliveryTypes.js'
import { undeliveredMailboxMessages } from '../../messageLifecycle.js'
import { buildWorkerTurnPrompt } from '../../workerTurnPrompt.js'
import { createBridgeDeliveryRequest } from '../../runtime/bridgeRequest.js'
import { BRIDGE_TASK_REQUEST_REASON, isBridgeFresh, notifyBridgeWork } from './index.js'
import { healMemberPaneBinding } from '../tmux/teamPanes.js'
import { transitionWorkerFsm } from '../../runtime/workerFsm.js'

export type { DeliveryResult }

function updateMemberStatusPersisted(
  team: TeamState,
  memberName: string,
  patch: Parameters<typeof updateMemberStatus>[2],
): void {
  updateMemberStatus(team, memberName, patch)
  updateTeamState(team.name, latest => {
    updateMemberStatus(latest, memberName, patch)
  })
}

function buildMemberTurnPrompt(
  team: TeamState,
  memberName: string,
  explicitTask: string | undefined,
  unreadMessagesForPrompt: ReturnType<typeof peekUnreadMailbox>,
): string | null {
  return buildWorkerTurnPrompt(team, memberName, {
    explicitInstruction: explicitTask,
    unreadMessages: unreadMessagesForPrompt,
    allowAssignedTaskTrigger: true,
  })
}

export async function requestLeaderAttentionIfNeeded(
  team: TeamState,
  message: {
    type?: TeamMessageType
    wakeHint?: TeamMessageWakeHint
    from?: string
    summary?: string
    text?: string
    messageId?: string
    taskId?: string
    threadId?: string
  },
): Promise<DeliveryResult> {
  const type = parsePersistedMessageType(message.type)
  const decision = type && isTaskReportType(type)
    ? decideMessagePolicy({ kind: 'task_report', reportType: type, recipientKind: 'leader' })
    : type && isMessageType(type)
      ? decideMessagePolicy({ kind: 'message', messageType: type, recipientKind: 'leader' })
      : undefined
  const wakeHint = message.wakeHint ?? decision?.wakeHint ?? 'none'
  if (!decision || decision.intent !== 'leader_attention' || !decision.shouldWake || wakeHint === 'none') {
    return {
      ok: false,
      recipient: TEAM_LEAD,
      wakeHint,
      reason: wakeHint === 'none' ? 'wake hint does not require wake' : `${type} does not request leader attention`,
      method: 'projection_requested',
    }
  }
  const reason = `leader attention requested ${type}`
  updateMemberStatusPersisted(team, TEAM_LEAD, {
    lastWakeReason: reason,
    lastError: undefined,
  })
  return {
    ok: true,
    recipient: TEAM_LEAD,
    wakeHint,
    reason,
    method: 'leader_attention_requested',
  }
}

export type WorkerDeliveryRequestOptions = {
  requestedBy?: string
  reason?: string
  messageIds?: string[]
  wakeHint?: TeamMessageWakeHint
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

export async function requestWorkerDelivery(
  team: TeamState,
  memberName: string,
  explicitTask?: string,
  options: WorkerDeliveryRequestOptions = {},
): Promise<DeliveryResult> {
  const member = team.members[memberName]
  if (!member || member.name === TEAM_LEAD) return { ok: false, recipient: memberName, reason: 'member not found or leader' }
  healMemberPaneBinding(member)

  const unread = peekUnreadMailbox(team.name, memberName)
  const requestedIds = new Set(options.messageIds ?? [])
  const promptMessages = undeliveredMailboxMessages(unread)
    .filter(message => requestedIds.size === 0 || requestedIds.has(message.id))
  const prompt = buildMemberTurnPrompt(team, memberName, explicitTask, promptMessages)
  if (!prompt) return { ok: false, recipient: memberName, reason: 'no prompt-worthy task, boot prompt, or undelivered message' }

  const bridgeReason = options.reason ?? (promptMessages.length > 0
    ? 'bridge delivery requested'
    : BRIDGE_TASK_REQUEST_REASON)
  const requestedMessageIds = uniqueStrings([
    ...(options.messageIds ?? []),
    ...promptMessages.map(msg => msg.id),
  ])
  const requestedBootPrompt = explicitTask ?? member.bootPrompt
  const wakeHint: TeamMessageWakeHint = options.wakeHint ?? (explicitTask ? 'hard' : 'soft')
  const requestedAt = Date.now()

  updateMemberStatusPersisted(team, memberName, {
    ...transitionWorkerFsm({ member, event: 'deliveryRequested', reason: bridgeReason }).patch,
    ...(explicitTask ? { bootPrompt: explicitTask } : {}),
  })
  const request = createBridgeDeliveryRequest(team.name, memberName, {
    messageIds: requestedMessageIds,
    bootPrompt: requestedBootPrompt,
    requestedBy: options.requestedBy ?? TEAM_LEAD,
    reason: bridgeReason,
    now: requestedAt,
  })
  const lease = getBridgeLease(team.name, memberName)
  const hasVisiblePane = Boolean(member.paneId)
  const bridgeFresh = hasVisiblePane && isBridgeFresh(member, requestedAt, lease)
  if (!bridgeFresh) {
    const reason = hasVisiblePane
      ? 'bridge unavailable in bridge-only delivery mode'
      : 'member pane binding missing; delivery pending'
    updateTeamState(team.name, latest => {
      const latestMemberForFsm = latest.members[memberName] ?? member
      updateMemberStatus(latest, memberName, {
        ...transitionWorkerFsm({ member: latestMemberForFsm, event: 'deliveryRequested', reason }).patch,
        bridgeAvailable: false,
        bridgeLastError: reason,
        ...(explicitTask ? { bootPrompt: explicitTask } : {}),
      })
      const latestMember = latest.members[memberName]
      if (!latestMember || latestMember.name === TEAM_LEAD) return
      latestMember.bridgeWorkRequestedAt = request.updatedAt
      latestMember.bridgeWorkRequestMessageIds = [...request.messageIds]
      latestMember.bridgeWorkRequestBootPrompt = request.bootPrompt
    })
    updateMemberStatus(team, memberName, {
      ...transitionWorkerFsm({ member, event: 'deliveryRequested', reason }).patch,
      bridgeAvailable: false,
      bridgeLastError: reason,
      bridgeWorkRequestedAt: request.updatedAt,
      bridgeWorkRequestMessageIds: [...request.messageIds],
      bridgeWorkRequestBootPrompt: request.bootPrompt,
      ...(explicitTask ? { bootPrompt: explicitTask } : {}),
    })
    return {
      ok: false,
      recipient: memberName,
      wakeHint,
      reason,
      error: reason,
      method: 'bridge_requested',
      requestId: request.requestId,
    }
  }

  let deliveredLocally = false
  try {
    deliveredLocally = await notifyBridgeWork(team.name, memberName)
  } catch {
    deliveredLocally = false
  }
  return {
    ok: true,
    recipient: memberName,
    wakeHint,
    reason: deliveredLocally ? 'bridge delivered prompt' : bridgeReason,
    method: deliveredLocally ? 'bridge' : 'bridge_requested',
    requestId: request.requestId,
  }
}
