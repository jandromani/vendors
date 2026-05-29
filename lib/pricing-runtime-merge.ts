type ProvenanceKind = "verified" | "measured" | "derived" | "estimated" | "editorial"

interface AssumptionRecord {
  id: string
  label: string
  description: string
  value: number
  unit: string
  provenance: ProvenanceKind
}

interface AssumptionOverrideRecord {
  id: string
  value: number
  reason?: string | null
  updatedAt?: string | null
  provenance?: ProvenanceKind
}

interface TelemetrySource {
  id: string
  label: string
  status: "active" | "draft" | "disabled"
  useCaseId?: string
  roleProfileId?: string
  sampleWindowDays?: number
  sampleSizeRequests?: number
  sampleSizeUsers?: number
  avgInputTokens?: number
  avgOutputTokens?: number
  overheadMultiplier?: number
  avgRequestsPerUserPerDay?: number
  cacheHitRate?: number
  batchHitRate?: number
  confidence?: number
  sourceLabel?: string
  recordedAt?: string
  notes?: string
}

interface TelemetryRegistry {
  version?: string
  updatedAt?: string | null
  sources: TelemetrySource[]
}

interface ValueProvenanceMap {
  [field: string]: ProvenanceKind
}

interface UseCaseProfile {
  id: string
  label: string
  description: string
  avgInputTokens: number
  avgOutputTokens: number
  overheadMultiplier: number
  extraCostPer1KRequests: Record<string, number>
  icon: string
  provenance: ValueProvenanceMap
  telemetrySourceIds?: string[]
}

interface RoleProfile {
  id: string
  label: string
  description: string
  primaryUseCaseId: string
  defaultTeamSize: number
  dailyRequestsPerUser: number
  daysPerMonth: number
  dataSensitivity: "public" | "internal" | "confidential"
  withCache: boolean
  withBatch: boolean
  billingPreference: "monthly" | "annual"
  explicitToolingCostPerUser: Record<string, number>
  vendorTargets: Record<string, { seatPlanName: string | null; modelTier: "fast" | "balanced" | "premium" }>
  provenance: ValueProvenanceMap
  telemetrySourceIds?: string[]
}

function roundNumber(value: number, decimals = 4) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function getActiveSources(registry: TelemetryRegistry | null | undefined) {
  return (registry?.sources ?? []).filter((source) => source.status === "active")
}

function weightedAverage(
  sources: TelemetrySource[],
  selector: (source: TelemetrySource) => number | undefined
) {
  let weightedSum = 0
  let weightSum = 0
  for (const source of sources) {
    const value = selector(source)
    if (!isFiniteNumber(value)) continue
    const weight = source.sampleSizeRequests ?? 1
    weightedSum += value * weight
    weightSum += weight
  }
  if (weightSum === 0) return null
  return weightedSum / weightSum
}

function collectSourceIds(sources: TelemetrySource[]) {
  return sources.map((source) => source.id)
}

export function mergeAssumptionsWithRuntimeSignals(
  assumptions: AssumptionRecord[],
  overridesRegistry: { overrides?: AssumptionOverrideRecord[] } | null | undefined,
  telemetryRegistry: TelemetryRegistry | null | undefined
) {
  const overrides = overridesRegistry?.overrides ?? []
  const overrideMap = new Map(overrides.map((item) => [item.id, item]))
  const activeSources = getActiveSources(telemetryRegistry)
  const measuredCacheHitRate = weightedAverage(activeSources, (source) => source.cacheHitRate)

  return assumptions.map((assumption) => {
    const override = overrideMap.get(assumption.id)
    if (override && isFiniteNumber(override.value)) {
      return {
        ...assumption,
        value: roundNumber(override.value),
        provenance: override.provenance ?? assumption.provenance,
      }
    }

    if (assumption.id === "optimization.cache_hit_rate_default" && isFiniteNumber(measuredCacheHitRate)) {
      return {
        ...assumption,
        value: roundNumber(measuredCacheHitRate),
        provenance: "measured" as ProvenanceKind,
        description: "Media ponderada de cache hit rate inferida a partir de telemetría real activa.",
      }
    }

    return assumption
  })
}

export function mergeTelemetryIntoWorkloads(
  workloads: UseCaseProfile[],
  telemetryRegistry: TelemetryRegistry | null | undefined
) {
  const activeSources = getActiveSources(telemetryRegistry)
  return workloads.map((workload) => {
    const matching = activeSources.filter((source) => source.useCaseId === workload.id)
    if (matching.length === 0) return workload

    const avgInputTokens = weightedAverage(matching, (source) => source.avgInputTokens)
    const avgOutputTokens = weightedAverage(matching, (source) => source.avgOutputTokens)
    const overheadMultiplier = weightedAverage(matching, (source) => source.overheadMultiplier)

    return {
      ...workload,
      avgInputTokens: isFiniteNumber(avgInputTokens) ? roundNumber(avgInputTokens, 2) : workload.avgInputTokens,
      avgOutputTokens: isFiniteNumber(avgOutputTokens) ? roundNumber(avgOutputTokens, 2) : workload.avgOutputTokens,
      overheadMultiplier: isFiniteNumber(overheadMultiplier) ? roundNumber(overheadMultiplier, 3) : workload.overheadMultiplier,
      provenance: {
        ...workload.provenance,
        avgInputTokens: isFiniteNumber(avgInputTokens) ? "measured" : workload.provenance.avgInputTokens,
        avgOutputTokens: isFiniteNumber(avgOutputTokens) ? "measured" : workload.provenance.avgOutputTokens,
        overheadMultiplier: isFiniteNumber(overheadMultiplier) ? "measured" : workload.provenance.overheadMultiplier,
      },
      telemetrySourceIds: collectSourceIds(matching),
    }
  })
}

export function mergeTelemetryIntoRoleProfiles(
  roles: RoleProfile[],
  telemetryRegistry: TelemetryRegistry | null | undefined
) {
  const activeSources = getActiveSources(telemetryRegistry)
  return roles.map((role) => {
    const matching = activeSources.filter((source) => source.roleProfileId === role.id)
    if (matching.length === 0) return role

    const dailyRequestsPerUser = weightedAverage(matching, (source) => source.avgRequestsPerUserPerDay)
    const cacheHitRate = weightedAverage(matching, (source) => source.cacheHitRate)
    const batchHitRate = weightedAverage(matching, (source) => source.batchHitRate)

    return {
      ...role,
      dailyRequestsPerUser: isFiniteNumber(dailyRequestsPerUser) ? roundNumber(dailyRequestsPerUser, 1) : role.dailyRequestsPerUser,
      withCache: isFiniteNumber(cacheHitRate) ? cacheHitRate >= 0.25 : role.withCache,
      withBatch: isFiniteNumber(batchHitRate) ? batchHitRate >= 0.15 : role.withBatch,
      provenance: {
        ...role.provenance,
        dailyRequestsPerUser: isFiniteNumber(dailyRequestsPerUser) ? "measured" : role.provenance.dailyRequestsPerUser,
      },
      telemetrySourceIds: collectSourceIds(matching),
    }
  })
}

export function summarizeTelemetryCoverage(
  workloads: UseCaseProfile[],
  roles: RoleProfile[],
  telemetryRegistry: TelemetryRegistry | null | undefined
) {
  const activeSources = getActiveSources(telemetryRegistry)
  return {
    activeSources: activeSources.length,
    measuredWorkloads: workloads.filter((workload) => workload.telemetrySourceIds && workload.telemetrySourceIds.length > 0).length,
    measuredRoles: roles.filter((role) => role.telemetrySourceIds && role.telemetrySourceIds.length > 0).length,
    totalObservedRequests: activeSources.reduce((sum, source) => sum + (source.sampleSizeRequests ?? 0), 0),
  }
}
