import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { handleTeamPanelInput } from './teamPanel/input.js'
import { renderTeamPanelLines } from './teamPanel/layout.js'
import {
  buildPanelSelectionView,
  clampPanelStateToData,
  createInitialPanelState,
} from './teamPanel/viewModel.js'
import { loadAgentConfig, createDefaultAgentConfig } from './config.js'
import { loadPanelData } from './teamPanel/dataSource.js'
import { panelDataFingerprint, panelStateFingerprint } from './teamPanel/fingerprint.js'
import { recordPanelProfileEvent } from './runtime/profiling.js'
import type { PanelData, TeamPanelResult } from './teamPanel/viewModel.js'

export type { TeamPanelResult } from './teamPanel/viewModel.js'

export async function openTeamPanel(
  ctx: ExtensionContext,
  teamName?: string | null,
): Promise<TeamPanelResult | undefined> {
  return ctx.ui.custom<TeamPanelResult | undefined>((tui, theme, _kb, done) => {
    let data = loadPanelData(teamName)
    let dataFingerprint = panelDataFingerprint(data)
    const panelMode = () => data.mode as PanelData['mode']
    const panelState = createInitialPanelState()
    clampPanelStateToData(panelState, data)
    let renderScheduled = false
    let flushRenderPromise: Promise<void> | null = null
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const panelConfig = {
      ...createDefaultAgentConfig().ui!.teamPanel,
      ...(loadAgentConfig().config.ui?.teamPanel ?? {}),
    }
    const semanticDebounceMs = panelConfig.refreshMode === 'debounced'
      ? Math.max(0, panelConfig.minRefreshMs)
      : 0

    const requestRenderOnce = () => {
      if (renderScheduled) return
      renderScheduled = true
      flushRenderPromise = Promise.resolve().then(() => {
        const startedAt = Date.now()
        renderScheduled = false
        flushRenderPromise = null
        tui.requestRender()
        recordPanelProfileEvent({
          kind: 'requestRender',
          mode: panelMode(),
          durationMs: Date.now() - startedAt,
        })
      })
    }

    const clearDebounceTimer = () => {
      if (!debounceTimer) return
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }

    const flushRender = async () => {
      await flushRenderPromise
    }

    const refresh = () => {
      clearDebounceTimer()
      const beforeStateFingerprint = panelStateFingerprint(panelState)
      const nextData = loadPanelData(teamName)
      const nextFingerprint = panelDataFingerprint(nextData)
      data = nextData
      clampPanelStateToData(panelState, data)
      const nextStateFingerprint = panelStateFingerprint(panelState)
      if (nextFingerprint === dataFingerprint && nextStateFingerprint === beforeStateFingerprint) {
        recordPanelProfileEvent({
          kind: 'cacheHit',
          mode: panelMode(),
          durationMs: 0,
        })
        return
      }
      dataFingerprint = nextFingerprint
      recordPanelProfileEvent({
        kind: 'diffChanged',
        mode: panelMode(),
        durationMs: 0,
      })
      requestRenderOnce()
    }

    const requestSemanticRefresh = () => {
      if (semanticDebounceMs <= 0) {
        refresh()
        return
      }
      if (debounceTimer) return
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        refresh()
      }, semanticDebounceMs)
    }

    return {
      invalidate() {
        requestSemanticRefresh()
      },
      flushRender,
      handleInput(input: string) {
        const selection = buildPanelSelectionView(data, panelState)
        handleTeamPanelInput(input, data, panelState, selection, {
          done: result => {
            clearDebounceTimer()
            done(result)
          },
          refresh,
          requestRender: requestRenderOnce,
        })
      },
      render(width: number): string[] {
        const startedAt = Date.now()
        const selection = buildPanelSelectionView(data, panelState)
        const lines = renderTeamPanelLines(theme, {
          width,
          height: tui.terminal.rows,
          data,
          state: panelState,
          selection,
        })
        recordPanelProfileEvent({
          kind: 'render',
          mode: panelMode(),
          durationMs: Date.now() - startedAt,
        })
        return lines
      },
    }
  })
}
