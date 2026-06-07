import type { AppendTaskEventInput, AppendTaskReportInput, TaskHistoryQueryPort, TaskMutationPort, TeamStatePort, UpdateTaskReportInput } from '../../app/ports.js'
import type { TeamState } from '../../internalTypes.js'
import { fileBackedStateRepository, type StateRepository } from '../../state/repository.js'

const stateRepository: StateRepository = fileBackedStateRepository

export const fileBackedTeamStatePort: TeamStatePort = {
  readTeam: stateRepository.readTeamState,
  updateTeam: stateRepository.updateTeamState,
}

function appendTaskEventPort(team: TeamState, input: AppendTaskEventInput) {
  return stateRepository.appendTaskEvent(team, input)
}

function appendTaskReportPort(team: TeamState, input: AppendTaskReportInput) {
  return stateRepository.appendTaskReport(team, input)
}

function updateTaskReportPort(team: TeamState, reportId: string, patch: UpdateTaskReportInput) {
  return stateRepository.updateTaskReport(team, reportId, patch)
}

export const fileBackedTaskMutationPort: Pick<TaskMutationPort, 'createTask' | 'appendTaskEvent' | 'appendTaskReport' | 'updateTaskReport'> = {
  createTask: stateRepository.createTask,
  appendTaskEvent: appendTaskEventPort,
  appendTaskReport: appendTaskReportPort,
  updateTaskReport: updateTaskReportPort,
}

export const fileBackedTaskHistoryQueryPort: TaskHistoryQueryPort = {
  taskReportsForTask: stateRepository.taskReportsForTask,
  taskEventsForTask: stateRepository.taskEventsForTask,
  taskMessageRefsForTask: stateRepository.taskMessageRefsForTask,
  latestTaskReport: stateRepository.latestTaskReport,
  latestTaskActivity: stateRepository.latestTaskActivity,
  taskHistoryCounts: stateRepository.taskHistoryCounts,
  taskHistorySummary: stateRepository.taskHistorySummary,
  findTaskReport: stateRepository.findTaskReport,
}
