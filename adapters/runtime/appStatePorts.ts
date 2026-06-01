import type { TaskMutationPort, TeamStatePort } from '../../app/ports.js'
import { createTask } from '../../state/taskStore.js'
import { readTeamState, updateTeamState } from '../../state/teamStore.js'

export const fileBackedTeamStatePort: TeamStatePort = {
  readTeam: readTeamState,
  updateTeam: updateTeamState,
}

export const fileBackedTaskMutationPort: Pick<TaskMutationPort, 'createTask'> = {
  createTask,
}
