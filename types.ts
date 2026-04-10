export const TEAM_LEAD = 'team-lead'

export type MemberStatus = 'idle' | 'queued' | 'running' | 'error'
export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed'

export type SessionTeamContext = {
  teamName: string | null
  memberName: string | null
}

export type TeamMember = {
  name: string
  role: string
  model?: string
  tools?: string[]
  systemPrompt?: string
  cwd: string
  sessionFile: string
  paneId?: string
  windowTarget?: string
  bootPrompt?: string
  status: MemberStatus
  createdAt: number
  updatedAt: number
  lastWakeReason?: string
  lastError?: string
}

export type TeamMessageType =
  | 'assignment'
  | 'question'
  | 'blocked'
  | 'completion_report'
  | 'fyi'

export type TeamMessagePriority = 'low' | 'normal' | 'high'
export type TeamMessageWakeHint = 'none' | 'soft' | 'hard'

export type TeamTaskNote = {
  at: number
  author: string
  text: string
  threadId?: string
  messageType?: TeamMessageType
  requestId?: string
  linkedMessageId?: string
  metadata?: Record<string, unknown>
}

export type TeamTask = {
  id: string
  title: string
  description: string
  status: TaskStatus
  owner?: string
  blockedBy: string[]
  notes: TeamTaskNote[]
  createdAt: number
  updatedAt: number
}

export type TeamEvent = {
  id: string
  at: number
  type: string
  by: string
  text: string
  metadata?: Record<string, unknown>
}

export type TeamState = {
  version: 1
  name: string
  description?: string
  createdAt: number
  leaderSessionFile?: string
  leaderCwd: string
  members: Record<string, TeamMember>
  tasks: Record<string, TeamTask>
  events?: TeamEvent[]
  nextTaskSeq: number
  revision?: number
  memberTombstones?: Record<string, number>
}

export type MailboxMessage = {
  id: string
  from: string
  to: string
  text: string
  summary?: string
  type?: TeamMessageType
  taskId?: string
  threadId?: string
  requestId?: string
  replyTo?: string
  priority?: TeamMessagePriority
  wakeHint?: TeamMessageWakeHint
  metadata?: Record<string, unknown>
  createdAt: number
  readAt?: number
}
