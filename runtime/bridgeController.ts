import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { getBridgeLease } from '../state/bridgeStore.js'
import { getMailboxPath, getRuntimeStatePath, getTeamStatePath } from '../state/paths.js'
import { getSessionFile } from '../session.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { BridgeNativeContext, BridgePumpResult } from './bridgeTypes.js'
import { maintainBridgeDeliveryRequests, pumpBridgeOnce } from './bridgeDeliveryPump.js'
import { heartbeatBridgeLease, markBridgeStopped, publishBridgeLease } from './bridgeLease.js'
import {
  BRIDGE_HEARTBEAT_MS,
  BRIDGE_WATCH_DEBOUNCE_MS,
  BRIDGE_WATCH_RETRY_MS,
} from './bridgeConstants.js'

export type WorkerBridgeController = {
  stop: () => void
  pump: () => Promise<BridgePumpResult | undefined>
}

const controllers = new Map<string, WorkerBridgeController>()

function scopedBridgeKey(...parts: string[]): string {
  return JSON.stringify(parts)
}

function bridgeKey(teamName: string, memberName: string, sessionFile: string): string {
  return scopedBridgeKey(teamName, memberName, sessionFile)
}

function parseBridgeKey(key: string): [string, string, string] | null {
  try {
    const parsed = JSON.parse(key)
    return Array.isArray(parsed) && parsed.length === 3
      ? [String(parsed[0]), String(parsed[1]), String(parsed[2])]
      : null
  } catch {
    return null
  }
}

export function startWorkerBridge(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  input: { teamName: string | null; memberName: string | null },
): WorkerBridgeController | null {
  const { teamName, memberName } = input
  if (!teamName || !memberName || memberName === TEAM_LEAD) return null
  const sessionFile = getSessionFile(ctx)
  const key = bridgeKey(teamName, memberName, sessionFile)
  const existing = controllers.get(key)
  if (existing) return existing

  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let retryTimer: NodeJS.Timeout | undefined
  let heartbeat: NodeJS.Timeout | undefined
  const watchers = new Map<string, fs.FSWatcher>()
  const desiredWatchPaths = new Set<string>()

  const shouldWatch = true
  const nativeCtx: BridgeNativeContext = {
    isIdle: () => typeof ctx.isIdle === 'function' ? ctx.isIdle() : true,
    hasPendingMessages: () => typeof ctx.hasPendingMessages === 'function' ? ctx.hasPendingMessages() : false,
    sendUserMessage: (content, options) => pi.sendUserMessage(content, options),
    sendMessage: (message, options) => pi.sendMessage(message, options),
  }

  const pump = async (): Promise<BridgePumpResult | undefined> => {
    if (stopped) return undefined
    return pumpBridgeOnce({ teamName, memberName, ctx: nativeCtx })
  }

  const maintain = (): void => {
    if (stopped) return
    maintainBridgeDeliveryRequests(teamName, memberName)
  }

  const schedule = (): void => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void pump()
    }, BRIDGE_WATCH_DEBOUNCE_MS)
    timer.unref?.()
  }

  const retryWatchMissingPaths = (): void => {
    if (stopped || retryTimer) return
    const missing = [...desiredWatchPaths].filter(filePath => !watchers.has(filePath))
    if (missing.length === 0) return
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      for (const filePath of missing) tryWatchPath(filePath)
    }, BRIDGE_WATCH_RETRY_MS)
    retryTimer.unref?.()
  }

  const tryWatchPath = (filePath: string): void => {
    if (stopped || !filePath || watchers.has(filePath)) return
    try {
      const watchDir = path.dirname(filePath)
      if (!watchDir || !fs.existsSync(watchDir)) throw new Error(`watch dir missing: ${watchDir || filePath}`)
      const basename = path.basename(filePath)
      const watcher = fs.watch(watchDir, { persistent: false }, (_eventType, filename) => {
        if (!filename || String(filename) === basename) schedule()
      })
      watcher.on?.('error', () => {
        watchers.delete(filePath)
        retryWatchMissingPaths()
      })
      watcher.on?.('close', () => {
        watchers.delete(filePath)
        if (!stopped) retryWatchMissingPaths()
      })
      watchers.set(filePath, watcher)
    } catch {
      retryWatchMissingPaths()
    }
  }

  const watchPath = (filePath: string): void => {
    if (!filePath) return
    desiredWatchPaths.add(filePath)
    tryWatchPath(filePath)
  }

  const lease = publishBridgeLease({ teamName, memberName, sessionFile })
  if (!lease) return null
  heartbeat = setInterval(() => {
    if (!stopped) {
      heartbeatBridgeLease({
        teamName,
        memberName,
        bridgeId: lease.bridgeId,
        generation: lease.generation,
        sessionFile,
      })
      void pump()
    }
  }, BRIDGE_HEARTBEAT_MS)
  heartbeat.unref?.()
  if (shouldWatch) {
    watchPath(getMailboxPath(teamName, memberName))
    watchPath(getTeamStatePath(teamName))
    watchPath(getRuntimeStatePath(teamName))
    schedule()
  }

  const controller: WorkerBridgeController = {
    stop() {
      if (stopped) return
      stopped = true
      if (timer) clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
      if (heartbeat) clearInterval(heartbeat)
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
      markBridgeStopped(teamName, memberName)
      controllers.delete(key)
    },
    pump,
  }
  controllers.set(key, controller)
  return controller
}

export function stopWorkerBridge(ctx: ExtensionContext): void {
  const sessionFile = getSessionFile(ctx)
  for (const [key, controller] of [...controllers.entries()]) {
    const parsed = parseBridgeKey(key)
    if (!parsed || parsed[2] !== sessionFile) continue
    controller.stop()
  }
}

export function startWorkerBridgeForContext(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  attached: { teamName: string | null; memberName: string | null },
): WorkerBridgeController | null {
  return startWorkerBridge(pi, ctx, attached)
}

export function pumpWorkerBridgeForContext(ctx: ExtensionContext): void {
  const sessionFile = getSessionFile(ctx)
  for (const [key, controller] of controllers.entries()) {
    const parsed = parseBridgeKey(key)
    if (!parsed || parsed[2] !== sessionFile) continue
    void controller.pump()
  }
}

export async function notifyBridgeWork(teamName: string, memberName: string): Promise<boolean> {
  const lease = getBridgeLease(teamName, memberName)
  const pumps: Array<Promise<BridgePumpResult | undefined>> = []
  for (const [key, controller] of controllers.entries()) {
    const parsed = parseBridgeKey(key)
    if (!parsed || parsed[0] !== teamName || parsed[1] !== memberName) continue
    if (!lease || parsed[2] !== lease.sessionFile) continue
    pumps.push(controller.pump())
  }
  if (pumps.length === 0) return false
  const results = await Promise.allSettled(pumps)
  return results.some(result => result.status === 'fulfilled' && result.value?.ok === true)
}

export function activeWorkerBridgeControllerCount(): number {
  return controllers.size
}
