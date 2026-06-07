import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { StringEnum } from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import { PLAN_RUN_ACTIONS } from '../core/planRunActions.js'
import type { ToolHandlerDeps } from './shared.js'
import { executePlanRunAction } from './planRunService.js'

const PlanRunStepParams = Type.Object({
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  owner: Type.Optional(Type.String()),
})

const PlanRunParams = Type.Object({
  action: StringEnum(PLAN_RUN_ACTIONS),
  sourceReportId: Type.Optional(Type.String({ description: 'For action=approve, the source planner TaskReport id.' })),
  planRunId: Type.Optional(Type.String({ description: 'For show/advance/pause/resume/cancel, the explicit PlanRun id.' })),
  confirmApproved: Type.Optional(Type.Boolean({ description: 'Must be true for action=approve; prevents accidental implicit execution.' })),
  steps: Type.Optional(Type.Array(PlanRunStepParams, { description: 'Optional compact future step hints; no tasks are created by approve.' })),
})

export function registerPlanRunTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  pi.registerTool({
    name: 'agentteam_planrun',
    label: 'AgentTeam PlanRun',
    description: 'Explicitly approve and inspect compact PlanRun records. Approval is leader-gated and never creates tasks or assignments in this slice.',
    promptSnippet: 'Use agentteam_planrun for explicitly approved PlanRun records: approve a planner TaskReport only with confirmApproved=true, then inspect compact show/list summaries. Steps run only through explicit future actions.',
    promptGuidelines: [
      'Only use action=approve after explicit user/leader approval and a reviewed planner TaskReport id.',
      'approve requires confirmApproved=true and sourceReportId; missing or false confirmation is denied with no mutation.',
      'approve creates only a compact PlanRun and approved event; it does not create tasks, assign workers, send mailbox messages, or advance steps.',
      'show/list return compact PlanRun summaries and must not expose source report bodies or mailbox bodies.',
      'advance, pause, resume, and cancel are reserved for future slices and are denied in this skeleton.',
    ],
    parameters: PlanRunParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executePlanRunAction(params, ctx, deps)
    },
  })
}
