// AI Vendor Pricing Data — April 2026
// Sources: Anthropic, OpenAI, Google official pricing pages
import pricingOverrides from "@/data/pricing-overrides.json"
import baseVendorData from "@/data/pricing-vendors.json"
import pricingAssumptionsData from "@/data/pricing-assumptions.json"
import pricingAssumptionOverridesData from "@/data/pricing-assumption-overrides.json"
import pricingFormulasData from "@/data/pricing-formulas.json"
import workloadProfilesData from "@/data/pricing-workload-profiles.json"
import pricingScenariosData from "@/data/pricing-scenarios.json"
import pricingRoutingRulesData from "@/data/pricing-routing-rules.json"
import pricingRoleProfilesData from "@/data/pricing-role-profiles.json"
import pricingTelemetryData from "@/data/pricing-telemetry.json"
import {
  mergeAssumptionsWithRuntimeSignals,
  mergeTelemetryIntoRoleProfiles,
  mergeTelemetryIntoWorkloads,
  summarizeTelemetryCoverage,
} from "@/lib/pricing-runtime-merge"

export type ModelTier = "fast" | "balanced" | "premium"
export type ProvenanceKind = "verified" | "measured" | "derived" | "estimated" | "editorial"

export interface Model {
  name: string
  version: string
  tier: ModelTier
  inputPricePerMTok: number  // USD per million tokens
  outputPricePerMTok: number // USD per million tokens
  contextWindow: string
  features: string[]
  badge?: string
}

export interface SeatPlan {
  name: string
  priceMonthly: number       // billed monthly
  priceAnnual: number        // per month billed annually
  minSeats?: number
  maxSeats?: number
  features: string[]
}

export interface FormulaDefinition {
  id: string
  label: string
  version: number
  output: string
  expression: string
  description: string
  inputs: string[]
}

export interface AssumptionRecord {
  id: string
  label: string
  description: string
  value: number
  unit: string
  provenance: ProvenanceKind
}

export interface AssumptionOverrideRecord {
  id: string
  value: number
  reason?: string | null
  updatedAt?: string | null
  provenance?: ProvenanceKind
}

export interface ProvenanceLegendItem {
  kind: ProvenanceKind
  label: string
  description: string
}

export interface ValueProvenanceMap {
  [field: string]: ProvenanceKind
}

// Real-world use case unit costs (per 1K requests)
export interface UseCaseProfile {
  id: string
  label: string
  description: string
  avgInputTokens: number
  avgOutputTokens: number
  overheadMultiplier: number
  extraCostPer1KRequests: Record<string, number>
  icon: string
  provenance: ValueProvenanceMap
}

export interface RoutingRule {
  condition: {
    useCase?: string
    complexityMin?: number
    complexityMax?: number
    costSensitivity?: "high" | "medium" | "low"
    volumeMin?: number
  }
  vendorId: string
  modelTier: ModelTier
  reason: string
  optimization?: string
  provenance: ProvenanceKind
}

export interface RoleVendorTarget {
  seatPlanName: string | null
  modelTier: ModelTier
}

export interface RoleProfile {
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
  vendorTargets: Record<string, RoleVendorTarget>
  provenance: ValueProvenanceMap
  telemetrySourceIds?: string[]
}

export interface TelemetrySource {
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

export interface TelemetryRegistry {
  version?: string
  updatedAt?: string | null
  sources: TelemetrySource[]
}

export interface Vendor {
  id: string
  surface?: "core" | "tracked"
  name: string
  company: string
  tagline: string
  color: string
  bgGradient: string
  textColor: string
  borderColor: string
  badgeColor: string
  models: Model[]
  seatPlans: SeatPlan[]
  extras: { label: string; price: string; note?: string }[]
  optimizations: { label: string; discount: string }[]
}

interface ModelPriceOverride {
  version?: string
  contextWindow?: string
  inputPricePerMTok?: number
  outputPricePerMTok?: number
}

interface SeatPlanOverride {
  priceMonthly?: number
  priceAnnual?: number
}

interface PricingOverridesShape {
  meta?: {
    timezone?: string
    snapshotTakenAt?: string
    updatedByAgentAt?: string | null
    lastRunStatus?: string
    lastRunSummary?: string
    sourcesChecked?: string[]
  }
  modelPriceOverrides?: Record<string, Record<string, ModelPriceOverride>>
  seatPlanOverrides?: Record<string, Record<string, SeatPlanOverride>>
}

const baseVendors = baseVendorData as Vendor[]

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function pickByName<T>(map: Record<string, T> | undefined, name: string): T | undefined {
  if (!map) return undefined
  if (map[name]) return map[name]
  const normalizedName = normalizeLookupKey(name)
  const matchingKey = Object.keys(map).find((key) => normalizeLookupKey(key) === normalizedName)
  return matchingKey ? map[matchingKey] : undefined
}

function applyPricingOverridesToVendor(
  vendor: Vendor,
  overrides: PricingOverridesShape
): Vendor {
  const modelOverrides = overrides.modelPriceOverrides?.[vendor.id] ?? {}
  const seatPlanOverrides = overrides.seatPlanOverrides?.[vendor.id] ?? {}

  return {
    ...vendor,
    models: vendor.models.map((model) => {
      const override = pickByName(modelOverrides, model.name)
      if (!override) return model
      return {
        ...model,
        version: override.version ?? model.version,
        contextWindow: override.contextWindow ?? model.contextWindow,
        inputPricePerMTok: override.inputPricePerMTok ?? model.inputPricePerMTok,
        outputPricePerMTok: override.outputPricePerMTok ?? model.outputPricePerMTok,
      }
    }),
    seatPlans: vendor.seatPlans.map((seatPlan) => {
      const override = pickByName(seatPlanOverrides, seatPlan.name)
      if (!override) return seatPlan
      return {
        ...seatPlan,
        priceMonthly: override.priceMonthly ?? seatPlan.priceMonthly,
        priceAnnual: override.priceAnnual ?? seatPlan.priceAnnual,
      }
    }),
  }
}

const resolvedPricingOverrides = pricingOverrides as PricingOverridesShape

export const pricingSnapshotMeta = {
  timezone: resolvedPricingOverrides.meta?.timezone ?? "Europe/Madrid",
  snapshotTakenAt: resolvedPricingOverrides.meta?.snapshotTakenAt ?? "2026-04-01T00:00:00.000Z",
  updatedByAgentAt: resolvedPricingOverrides.meta?.updatedByAgentAt ?? null,
  lastRunStatus: resolvedPricingOverrides.meta?.lastRunStatus ?? "never",
  lastRunSummary: resolvedPricingOverrides.meta?.lastRunSummary ?? "Sin ejecuciones automáticas todavía.",
  sourcesChecked: resolvedPricingOverrides.meta?.sourcesChecked ?? [],
}

export const allVendors: Vendor[] = baseVendors.map((vendor) =>
  applyPricingOverridesToVendor(vendor, resolvedPricingOverrides)
)

export const vendors: Vendor[] = allVendors.filter(
  (vendor) => (vendor.surface ?? "core") === "core"
)

export const trackedVendors: Vendor[] = allVendors.filter(
  (vendor) => vendor.surface === "tracked"
)

export interface Scenario {
  id: string
  label: string
  inputTokensPerDay: number
  outputTokensPerDay: number
  daysPerMonth: number
  category: "light" | "normal" | "medium" | "heavy" | "24x7"
  provenance: ValueProvenanceMap
}

const formulasRegistry = pricingFormulasData as { version: string; formulas: FormulaDefinition[] }
const assumptionsRegistry = pricingAssumptionsData as { version: string; provenanceLegend: ProvenanceLegendItem[]; assumptions: AssumptionRecord[] }
const assumptionOverridesRegistry = pricingAssumptionOverridesData as {
  version?: string
  updatedAt?: string | null
  updatedBy?: string | null
  overrides?: AssumptionOverrideRecord[]
}
const telemetryRegistryData = pricingTelemetryData as TelemetryRegistry

export const pricingFormulasVersion = formulasRegistry.version
export const pricingFormulas = formulasRegistry.formulas
export const pricingAssumptionsVersion = assumptionsRegistry.version
export const pricingAssumptionOverrides = assumptionOverridesRegistry.overrides ?? []
export const pricingTelemetryRegistry = telemetryRegistryData
export const pricingAssumptions = mergeAssumptionsWithRuntimeSignals(
  assumptionsRegistry.assumptions,
  assumptionOverridesRegistry,
  telemetryRegistryData
) as AssumptionRecord[]
export const provenanceLegend = assumptionsRegistry.provenanceLegend

export const useCases = mergeTelemetryIntoWorkloads(
  workloadProfilesData as UseCaseProfile[],
  telemetryRegistryData
) as UseCaseProfile[]
export const routingRules = pricingRoutingRulesData as RoutingRule[]
export const roleProfiles = mergeTelemetryIntoRoleProfiles(
  pricingRoleProfilesData as RoleProfile[],
  telemetryRegistryData
) as RoleProfile[]
export const scenarios = pricingScenariosData as Scenario[]
export const telemetryCoverage = summarizeTelemetryCoverage(useCases, roleProfiles, telemetryRegistryData)

export function calcMonthlyCost(
  inputPerDay: number,
  outputPerDay: number,
  daysPerMonth: number,
  inputPricePerMTok: number,
  outputPricePerMTok: number
): number {
  const inputCostPerDay  = (inputPerDay  / 1_000_000) * inputPricePerMTok
  const outputCostPerDay = (outputPerDay / 1_000_000) * outputPricePerMTok
  return (inputCostPerDay + outputCostPerDay) * daysPerMonth
}

// Calculate real TCO per 1K requests for a use case
export function calcUseCaseCostPer1K(
  useCase: UseCaseProfile,
  vendor: Vendor,
  tier: ModelTier,
  withBatch: boolean,
  withCache: boolean
): number {
  const model = vendor.models.find(m => m.tier === tier)!
  const { avgInputTokens, avgOutputTokens, overheadMultiplier, extraCostPer1KRequests } = useCase

  // Effective tokens per request with overhead
  const effectiveInput  = avgInputTokens  * overheadMultiplier
  const effectiveOutput = avgOutputTokens * overheadMultiplier

  // Base token cost per 1K requests
  let inputCost  = (effectiveInput  / 1_000_000) * model.inputPricePerMTok  * 1000
  let outputCost = (effectiveOutput / 1_000_000) * model.outputPricePerMTok * 1000

  // Cache discount: applies to input tokens (40% cache hit rate assumption)
  if (withCache) {
    const cacheDiscounts: Record<string, number> = { claude: 0.90, chatgpt: 0.50, gemini: 0.75 }
    const hitRate = 0.40 // 40% of input tokens are cache hits
    inputCost = inputCost * (1 - hitRate * cacheDiscounts[vendor.id])
  }

  // Batch discount: applies to both input and output
  if (withBatch) {
    inputCost  *= 0.50
    outputCost *= 0.50
  }

  // Extras (tool calls, search, storage)
  const extraCost = extraCostPer1KRequests[vendor.id] ?? 0

  return inputCost + outputCost + extraCost
}

// Enterprise degradation model: 80/15/5 distribution
// Returns weighted monthly cost for a given daily request volume
export function calcDegradationCost(
  vendor: Vendor,
  dailyRequests: number,
  daysPerMonth: number,
  useCase: UseCaseProfile,
  withBatch: boolean,
  withCache: boolean
): { total: number; fastCost: number; balancedCost: number; premiumCost: number } {
  const weights = { fast: 0.80, balanced: 0.15, premium: 0.05 }
  const monthly1K = (dailyRequests * daysPerMonth) / 1000

  const fastCost     = calcUseCaseCostPer1K(useCase, vendor, "fast",     withBatch, withCache) * monthly1K * weights.fast
  const balancedCost = calcUseCaseCostPer1K(useCase, vendor, "balanced", withBatch, withCache) * monthly1K * weights.balanced
  const premiumCost  = calcUseCaseCostPer1K(useCase, vendor, "premium",  withBatch, withCache) * monthly1K * weights.premium

  return {
    total: fastCost + balancedCost + premiumCost,
    fastCost,
    balancedCost,
    premiumCost,
  }
}
