import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { handleTeamPanelInput } from './teamPanel/input.js'
import { renderTeamPanelLines } from './teamPanel/layout.js'
import {
  buildPanelSelectionView,
  clampPanelStateToData,
  createInitialPanelState,
} from './teamPanel/viewModel.js'
import { loadPanelData } from './teamPanel/dataSource.js'
import type { TeamPanelResult } from './teamPanel/viewModel.js'

export type { TeamPanelResult } from './teamPanel/viewModel.js'

export async function openTeamPanel(
  ctx: ExtensionContext,
  teamName?: string | null,
): Promise<TeamPanelResult | undefined> {
  return ctx.ui.custom<TeamPanelResult | undefined>((tui, theme, _kb, done) => {
    let data = loadPanelData(teamName)
    const panelState = createInitialPanelState()
    clampPanelStateToData(panelState, data)

    const refresh = () => {
      data = loadPanelData(teamName)
      clampPanelStateToData(panelState, data)
      tui.requestRender()
    }

    return {
      invalidate() {},
      handleInput(input: string) {
        const selection = buildPanelSelectionView(data, panelState)
        handleTeamPanelInput(input, data, panelState, selection, {
          done,
          refresh,
          requestRender: () => tui.requestRender(),
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
