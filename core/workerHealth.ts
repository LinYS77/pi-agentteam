import { type WorkerHealth } from './publicModel.js'

const WORKER_HEALTH_PROJECTION_CHECKS = Object.freeze(['error', 'offline', 'busy', 'idle'] as const)
export type WorkerHealthProjectionCheck = typeof WORKER_HEALTH_PROJECTION_CHECKS[number]

export type WorkerHealthProjectionInput = {
  isOperational: boolean
  hasPendingWork?: boolean
  hasActiveTurn?: boolean
  hasError?: boolean
}

export { WORKER_HEALTH_PROJECTION_CHECKS }

export function projectWorkerHealth(input: WorkerHealthProjectionInput): WorkerHealth {
  if (input.hasError) return 'error'
  if (!input.isOperational) return 'offline'
  if (input.hasPendingWork || input.hasActiveTurn) return 'busy'
  return 'idle'
}
