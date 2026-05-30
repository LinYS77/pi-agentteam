import { projectWorkerHealth, type WorkerHealthProjectionInput } from '../core/workerHealth.js'
import type { WorkerHealth } from '../core/publicModel.js'

export type TeamMemberHealthProjectionInput = {
  paneId?: string
  status?: string
  bridgeLastError?: string
  bridgeWorkRequestedAt?: number
}

export function memberHealthProjectionInput(member: TeamMemberHealthProjectionInput): WorkerHealthProjectionInput {
  return {
    isOperational: Boolean(member.paneId) && member.status !== 'offline',
    hasError: member.status === 'error' || Boolean(member.bridgeLastError),
    hasActiveTurn: member.status === 'running' || member.status === 'draining',
    hasPendingWork: member.status === 'queued' || member.status === 'pending_delivery' || Boolean(member.bridgeWorkRequestedAt),
  }
}

export function projectTeamMemberHealth(member: TeamMemberHealthProjectionInput): WorkerHealth {
  return projectWorkerHealth(memberHealthProjectionInput(member))
}
