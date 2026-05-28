import { TEAM_LEAD } from './internalTypes.js'

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function isLeader(memberName: string): boolean {
  return memberName === TEAM_LEAD
}
