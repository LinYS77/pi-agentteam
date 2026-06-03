import { planTaskReportEffects } from './messageApplication.js'
import { runOutboxOnce, type OutboxRunResult } from './effectRunner.js'
import { outboxEffectWarningName, outboxHash } from './outbox.js'
import type { TaskApplicationDeps } from './types.js'
import type { TaskCommandResult } from './taskTypes.js'

function appendTaskWarnings(result: TaskCommandResult, warnings: NonNullable<TaskCommandResult['sideEffectWarnings']>): void {
  if (warnings.length === 0) return
  result.sideEffectWarnings = [...(result.sideEffectWarnings ?? []), ...warnings]
  result.details.sideEffectWarnings = result.sideEffectWarnings
  result.details.warning = result.details.warning ?? 'side_effect_failed'
  result.text = `${result.text} (warning: side effect failed: ${warnings.map(item => `${item.kind}${item.error ? ` ${item.error}` : ''}`).join('; ')})`
}

function appendOutboxTaskWarnings(result: TaskCommandResult, run: OutboxRunResult): void {
  appendTaskWarnings(result, run.results
    .filter(item => !item.ok)
    .map(item => ({
      kind: outboxEffectWarningName(item.kind),
      error: item.error,
      effectId: item.effectId,
      outboxKind: item.kind,
      outboxStatus: item.terminal ? 'failed' : 'pending',
    })))
}

function mailboxMessageId(effectId: string): string {
  return `mailbox-${effectId}`
}

async function runTaskOutboxEffects(
  result: TaskCommandResult,
  deps: TaskApplicationDeps,
  teamName: string,
  effectIds: string[],
): Promise<OutboxRunResult> {
  const run = await runOutboxOnce({
    teamName,
    workerId: 'task-application',
    limit: effectIds.length || 1,
    effectIds,
  }, deps)
  result.details.outboxRun = run
  result.details.outboxEffects = effectIds.map(effectId => {
    const effect = deps.outboxStore.get(teamName, effectId)
    return effect
      ? { effectId, kind: effect.kind, status: effect.status, idempotencyKey: effect.idempotencyKey, lastError: effect.lastError }
      : { effectId, status: 'pending' }
  })
  appendOutboxTaskWarnings(result, run)
  return run
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
    const deterministicMailboxId = mailboxMessageId(mailboxEffect.effectId)
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
    const run = await runTaskOutboxEffects(result, deps, result.wakeTeam.name, [mailboxEffect.effectId])
    const mailboxRunResult = run.results.find(item => item.effectId === mailboxEffect.effectId)
    const storedMailboxEffect = deps.outboxStore.get(result.wakeTeam.name, mailboxEffect.effectId)
    mailboxDelivered = Boolean(mailboxRunResult?.ok || storedMailboxEffect?.status === 'done')
    sentLeaderMailboxMessage = (mailboxRunResult?.value ?? storedMailboxEffect?.result) as { id?: string } | undefined
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
      const mailboxError = mailboxRunResult?.error ?? deps.outboxStore.get(result.wakeTeam.name, mailboxEffect.effectId)?.lastError ?? 'leader mailbox push failed'
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
    await runTaskOutboxEffects(result, deps, result.wakeTeam.name, [attentionEffect.effectId])
  }


  if (outboxEffectIds.length > 0) {
    result.details.outboxEffectIds = outboxEffectIds
  }
}
