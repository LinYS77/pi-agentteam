import { planTaskReportEffects } from './messageApplication.js'
import { outboxHash } from './outbox.js'
import {
  mailboxMessageIdForEffect,
  runSelectedOutboxEffects,
} from './outboxSideEffects.js'
import type { TaskApplicationDeps } from './types.js'
import type { TaskCommandResult } from './taskTypes.js'

function appendTaskWarnings(result: TaskCommandResult, warnings: NonNullable<TaskCommandResult['sideEffectWarnings']>): void {
  if (warnings.length === 0) return
  result.sideEffectWarnings = [...(result.sideEffectWarnings ?? []), ...warnings]
  result.details.sideEffectWarnings = result.sideEffectWarnings
  result.details.warning = result.details.warning ?? 'side_effect_failed'
  result.text = `${result.text} (warning: side effect failed: ${warnings.map(item => `${item.kind}${item.error ? ` ${item.error}` : ''}`).join('; ')})`
}

async function applyTaskOutboxRun(
  result: TaskCommandResult,
  deps: TaskApplicationDeps,
  teamName: string,
  effectIds: string[],
) {
  const selected = await runSelectedOutboxEffects({
    teamName,
    workerId: 'task-application',
    limit: effectIds.length || 1,
    effectIds,
  }, deps)
  result.details.outboxRun = selected.run
  result.details.outboxEffects = selected.records
  appendTaskWarnings(result, selected.warnings)
  return selected
}

export async function handleTaskApplicationSideEffects(result: TaskCommandResult, deps: TaskApplicationDeps): Promise<void> {
  let leaderWakeMessage = result.leaderWake
  let mailboxDelivered = false
  let sentLeaderMailboxMessage: { id?: string } | undefined
  let mailboxOutboxEffectId: string | undefined
  let leaderMailboxReportId: string | undefined
  const outboxEffectIds: string[] = []

  if (result.leaderMailbox && result.wakeTeam) {
    const pushed = result.leaderMailbox.message
    leaderMailboxReportId = typeof pushed.metadata?.reportId === 'string' ? pushed.metadata.reportId : undefined
    const mailboxEffect = deps.outboxStore.enqueue({
      teamName: result.wakeTeam.name,
      kind: 'inbox_item_append_requested',
      idempotencyKey: ['task-leader-mailbox', result.wakeTeam.name, pushed.type ?? 'inform', pushed.taskId ?? '', pushed.from, pushed.to, String(pushed.metadata?.reportId ?? ''), outboxHash(pushed.summary ?? ''), outboxHash(pushed.text)].join(':'),
      payload: {
        teamName: result.wakeTeam.name,
        recipient: pushed.to,
        message: {
          ...pushed,
          id: 'mailbox-pending',
          metadata: { ...(pushed.metadata ?? {}), outboxSource: 'taskApplication' },
        },
      },
    })
    const deterministicMailboxId = mailboxMessageIdForEffect(mailboxEffect.effectId)
    mailboxEffect.payload.message.id = deterministicMailboxId
    mailboxOutboxEffectId = mailboxEffect.effectId
    outboxEffectIds.push(mailboxEffect.effectId)
    if (leaderWakeMessage) {
      leaderWakeMessage = {
        ...leaderWakeMessage,
        messageId: deterministicMailboxId,
        taskId: pushed.taskId,
        threadId: pushed.threadId,
      }
    }
    const selected = await applyTaskOutboxRun(result, deps, result.wakeTeam.name, [mailboxEffect.effectId])
    const mailboxResult = selected.byId[mailboxEffect.effectId]?.result
    mailboxDelivered = Boolean(mailboxResult?.ok)
    sentLeaderMailboxMessage = mailboxResult?.value as { id?: string } | undefined
    if (!sentLeaderMailboxMessage && mailboxDelivered) sentLeaderMailboxMessage = { id: deterministicMailboxId }
    result.details.leaderMailboxDelivered = mailboxDelivered
    if (mailboxDelivered && leaderMailboxReportId && sentLeaderMailboxMessage?.id) {
      const reportId = leaderMailboxReportId
      const mailboxMessageId = sentLeaderMailboxMessage.id
      const refreshed = deps.teamState.updateTeam(result.wakeTeam.name, latest => {
        deps.taskMutations.updateTaskReport(latest, reportId, { mailboxMessageId })
      })
      if (refreshed) result.wakeTeam = refreshed
    }
    if (!mailboxDelivered) {
      const mailboxError = mailboxResult?.error ?? 'leader mailbox push failed'
      result.details.mailboxDeliveryFailed = { recipient: pushed.to, error: mailboxError }
      result.text = `${result.text} (leader mailbox push failed for ${pushed.to}: ${mailboxError})`
    }
  }

  const reportEffects = planTaskReportEffects({
    wakeTeam: result.wakeTeam,
    leaderWake: leaderWakeMessage,
    mailboxDelivered,
    mailboxMessageId: sentLeaderMailboxMessage?.id,
    leaderMailboxRequired: Boolean(result.leaderMailbox),
  })
  if (reportEffects.leaderAttention && result.wakeTeam) {
    const attentionEffect = deps.outboxStore.enqueue({
      teamName: result.wakeTeam.name,
      kind: 'leader_attention_requested',
      idempotencyKey: ['task-leader-attention', result.wakeTeam.name, reportEffects.leaderAttention.message.type, reportEffects.leaderAttention.message.messageId ?? '', reportEffects.leaderAttention.message.taskId ?? ''].join(':'),
      payload: {
        teamName: result.wakeTeam.name,
        message: reportEffects.leaderAttention.message,
      },
      dependsOn: mailboxOutboxEffectId ? [mailboxOutboxEffectId] : [],
    })
    outboxEffectIds.push(attentionEffect.effectId)
    await applyTaskOutboxRun(result, deps, result.wakeTeam.name, [attentionEffect.effectId])
  }

  if (outboxEffectIds.length > 0) {
    result.details.outboxEffectIds = outboxEffectIds
  }
}
