import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { handleTeamPanelInput } from './teamPanel/input.js'
import { renderTeamPanelLines } from './teamPanel/layout.js'
import {
  buildPanelSelectionView,
  clampPanelStateToData,
  createInitialPanelState,
} from './teamPanel/viewModel.js'
import { loadPanelData } from './teamPanel/dataSource.js'
import { panelDataFingerprint, panelStateFingerprint } from './teamPanel/fingerprint.js'
import type { TeamPanelResult } from './teamPanel/viewModel.js'

export type { TeamPanelResult } from './teamPanel/viewModel.js'

export async function openTeamPanel(
  ctx: ExtensionContext,
  teamName?: string | null,
): Promise<TeamPanelResult | undefined> {
  return ctx.ui.custom<TeamPanelResult | undefined>((tui, theme, _kb, done) => {
    let data = loadPanelData(teamName)
    let dataFingerprint = panelDataFingerprint(data)
    const panelState = createInitialPanelState()
    clampPanelStateToData(panelState, data)
    let renderScheduled = false
    let flushRenderPromise: Promise<void> | null = null

    const requestRenderOnce = () => {
      if (renderScheduled) return
      renderScheduled = true
      flushRenderPromise = Promise.resolve().then(() => {
        renderScheduled = false
        flushRenderPromise = null
        tui.requestRender()
      })
    }

    const flushRender = async () => {
      await flushRenderPromise
    }

    const refresh = () => {
      const beforeStateFingerprint = panelStateFingerprint(panelState)
      const nextData = loadPanelData(teamName)
      const nextFingerprint = panelDataFingerprint(nextData)
      data = nextData
      clampPanelStateToData(panelState, data)
      const nextStateFingerprint = panelStateFingerprint(panelState)
      if (nextFingerprint === dataFingerprint && nextStateFingerprint === beforeStateFingerprint) return
      dataFingerprint = nextFingerprint
      requestRenderOnce()
    }

    return {
      invalidate() {},
      flushRender,
      handleInput(input: string) {
        const selection = buildPanelSelectionView(data, panelState)
        handleTeamPanelInput(input, data, panelState, selection, {
          done,
          refresh,
          requestRender: requestRenderOnce,
        })
      },
      render(width: number): string[] {
        const selection = buildPanelSelectionView(data, panelState)
        return renderTeamPanelLines(theme, {
          width,
          height: tui.terminal.rows,
          data,
          state: panelState,
          selection,
        })
      },
    }
  })
}
