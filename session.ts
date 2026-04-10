import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import { ensureAttachedSessionContext } from './state.js'

export function getSessionFile(ctx: Pick<ExtensionContext, 'sessionManager'>): string {
  return ctx.sessionManager.getSessionFile() ?? `ephemeral:${process.pid}`
}

export function getCurrentMemberName(
  ctx: Pick<ExtensionContext, 'sessionManager'>,
): string | null {
  return ensureAttachedSessionContext(getSessionFile(ctx)).context.memberName
}

export function getCurrentTeamName(
  ctx: Pick<ExtensionContext, 'sessionManager'>,
): string | null {
  return ensureAttachedSessionContext(getSessionFile(ctx)).context.teamName
}


