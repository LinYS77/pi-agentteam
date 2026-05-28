import type { AgentTeamConfigDiagnostic } from '../config.js'

export type SpawnRollbackCleanup = {
  memberRemoved: boolean
  sessionContextCleared: boolean
  sessionFileRemoved: boolean
  paneKilled?: boolean
  paneCleanupSkipped?: string
}

export type TeamCreateInput = {
  team_name: string
  description?: string
}

export type TeamSpawnInput = {
  name: string
  role: string
  task?: string
  cwd?: string
}

export type SpawnResult = {
  ok: boolean
  text: string
  memberName?: string
  sessionFile?: string
  paneId?: string
  model?: string
  modelLabel?: string
  modelSource?: 'configured' | 'default'
  configDiagnostics?: AgentTeamConfigDiagnostic[]
  rollbackCleanup?: SpawnRollbackCleanup
  bridgeReady?: boolean
  deliveryRequestId?: string
  outboxEffectId?: string
  outboxStatus?: 'pending' | 'done' | 'failed'
}
