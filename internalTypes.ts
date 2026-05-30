// Internal persisted/runtime model types.
//
// These types describe AgentTeam's on-disk stores and runtime adapter state.
// They are intentionally separate from the public vocabulary in
// core/publicModel.ts and should not be presented as public API/tool schema.

import type { MessageType, TaskReportType, TaskStatus } from './core/publicModel.js'
import type { TaskNoteDisplayMode, TaskNoteSourceKind } from './core/taskNoteModel.js'

export { TEAM_LEAD } from './core/teamIdentity.js'
export type { TaskNoteDisplayMode, TaskNoteSourceKind } from './core/taskNoteModel.js'

export const WORKER_FSM_STATUSES = ['offline', 'idle', 'pending_delivery', 'queued', 'running', 'draining', 'error'] as const
export type WorkerFsmStatus = typeof WORKER_FSM_STATUSES[number]
export type MemberStatus = WorkerFsmStatus

export type SessionTeamContext = {
  teamName: string | null
  memberName: string | null
}

export type TeamMember = {
  name: string
  role: string
  model?: string
  tools?: string[]
  systemPrompt?: string
  cwd: string
  sessionFile: string
  paneId?: string
  windowTarget?: string
  bootPrompt?: string
  status: MemberStatus
  createdAt: number
  updatedAt: number
  lastWakeReason?: string
  lastError?: string
  bridgeAvailable?: boolean
  bridgeVersion?: number
  bridgeLastSeenAt?: number
  bridgeLastDeliveryAt?: number
  bridgeLastError?: string
  bridgeWorkRequestedAt?: number
  bridgeWorkRequestCount?: number
  bridgeWorkRequestMessageIds?: string[]
  bridgeWorkRequestBootPrompt?: string
}

export type TeamMessageType = MessageType | TaskReportType

export type TeamMessagePriority = 'low' | 'normal' | 'high'
export type TeamMessageWakeHint = 'none' | 'soft' | 'hard'

export type TaskNoteMetadata = Record<string, unknown> & {
  metadataVersion?: number
  sourceKind?: TaskNoteSourceKind
  displayMode?: TaskNoteDisplayMode
  linkedIds?: Record<string, string>
}

export type TeamTaskNote = {
  at: number
  author: string
  text: string
  threadId?: string
  messageType?: TeamMessageType
  requestId?: string
  linkedMessageId?: string
  metadata?: TaskNoteMetadata
  hidden?: boolean
}

export type TeamTask = {
  id: string
  title: string
  description: string
  status: TaskStatus
  owner?: string
  blockedBy: string[]
  notes: TeamTaskNote[]
  createdAt: number
  updatedAt: number
}

export type TeamEvent = {
  id: string
  at: number
  type: string
  by: string
  text: string
  metadata?: Record<string, unknown>
}

export type TeamState = {
  version: 1
  name: string
  description?: string
  createdAt: number
  leaderSessionFile?: string
  leaderCwd: string
  members: Record<string, TeamMember>
  tasks: Record<string, TeamTask>
  events?: TeamEvent[]
  nextTaskSeq: number
  revision?: number
  memberTombstones?: Record<string, number>
}

export type BridgeLeaseState = {
  memberName: string
  bridgeId: string
  protocolVersion: number
  packageVersion?: string
  sessionFile: string
  pid?: number
  processIdentity?: string
  startedAt: number
  lastSeenAt: number
  expiresAt: number
  generation: number
  capabilities: string[]
  lastError?: string
}

export type DeliveryRequestStatus =
  | 'pending'
  | 'claimed'
  | 'submitted'
  | 'started'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled'

export type DeliveryRequestClaim = {
  claimId: string
  bridgeId: string
  claimedAt: number
  expiresAt: number
  generation: number
  messageIds: string[]
  promptHash: string
}

export type DeliveryRequestState = {
  requestId: string
  teamName: string
  memberName: string
  status: DeliveryRequestStatus
  messageIds: string[]
  bootPrompt?: string
  requestedBy?: string
  reason?: string
  promptHash?: string
  createdAt: number
  updatedAt: number
  expiresAt: number
  claim?: DeliveryRequestClaim
  submittedAt?: number
  startedAt?: number
  completedAt?: number
  failedAt?: number
  expiredAt?: number
  cancelledAt?: number
  lastError?: string
}

export type LeaderProjectionStatus = 'pending' | 'projecting' | 'projected' | 'failed'

export type LeaderProjectionState = {
  projectionKey: string
  teamName: string
  messageId: string
  generation: string
  status: LeaderProjectionStatus
  attempts: number
  createdAt: number
  updatedAt: number
  claimExpiresAt?: number
  projectedAt?: number
  failedAt?: number
  lastError?: string
}

export type LeaderAttentionStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'

export type LeaderAttentionState = {
  attentionKey: string
  teamName: string
  messageId: string
  generation: string
  status: LeaderAttentionStatus
  attempts: number
  createdAt: number
  updatedAt: number
  claimExpiresAt?: number
  sentAt?: number
  failedAt?: number
  skippedAt?: number
  lastError?: string
}

export type MailboxMessage = {
  id: string
  from: string
  to: string
  text: string
  summary?: string
  type?: TeamMessageType
  taskId?: string
  threadId?: string
  requestId?: string
  replyTo?: string
  priority?: TeamMessagePriority
  wakeHint?: TeamMessageWakeHint
  metadata?: Record<string, unknown>
  createdAt: number
  deliveredAt?: number
  readAt?: number
}
