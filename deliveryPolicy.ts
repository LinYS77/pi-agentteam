export type AgentTeamDeliveryPolicyName = 'bridge-only'

export type AgentTeamDeliveryPolicy = {
  policy: AgentTeamDeliveryPolicyName
  label: string
  stable: boolean
  workerBridgeAutoStart: boolean
  workerBridgeAutoPump: boolean
  bridgeRetryUsesSameChannel: boolean
}

export const BRIDGE_ONLY_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = 'bridge-only'
export const DEFAULT_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = BRIDGE_ONLY_DELIVERY_POLICY

function normalizePolicyName(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '-')
}

export function parseDeliveryPolicyName(value?: string | null): AgentTeamDeliveryPolicyName | null {
  const normalized = normalizePolicyName(value)
  if (!normalized || normalized === 'bridge-only' || normalized === 'bridgeonly' || normalized === 'bridge') {
    return BRIDGE_ONLY_DELIVERY_POLICY
  }
  return null
}

export function normalizeDeliveryPolicyName(value?: string | null): AgentTeamDeliveryPolicyName {
  return parseDeliveryPolicyName(value) ?? DEFAULT_DELIVERY_POLICY
}

export function resolveDeliveryPolicy(_input: { policy?: string | null } = {}): AgentTeamDeliveryPolicy {
  return {
    policy: BRIDGE_ONLY_DELIVERY_POLICY,
    label: 'bridge-only',
    stable: true,
    workerBridgeAutoStart: true,
    workerBridgeAutoPump: true,
    bridgeRetryUsesSameChannel: true,
  }
}

export function isBridgeOnlyDeliveryPolicy(_input: { policy?: string | null } = {}): boolean {
  return true
}
