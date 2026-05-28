import * as fs from 'node:fs'
import * as path from 'node:path'
import { isMessageType, isTaskReportType, isTaskStatus } from '../core/publicModel.js'
import { readJsonFile, writeJsonFile } from './fsStore.js'
import {
  getAgentTeamRoot,
  getQuarantineRoot,
  sanitizeName,
} from './paths.js'

export const QUARANTINE_KIND = 'vnext-unsupported'

const LEGACY_TASK_STATUSES = Object.freeze(['pending', 'in_progress', 'completed'] as const)
const LEGACY_MESSAGE_TYPES = Object.freeze(['fyi', 'completion_report', 'blocked'] as const)
const OUTBOX_EFFECT_KINDS = Object.freeze(['inbox_item_append_requested', 'worker_delivery_requested', 'leader_attention_requested', 'task_note_append_requested', 'append_event_requested'] as const)
const LEGACY_OUTBOX_EFFECT_KINDS = Object.freeze(['leader_triage_requested'] as const)
const TASK_NOTE_SOURCE_KINDS = Object.freeze(['task_note', 'task_report', 'communication_ref', 'legacy_communication_ref'] as const)
const TASK_NOTE_DISPLAY_MODES = Object.freeze(['visible', 'hidden', 'folded'] as const)

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

function pushInvalidTaskNoteMetadata(
  reasons: StateValidationReason[],
  input: { file: string; path: string; metadata: unknown },
): void {
  if (input.metadata === undefined) return
  if (!isObjectRecord(input.metadata)) {
    reasons.push(reason({
      code: 'invalid_task_note_metadata',
      file: input.file,
      path: input.path,
      field: 'metadata',
      value: input.metadata,
      message: 'Task note metadata must be an object when present',
    }))
    return
  }
  const sourceKind = input.metadata.sourceKind
  if (sourceKind !== undefined && (typeof sourceKind !== 'string' || !(TASK_NOTE_SOURCE_KINDS as readonly string[]).includes(sourceKind))) {
    reasons.push(reason({
      code: 'unsupported_task_note_source_kind',
      file: input.file,
      path: `${input.path}.sourceKind`,
      field: 'sourceKind',
      value: sourceKind,
      message: `Unsupported task note sourceKind ${valueString(sourceKind)} in persisted state`,
    }))
  }
  const displayMode = input.metadata.displayMode
  if (displayMode !== undefined && (typeof displayMode !== 'string' || !(TASK_NOTE_DISPLAY_MODES as readonly string[]).includes(displayMode))) {
    reasons.push(reason({
      code: 'unsupported_task_note_display_mode',
      file: input.file,
      path: `${input.path}.displayMode`,
      field: 'displayMode',
      value: displayMode,
      message: `Unsupported task note displayMode ${valueString(displayMode)} in persisted state`,
    }))
  }
  const linkedIds = input.metadata.linkedIds
  if (linkedIds !== undefined && !isObjectRecord(linkedIds)) {
    reasons.push(reason({
      code: 'invalid_task_note_linked_ids',
      file: input.file,
      path: `${input.path}.linkedIds`,
      field: 'linkedIds',
      value: linkedIds,
      message: 'Task note metadata.linkedIds must be an object when present',
    }))
  } else if (isObjectRecord(linkedIds)) {
    for (const [key, value] of Object.entries(linkedIds)) {
      if (typeof value === 'string') continue
      reasons.push(reason({
        code: 'invalid_task_note_linked_id',
        file: input.file,
        path: `${input.path}.linkedIds.${key}`,
        field: key,
        value,
        message: 'Task note metadata.linkedIds values must be strings',
      }))
    }
  }
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

      const notes = task.notes
      if (notes === undefined) continue
      if (!Array.isArray(notes)) {
        reasons.push(reason({ code: 'invalid_task_notes_shape', file, path: `${taskPath}.notes`, field: 'notes', value: notes, message: `Task ${taskId} notes must be an array` }))
        continue
      }
      notes.forEach((note, index) => {
        if (!isObjectRecord(note)) return
        pushInvalidMessageType(reasons, {
          file,
          path: `${taskPath}.notes[${index}].messageType`,
          field: 'messageType',
          value: note.messageType,
        })
        pushInvalidTaskNoteMetadata(reasons, {
          file,
          path: `${taskPath}.notes[${index}].metadata`,
          metadata: note.metadata,
        })
      })
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
    if (typeof kind === 'string' && (OUTBOX_EFFECT_KINDS as readonly string[]).includes(kind)) continue
    const legacy = typeof kind === 'string' && (LEGACY_OUTBOX_EFFECT_KINDS as readonly string[]).includes(kind)
    reasons.push(reason({
      code: legacy ? 'legacy_outbox_effect_kind' : 'unsupported_outbox_effect_kind',
      file,
      path: `${effectPath}.kind`,
      field: 'kind',
      value: kind,
      message: legacy
        ? `Legacy outbox effect kind ${kind} is not supported in vNext persisted state`
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

export function validateOrQuarantineTeam(teamName: string, now = Date.now()): QuarantineRecord | null {
  if (!teamDirExists(teamName)) return null
  const reasons = validatePersistedTeamDir(teamName)
  if (reasons.length === 0) return null
  return quarantineTeamDir(teamName, reasons, now)
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
