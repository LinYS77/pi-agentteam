import type { EffectiveAgentModelSource } from '../config.js'
import type { TeamIdentity } from '../core/teamIdentity.js'
import type {
  MailboxMessage,
  PlanRun,
  PlanRunEvent,
  PlanRunStep,
  TeamMember,
  TeamState,
  TaskEvent,
  TaskMessageRef,
  TaskReport,
  TeamTask,
} from '../internalTypes.js'
import type { TaskHistoryCounts, TaskHistoryDisplaySummary, TaskHistoryReportDisplay, TaskHistorySummary } from '../state/taskHistoryReadModel.js'
import type { CompactPlanRunLeaderAttention, CompactPlanRunPanelProjection } from '../state/runVisibilityReadModel.js'
import type { ReportWatchdogSummary, ReportWatchdogTaskSummary } from '../state/taskReportWatchdogReadModel.js'
export type { TaskHistoryCounts, TaskHistorySummary } from '../state/taskHistoryReadModel.js'
export type { CompactPlanRunLeaderAttention, CompactPlanRunPanelProjection } from '../state/runVisibilityReadModel.js'
export type { ReportWatchdogState, ReportWatchdogSummary, ReportWatchdogTaskSummary } from '../state/taskReportWatchdogReadModel.js'
import type {
  OutboxClaimInput,
  OutboxCompleteInput,
  OutboxEffect,
  OutboxEnqueueInput,
  OutboxFailInput,
} from './outbox.js'
import type { OutboxRunResult, RunOutboxInput } from './effectRunner.js'

export type TeamStateUpdater = (team: TeamState) => void | TeamState

export type TeamStatePort = {
  readTeam(teamName: string): TeamState | null
  updateTeam(teamName: string, updater: TeamStateUpdater): TeamState | null
}

export type CreateTaskInput = {
  title: string
  description: string
  owner?: string
}

export type AppendTaskEventInput = Omit<TaskEvent, 'id'>
export type AppendTaskReportInput = Omit<TaskReport, 'id' | 'reportOnly'>
export type UpdateTaskReportInput = Partial<Omit<TaskReport, 'id' | 'taskId'>>
export type AppendTaskMessageRefInput = Omit<TaskMessageRef, 'id'>

export type PlanRunStepSummary = Pick<PlanRunStep,
  | 'id'
  | 'index'
  | 'title'
  | 'description'
  | 'owner'
  | 'taskId'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'sourceSummary'
>

export type PlanRunEventSummary = Pick<PlanRunEvent,
  | 'id'
  | 'planRunId'
  | 'type'
  | 'by'
  | 'at'
  | 'summary'
  | 'stepIndex'
  | 'taskId'
  | 'reportId'
  | 'pauseReason'
>

export type PlanRunSummary = Pick<PlanRun,
  | 'id'
  | 'status'
  | 'sourceTaskId'
  | 'sourceReportId'
  | 'sourceReportSummary'
  | 'sourceReportHash'
  | 'approvedBy'
  | 'approvedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'currentStepIndex'
  | 'activeTaskId'
  | 'pauseReason'
  | 'limits'
  | 'limitState'
> & {
  stepCount: number
  steps: PlanRunStepSummary[]
  latestEvent?: PlanRunEventSummary
}

export type AppendPlanRunEventInput = Omit<PlanRunEvent, 'id'>
export type PlanRunStateUpdater = (team: TeamState) => void | TeamState

export type PlanRunRepositoryPort = {
  readPlanRunSummary(teamName: string, planRunId?: string): PlanRunSummary | null
  listPlanRuns(teamName: string): PlanRunSummary[]
}

export type PlanRunMutationPort = {
  writePlanRunMutation(teamName: string, updater: PlanRunStateUpdater): TeamState | null
  appendPlanRunEvent(teamName: string, input: AppendPlanRunEventInput): PlanRunEvent | null
}

export type TaskHistoryQueryPort = {
  taskReportsForTask(team: TeamState, taskId: string): TaskReport[]
  taskEventsForTask(team: TeamState, taskId: string): TaskEvent[]
  taskMessageRefsForTask(team: TeamState, taskId: string): TaskMessageRef[]
  latestTaskReport(team: TeamState, taskId: string): TaskReport | undefined
  latestTaskActivity(team: TeamState, taskId: string): TaskReport | TaskEvent | TaskMessageRef | undefined
  taskHistoryCounts(team: TeamState, taskId: string): TaskHistoryCounts
  taskHistorySummary(team: TeamState, taskId: string): TaskHistorySummary
  findTaskReport(team: TeamState, reportId: string): TaskReport | undefined
}

export type TaskMutationPort = {
  createTask(team: TeamState, input: CreateTaskInput): TeamTask
  appendTaskEvent(team: TeamState, input: AppendTaskEventInput): TaskEvent
  appendTaskReport(team: TeamState, input: AppendTaskReportInput): TaskReport
  updateTaskReport(team: TeamState, reportId: string, patch: UpdateTaskReportInput): TaskReport | undefined
  appendTaskMessageRef(team: TeamState, input: AppendTaskMessageRefInput): TaskMessageRef
}

export type MailboxRepositoryPort = {
  readMailbox(teamName: string, memberName: string): MailboxMessage[]
  markDelivered(teamName: string, memberName: string, ids: string[]): void
  markRead(teamName: string, memberName: string, ids: string[]): void
}

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
  planRunAttentionCount: number
  planRunAttention: CompactPlanRunLeaderAttention[]
  latestPlanRunAttentionId: string
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

export type RepositoryTeamPanelConfigRoleModel = {
  role: string
  modelLabel: string
  modelSource: EffectiveAgentModelSource
}

export type RepositoryTeamPanelConfigProjection = {
  exists: boolean
  path?: string
  schemaVersion?: number
  diagnosticCount: number
  roleModels: RepositoryTeamPanelConfigRoleModel[]
}

export type RepositoryTeamPanelModel = {
  version: TeamState['version']
  name: string
  identity: TeamIdentity
  description?: string
  createdAt: number
  leaderCwd: string
  leaderSessionFile?: string
  members: Record<string, RepositoryTeamPanelMember>
  tasks: Record<string, RepositoryTeamPanelTask>
  config: RepositoryTeamPanelConfigProjection
  planRuns: CompactPlanRunPanelProjection[]
  nextTaskSeq: number
  revision?: number
  memberTombstones?: Record<string, number>
}

export type StateRepositoryPort = PlanRunRepositoryPort & PlanRunMutationPort & {
  readTeamPanelModel(teamName: string): RepositoryTeamPanelModel | null
  readLeaderMailboxProjection(teamName: string): RepositoryLeaderMailboxProjection
  readLeaderCoordinationProjection(teamName: string): RepositoryLeaderCoordinationProjection | null
  readTaskReportSummary(teamName: string, reportId: string): TaskHistoryReportDisplay | undefined
  readReportWatchdogSummary(teamName: string): ReportWatchdogSummary | null
  writeTeamMutation(teamName: string, updater: TeamStateUpdater): TeamState | null
}

export type RuntimeRepositoryPaneSnapshotItem = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

export type RuntimeRepositorySnapshot = {
  capturedAt: number
  panes: RuntimeRepositoryPaneSnapshotItem[]
  byPaneId: Record<string, RuntimeRepositoryPaneSnapshotItem>
  ok?: boolean
  error?: string
}

export type RuntimeRepositoryPort = {
  withRuntimeSnapshot<T>(handler: (snapshot: RuntimeRepositorySnapshot) => T): T
  listAgentTeamPanes(snapshot?: RuntimeRepositorySnapshot): RuntimeRepositoryPaneSnapshotItem[]
  reconcileTeamPanes(team: TeamState, options?: { force?: boolean; mode?: 'light' | 'force'; snapshot?: RuntimeRepositorySnapshot }): boolean
}

export type OutboxStorePort = {
  enqueue<K extends OutboxEffect['kind']>(input: OutboxEnqueueInput<K>): OutboxEffect<K>
  get(teamName: string, effectId: string): OutboxEffect | null
  claim(input: OutboxClaimInput): OutboxEffect[]
  markDone(input: OutboxCompleteInput): OutboxEffect | null
  markFailed(input: OutboxFailInput): OutboxEffect | null
  list?(teamName: string): OutboxEffect[]
  recoverExpiredClaims?(teamName: string, now?: number): OutboxEffect[]
}

export type EffectHandlerSuccess = {
  ok: true
  result?: unknown
}

export type EffectHandlerFailure = {
  ok: false
  error: string
  result?: unknown
}

export type EffectHandlerResult = EffectHandlerSuccess | EffectHandlerFailure

export type MaybePromise<T> = T | Promise<T>

export type OutboxEffectHandler<K extends OutboxEffect['kind']> = (
  effect: OutboxEffect<K>,
) => MaybePromise<EffectHandlerResult>

export type OutboxEffectHandlers = {
  inbox_item_append_requested: OutboxEffectHandler<'inbox_item_append_requested'>
  worker_delivery_requested: OutboxEffectHandler<'worker_delivery_requested'>
  leader_attention_requested: OutboxEffectHandler<'leader_attention_requested'>
  task_message_ref_append_requested: OutboxEffectHandler<'task_message_ref_append_requested'>
  append_event_requested: OutboxEffectHandler<'append_event_requested'>
}

export type OutboxRunnerPort = {
  runOnce(input: RunOutboxInput): Promise<OutboxRunResult>
}
