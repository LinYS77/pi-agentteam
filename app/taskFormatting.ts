import type { TeamTask } from '../internalTypes.js'

export function formatTask(task: TeamTask): string {
  const owner = task.owner ? ` @${task.owner}` : ''
  const blocked = task.blockedBy.length > 0 ? ` blockedBy=${task.blockedBy.join(',')}` : ''
  return `${task.id} [${task.status}] ${task.title}${owner}${blocked}`
}

export function buildImplementationCompletionNote(note?: string): string {
  const trimmed = note?.trim() ?? ''
  const template = [
    'Change summary:',
    '- Files changed: <path[:lines], ...>',
    '- Line range / diff scope: <start-end or hunk summary>',
    '- Checks run: <command -> result>',
    '- Validation result: <pass/fail + evidence>',
  ].join('\n')

  if (!trimmed) return template
  if (/Files changed:|Line range \/ diff scope:|Checks run:|Validation result:/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}\n\n${template}`
}
