import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseFrontmatter } from '@mariozechner/pi-coding-agent'

export type AgentSource = 'builtin' | 'user' | 'project'

export type AgentDefinition = {
  name: string
  description: string
  tools?: string[]
  model?: string
  systemPrompt: string
  source: AgentSource
  filePath: string
}

type AgentTeamConfig = {
  agentModels?: Record<string, string | null>
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = cwd
  for (;;) {
    const candidate = path.join(currentDir, '.pi', 'agents')
    if (isDirectory(candidate)) return candidate
    const parent = path.dirname(currentDir)
    if (parent === currentDir) return null
    currentDir = parent
  }
}

function getConfigPath(): string {
  return path.join(path.dirname(__filename), 'config.json')
}

function readAgentTeamConfig(): AgentTeamConfig {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) as AgentTeamConfig
  } catch {
    return {}
  }
}

function applyModelOverrides(
  agents: AgentDefinition[],
  config: AgentTeamConfig,
): AgentDefinition[] {
  const modelMap = config.agentModels ?? {}
  return agents.map(agent => {
    const override = modelMap[agent.name]
    if (typeof override !== 'string' || override.trim().length === 0) {
      return {
        ...agent,
        model: undefined,
      }
    }
    return {
      ...agent,
      model: override.trim(),
    }
  })
}

function loadAgentsFromDir(
  dir: string,
  source: AgentSource,
): AgentDefinition[] {
  if (!isDirectory(dir)) return []
  const out: AgentDefinition[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.endsWith('.md')) continue
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    const filePath = path.join(dir, entry.name)
    let content = ''
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content)
    if (!frontmatter.name || !frontmatter.description) continue
    const tools = frontmatter.tools
      ?.split(',')
      .map(t => t.trim())
      .filter(Boolean)
    out.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: undefined,
      systemPrompt: body,
      source,
      filePath,
    })
  }
  return out
}

export function discoverAgents(cwd: string): AgentDefinition[] {
  const builtinDir = path.join(path.dirname(__filename), 'agents')
  const userDir = path.join(process.env.HOME ?? '', '.pi', 'agent', 'agents')
  const projectDir = findNearestProjectAgentsDir(cwd)
  const map = new Map<string, AgentDefinition>()
  const config = readAgentTeamConfig()

  for (const agent of applyModelOverrides(loadAgentsFromDir(builtinDir, 'builtin'), config)) {
    map.set(agent.name, agent)
  }
  for (const agent of applyModelOverrides(loadAgentsFromDir(userDir, 'user'), config)) {
    map.set(agent.name, agent)
  }
  if (projectDir) {
    for (const agent of applyModelOverrides(loadAgentsFromDir(projectDir, 'project'), config)) {
      map.set(agent.name, agent)
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
