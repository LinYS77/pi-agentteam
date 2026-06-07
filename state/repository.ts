import type {
  MailboxMessage,
  SessionTeamContext,
  TaskEvent,
  TaskMessageRef,
  TaskReport,
  TeamMember,
  TeamState,
  TeamTask,
} from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import { isMailboxMessageUnread } from '../messageLifecycle.js'
import { summarizeOutboxEffects, type OutboxDiagnosticsSummary } from '../app/outboxDiagnostics.js'
import { markMailboxMessagesDelivered, markMailboxMessagesRead, readMailbox } from './mailboxStore.js'
import {
  appendTaskEvent,
  appendTaskReport,
  updateTaskReport,
} from './taskHistory.js'
import { buildReportWatchdogSummary, type ReportWatchdogSummary, type ReportWatchdogTaskSummary } from './taskReportWatchdogReadModel.js'
import {
  displayTaskReport,
  findTaskReport,
  latestTaskActivity,
  latestTaskReport,
  taskEventsForTask,
  taskHistoryCounts,
  taskHistoryDisplaySummary,
  taskHistorySummary,
  taskMessageRefsForTask,
  taskReportsForTask,
  type TaskHistoryCounts,
  type TaskHistoryDisplaySummary,
  type TaskHistorySummary,
  type TaskHistoryItem,
  type TaskHistoryReportDisplay,
} from './taskHistoryReadModel.js'
import { listOutboxEffects } from './outboxStore.js'
import { readOutboxDiagnosticsStore } from './outboxDiagnosticsStore.js'
import { buildSessionContextForTeam, readSessionContext, writeSessionContext } from './sessionBinding.js'
import { createTask } from './taskStore.js'
import { createInitialTeamState, findTeamByProjectSlug, listTeams, readTeamState, updateTeamState, writeTeamState } from './teamStore.js'
import { listQuarantinedTeams, readLatestQuarantineForTeam, type QuarantinedTeamSummary } from './validation.js'

export type RepositoryMailboxProjectionItem = Pick<MailboxMessage,
  | 'id'
  | 'from'
  | 'to'
  | 'summary'
  | 'type'
  | 'taskId'
  | 'threadId'
  | 'requestId'
  | 'replyTo'
  | 'priority'
  | 'wakeHint'
  | 'metadata'
  | 'createdAt'
  | 'deliveredAt'
  | 'readAt'
>

export type RepositoryLeaderMailboxProjection = {
  total: number
  unread: number
  items: RepositoryMailboxProjectionItem[]
  latestAttention?: RepositoryMailboxProjectionItem
}

export type RepositoryLeaderCoordinationProjection = {
  teamName: string
  blockedCount: number
  blockedTaskIds: string[]
  unreadCount: number
  latestUnreadMessageId: string
  waitingReportCount: number
  waitingReportTaskIds: string[]
  latestWaitingReportTaskId: string
}

export type RepositoryTeamPanelMember = Pick<TeamMember,
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

export type RepositoryTeamPanelTask = Pick<TeamTask,
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

export type RepositoryTeamPanelModel = {
  version: TeamState['version']
  name: string
  identity?: TeamState['identity']
  description?: string
  createdAt: number
  leaderCwd: string
  leaderSessionFile?: string
  members: Record<string, RepositoryTeamPanelMember>
  tasks: Record<string, RepositoryTeamPanelTask>
  nextTaskSeq: number
  revision?: number
  memberTombstones?: Record<string, number>
}

export type TeamMutationWriter = (team: TeamState) => void | TeamState
export type CreateInitialTeamStateInput = Parameters<typeof createInitialTeamState>[0]
export type CreateRepositoryTaskInput = Parameters<typeof createTask>[1]
export type AppendRepositoryTaskEventInput = Parameters<typeof appendTaskEvent>[1]
export type AppendRepositoryTaskReportInput = Parameters<typeof appendTaskReport>[1]
export type UpdateRepositoryTaskReportInput = Parameters<typeof updateTaskReport>[2]

export type StateRepository = {
  createInitialTeamState(input: CreateInitialTeamStateInput): TeamState
  readTeamState(teamName: string): TeamState | null
  writeTeamState(team: TeamState): void
  updateTeamState(teamName: string, updater: TeamMutationWriter): TeamState | null
  findTeamByProjectSlug(projectKey: string, slug: string): TeamState | null
  readSessionContext(sessionFile: string): SessionTeamContext
  writeSessionContext(sessionFile: string, context: SessionTeamContext): void
  buildSessionContextForTeam(team: TeamState, memberName: string): SessionTeamContext
  readLatestQuarantineForTeam(teamName: string): QuarantinedTeamSummary | null
  readMailbox(teamName: string, memberName: string): MailboxMessage[]
  markMailboxMessagesDelivered(teamName: string, memberName: string, ids: string[]): void
  markMailboxMessagesRead(teamName: string, memberName: string, ids: string[]): void
  createTask(team: TeamState, input: CreateRepositoryTaskInput): TeamTask
  appendTaskEvent(team: TeamState, input: AppendRepositoryTaskEventInput): TaskEvent
  appendTaskReport(team: TeamState, input: AppendRepositoryTaskReportInput): TaskReport
  updateTaskReport(team: TeamState, reportId: string, patch: UpdateRepositoryTaskReportInput): TaskReport | undefined
  taskReportsForTask(team: TeamState, taskId: string): TaskReport[]
  taskEventsForTask(team: TeamState, taskId: string): TaskEvent[]
  taskMessageRefsForTask(team: TeamState, taskId: string): TaskMessageRef[]
  latestTaskReport(team: TeamState, taskId: string): TaskReport | undefined
  latestTaskActivity(team: TeamState, taskId: string): TaskHistoryItem | undefined
  taskHistoryCounts(team: TeamState, taskId: string): TaskHistoryCounts
  taskHistorySummary(team: TeamState, taskId: string): TaskHistorySummary
  findTaskReport(team: TeamState, reportId: string): TaskReport | undefined
  readTeamForPanel(teamName: string): TeamState | null
  readTeamPanelModel(teamName: string): RepositoryTeamPanelModel | null
  listTeamPanelNames(): string[]
  readLeaderMailboxProjection(teamName: string): RepositoryLeaderMailboxProjection
  readLeaderCoordinationProjection(teamName: string): RepositoryLeaderCoordinationProjection | null
  readTaskReportSummary(teamName: string, reportId: string): TaskHistoryReportDisplay | undefined
  readReportWatchdogSummary(teamName: string): ReportWatchdogSummary | null
  readOutboxDiagnosticsSummary(teamName: string): OutboxDiagnosticsSummary
  listQuarantinedTeams(): QuarantinedTeamSummary[]
  writeTeamMutation(teamName: string, updater: TeamMutationWriter): TeamState | null
}

function toRepositoryMailboxProjectionItem(message: MailboxMessage): RepositoryMailboxProjectionItem {
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

function toRepositoryTeamPanelMember(member: TeamMember): RepositoryTeamPanelMember {
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

function toRepositoryTeamPanelTask(
  team: TeamState,
  task: TeamTask,
  watchdogByTaskId: Map<string, ReportWatchdogTaskSummary>,
): RepositoryTeamPanelTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    owner: task.owner,
    blockedBy: [...task.blockedBy],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    history: taskHistoryDisplaySummary(team, task.id),
    watchdog: watchdogByTaskId.get(task.id),
  }
}

export {
  appendTaskEvent,
  appendTaskReport,
  createInitialTeamState,
  createTask,
  findTaskReport,
  findTeamByProjectSlug,
  latestTaskActivity,
  latestTaskReport,
  markMailboxMessagesDelivered,
  markMailboxMessagesRead,
  readLatestQuarantineForTeam,
  readMailbox,
  readSessionContext,
  readTeamState,
  taskEventsForTask,
  taskHistoryCounts,
  taskHistorySummary,
  taskMessageRefsForTask,
  taskReportsForTask,
  updateTaskReport,
  writeSessionContext,
  writeTeamState,
}

export function buildSessionContextForRepository(team: TeamState, memberName: string): SessionTeamContext {
  return buildSessionContextForTeam(team, memberName)
}

export { buildSessionContextForRepository as buildSessionContextForTeam }

export function updateTeamStateForRepository(teamName: string, updater: TeamMutationWriter): TeamState | null {
  return updateTeamState(teamName, updater)
}

export { updateTeamStateForRepository as updateTeamState }

export function readTeamForPanel(teamName: string): TeamState | null {
  return readTeamState(teamName)
}

function toRepositoryTeamPanelModel(team: TeamState): RepositoryTeamPanelModel {
  const watchdogByTaskId = new Map(buildReportWatchdogSummary(team).tasks.map(watchdog => [watchdog.taskId, watchdog]))
  return {
    version: team.version,
    name: team.name,
    identity: team.identity,
    description: team.description,
    createdAt: team.createdAt,
    leaderCwd: team.leaderCwd,
    leaderSessionFile: team.leaderSessionFile,
    members: Object.fromEntries(
      Object.entries(team.members).map(([name, member]) => [name, toRepositoryTeamPanelMember(member)]),
    ),
    tasks: Object.fromEntries(
      Object.entries(team.tasks).map(([taskId, task]) => [taskId, toRepositoryTeamPanelTask(team, task, watchdogByTaskId)]),
    ),
    nextTaskSeq: team.nextTaskSeq,
    revision: team.revision,
    memberTombstones: team.memberTombstones ? { ...team.memberTombstones } : undefined,
  }
}

export function readTeamPanelModel(teamName: string): RepositoryTeamPanelModel | null {
  const team = readTeamForPanel(teamName)
  return team ? toRepositoryTeamPanelModel(team) : null
}

export function listTeamPanelNames(): string[] {
  return listTeams().map(team => team.name)
}

function blockedTaskIdsForLeaderCoordination(team: TeamState): string[] {
  return Object.values(team.tasks)
    .filter(task => task.status === 'blocked')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(task => task.id)
}

export function readLeaderMailboxProjection(teamName: string): RepositoryLeaderMailboxProjection {
  const items = readMailbox(teamName, TEAM_LEAD)
    .map(toRepositoryMailboxProjectionItem)
    .sort((a, b) => b.createdAt - a.createdAt)
  const latestAttention = items.find(isMailboxMessageUnread)
  return {
    total: items.length,
    unread: items.filter(isMailboxMessageUnread).length,
    items,
    latestAttention,
  }
}

export function readLeaderCoordinationProjection(teamName: string): RepositoryLeaderCoordinationProjection | null {
  const team = readTeamState(teamName)
  if (!team) return null
  const blockedTaskIds = blockedTaskIdsForLeaderCoordination(team)
  const mailbox = readLeaderMailboxProjection(teamName)
  const waitingReportTaskIds = buildReportWatchdogSummary(team).tasks
    .filter(task => task.state === 'waiting_for_report' && task.needsNudge)
    .map(task => task.taskId)
  return {
    teamName,
    blockedCount: blockedTaskIds.length,
    blockedTaskIds,
    unreadCount: mailbox.unread,
    latestUnreadMessageId: mailbox.latestAttention?.id ?? '',
    waitingReportCount: waitingReportTaskIds.length,
    waitingReportTaskIds,
    latestWaitingReportTaskId: waitingReportTaskIds[0] ?? '',
  }
}

export function readTaskReportSummary(teamName: string, reportId: string): TaskHistoryReportDisplay | undefined {
  const team = readTeamState(teamName)
  const report = team?.taskReports[reportId]
  return report ? displayTaskReport(report) : undefined
}

export function readReportWatchdogSummary(teamName: string): ReportWatchdogSummary | null {
  const team = readTeamState(teamName)
  return team ? buildReportWatchdogSummary(team) : null
}

export function readOutboxDiagnosticsSummary(teamName: string): OutboxDiagnosticsSummary {
  return summarizeOutboxEffects(listOutboxEffects(teamName), readOutboxDiagnosticsStore(teamName))
}

export { listQuarantinedTeams }

export function writeTeamMutation(teamName: string, updater: TeamMutationWriter): TeamState | null {
  return updateTeamStateForRepository(teamName, updater)
}

export function createStateRepository(): StateRepository {
  return {
    createInitialTeamState,
    readTeamState,
    writeTeamState,
    updateTeamState: updateTeamStateForRepository,
    findTeamByProjectSlug,
    readSessionContext,
    writeSessionContext,
    buildSessionContextForTeam: buildSessionContextForRepository,
    readLatestQuarantineForTeam,
    readMailbox,
    markMailboxMessagesDelivered,
    markMailboxMessagesRead,
    createTask,
    appendTaskEvent,
    appendTaskReport,
    updateTaskReport,
    taskReportsForTask,
    taskEventsForTask,
    taskMessageRefsForTask,
    latestTaskReport,
    latestTaskActivity,
    taskHistoryCounts,
    taskHistorySummary,
    findTaskReport,
    readTeamForPanel,
    readTeamPanelModel,
    listTeamPanelNames,
    readLeaderMailboxProjection,
    readLeaderCoordinationProjection,
    readTaskReportSummary,
    readReportWatchdogSummary,
    readOutboxDiagnosticsSummary,
    listQuarantinedTeams,
    writeTeamMutation,
  }
}

export const fileBackedStateRepository: StateRepository = createStateRepository()
