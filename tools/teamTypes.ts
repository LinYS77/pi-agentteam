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
}
