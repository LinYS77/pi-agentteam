import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import {
  truncateToWidth,
  visibleWidth,
} from '@mariozechner/pi-tui'

export type PanelTheme = ExtensionContext['ui']['theme']
export type PanelColor = 'dim' | 'accent' | 'warning' | 'error' | 'success' | 'text'

export function short(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

export function basename(filePath: string): string {
  const chunks = filePath.split('/').filter(Boolean)
  return chunks[chunks.length - 1] ?? filePath
}

export function formatAge(ageMs: number): string {
  const minutes = Math.max(0, Math.floor(ageMs / 60000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h` : `${hours}h${rem}m`
}

export function formatDateTime(timeMs: number | undefined): string {
  if (!timeMs) return '-'
  return new Date(timeMs).toLocaleString()
}

export function fitToWidth(line: string, width: number): string {
  const safeWidth = Math.max(0, width)
  const clipped = truncateToWidth(line, safeWidth)
  const pad = Math.max(0, safeWidth - visibleWidth(clipped))
  return `${clipped}${' '.repeat(pad)}`
}

export function drawBox(
  theme: PanelTheme,
  options: {
    width: number
    title: string
    lines: string[]
    focused?: boolean
    paddingX?: number
    paddingY?: number
    footer?: string
    minContentLines?: number
  },
): string[] {
  const width = Math.max(8, options.width)
  const inner = width - 2
  const isFocused = Boolean(options.focused)
  const borderColor = isFocused ? 'accent' : 'dim'
  const px = options.paddingX ?? 2
  const py = options.paddingY ?? 0
  const padStr = ' '.repeat(px)
  const contentInner = Math.max(0, inner - px * 2)

  const marker = isFocused ? theme.fg('accent', '● ') : ''
  const rawTitleText = ` ${marker}${options.title} `
  const titleText = truncateToWidth(rawTitleText, inner)
  const title = isFocused ? theme.bold(titleText) : theme.bold(titleText)
  const topFill = '─'.repeat(Math.max(0, inner - visibleWidth(titleText)))
  const top = theme.fg(borderColor, `╭${title}${topFill}╮`)

  let bottom = ''
  if (options.footer) {
    const footerText = ` ${options.footer} `
    const rightAlign = Math.max(0, inner - visibleWidth(footerText) - 1)
    const botFill = '─'.repeat(rightAlign)
    bottom = theme.fg(borderColor, `╰${botFill}${theme.fg('dim', footerText)}─╯`)
  } else {
    bottom = theme.fg(borderColor, `╰${'─'.repeat(inner)}╯`)
  }

  let content = options.lines.length > 0 ? options.lines : ['']
  if (options.minContentLines !== undefined && content.length < options.minContentLines) {
    content = [...content, ...Array(options.minContentLines - content.length).fill('')]
  }

  const padLines = Array(py).fill('')
  const finalContent = [...padLines, ...content, ...padLines]

  const body = finalContent.map(line => {
    const left = theme.fg(borderColor, '│')
    const right = theme.fg(borderColor, '│')
    return `${left}${padStr}${fitToWidth(line, contentInner)}${padStr}${right}`
  })

  return [top, ...body, bottom]
}

export function mergeColumns(
  left: string[],
  right: string[],
  leftWidth: number,
  rightWidth: number,
  gap = 2,
): string[] {
  const spacer = ' '.repeat(Math.max(1, gap))
  const max = Math.max(left.length, right.length)
  const out: string[] = []
  for (let i = 0; i < max; i += 1) {
    const leftLine = left[i] ? fitToWidth(left[i]!, leftWidth) : ' '.repeat(leftWidth)
    const rightLine = right[i] ? fitToWidth(right[i]!, rightWidth) : ' '.repeat(rightWidth)
    out.push(`${leftLine}${spacer}${rightLine}`)
  }
  return out
}

export function windowSlice<T>(items: T[], cursor: number, maxVisible: number): { items: T[]; offset: number } {
  if (items.length <= maxVisible) {
    return { items, offset: 0 }
  }
  const safeCursor = Math.max(0, Math.min(items.length - 1, cursor))
  let start = Math.max(0, safeCursor - Math.floor(maxVisible / 2))
  if (start + maxVisible > items.length) {
    start = items.length - maxVisible
  }
  return {
    items: items.slice(start, start + maxVisible),
    offset: start,
  }
}

export function padCell(text: string, width: number): string {
  return `${text}${' '.repeat(Math.max(0, width - visibleWidth(text)))} `
}

function splitLongTokenByWidth(token: string, width: number): string[] {
  if (visibleWidth(token) <= width) return [token]
  const chunks: string[] = []
  let current = ''
  for (const char of [...token]) {
    if (current && visibleWidth(current + char) > width) {
      chunks.push(current)
      current = char
    } else {
      current += char
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export function wordWrap(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width)
  if (!text) return ['']
  const lines: string[] = []
  let currentLine = ''

  const flush = () => {
    if (!currentLine) return
    lines.push(currentLine)
    currentLine = ''
  }

  for (const rawToken of text.split(/(\s+)/u)) {
    if (!rawToken) continue
    if (/^\s+$/u.test(rawToken)) {
      if (currentLine && visibleWidth(`${currentLine} `) <= safeWidth) currentLine += ' '
      continue
    }

    for (const token of splitLongTokenByWidth(rawToken, safeWidth)) {
      if (!currentLine) {
        currentLine = token
        continue
      }
      if (visibleWidth(currentLine + token) <= safeWidth) {
        currentLine += token
        continue
      }
      if (visibleWidth(`${currentLine} ${token}`) <= safeWidth) {
        currentLine += ` ${token}`
        continue
      }
      flush()
      currentLine = token
    }
  }

  flush()
  return lines.length > 0 ? lines : ['']
}

export function renderDetailField(
  theme: PanelTheme,
  label: string,
  value: string,
  color: PanelColor = 'text',
): string {
  const labelWidth = 13
  return `${theme.fg('dim', padCell(`${label}:`, labelWidth))} ${theme.fg(color, value)}`
}

export function renderDetailBlock(
  theme: PanelTheme,
  label: string,
  value: string,
  width: number,
  color: PanelColor = 'text',
): string[] {
  const out: string[] = []
  const marker = theme.fg('accent', '▸')
  out.push(`${marker} ${theme.bold(theme.fg('dim', label))}`)
  const indent = '  '
  const wrapWidth = Math.max(8, width - visibleWidth(indent))
  const rawLines = value ? value.split('\n') : ['']
  for (const rawLine of rawLines) {
    for (const wrappedLine of wordWrap(rawLine, wrapWidth)) {
      out.push(`${indent}${theme.fg(color, wrappedLine)}`)
    }
  }
  return out
}

export function renderDetailSeparator(theme: PanelTheme, width: number): string {
  return theme.fg('dim', '─'.repeat(Math.max(8, width)))
}
