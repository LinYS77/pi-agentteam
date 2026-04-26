import { discoverAgents } from '../agents.js'
import type { AgentDefinition } from '../agents.js'

export function normalizeSpawnRole(role: string, memberName?: string): string {
  const raw = role.trim()
  const key = raw.toLowerCase()
  const name = (memberName ?? '').trim().toLowerCase()
  if (!raw) return role

  const plannerAliases = ['plan', 'planner', 'planning', '规划', '规划师']
  const researcherAliases = ['research', 'researcher', 'researching', '研究', '研究员']
  const implementerAliases = ['implement', 'implementer', 'coder', 'developer', 'dev', '实现', '实现者', '工程师']

  if (plannerAliases.includes(key)) return 'planner'
  if (researcherAliases.includes(key)) return 'researcher'
  if (implementerAliases.includes(key)) return 'implementer'

  const genericRole = ['worker', 'teammate', 'agent', 'subagent', '成员', '队员'].includes(key)
  if (genericRole) {
    if (name.includes('plan') || name.includes('规划')) return 'planner'
    if (name.includes('research') || name.includes('研究')) return 'researcher'
    if (name.includes('implement') || name.includes('dev') || name.includes('code') || name.includes('实现')) return 'implementer'
  }

  return raw
}

export function resolveSpawnRole(
  role: string,
  memberName?: string,
): { ok: true; normalizedRole: string; roleAgent: AgentDefinition } | { ok: false; normalizedRole: string; text: string } {
  const discovered = discoverAgents()
  const normalizedRole = normalizeSpawnRole(role, memberName)
  const roleAgent = discovered.find(a => a.name === normalizedRole)
  if (!roleAgent) {
    const available = discovered.map(agent => agent.name).sort().join(', ') || '(none)'
    return { ok: false, normalizedRole, text: `Unknown teammate role ${normalizedRole}. Available roles: ${available}` }
  }
  return { ok: true, normalizedRole, roleAgent }
}
