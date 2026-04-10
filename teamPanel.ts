import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import { truncateToWidth } from '@mariozechner/pi-tui'
import { handleTeamPanelInput } from './teamPanel/input.js'
import { renderTeamPanelLines } from './teamPanel/layout.js'
import {
  buildPanelSelectionView,
  clampPanelStateToData,
  createInitialPanelState,
  loadPanelData,
} from './teamPanel/viewModel.js'
import type { TeamPanelResult } from './teamPanel/viewModel.js'

export type { TeamPanelResult } from './teamPanel/viewModel.js'

export async function openTeamPanel(
  ctx: ExtensionContext,
  teamName: string,
  onSyncMailbox: () => void,
): Promise<TeamPanelResult | undefined> {
  return ctx.ui.custom<TeamPanelResult | undefined>((tui, theme, _kb, done) => {
    let data = loadPanelData(teamName)
    const panelState = createInitialPanelState()

    const refresh = () => {
      data = loadPanelData(teamName)
      if (!data) {
        done({ type: 'close' })
        return
      }
      clampPanelStateToData(panelState, data)
      tui.requestRender()
    }

    return {
      invalidate() {},
      handleInput(input: string) {
        if (!data) {
          done({ type: 'close' })
          return
        }

        const selection = buildPanelSelectionView(data, panelState)
        handleTeamPanelInput(input, data, panelState, selection, {
          done,
          refresh,
          onSyncMailbox,
          requestRender: () => tui.requestRender(),
        })
      },
      render(width: number): string[] {
        const safeWidth = Math.max(56, width)
        if (!data) {
          return [truncateToWidth(theme.fg('error', 'agentteam: team not found'), safeWidth)]
        }

        const selection = buildPanelSelectionView(data, panelState)
        return renderTeamPanelLines(theme, {
          width,
          data,
          state: panelState,
          selection,
        })
      },
    }
  })
}
