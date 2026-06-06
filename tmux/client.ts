import { execFile, execFileSync } from 'node:child_process'
import { recordTmuxCommand } from '../core/profiling.js'

type TmuxResult = {
  ok: boolean
  stdout: string
  stderr?: string
}

interface TmuxClient {
  exec(args: string[], input?: string): string
  execNoThrow(args: string[], input?: string): TmuxResult
  execAsync(args: string[], input?: string, signal?: AbortSignal): Promise<string>
  execNoThrowAsync(args: string[], input?: string, signal?: AbortSignal): Promise<TmuxResult>
}

const TMUX = 'tmux'

class DefaultTmuxClient implements TmuxClient {
  exec(args: string[], input?: string): string {
    return execFileSync(TMUX, args, {
      encoding: 'utf8',
      input,
    }).trim()
  }

  execNoThrow(args: string[], input?: string): TmuxResult {
    try {
      return { ok: true, stdout: this.exec(args, input) }
    } catch (error) {
      return {
        ok: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      }
    }
  }

  execAsync(args: string[], input?: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile(TMUX, args, {
        encoding: 'utf8',
        signal,
      }, (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        resolve(String(stdout).trim())
      })

      if (input !== undefined) {
        child.stdin?.end(input)
      }
    })
  }

  async execNoThrowAsync(args: string[], input?: string, signal?: AbortSignal): Promise<TmuxResult> {
    try {
      return { ok: true, stdout: await this.execAsync(args, input, signal) }
    } catch (error) {
      return {
        ok: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

let client: TmuxClient = new DefaultTmuxClient()

function commandName(args: string[]): string {
  return args[0] ?? 'tmux'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function recordCommand(args: string[], startedAt: number, ok: boolean, error?: unknown): void {
  recordTmuxCommand({
    command: commandName(args),
    args,
    durationMs: Date.now() - startedAt,
    ok,
    ...(error === undefined ? {} : { error: errorMessage(error) }),
  })
}

export function withTmuxClientForTests<T>(fakeClient: TmuxClient, fn: () => T | Promise<T>): T | Promise<T> {
  const previous = client
  client = fakeClient
  try {
    const result = fn()
    if (result && typeof (result as Promise<T>).then === 'function') {
      return (result as Promise<T>).finally(() => {
        client = previous
      })
    }
    client = previous
    return result
  } catch (error) {
    client = previous
    throw error
  }
}

export function runTmux(args: string[], input?: string): string {
  const startedAt = Date.now()
  try {
    const result = client.exec(args, input)
    recordCommand(args, startedAt, true)
    return result
  } catch (error) {
    recordCommand(args, startedAt, false, error)
    throw error
  }
}

export function runTmuxNoThrow(args: string[], input?: string): TmuxResult {
  const startedAt = Date.now()
  const result = client.execNoThrow(args, input)
  recordCommand(args, startedAt, result.ok, result.ok ? undefined : result.stderr)
  return result
}

export async function runTmuxAsync(args: string[], input?: string, signal?: AbortSignal): Promise<string> {
  const startedAt = Date.now()
  try {
    const result = await client.execAsync(args, input, signal)
    recordCommand(args, startedAt, true)
    return result
  } catch (error) {
    recordCommand(args, startedAt, false, error)
    throw error
  }
}

export async function runTmuxNoThrowAsync(args: string[], input?: string, signal?: AbortSignal): Promise<TmuxResult> {
  const startedAt = Date.now()
  const result = await client.execNoThrowAsync(args, input, signal)
  recordCommand(args, startedAt, result.ok, result.ok ? undefined : result.stderr)
  return result
}
