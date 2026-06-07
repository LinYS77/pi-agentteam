import type { MemberStatus, TaskEvent, TaskMessageRef, TaskReport, TeamState, TeamTask } from '../internalTypes.js'

export type ReportWatchdogState = 'ok' | 'active' | 'waiting_for_report'

export type ReportWatchdogTaskSummary = {
  taskId: string
  owner: string
  state: ReportWatchdogState
  needsNudge: boolean
  latestAssignmentAt?: number
  latestAssignmentRefId?: string
  latestAssignmentEventId?: string
  latestOwnerReportAt?: number
  latestOwnerReportId?: string
  workerStatus?: MemberStatus
  reason: string
}

export type ReportWatchdogSummary = {
  teamName: string
  total: number
  ok: number
  active: number
  waitingForReport: number
  needsNudge: number
  tasks: ReportWatchdogTaskSummary[]
}

type AssignmentAnchor = {
  at: number
  eventId?: string
  refId?: string
}

type OwnerReportAnchor = {
  at: number
  reportId: string
}

const ACTIVE_WORKER_STATUSES = new Set<MemberStatus>([
  'pending_delivery',
  'queued',
  'running',
  'draining',
])

function taskIdNumber(id: string): number {
  const match = /^T(\d+)$/.exec(id)
  return match ? Number(match[1]) : Number.NaN
}

function compareTaskIds(a: string, b: string): number {
  const aNum = taskIdNumber(a)
  const bNum = taskIdNumber(b)
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum
  return a.localeCompare(b)
}

function eventTargetsOwner(event: TaskEvent, owner: string): boolean {
  if (event.type !== 'assigned') return false
  const newOwner = event.data?.newOwner
  if (typeof newOwner === 'string') return newOwner === owner
  return event.summary.includes(owner)
}

function messageRefTargetsOwner(ref: TaskMessageRef, owner: string): boolean {
  return ref.type === 'assignment' && ref.to === owner
}

function preferLatestAssignment(current: AssignmentAnchor | undefined, next: AssignmentAnchor): AssignmentAnchor {
  if (!current || next.at > current.at) return next
  if (next.at < current.at) return current
  return {
    at: current.at,
    eventId: next.eventId ?? current.eventId,
    refId: next.refId ?? current.refId,
  }
}

function latestAssignmentForOwner(team: TeamState, task: TeamTask, owner: string): AssignmentAnchor | undefined {
  let latest: AssignmentAnchor | undefined
  for (const event of Object.values(team.taskEvents)) {
    if (event.taskId !== task.id || !eventTargetsOwner(event, owner)) continue
    latest = preferLatestAssignment(latest, { at: event.at, eventId: event.id })
  }
  for (const ref of Object.values(team.taskMessageRefs)) {
    if (ref.taskId !== task.id || !messageRefTargetsOwner(ref, owner)) continue
    latest = preferLatestAssignment(latest, { at: ref.createdAt, refId: ref.id })
  }
  return latest
}

function latestOwnerReportAfter(team: TeamState, task: TeamTask, owner: string, at: number | undefined): OwnerReportAnchor | undefined {
  let latest: OwnerReportAnchor | undefined
  for (const report of Object.values(team.taskReports)) {
    if (!reportSatisfiesOwner(report, task, owner, at)) continue
    if (!latest || report.createdAt > latest.at || (report.createdAt === latest.at && report.id.localeCompare(latest.reportId) > 0)) {
      latest = { at: report.createdAt, reportId: report.id }
    }
  }
  return latest
}

function reportSatisfiesOwner(report: TaskReport, task: TeamTask, owner: string, at: number | undefined): boolean {
  if (report.taskId !== task.id) return false
  if (report.author !== owner) return false
  if (at !== undefined && report.createdAt < at) return false
  return true
}

function compactTaskWatchdog(team: TeamState, task: TeamTask): ReportWatchdogTaskSummary | undefined {
  const owner = task.owner
  if (task.status !== 'open' || !owner) return undefined

  const workerStatus = team.members[owner]?.status
  const latestAssignment = latestAssignmentForOwner(team, task, owner)
  const latestOwnerReport = latestOwnerReportAfter(team, task, owner, latestAssignment?.at)
  const base = {
    taskId: task.id,
    owner,
    latestAssignmentAt: latestAssignment?.at,
    latestAssignmentRefId: latestAssignment?.refId,
    latestAssignmentEventId: latestAssignment?.eventId,
    latestOwnerReportAt: latestOwnerReport?.at,
    latestOwnerReportId: latestOwnerReport?.reportId,
    workerStatus,
  }

  if (latestOwnerReport) {
    return {
      ...base,
      state: 'ok',
      needsNudge: false,
      reason: 'owner_report_after_assignment',
    }
  }

  if (workerStatus && ACTIVE_WORKER_STATUSES.has(workerStatus)) {
    return {
      ...base,
      state: 'active',
      needsNudge: false,
      reason: 'owner_active',
    }
  }

  return {
    ...base,
    state: 'waiting_for_report',
    needsNudge: true,
    reason: latestAssignment ? 'missing_owner_report_after_assignment' : 'missing_owner_report',
  }
}

export function buildReportWatchdogSummary(team: TeamState): ReportWatchdogSummary {
  const tasks = Object.values(team.tasks)
    .sort((a, b) => compareTaskIds(a.id, b.id))
    .map(task => compactTaskWatchdog(team, task))
    .filter((task): task is ReportWatchdogTaskSummary => Boolean(task))
  return {
    teamName: team.name,
    total: tasks.length,
    ok: tasks.filter(task => task.state === 'ok').length,
    active: tasks.filter(task => task.state === 'active').length,
    waitingForReport: tasks.filter(task => task.state === 'waiting_for_report').length,
    needsNudge: tasks.filter(task => task.needsNudge).length,
    tasks,
  }
}
