import { TEAM_LEAD } from '../../internalTypes.js'
import type { TeamState } from '../../internalTypes.js'

export function sanitizeWorkerName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
}

export function sanitizeTeamName(name: string): string {
  return sanitizeWorkerName(name)
}

type NewNameValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; normalized: string; reason: 'empty_after_normalization' | 'weak_slug'; message: string }

function isSafeNewSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(slug)
}

function validateNewName(rawName: string, label: 'Team' | 'Teammate'): NewNameValidationResult {
  const normalized = sanitizeWorkerName(rawName)
  if (!normalized) {
    return {
      ok: false,
      normalized,
      reason: 'empty_after_normalization',
      message: `${label} name cannot be empty after normalization`,
    }
  }
  if (!isSafeNewSlug(normalized)) {
    return {
      ok: false,
      normalized,
      reason: 'weak_slug',
      message: `${label} name must normalize to a safe ASCII slug that starts and ends with a letter or digit. Use a short ASCII name such as ${label === 'Team' ? 'research-team' : 'researcher-one'}.`,
    }
  }
  return { ok: true, normalized }
}

export function validateNewTeamName(name: string): NewNameValidationResult {
  return validateNewName(name, 'Team')
}

export function validateNewWorkerName(name: string): NewNameValidationResult {
  return validateNewName(name, 'Teammate')
}

export function normalizeOwnerName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed === TEAM_LEAD ? TEAM_LEAD : sanitizeWorkerName(trimmed)
}

export function assertValidOwner(team: TeamState, owner: string): void {
  if (owner === TEAM_LEAD) return
  if (!team.members[owner]) {
    throw new Error(`Owner ${owner} not found in current team`)
  }
}

function isIdleLikeTask(task?: string): boolean {
  const text = task?.trim().toLowerCase()
  if (!text) return true
  return [
    /^wake\s+instruction\s*:?$/i,
    /^instruction\s*:?$/i,
    /^stay idle[.!\s]*$/i,
    /^do not perform any actions?[.!\s]*$/i,
    /^wait for instructions?[.!\s]*$/i,
    /until explicitly instructed/i,
    /不要进行任何操作/,
    /保持空闲/,
    /先待命/,
    /不要开始/,
    /只创建/,
  ].some(pattern => pattern.test(text))
}

function isDeferredFollowupTask(task?: string): boolean {
  const text = task?.trim().toLowerCase()
  if (!text) return false
  return [
    /先等待/,
    /等待.*(报告|消息|结果|完成)/,
    /收到.*后/,
    /wait\s+for\s+.*(report|message|result)/i,
    /after\s+.*(report|message|result)/i,
    /once\s+.*(report|message|result)/i,
  ].some(pattern => pattern.test(text))
}

export function classifySpawnTask(task?: string): { initialTask?: string; bootPrompt?: string } {
  const text = task?.trim()
  if (!text || isIdleLikeTask(text)) return {}
  if (isDeferredFollowupTask(text)) return { bootPrompt: text }
  return { initialTask: text }
}
