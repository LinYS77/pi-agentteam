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

export function parseDeliveryPolicyName(value?: string | null): AgentTeamDeliveryPolicyName | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === BRIDGE_ONLY_DELIVERY_POLICY) return BRIDGE_ONLY_DELIVERY_POLICY
  return null
}

export function normalizeDeliveryPolicyName(_value?: string | null): AgentTeamDeliveryPolicyName {
  return DEFAULT_DELIVERY_POLICY
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
