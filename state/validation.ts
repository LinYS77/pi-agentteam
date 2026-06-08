import * as fs from 'node:fs'
import * as path from 'node:path'
import { isOutboxEffectKind } from '../core/outboxModel.js'
import { isMessageType, isTaskReportType, isTaskStatus } from '../core/publicModel.js'
import { TEAM_LEAD, type TaskEventType, type TeamMessagePriority, type TeamMessageType, type TeamMessageWakeHint, type TeamState } from '../internalTypes.js'
import { readJsonFile, writeJsonFile } from './fsStore.js'
import { appendTaskMessageRef, compactTaskHistorySummary, formatTaskEventId } from './taskHistory.js'
import { migrateTaskNotesToHistory, teamHasLegacyTaskNotes } from './taskHistoryMigration.js'
import {
  getAgentTeamRoot,
  getQuarantineRoot,
  sanitizeName,
} from './paths.js'

export const QUARANTINE_KIND = 'vnext-unsupported'

const LEGACY_TASK_STATUSES = Object.freeze(['pending', 'in_progress', 'completed'] as const)
const LEGACY_MESSAGE_TYPES = Object.freeze(['fyi', 'completion_report', 'blocked'] as const)
const LEGACY_OUTBOX_EFFECT_KINDS = Object.freeze(['leader_triage_requested', 'task_note_append_requested'] as const)
const TASK_EVENT_TYPES = Object.freeze([
  'created',
  'assigned',
  'blocked',
  'unblocked',
  'closed',
  'owner_removed',
  'progress',
  'report_submitted',
  'migrated',
] as const satisfies readonly TaskEventType[])

const PLAN_RUN_STATUSES = Object.freeze([
  'approved',
  'active',
  'waiting_review',
  'paused',
  'cancelled',
  'done',
] as const)

const PLAN_RUN_STEP_STATUSES = Object.freeze([
  'pending',
  'assigned',
  'open',
  'waiting_review',
  'done',
  'blocked',
  'skipped',
] as const)

const PLAN_RUN_EVENT_TYPES = Object.freeze([
  'approved',
  'advanced',
  'step_task_created',
  'step_accepted',
  'waiting_review',
  'paused',
  'resumed',
  'cancelled',
  'completed',
  'failure_signaled',
  'limit_reached',
] as const)

const PLAN_RUN_PAUSE_REASONS = Object.freeze([
  'report_blocked',
  'question',
  'watchdog',
  'waiting_for_report',
  'leader_paused',
  'validation_failed',
  'test_failed',
  'limit_reached',
] as const)

const OLD_LAYOUT_MARKER_KEYS = Object.freeze([
  'layout',
  'layoutState',
  'tmuxLayout',
  'paneLayout',
  'legacyLayout',
  'layoutVersion',
] as const)

const LEGACY_ACTIVE_LAYOUT_ENTRIES = Object.freeze([
  { name: 'state.json', kind: 'file' },
  { name: 'mailboxes', kind: 'directory' },
  { name: 'outbox-state.json', kind: 'file' },
  { name: 'bridge-state.json', kind: 'file' },
  { name: 'delivery-state.json', kind: 'file' },
  { name: 'leader-projection-state.json', kind: 'file' },
] as const)

export type StateValidationReason = {
  code: string
  file: string
  path: string
  field: string
  value: unknown
  message: string
}

export type QuarantineRecord = {
  version: 1
  kind: typeof QUARANTINE_KIND
  teamName: string
  quarantinedAt: number
  sourceDir: string
  quarantineDir: string
  reasons: StateValidationReason[]
}

export type QuarantinedTeamSummary = {
  teamName: string
  quarantinedAt: number
  quarantineDir: string
  reasonCount: number
  reasons: StateValidationReason[]
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueString(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function activeTeamDir(teamName: string): string {
  return path.join(getAgentTeamRoot(), 'teams', sanitizeName(teamName))
}

function teamDirExists(teamName: string): boolean {
  const dir = activeTeamDir(teamName)
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory()
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function messageTypeValue(value: unknown): TeamMessageType | undefined {
  return isMessageType(value) || isTaskReportType(value) ? value : undefined
}

function priorityValue(value: unknown): TeamMessagePriority | undefined {
  return value === 'low' || value === 'normal' || value === 'high' ? value : undefined
}

function wakeHintValue(value: unknown): TeamMessageWakeHint | undefined {
  return value === 'none' || value === 'soft' || value === 'hard' ? value : undefined
}

function reason(input: Omit<StateValidationReason, 'message'> & { message?: string }): StateValidationReason {
  return {
    ...input,
    message: input.message ?? `Unsupported persisted state at ${input.path}: ${input.field}=${valueString(input.value)}`,
  }
}

function pushInvalidMessageType(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (input.value === undefined) return
  if (isMessageType(input.value) || isTaskReportType(input.value)) return
  const legacy = typeof input.value === 'string' && (LEGACY_MESSAGE_TYPES as readonly string[]).includes(input.value)
  reasons.push(reason({
    code: legacy ? 'legacy_message_type' : 'unsupported_message_type',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: legacy
      ? `Legacy message type ${input.value} is not supported in vNext persisted state`
      : `Unsupported message type ${valueString(input.value)} in persisted state`,
  }))
}

function pushInvalidTaskStatus(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (isTaskStatus(input.value)) return
  const legacy = typeof input.value === 'string' && (LEGACY_TASK_STATUSES as readonly string[]).includes(input.value)
  reasons.push(reason({
    code: legacy ? 'legacy_task_status' : 'unsupported_task_status',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: legacy
      ? `Legacy task status ${input.value} is not supported in vNext persisted state`
      : `Unsupported task status ${valueString(input.value)} in persisted state`,
  }))
}

function pushInvalidReportStatusAtReport(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (input.value === 'open' || input.value === 'blocked') return
  reasons.push(reason({
    code: 'unsupported_task_report_status_at_report',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Unsupported task report statusAtReport ${valueString(input.value)} in persisted state`,
  }))
}

function inspectTeamIdentity(
  reasons: StateValidationReason[],
  value: unknown,
  input: { file: string; path: string; teamName?: unknown },
): void {
  if (value === undefined) return
  if (!isObjectRecord(value)) {
    reasons.push(reason({ code: 'invalid_team_identity_shape', file: input.file, path: input.path, field: 'identity', value, message: 'Team identity must be an object when present' }))
    return
  }
  for (const field of ['teamId', 'projectKey', 'displayName', 'slug'] as const) {
    if (typeof value[field] === 'string' && value[field].trim()) continue
    reasons.push(reason({
      code: 'invalid_team_identity_field',
      file: input.file,
      path: `${input.path}.${field}`,
      field,
      value: value[field],
      message: `Team identity ${field} must be a non-empty string`,
    }))
  }
  if (value.legacyName === undefined) return
  if (typeof value.legacyName !== 'string' || !value.legacyName.trim()) {
    reasons.push(reason({
      code: 'invalid_team_identity_legacy_name',
      file: input.file,
      path: `${input.path}.legacyName`,
      field: 'legacyName',
      value: value.legacyName,
      message: 'Team identity legacyName must be a non-empty string when present',
    }))
    return
  }
  if (typeof input.teamName === 'string' && input.teamName && value.legacyName !== input.teamName) {
    reasons.push(reason({
      code: 'invalid_team_identity_legacy_name',
      file: input.file,
      path: `${input.path}.legacyName`,
      field: 'legacyName',
      value: value.legacyName,
      message: 'Team identity legacyName must match the legacy storage team name',
    }))
  }
}

function pushInvalidTaskEventType(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (typeof input.value === 'string' && (TASK_EVENT_TYPES as readonly string[]).includes(input.value)) return
  reasons.push(reason({
    code: 'unsupported_task_event_type',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Unsupported task event type ${valueString(input.value)} in persisted state`,
  }))
}

function pushInvalidPlanRunStatus(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (input.value === undefined) return
  if (typeof input.value === 'string' && (PLAN_RUN_STATUSES as readonly string[]).includes(input.value)) return
  reasons.push(reason({
    code: 'unsupported_plan_run_status',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Unsupported PlanRun status ${valueString(input.value)} in persisted state`,
  }))
}

function pushInvalidPlanRunStepStatus(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (input.value === undefined) return
  if (typeof input.value === 'string' && (PLAN_RUN_STEP_STATUSES as readonly string[]).includes(input.value)) return
  reasons.push(reason({
    code: 'unsupported_plan_run_step_status',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Unsupported PlanRun step status ${valueString(input.value)} in persisted state`,
  }))
}

function pushInvalidPlanRunEventType(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (input.value === undefined) return
  if (typeof input.value === 'string' && (PLAN_RUN_EVENT_TYPES as readonly string[]).includes(input.value)) return
  reasons.push(reason({
    code: 'unsupported_plan_run_event_type',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Unsupported PlanRun event type ${valueString(input.value)} in persisted state`,
  }))
}

function pushInvalidPlanRunPauseReason(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  if (input.value === undefined) return
  if (typeof input.value === 'string' && (PLAN_RUN_PAUSE_REASONS as readonly string[]).includes(input.value)) return
  reasons.push(reason({
    code: 'unsupported_plan_run_pause_reason',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Unsupported PlanRun pauseReason ${valueString(input.value)} in persisted state`,
  }))
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && isPositiveFiniteNumber(value)
}

function pushInvalidPlanRunLimit(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown; integer?: boolean },
): void {
  if (input.value === undefined) return
  const valid = input.integer ? isPositiveInteger(input.value) : isPositiveFiniteNumber(input.value)
  if (valid) return
  reasons.push(reason({
    code: 'invalid_plan_run_limit',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Invalid PlanRun limit ${input.field}=${valueString(input.value)}; expected positive ${input.integer ? 'integer' : 'finite number'}`,
  }))
}

function pushInvalidPlanRunLimitStateNumber(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown; required?: boolean; integer?: boolean },
): void {
  if (input.value === undefined && input.required !== true) return
  const valid = input.integer
    ? (Number.isInteger(input.value) && typeof input.value === 'number' && input.value >= 0)
    : (typeof input.value === 'number' && Number.isFinite(input.value) && input.value >= 0)
  if (valid) return
  reasons.push(reason({
    code: 'invalid_plan_run_limit_state',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Invalid PlanRun limitState ${input.field}=${valueString(input.value)}`,
  }))
}

function inspectPlanRunLimits(
  reasons: StateValidationReason[],
  value: unknown,
  input: { file: string; path: string },
): void {
  if (value === undefined) return
  if (!isObjectRecord(value)) {
    reasons.push(reason({ code: 'invalid_plan_run_limits_shape', file: input.file, path: input.path, field: 'limits', value, message: 'PlanRun limits must be an object when present' }))
    return
  }
  pushInvalidPlanRunLimit(reasons, { file: input.file, path: `${input.path}.maxSteps`, field: 'maxSteps', value: value.maxSteps, integer: true })
  pushInvalidPlanRunLimit(reasons, { file: input.file, path: `${input.path}.maxConsecutiveSteps`, field: 'maxConsecutiveSteps', value: value.maxConsecutiveSteps, integer: true })
  pushInvalidPlanRunLimit(reasons, { file: input.file, path: `${input.path}.deadlineAt`, field: 'deadlineAt', value: value.deadlineAt })
  pushInvalidPlanRunLimit(reasons, { file: input.file, path: `${input.path}.maxDurationMs`, field: 'maxDurationMs', value: value.maxDurationMs })
}

function inspectPlanRunLimitReached(
  reasons: StateValidationReason[],
  value: unknown,
  input: { file: string; path: string },
): void {
  if (value === undefined) return
  if (!isObjectRecord(value)) {
    reasons.push(reason({ code: 'invalid_plan_run_limit_state', file: input.file, path: input.path, field: 'lastLimitReached', value, message: 'PlanRun limitState.lastLimitReached must be an object when present' }))
    return
  }
  if (value.kind !== 'max_steps' && value.kind !== 'max_consecutive_steps' && value.kind !== 'deadline' && value.kind !== 'duration') {
    reasons.push(reason({ code: 'invalid_plan_run_limit_state', file: input.file, path: `${input.path}.kind`, field: 'kind', value: value.kind, message: `Unsupported PlanRun limitState.lastLimitReached kind ${valueString(value.kind)}` }))
  }
  pushInvalidPlanRunLimitStateNumber(reasons, { file: input.file, path: `${input.path}.at`, field: 'at', value: value.at, required: true })
  pushInvalidPlanRunLimitStateNumber(reasons, { file: input.file, path: `${input.path}.value`, field: 'value', value: value.value })
  pushInvalidPlanRunLimitStateNumber(reasons, { file: input.file, path: `${input.path}.limit`, field: 'limit', value: value.limit })
}

function inspectPlanRunLimitState(
  reasons: StateValidationReason[],
  value: unknown,
  input: { file: string; path: string },
): void {
  if (value === undefined) return
  if (!isObjectRecord(value)) {
    reasons.push(reason({ code: 'invalid_plan_run_limit_state_shape', file: input.file, path: input.path, field: 'limitState', value, message: 'PlanRun limitState must be an object when present' }))
    return
  }
  pushInvalidPlanRunLimitStateNumber(reasons, { file: input.file, path: `${input.path}.stepsStarted`, field: 'stepsStarted', value: value.stepsStarted, required: true, integer: true })
  pushInvalidPlanRunLimitStateNumber(reasons, { file: input.file, path: `${input.path}.consecutiveStepsStarted`, field: 'consecutiveStepsStarted', value: value.consecutiveStepsStarted, required: true, integer: true })
  pushInvalidPlanRunLimitStateNumber(reasons, { file: input.file, path: `${input.path}.lastLimitCheckAt`, field: 'lastLimitCheckAt', value: value.lastLimitCheckAt })
  inspectPlanRunLimitReached(reasons, value.lastLimitReached, { file: input.file, path: `${input.path}.lastLimitReached` })
}

function inspectOldLayoutMarkers(
  reasons: StateValidationReason[],
  value: Record<string, unknown>,
  input: { file: string; path: string },
): void {
  for (const key of OLD_LAYOUT_MARKER_KEYS) {
    if (!(key in value)) continue
    reasons.push(reason({
      code: 'legacy_layout_marker',
      file: input.file,
      path: `${input.path}.${key}`,
      field: key,
      value: value[key],
      message: `Legacy layout marker ${key} is not supported in active vNext team state`,
    }))
  }
}

export function validatePersistedTeamState(raw: unknown, file = 'team.json'): StateValidationReason[] {
  const reasons: StateValidationReason[] = []
  if (!isObjectRecord(raw)) {
    reasons.push(reason({ code: 'invalid_team_state', file, path: '$', field: '$', value: raw, message: 'Team state root must be an object' }))
    return reasons
  }

  inspectOldLayoutMarkers(reasons, raw, { file, path: '$' })
  inspectTeamIdentity(reasons, raw.identity, { file, path: '$.identity', teamName: raw.name })

  const tasks = raw.tasks
  if (tasks !== undefined && !isObjectRecord(tasks)) {
    reasons.push(reason({ code: 'invalid_tasks_shape', file, path: '$.tasks', field: 'tasks', value: tasks, message: 'Team state tasks must be an object' }))
  } else if (isObjectRecord(tasks)) {
    for (const [taskId, task] of Object.entries(tasks)) {
      const taskPath = `$.tasks.${taskId}`
      if (!isObjectRecord(task)) {
        reasons.push(reason({ code: 'invalid_task_shape', file, path: taskPath, field: taskId, value: task, message: `Task ${taskId} must be an object` }))
        continue
      }
      pushInvalidTaskStatus(reasons, { file, path: `${taskPath}.status`, field: 'status', value: task.status })
      inspectOldLayoutMarkers(reasons, task, { file, path: taskPath })
      if ('notes' in task) {
        reasons.push(reason({
          code: 'legacy_task_notes',
          file,
          path: `${taskPath}.notes`,
          field: 'notes',
          value: task.notes,
          message: `Legacy task.notes for ${taskId} must be migrated to TaskReport/TaskEvent/TaskMessageRef history before active persistence`,
        }))
      }
    }
  }

  const members = raw.members
  if (isObjectRecord(members)) {
    for (const [memberName, member] of Object.entries(members)) {
      if (isObjectRecord(member)) {
        inspectOldLayoutMarkers(reasons, member, { file, path: `$.members.${memberName}` })
      }
    }
  }

  const events = raw.events
  if (Array.isArray(events)) {
    events.forEach((event, index) => {
      if (isObjectRecord(event)) {
        inspectOldLayoutMarkers(reasons, event, { file, path: `$.events[${index}]` })
      }
    })
  }

  const taskReports = raw.taskReports
  if (taskReports !== undefined && !isObjectRecord(taskReports)) {
    reasons.push(reason({ code: 'invalid_task_reports_shape', file, path: '$.taskReports', field: 'taskReports', value: taskReports, message: 'Team state taskReports must be an object when present' }))
  } else if (isObjectRecord(taskReports)) {
    for (const [reportId, report] of Object.entries(taskReports)) {
      const reportPath = `$.taskReports.${reportId}`
      if (!isObjectRecord(report)) {
        reasons.push(reason({ code: 'invalid_task_report_shape', file, path: reportPath, field: reportId, value: report, message: `Task report ${reportId} must be an object` }))
        continue
      }
      if (!isTaskReportType(report.type)) {
        pushInvalidMessageType(reasons, { file, path: `${reportPath}.type`, field: 'type', value: report.type })
      }
      pushInvalidReportStatusAtReport(reasons, { file, path: `${reportPath}.statusAtReport`, field: 'statusAtReport', value: report.statusAtReport })
    }
  }

  const taskEvents = raw.taskEvents
  if (taskEvents !== undefined && !isObjectRecord(taskEvents)) {
    reasons.push(reason({ code: 'invalid_task_events_shape', file, path: '$.taskEvents', field: 'taskEvents', value: taskEvents, message: 'Team state taskEvents must be an object when present' }))
  } else if (isObjectRecord(taskEvents)) {
    for (const [eventId, event] of Object.entries(taskEvents)) {
      const eventPath = `$.taskEvents.${eventId}`
      if (!isObjectRecord(event)) {
        reasons.push(reason({ code: 'invalid_task_event_shape', file, path: eventPath, field: eventId, value: event, message: `Task event ${eventId} must be an object` }))
        continue
      }
      pushInvalidTaskEventType(reasons, { file, path: `${eventPath}.type`, field: 'type', value: event.type })
    }
  }

  const taskMessageRefs = raw.taskMessageRefs
  if (taskMessageRefs !== undefined && !isObjectRecord(taskMessageRefs)) {
    reasons.push(reason({ code: 'invalid_task_message_refs_shape', file, path: '$.taskMessageRefs', field: 'taskMessageRefs', value: taskMessageRefs, message: 'Team state taskMessageRefs must be an object when present' }))
  } else if (isObjectRecord(taskMessageRefs)) {
    for (const [refId, ref] of Object.entries(taskMessageRefs)) {
      const refPath = `$.taskMessageRefs.${refId}`
      if (!isObjectRecord(ref)) {
        reasons.push(reason({ code: 'invalid_task_message_ref_shape', file, path: refPath, field: refId, value: ref, message: `Task message ref ${refId} must be an object` }))
        continue
      }
      pushInvalidMessageType(reasons, { file, path: `${refPath}.type`, field: 'type', value: ref.type })
    }
  }

  const planRuns = raw.planRuns
  if (planRuns !== undefined && !isObjectRecord(planRuns)) {
    reasons.push(reason({ code: 'invalid_plan_runs_shape', file, path: '$.planRuns', field: 'planRuns', value: planRuns, message: 'Team state planRuns must be an object when present' }))
  } else if (isObjectRecord(planRuns)) {
    for (const [planRunId, planRun] of Object.entries(planRuns)) {
      const planRunPath = `$.planRuns.${planRunId}`
      if (!isObjectRecord(planRun)) {
        reasons.push(reason({ code: 'invalid_plan_run_shape', file, path: planRunPath, field: planRunId, value: planRun, message: `PlanRun ${planRunId} must be an object` }))
        continue
      }
      inspectOldLayoutMarkers(reasons, planRun, { file, path: planRunPath })
      pushInvalidPlanRunStatus(reasons, { file, path: `${planRunPath}.status`, field: 'status', value: planRun.status })
      pushInvalidPlanRunPauseReason(reasons, { file, path: `${planRunPath}.pauseReason`, field: 'pauseReason', value: planRun.pauseReason })
      inspectPlanRunLimits(reasons, planRun.limits, { file, path: `${planRunPath}.limits` })
      inspectPlanRunLimitState(reasons, planRun.limitState, { file, path: `${planRunPath}.limitState` })
      if (planRun.steps !== undefined && !Array.isArray(planRun.steps)) {
        reasons.push(reason({ code: 'invalid_plan_run_steps_shape', file, path: `${planRunPath}.steps`, field: 'steps', value: planRun.steps, message: `PlanRun ${planRunId} steps must be an array when present` }))
      } else if (Array.isArray(planRun.steps)) {
        planRun.steps.forEach((step, index) => {
          if (!isObjectRecord(step)) {
            reasons.push(reason({ code: 'invalid_plan_run_step_shape', file, path: `${planRunPath}.steps[${index}]`, field: String(index), value: step, message: `PlanRun ${planRunId} step ${index} must be an object` }))
            return
          }
          inspectOldLayoutMarkers(reasons, step, { file, path: `${planRunPath}.steps[${index}]` })
          pushInvalidPlanRunStepStatus(reasons, { file, path: `${planRunPath}.steps[${index}].status`, field: 'status', value: step.status })
        })
      }
    }
  }

  const planRunEvents = raw.planRunEvents
  if (planRunEvents !== undefined && !isObjectRecord(planRunEvents)) {
    reasons.push(reason({ code: 'invalid_plan_run_events_shape', file, path: '$.planRunEvents', field: 'planRunEvents', value: planRunEvents, message: 'Team state planRunEvents must be an object when present' }))
  } else if (isObjectRecord(planRunEvents)) {
    for (const [eventId, event] of Object.entries(planRunEvents)) {
      const eventPath = `$.planRunEvents.${eventId}`
      if (!isObjectRecord(event)) {
        reasons.push(reason({ code: 'invalid_plan_run_event_shape', file, path: eventPath, field: eventId, value: event, message: `PlanRun event ${eventId} must be an object` }))
        continue
      }
      inspectOldLayoutMarkers(reasons, event, { file, path: eventPath })
      pushInvalidPlanRunEventType(reasons, { file, path: `${eventPath}.type`, field: 'type', value: event.type })
      pushInvalidPlanRunPauseReason(reasons, { file, path: `${eventPath}.pauseReason`, field: 'pauseReason', value: event.pauseReason })
    }
  }

  return reasons
}

export function validatePersistedMailbox(raw: unknown, file: string): StateValidationReason[] {
  const reasons: StateValidationReason[] = []
  if (!Array.isArray(raw)) {
    reasons.push(reason({ code: 'invalid_mailbox_shape', file, path: '$', field: '$', value: raw, message: 'Mailbox file must be an array' }))
    return reasons
  }
  raw.forEach((message, index) => {
    if (!isObjectRecord(message)) {
      reasons.push(reason({ code: 'invalid_mailbox_message_shape', file, path: `$[${index}]`, field: String(index), value: message, message: 'Mailbox message must be an object' }))
      return
    }
    pushInvalidMessageType(reasons, {
      file,
      path: `$[${index}].type`,
      field: 'type',
      value: message.type,
    })
  })
  return reasons
}

export function validatePersistedOutbox(raw: unknown, file = 'outbox.json'): StateValidationReason[] {
  const reasons: StateValidationReason[] = []
  if (!isObjectRecord(raw)) {
    reasons.push(reason({ code: 'invalid_outbox_shape', file, path: '$', field: '$', value: raw, message: 'Outbox state root must be an object' }))
    return reasons
  }
  const effects = raw.effects
  if (effects === undefined) return reasons
  if (!isObjectRecord(effects)) {
    reasons.push(reason({ code: 'invalid_outbox_effects_shape', file, path: '$.effects', field: 'effects', value: effects, message: 'Outbox effects must be an object' }))
    return reasons
  }
  for (const [effectId, effect] of Object.entries(effects)) {
    const effectPath = `$.effects.${effectId}`
    if (!isObjectRecord(effect)) {
      reasons.push(reason({ code: 'invalid_outbox_effect_shape', file, path: effectPath, field: effectId, value: effect, message: `Outbox effect ${effectId} must be an object` }))
      continue
    }
    const kind = effect.kind
    if (isOutboxEffectKind(kind)) continue
    const legacy = typeof kind === 'string' && (LEGACY_OUTBOX_EFFECT_KINDS as readonly string[]).includes(kind)
    reasons.push(reason({
      code: legacy ? 'legacy_outbox_effect_kind' : 'unsupported_outbox_effect_kind',
      file,
      path: `${effectPath}.kind`,
      field: 'kind',
      value: kind,
      message: legacy
        ? `Legacy outbox effect kind ${kind} is not supported in active vNext persisted state`
        : `Unsupported outbox effect kind ${valueString(kind)} in persisted state`,
    }))
  }
  return reasons
}

function pushLegacyLayoutEntryReason(
  reasons: StateValidationReason[],
  input: { file: string; path: string; field: string; value: unknown },
): void {
  reasons.push(reason({
    code: 'legacy_layout_entry',
    file: input.file,
    path: input.path,
    field: input.field,
    value: input.value,
    message: `Legacy active layout entry ${input.file} is not supported in vNext; use team.json/inboxes/outbox.json/runtime.json`,
  }))
}

export function validatePersistedTeamDir(teamName: string): StateValidationReason[] {
  const reasons: StateValidationReason[] = []
  const teamDir = activeTeamDir(teamName)

  for (const entry of LEGACY_ACTIVE_LAYOUT_ENTRIES) {
    const entryPath = path.join(teamDir, entry.name)
    if (!fs.existsSync(entryPath)) continue
    const actualKind = fs.statSync(entryPath).isDirectory() ? 'directory' : 'file'
    pushLegacyLayoutEntryReason(reasons, {
      file: entry.name,
      path: `$/${entry.name}`,
      field: entry.name,
      value: actualKind,
    })
    if (entry.name === 'state.json' && actualKind === 'file') {
      reasons.push(...validatePersistedTeamState(readJsonFile<unknown>(entryPath), 'state.json'))
    }
    if (entry.name === 'mailboxes' && actualKind === 'directory') {
      for (const mailboxEntry of fs.readdirSync(entryPath, { withFileTypes: true })) {
        if (!mailboxEntry.isFile() || !mailboxEntry.name.endsWith('.json')) continue
        const mailboxPath = path.join(entryPath, mailboxEntry.name)
        reasons.push(...validatePersistedMailbox(readJsonFile<unknown>(mailboxPath), path.join('mailboxes', mailboxEntry.name)))
      }
    }
  }

  const statePath = path.join(teamDir, 'team.json')
  if (fs.existsSync(statePath)) {
    reasons.push(...validatePersistedTeamState(readJsonFile<unknown>(statePath), 'team.json'))
  }

  const inboxDir = path.join(teamDir, 'inboxes')
  if (fs.existsSync(inboxDir)) {
    for (const entry of fs.readdirSync(inboxDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      if (entry.name.endsWith('.panel.json')) continue
      const inboxPath = path.join(inboxDir, entry.name)
      reasons.push(...validatePersistedMailbox(readJsonFile<unknown>(inboxPath), path.join('inboxes', entry.name)))
    }
  }

  const outboxPath = path.join(teamDir, 'outbox.json')
  if (fs.existsSync(outboxPath)) {
    reasons.push(...validatePersistedOutbox(readJsonFile<unknown>(outboxPath), 'outbox.json'))
  }
  return reasons
}

function timestampSegment(now: number): string {
  return new Date(now).toISOString().replace(/[:.]/g, '-')
}

function uniqueQuarantineTeamDir(timestampDir: string, teamName: string): string {
  const base = path.join(timestampDir, sanitizeName(teamName))
  if (!fs.existsSync(base)) return base
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`
    if (!fs.existsSync(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

export function quarantineTeamDir(teamName: string, reasons: StateValidationReason[], now = Date.now()): QuarantineRecord | null {
  if (reasons.length === 0) return null
  const sanitized = sanitizeName(teamName)
  const sourceDir = activeTeamDir(sanitized)
  if (!fs.existsSync(sourceDir)) return null

  const quarantineParent = path.join(getQuarantineRoot(), QUARANTINE_KIND, timestampSegment(now))
  fs.mkdirSync(quarantineParent, { recursive: true })
  const quarantineDir = uniqueQuarantineTeamDir(quarantineParent, sanitized)
  fs.renameSync(sourceDir, quarantineDir)
  const record: QuarantineRecord = {
    version: 1,
    kind: QUARANTINE_KIND,
    teamName: sanitized,
    quarantinedAt: now,
    sourceDir,
    quarantineDir,
    reasons,
  }
  writeJsonFile(path.join(quarantineDir, 'reasons.json'), record)
  return record
}

function appendLegacyOutboxCleanupEvent(team: TeamState, input: { effectId: string; summary: string; at: number; taskId?: string; converted?: boolean }): void {
  const existing = (team.events ?? []).some(event => event.id === `legacy-outbox-cleanup-${input.effectId}`)
  if (!existing) {
    team.events = [
      ...(team.events ?? []),
      {
        id: `legacy-outbox-cleanup-${input.effectId}`,
        at: input.at,
        type: 'legacy_outbox_cleanup',
        by: TEAM_LEAD,
        text: input.summary,
        metadata: {
          source: 'task_note_append_requested_cleanup',
          effectId: input.effectId,
          taskId: input.taskId,
          converted: input.converted,
        },
      },
    ]
  }
  if (input.taskId && team.tasks[input.taskId]) {
    const already = Object.values(team.taskEvents ?? {}).some(event => event.data?.legacyOutboxEffectId === input.effectId)
    if (!already) {
      const seq = typeof team.nextTaskEventSeq === 'number' && Number.isFinite(team.nextTaskEventSeq) && team.nextTaskEventSeq >= 1
        ? Math.floor(team.nextTaskEventSeq)
        : 1
      team.nextTaskEventSeq = seq + 1
      const id = formatTaskEventId(seq)
      team.taskEvents[id] = {
        id,
        taskId: input.taskId,
        type: 'migrated',
        by: TEAM_LEAD,
        at: input.at,
        summary: compactTaskHistorySummary(input.summary),
        data: {
          source: 'legacy_outbox_cleanup',
          legacyOutboxEffectId: input.effectId,
          converted: input.converted,
        },
      }
    }
  }
}

function migrateLegacyTaskNoteOutboxEffects(team: TeamState, rawOutbox: unknown, outboxPath: string, now: number): boolean {
  if (!isObjectRecord(rawOutbox)) return false
  const effects = isObjectRecord(rawOutbox.effects) ? rawOutbox.effects : {}
  let changed = false
  for (const [effectId, rawEffect] of Object.entries(effects)) {
    if (!isObjectRecord(rawEffect) || rawEffect.kind !== 'task_note_append_requested') continue
    const payload = isObjectRecord(rawEffect.payload) ? rawEffect.payload : {}
    const details = isObjectRecord(payload.details) ? payload.details : {}
    const metadata = isObjectRecord(details.metadata) ? details.metadata : {}
    const taskId = stringValue(payload.taskId)
    const mailboxMessageId = stringValue(details.linkedMessageId) ?? stringValue(metadata.linkedMailboxMessageId)
    const createdAt = numberValue(rawEffect.createdAt, now)
    let converted = false
    if (taskId && team.tasks[taskId] && mailboxMessageId) {
      appendTaskMessageRef(team, {
        taskId,
        mailboxMessageId,
        from: stringValue(metadata.from) ?? stringValue(payload.author) ?? TEAM_LEAD,
        to: stringValue(metadata.to) ?? TEAM_LEAD,
        type: messageTypeValue(details.messageType) ?? messageTypeValue(metadata.messageType) ?? 'inform',
        createdAt,
        threadId: stringValue(details.threadId) ?? stringValue(metadata.threadId),
        summary: stringValue(metadata.summary),
        priority: priorityValue(metadata.priority),
        wakeHint: wakeHintValue(metadata.wakeHint),
        diagnostic: true,
        metadata: {
          source: 'legacy_task_note_outbox_migration',
          legacyOutboxEffectId: effectId,
          compact: true,
        },
      })
      converted = true
    }
    appendLegacyOutboxCleanupEvent(team, {
      effectId,
      taskId,
      at: createdAt,
      converted,
      summary: converted
        ? `Migrated legacy task_note_append_requested outbox effect ${effectId} to TaskMessageRef`
        : `Removed unsupported legacy task_note_append_requested outbox effect ${effectId}`,
    })
    delete effects[effectId]
    if (isObjectRecord(rawOutbox.idempotency)) {
      for (const [key, value] of Object.entries(rawOutbox.idempotency)) {
        if (value === effectId) delete rawOutbox.idempotency[key]
      }
    }
    changed = true
  }
  if (changed) writeJsonFile(outboxPath, rawOutbox)
  return changed
}

function migrateLegacyPersistedStateBeforeValidation(teamName: string, now: number): void {
  const teamDir = activeTeamDir(teamName)
  const statePath = path.join(teamDir, 'team.json')
  const outboxPath = path.join(teamDir, 'outbox.json')
  const rawState = fs.existsSync(statePath) ? readJsonFile<unknown>(statePath) : null
  let team: TeamState | null = null
  let stateChanged = false
  if (rawState && teamHasLegacyTaskNotes(rawState)) {
    team = migrateTaskNotesToHistory(rawState).team
    stateChanged = true
  } else if (rawState && isObjectRecord(rawState)) {
    team = rawState as TeamState
  }
  if (team && fs.existsSync(outboxPath)) {
    const rawOutbox = readJsonFile<unknown>(outboxPath)
    if (migrateLegacyTaskNoteOutboxEffects(team, rawOutbox, outboxPath, now)) stateChanged = true
  }
  if (team && stateChanged) writeJsonFile(statePath, team)
}

export function validateOrQuarantineTeam(teamName: string, now = Date.now()): QuarantineRecord | null {
  if (!teamDirExists(teamName)) return null
  migrateLegacyPersistedStateBeforeValidation(teamName, now)
  const reasons = validatePersistedTeamDir(teamName)
  if (reasons.length === 0) return null
  return quarantineTeamDir(teamName, reasons, now)
}

export function isTeamQuarantined(teamName: string): boolean {
  if (!teamDirExists(teamName)) return false
  return readLatestQuarantineForTeam(teamName) !== null
}

export function readLatestQuarantineForTeam(teamName: string): QuarantinedTeamSummary | null {
  const root = path.join(getQuarantineRoot(), QUARANTINE_KIND)
  if (!fs.existsSync(root)) return null
  const sanitized = sanitizeName(teamName)
  const matches: QuarantinedTeamSummary[] = []
  for (const tsEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!tsEntry.isDirectory()) continue
    const tsDir = path.join(root, tsEntry.name)
    for (const teamEntry of fs.readdirSync(tsDir, { withFileTypes: true })) {
      if (!teamEntry.isDirectory()) continue
      if (sanitizeName(teamEntry.name) !== sanitized) continue
      const teamDir = path.join(tsDir, teamEntry.name)
      const record = readJsonFile<QuarantineRecord>(path.join(teamDir, 'reasons.json'))
      if (!record || !Array.isArray(record.reasons)) continue
      matches.push({
        teamName: record.teamName,
        quarantinedAt: record.quarantinedAt,
        quarantineDir: record.quarantineDir || teamDir,
        reasonCount: record.reasons.length,
        reasons: record.reasons,
      })
    }
  }
  matches.sort((a, b) => b.quarantinedAt - a.quarantinedAt || a.quarantineDir.localeCompare(b.quarantineDir))
  return matches[0] ?? null
}

export function listQuarantinedTeams(): QuarantinedTeamSummary[] {
  const root = path.join(getQuarantineRoot(), QUARANTINE_KIND)
  if (!fs.existsSync(root)) return []
  const matches: QuarantinedTeamSummary[] = []
  for (const tsEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!tsEntry.isDirectory()) continue
    const tsDir = path.join(root, tsEntry.name)
    for (const teamEntry of fs.readdirSync(tsDir, { withFileTypes: true })) {
      if (!teamEntry.isDirectory()) continue
      const teamDir = path.join(tsDir, teamEntry.name)
      const record = readJsonFile<QuarantineRecord>(path.join(teamDir, 'reasons.json'))
      if (!record || !Array.isArray(record.reasons)) continue
      matches.push({
        teamName: record.teamName,
        quarantinedAt: record.quarantinedAt,
        quarantineDir: record.quarantineDir || teamDir,
        reasonCount: record.reasons.length,
        reasons: record.reasons,
      })
    }
  }
  return matches.sort((a, b) => b.quarantinedAt - a.quarantinedAt || a.teamName.localeCompare(b.teamName))
}
