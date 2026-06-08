// Internal persisted/runtime model types.
//
// These types describe AgentTeam's on-disk stores and runtime adapter state.
// They are intentionally separate from the public vocabulary in
// core/publicModel.ts and should not be presented as public API/tool schema.

import type { MessageType, TaskReportType, TaskStatus } from './core/publicModel.js'
import type { TeamIdentity } from './core/teamIdentity.js'

export { TEAM_LEAD } from './core/teamIdentity.js'

export const WORKER_FSM_STATUSES = ['offline', 'idle', 'pending_delivery', 'queued', 'running', 'draining', 'error'] as const
export type WorkerFsmStatus = typeof WORKER_FSM_STATUSES[number]
export type MemberStatus = WorkerFsmStatus

export type SessionTeamContext = {
  teamName: string | null
  memberName: string | null
  teamId?: string | null
  projectKey?: string | null
  identityKey?: string | null
  teamSlug?: string | null
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

export type TeamTask = {
  id: string
  title: string
  description: string
  status: TaskStatus
  owner?: string
  blockedBy: string[]
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

export type TaskReportStatusAtReport = Extract<TaskStatus, 'open' | 'blocked'>

export type TaskReport = {
  id: string
  taskId: string
  type: TaskReportType
  author: string
  text: string
  summary: string
  createdAt: number
  threadId?: string
  reportOnly: true
  reporterIsOwner: boolean
  reportedBlockedBy?: string[]
  statusAtReport: TaskReportStatusAtReport
  ownerAtReport?: string
  mailboxMessageId?: string
  metadata?: Record<string, unknown>
}

export type TaskEventType =
  | 'created'
  | 'assigned'
  | 'blocked'
  | 'unblocked'
  | 'closed'
  | 'owner_removed'
  | 'progress'
  | 'report_submitted'
  | 'migrated'

export type TaskEvent = {
  id: string
  taskId: string
  type: TaskEventType
  by: string
  at: number
  summary: string
  reportId?: string
  data?: Record<string, unknown>
}

export type TaskMessageRef = {
  id: string
  taskId: string
  mailboxMessageId: string
  from: string
  to: string
  type: TeamMessageType
  createdAt: number
  threadId?: string
  summary?: string
  priority?: TeamMessagePriority
  wakeHint?: TeamMessageWakeHint
  reportId?: string
  diagnostic?: boolean
  metadata?: Record<string, unknown>
}

export type PlanRunStatus =
  | 'approved'
  | 'active'
  | 'waiting_review'
  | 'paused'
  | 'cancelled'
  | 'done'

export type PlanRunStepStatus =
  | 'pending'
  | 'assigned'
  | 'open'
  | 'waiting_review'
  | 'done'
  | 'blocked'
  | 'skipped'

export type PlanRunPauseReason =
  | 'report_blocked'
  | 'question'
  | 'watchdog'
  | 'waiting_for_report'
  | 'leader_paused'
  | 'validation_failed'

export type PlanRunStep = {
  id: string
  index: number
  title: string
  description: string
  owner?: string
  taskId?: string
  status: PlanRunStepStatus
  createdAt: number
  updatedAt: number
  sourceSummary?: string
  metadata?: Record<string, unknown>
}

export type PlanRun = {
  id: string
  status: PlanRunStatus
  sourceTaskId?: string
  sourceReportId: string
  sourceReportSummary?: string
  sourceReportHash?: string
  approvedBy?: string
  approvedAt?: number
  createdAt: number
  updatedAt: number
  currentStepIndex: number
  activeTaskId?: string
  pauseReason?: PlanRunPauseReason
  steps: PlanRunStep[]
  metadata?: Record<string, unknown>
}

export type PlanRunEventType =
  | 'approved'
  | 'advanced'
  | 'step_task_created'
  | 'step_accepted'
  | 'waiting_review'
  | 'paused'
  | 'resumed'
  | 'cancelled'
  | 'completed'

export type PlanRunEvent = {
  id: string
  planRunId: string
  type: PlanRunEventType
  by: string
  at: number
  summary: string
  stepIndex?: number
  taskId?: string
  reportId?: string
  pauseReason?: PlanRunPauseReason
  data?: Record<string, unknown>
}

export type TeamState = {
  version: 1
  name: string
  identity?: TeamIdentity
  description?: string
  createdAt: number
  leaderSessionFile?: string
  leaderCwd: string
  members: Record<string, TeamMember>
  tasks: Record<string, TeamTask>
  events?: TeamEvent[]
  taskReports: Record<string, TaskReport>
  taskEvents: Record<string, TaskEvent>
  taskMessageRefs: Record<string, TaskMessageRef>
  planRuns?: Record<string, PlanRun>
  planRunEvents?: Record<string, PlanRunEvent>
  activePlanRunId?: string
  nextTaskSeq: number
  nextTaskReportSeq: number
  nextTaskEventSeq: number
  nextTaskMessageRefSeq: number
  nextPlanRunSeq?: number
  nextPlanRunEventSeq?: number
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
