import * as fs from 'node:fs'
import * as path from 'node:path'

export type DebouncedFileWatcher = {
  stop: () => void
}

export type DebouncedFileWatchOptions = {
  debounceMs: number
  retryMs: number
  onChange: () => void
}

export function watchFileDebounced(filePath: string, options: DebouncedFileWatchOptions): DebouncedFileWatcher {
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let retryTimer: NodeJS.Timeout | undefined
  let watcher: fs.FSWatcher | undefined

  const schedule = (): void => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      options.onChange()
    }, options.debounceMs)
    timer.unref?.()
  }

  const retryWatch = (): void => {
    if (stopped || retryTimer || watcher) return
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      tryWatch()
    }, options.retryMs)
    retryTimer.unref?.()
  }

  const tryWatch = (): void => {
    if (stopped || watcher) return
    try {
      const watchDir = path.dirname(filePath)
      if (!fs.existsSync(watchDir)) throw new Error(`watch directory missing: ${watchDir}`)
      const basename = path.basename(filePath)
      watcher = fs.watch(watchDir, { persistent: false }, (_eventType, filename) => {
        if (!filename || String(filename) === basename) schedule()
      })
      watcher.on?.('error', () => {
        watcher = undefined
        retryWatch()
      })
      watcher.on?.('close', () => {
        watcher = undefined
        if (!stopped) retryWatch()
      })
    } catch {
      retryWatch()
    }
  }

  tryWatch()
  schedule()

  return {
    stop() {
      if (stopped) return
      stopped = true
      if (timer) clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
      watcher?.close()
    },
  }
}
