import type { OutboxDiagnosticsSummary } from '../app/outboxDiagnostics.js'
import { effectiveTeamIdentity, type TeamIdentity } from '../core/teamIdentity.js'
import type { EffectiveAgentModelSource } from '../config.js'
import type {
  MailboxMessage,
  TeamMember,
  TeamMessagePriority,
  TeamMessageWakeHint,
  TeamState,
  TeamTask,
} from '../internalTypes.js'
import type { QuarantinedTeamSummary } from '../state/validation.js'
import {
  defaultPanelReadModelServices,
  type CompactPlanRunPanelProjection,
  type PanelReadModelServices,
  type ReportWatchdogTaskSummary,
  type TaskHistoryDisplaySummary,
} from './readModelServices.js'

export type PanelMailboxItem = {
  id: string
  from: string
  to: string
  summary?: string
  type?: MailboxMessage['type']
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

export type PanelMemberModel = Pick<TeamMember,
  | 'name'
  | 'role'
  | 'model'
  | 'sessionFile'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'paneId'
  | 'windowTarget'
  | 'lastWakeReason'
  | 'lastError'
  | 'bridgeAvailable'
  | 'bridgeVersion'
  | 'bridgeLastSeenAt'
  | 'bridgeLastDeliveryAt'
  | 'bridgeLastError'
  | 'bridgeWorkRequestedAt'
  | 'bridgeWorkRequestCount'
>

export type PanelTaskModel = Pick<TeamTask,
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'owner'
  | 'blockedBy'
  | 'createdAt'
  | 'updatedAt'
> & {
  history: TaskHistoryDisplaySummary
  watchdog?: ReportWatchdogTaskSummary
}

export type PanelConfigRoleModel = {
  role: string
  modelLabel: string
  modelSource: EffectiveAgentModelSource
}

export type PanelConfigProjection = {
  exists: boolean
  path?: string
  schemaVersion?: number
  diagnosticCount: number
  roleModels: PanelConfigRoleModel[]
}

export type PanelTeamModel = {
  version: TeamState['version']
  name: string
  identity: TeamIdentity
  description?: string
  createdAt: number
  leaderCwd: string
  leaderSessionFile?: string
  members: Record<string, PanelMemberModel>
  tasks: Record<string, PanelTaskModel>
  config?: PanelConfigProjection
  planRuns: CompactPlanRunPanelProjection[]
  nextTaskSeq: number
  revision?: number
  memberTombstones?: Record<string, number>
}

export type TeamAttentionSummary = {
  blockedTasks: number
  unreadMessages: number
  blockedMessages: number
  unownedActiveTasks: number
  errorMembers: number
  paneLostMembers: number
}

export type TeamRuntimeDiagnostics = {
  outbox?: OutboxDiagnosticsSummary
}

export type GlobalTeamMailboxProjection = {
  total: number
  unread: number
  blocked: number
  latestAttention?: PanelMailboxItem
}

export type GlobalPaneItem = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

export type AttachedPanelData = {
  mode: 'attached'
  team: PanelTeamModel
  members: PanelMemberModel[]
  tasks: PanelTaskModel[]
  mailbox: PanelMailboxItem[]
  outboxDiagnostics?: OutboxDiagnosticsSummary
}

export type GlobalPanelData = {
  mode: 'global'
  teams: PanelTeamModel[]
  teamSummaries: Record<string, TeamAttentionSummary>
  teamMailboxes: Record<string, GlobalTeamMailboxProjection>
  teamDiagnostics: Record<string, TeamRuntimeDiagnostics>
  quarantinedTeams: QuarantinedTeamSummary[]
  orphanPanes: GlobalPaneItem[]
}

export type PanelData = AttachedPanelData | GlobalPanelData

export function toPanelMailboxItem(message: MailboxMessage): PanelMailboxItem {
  return {
    id: message.id,
    from: message.from,
    to: message.to,
    summary: message.summary,
    type: message.type,
    taskId: message.taskId,
    threadId: message.threadId,
    requestId: message.requestId,
    replyTo: message.replyTo,
    priority: message.priority,
    wakeHint: message.wakeHint,
    metadata: message.metadata,
    createdAt: message.createdAt,
    deliveredAt: message.deliveredAt,
    readAt: message.readAt,
  }
}

export function toPanelMemberModel(member: TeamMember): PanelMemberModel {
  return {
    name: member.name,
    role: member.role,
    model: member.model,
    sessionFile: member.sessionFile,
    status: member.status,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    paneId: member.paneId,
    windowTarget: member.windowTarget,
    lastWakeReason: member.lastWakeReason,
    lastError: member.lastError,
    bridgeAvailable: member.bridgeAvailable,
    bridgeVersion: member.bridgeVersion,
    bridgeLastSeenAt: member.bridgeLastSeenAt,
    bridgeLastDeliveryAt: member.bridgeLastDeliveryAt,
    bridgeLastError: member.bridgeLastError,
    bridgeWorkRequestedAt: member.bridgeWorkRequestedAt,
    bridgeWorkRequestCount: member.bridgeWorkRequestCount,
  }
}

export function toPanelTaskModel(
  team: TeamState,
  task: TeamTask,
  services: PanelReadModelServices = defaultPanelReadModelServices,
): PanelTaskModel {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    owner: task.owner,
    blockedBy: [...task.blockedBy],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    history: services.taskHistorySummary(team, task.id),
    watchdog: services.taskWatchdogSummary(team, task.id),
  }
}

export function toPanelTeamModel(
  team: TeamState,
  mode: 'attached' | 'global' = 'attached',
  services: PanelReadModelServices = defaultPanelReadModelServices,
): PanelTeamModel {
  const startedAt = Date.now()
  const members = Object.fromEntries(
    Object.entries(team.members).map(([name, member]) => [name, toPanelMemberModel(member)]),
  )
  const tasks = Object.fromEntries(
    Object.entries(team.tasks).map(([taskId, task]) => [taskId, toPanelTaskModel(team, task, services)]),
  )
  services.recordReadModelBuild({
    mode,
    durationMs: Date.now() - startedAt,
    teamCount: 1,
    memberCount: Object.keys(members).length,
    taskCount: Object.keys(tasks).length,
  })
  return {
    version: team.version,
    name: team.name,
    identity: effectiveTeamIdentity(team),
    description: team.description,
    createdAt: team.createdAt,
    leaderCwd: team.leaderCwd,
    leaderSessionFile: team.leaderSessionFile,
    members,
    tasks,
    planRuns: services.planRunProjection(team),
    nextTaskSeq: team.nextTaskSeq,
    revision: team.revision,
    memberTombstones: team.memberTombstones ? { ...team.memberTombstones } : undefined,
  }
}
