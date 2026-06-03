import type { AppendTaskEventInput, AppendTaskReportInput, TaskHistoryQueryPort, TaskMutationPort, TeamStatePort, UpdateTaskReportInput } from '../../app/ports.js'
import { createTask } from '../../state/taskStore.js'
import { readTeamState, updateTeamState } from '../../state/teamStore.js'
import {
  appendTaskEvent,
  appendTaskReport,
  findTaskReport,
  updateTaskReport,
  latestTaskActivity,
  latestTaskReport,
  taskEventsForTask,
  taskHistoryCounts,
  taskHistorySummary,
  taskMessageRefsForTask,
  taskReportsForTask,
} from '../../state/taskHistory.js'
import type { TeamState } from '../../internalTypes.js'

export const fileBackedTeamStatePort: TeamStatePort = {
  readTeam: readTeamState,
  updateTeam: updateTeamState,
}

function appendTaskEventPort(team: TeamState, input: AppendTaskEventInput) {
  return appendTaskEvent(team, input)
}

function appendTaskReportPort(team: TeamState, input: AppendTaskReportInput) {
  return appendTaskReport(team, input)
}

function updateTaskReportPort(team: TeamState, reportId: string, patch: UpdateTaskReportInput) {
  return updateTaskReport(team, reportId, patch)
}

export const fileBackedTaskMutationPort: Pick<TaskMutationPort, 'createTask' | 'appendTaskEvent' | 'appendTaskReport' | 'updateTaskReport'> = {
  createTask,
  appendTaskEvent: appendTaskEventPort,
  appendTaskReport: appendTaskReportPort,
  updateTaskReport: updateTaskReportPort,
}

export const fileBackedTaskHistoryQueryPort: TaskHistoryQueryPort = {
  taskReportsForTask,
  taskEventsForTask,
  taskMessageRefsForTask,
  latestTaskReport,
  latestTaskActivity,
  taskHistoryCounts,
  taskHistorySummary,
  findTaskReport,
}
