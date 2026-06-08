import * as fs from 'node:fs'
import type {
  MailboxMessage,
  PlanRun,
  PlanRunEvent,
  TaskEvent,
  TaskMessageRef,
  TaskReport,
  TeamMember,
  TeamState,
  TeamTask,
} from '../internalTypes.js'
import { readJsonFile, writeJsonFile } from './fsStore.js'
import { getMailboxPath, getMailboxProjectionPath, getTeamPanelProjectionPath } from './paths.js'
import { normalizeTeamState } from './merge.js'

export type PanelMailboxProjectionState = {
  version: 1
  teamName: string
  memberName: string
  updatedAt: number
  sourceMtimeMs?: number
  items: Array<Omit<MailboxMessage, 'text'>>
}

export type PanelTaskReportProjection = Omit<TaskReport, 'text'> & { text?: '' }

export type PanelTeamProjectionState = {
  version: 1
  teamName: string
  updatedAt: number
  team: Omit<TeamState, 'taskReports'> & {
    taskReports: Record<string, PanelTaskReportProjection>
  }
}

function compactMailboxMessage(message: MailboxMessage): Omit<MailboxMessage, 'text'> {
  const { text: _text, ...compact } = message
  return compact
}

function compactTaskReport(report: TaskReport): PanelTaskReportProjection {
  const { text: _text, ...compact } = report
  return compact
}

function fileMtimeMs(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).mtimeMs
  } catch {
    return undefined
  }
}

function cloneRecord<T>(record: Record<string, T> | undefined): Record<string, T> {
  return Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [key, { ...(value as object) } as T]))
}

export function compactTeamForPanel(team: TeamState): PanelTeamProjectionState['team'] {
  const normalized = normalizeTeamState(team)
  return {
    ...normalized,
    members: cloneRecord<TeamMember>(normalized.members),
    tasks: cloneRecord<TeamTask>(normalized.tasks),
    events: normalized.events?.map(event => ({ ...event })),
    taskReports: Object.fromEntries(
      Object.entries(normalized.taskReports).map(([reportId, report]) => [reportId, compactTaskReport(report)]),
    ),
    taskEvents: cloneRecord<TaskEvent>(normalized.taskEvents),
    taskMessageRefs: cloneRecord<TaskMessageRef>(normalized.taskMessageRefs),
    planRuns: cloneRecord<PlanRun>(normalized.planRuns),
    planRunEvents: cloneRecord<PlanRunEvent>(normalized.planRunEvents),
    memberTombstones: { ...(normalized.memberTombstones ?? {}) },
  }
}

export function writeTeamPanelProjection(team: TeamState): void {
  writeJsonFile(getTeamPanelProjectionPath(team.name), {
    version: 1,
    teamName: team.name,
    updatedAt: Date.now(),
    team: compactTeamForPanel(team),
  } satisfies PanelTeamProjectionState)
}

export function readTeamPanelProjection(teamName: string): PanelTeamProjectionState | null {
  const projection = readJsonFile<PanelTeamProjectionState>(getTeamPanelProjectionPath(teamName))
  if (!projection || projection.version !== 1 || projection.teamName !== teamName || !projection.team) return null
  return projection
}

export function writeMailboxProjection(teamName: string, memberName: string, mailbox: MailboxMessage[]): void {
  writeJsonFile(getMailboxProjectionPath(teamName, memberName), {
    version: 1,
    teamName,
    memberName,
    updatedAt: Date.now(),
    sourceMtimeMs: fileMtimeMs(getMailboxPath(teamName, memberName)),
    items: mailbox.map(compactMailboxMessage),
  } satisfies PanelMailboxProjectionState)
}

export function readMailboxProjection(teamName: string, memberName: string): PanelMailboxProjectionState | null {
  const projection = readJsonFile<PanelMailboxProjectionState>(getMailboxProjectionPath(teamName, memberName))
  if (!projection || projection.version !== 1 || projection.teamName !== teamName || projection.memberName !== memberName || !Array.isArray(projection.items)) return null
  const sourceMtimeMs = fileMtimeMs(getMailboxPath(teamName, memberName))
  if (sourceMtimeMs !== undefined && projection.sourceMtimeMs !== undefined && sourceMtimeMs > projection.sourceMtimeMs + 1) return null
  return projection
}
