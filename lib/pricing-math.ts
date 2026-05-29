import {
  pricingAssumptions,
  pricingAssumptionsVersion,
  pricingFormulas,
  pricingFormulasVersion,
  roleProfiles,
  routingRules,
  scenarios,
  type AssumptionRecord,
  type FormulaDefinition,
  type ModelTier,
  type ProvenanceKind,
  type RoleProfile,
  type RoutingRule,
  type Scenario,
  type UseCaseProfile,
  type Vendor,
  useCases,
  vendors,
} from "@/lib/vendor-data"

const PROVENANCE_WEIGHT: Record<ProvenanceKind, number> = {
  verified: 0,
  measured: 0,
  derived: 1,
  estimated: 2,
  editorial: 3,
}

export interface PricingRuntimeDataset {
  vendors: Vendor[]
  useCases: UseCaseProfile[]
  roleProfiles: RoleProfile[]
  routingRules: RoutingRule[]
  scenarios: Scenario[]
  pricingAssumptions: AssumptionRecord[]
  pricingFormulas: FormulaDefinition[]
  pricingFormulasVersion: string
  pricingAssumptionsVersion: string
}

const DEFAULT_RUNTIME_DATASET: PricingRuntimeDataset = {
  vendors,
  useCases,
  roleProfiles,
  routingRules,
  scenarios,
  pricingAssumptions,
  pricingFormulas,
  pricingFormulasVersion,
  pricingAssumptionsVersion,
}

export interface TraceInput {
  key: string
  label: string
  value: number | string | boolean | null
  unit?: string
  provenance: ProvenanceKind
  source: string
}

export interface FormulaTrace {
  formulaId: string
  formulaVersion: number
  formulaLabel: string
  output: string
  provenance: ProvenanceKind
  inputs: TraceInput[]
  result: number
}

export interface CostBreakdownResult {
  formula: FormulaTrace
  provenance: ProvenanceKind
}

export interface ScenarioCostBreakdown extends CostBreakdownResult {
  vendor: Vendor
  model: Vendor["models"][number]
  scenario: Scenario
  monthlyCost: number
  inputCostPerDay: number
  outputCostPerDay: number
}

export interface UseCaseCostBreakdown extends CostBreakdownResult {
  vendor: Vendor
  model: Vendor["models"][number]
  useCase: UseCaseProfile
  costPer1K: number
  breakdown: {
    effectiveInputTokens: number
    effectiveOutputTokens: number
    inputCostBeforeDiscounts: number
    outputCostBeforeDiscounts: number
    cacheSavings: number
    batchSavings: number
    extraCostPer1K: number
  }
}

export interface DegradationBreakdown extends CostBreakdownResult {
  vendor: Vendor
  useCase: UseCaseProfile
  dailyRequests: number
  daysPerMonth: number
  total: number
  fastCost: number
  balancedCost: number
  premiumCost: number
}

export interface RoutingDecision {
  vendor: Vendor
  model: Vendor["models"][number]
  useCase: UseCaseProfile
  rule: RoutingRule
  matchedRules: Array<{ rule: RoutingRule; score: number }>
  provenance: ProvenanceKind
}

export interface RoleCostBreakdown extends CostBreakdownResult {
  vendor: Vendor
  role: RoleProfile
  model: Vendor["models"][number]
  seatPlan: Vendor["seatPlans"][number] | null
  teamSize: number
  billingPreference: "monthly" | "annual"
  monthlyRequestsPerUser: number
  seatCostPerUser: number
  apiMonthlyCostPerUser: number
  toolingCostPerUser: number
  monthlyPerUser: number
  monthlyTotal: number
  annualTotal: number
  useCaseBreakdown: UseCaseCostBreakdown
  annualFormula: FormulaTrace
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function getDataset(dataset?: PricingRuntimeDataset) {
  return dataset ?? DEFAULT_RUNTIME_DATASET
}

function findFormula(formulaId: string, dataset?: PricingRuntimeDataset): FormulaDefinition {
  const formula = getDataset(dataset).pricingFormulas.find((item) => item.id === formulaId)
  if (!formula) {
    throw new Error(`Unknown formulaId: ${formulaId}`)
  }
  return formula
}

function findAssumption(assumptionId: string, dataset?: PricingRuntimeDataset): AssumptionRecord {
  const assumption = getDataset(dataset).pricingAssumptions.find((item) => item.id === assumptionId)
  if (!assumption) {
    throw new Error(`Unknown assumptionId: ${assumptionId}`)
  }
  return assumption
}

function combineProvenance(kinds: ProvenanceKind[]): ProvenanceKind {
  if (kinds.length === 0) return "derived"
  if (kinds.every((kind) => kind === "verified" || kind === "measured")) {
    return "derived"
  }

  let worst: ProvenanceKind = "verified"
  for (const kind of kinds) {
    if (PROVENANCE_WEIGHT[kind] > PROVENANCE_WEIGHT[worst]) {
      worst = kind
    }
  }
  return worst === "verified" || worst === "measured" ? "derived" : worst
}

function buildFormulaTrace(
  formulaId: string,
  inputs: TraceInput[],
  result: number,
  dataset?: PricingRuntimeDataset
): FormulaTrace {
  const formula = findFormula(formulaId, dataset)
  return {
    formulaId: formula.id,
    formulaVersion: formula.version,
    formulaLabel: formula.label,
    output: formula.output,
    provenance: combineProvenance(inputs.map((input) => input.provenance)),
    inputs,
    result: roundCurrency(result),
  }
}

function buildInput(
  key: string,
  label: string,
  value: number | string | boolean | null,
  provenance: ProvenanceKind,
  source: string,
  unit?: string
): TraceInput {
  return { key, label, value, provenance, source, unit }
}

function findUseCaseById(id: string, dataset?: PricingRuntimeDataset): UseCaseProfile {
  const useCase = getDataset(dataset).useCases.find((item) => item.id === id)
  if (!useCase) {
    throw new Error(`Unknown use case: ${id}`)
  }
  return useCase
}

function findScenarioById(id: string, dataset?: PricingRuntimeDataset): Scenario {
  const scenario = getDataset(dataset).scenarios.find((item) => item.id === id)
  if (!scenario) {
    throw new Error(`Unknown scenario: ${id}`)
  }
  return scenario
}

function findRoleById(id: string, dataset?: PricingRuntimeDataset): RoleProfile {
  const role = getDataset(dataset).roleProfiles.find((item) => item.id === id)
  if (!role) {
    throw new Error(`Unknown role profile: ${id}`)
  }
  return role
}

export function findVendorById(id: string, dataset?: PricingRuntimeDataset): Vendor {
  const vendor = getDataset(dataset).vendors.find((item) => item.id === id)
  if (!vendor) {
    throw new Error(`Unknown vendor: ${id}`)
  }
  return vendor
}

export function findModelByTier(vendor: Vendor, tier: ModelTier) {
  const model = vendor.models.find((item) => item.tier === tier)
  if (!model) {
    throw new Error(`Vendor ${vendor.id} has no model for tier ${tier}`)
  }
  return model
}

export function findSeatPlanByName(vendor: Vendor, seatPlanName: string | null) {
  if (!seatPlanName) return null
  const seatPlan = vendor.seatPlans.find((item) => item.name === seatPlanName)
  if (!seatPlan) {
    throw new Error(`Vendor ${vendor.id} has no seat plan named ${seatPlanName}`)
  }
  return seatPlan
}

function pickSeatRate(
  seatPlan: Vendor["seatPlans"][number] | null,
  billingPreference: "monthly" | "annual"
): number {
  if (!seatPlan) return 0
  if (billingPreference === "annual" && seatPlan.priceAnnual > 0) return seatPlan.priceAnnual
  if (billingPreference === "monthly" && seatPlan.priceMonthly > 0) return seatPlan.priceMonthly
  if (seatPlan.priceMonthly > 0) return seatPlan.priceMonthly
  if (seatPlan.priceAnnual > 0) return seatPlan.priceAnnual
  return 0
}

function getBatchDiscountRate(dataset?: PricingRuntimeDataset): AssumptionRecord {
  return findAssumption("optimization.batch_discount_rate", dataset)
}

function getCacheHitRate(dataset?: PricingRuntimeDataset): AssumptionRecord {
  return findAssumption("optimization.cache_hit_rate_default", dataset)
}

function getCacheDiscountRate(vendorId: string, dataset?: PricingRuntimeDataset): AssumptionRecord {
  return findAssumption(`optimization.cache_discount.${vendorId}`, dataset)
}

function getDegradationWeights(dataset?: PricingRuntimeDataset) {
  return {
    fast: findAssumption("routing.degradation.fast_weight", dataset),
    balanced: findAssumption("routing.degradation.balanced_weight", dataset),
    premium: findAssumption("routing.degradation.premium_weight", dataset),
  }
}

function buildVerifiedPriceInputs(model: Vendor["models"][number]): TraceInput[] {
  return [
    buildInput("inputPricePerMTok", "Precio input", model.inputPricePerMTok, "verified", "truth graph", "USD/MTok"),
    buildInput("outputPricePerMTok", "Precio output", model.outputPricePerMTok, "verified", "truth graph", "USD/MTok"),
  ]
}

export function calcScenarioTokenCostBreakdown(
  scenarioInput: Scenario | string,
  vendorInput: Vendor | string,
  tier: ModelTier,
  dataset?: PricingRuntimeDataset
): ScenarioCostBreakdown {
  const scenario = typeof scenarioInput === "string" ? findScenarioById(scenarioInput, dataset) : scenarioInput
  const vendor = typeof vendorInput === "string" ? findVendorById(vendorInput, dataset) : vendorInput
  const model = findModelByTier(vendor, tier)
  const inputCostPerDay = (scenario.inputTokensPerDay / 1_000_000) * model.inputPricePerMTok
  const outputCostPerDay = (scenario.outputTokensPerDay / 1_000_000) * model.outputPricePerMTok
  const monthlyCost = (inputCostPerDay + outputCostPerDay) * scenario.daysPerMonth

  const formula = buildFormulaTrace("scenario_token_monthly_v1", [
    buildInput("inputTokensPerDay", "Input tokens / dia", scenario.inputTokensPerDay, scenario.provenance.inputTokensPerDay, `scenario:${scenario.id}`, "tokens/day"),
    buildInput("outputTokensPerDay", "Output tokens / dia", scenario.outputTokensPerDay, scenario.provenance.outputTokensPerDay, `scenario:${scenario.id}`, "tokens/day"),
    buildInput("daysPerMonth", "Dias / mes", scenario.daysPerMonth, scenario.provenance.daysPerMonth, `scenario:${scenario.id}`, "days/month"),
    ...buildVerifiedPriceInputs(model),
  ], monthlyCost, dataset)

  return {
    vendor,
    model,
    scenario,
    monthlyCost: roundCurrency(monthlyCost),
    inputCostPerDay: roundCurrency(inputCostPerDay),
    outputCostPerDay: roundCurrency(outputCostPerDay),
    formula,
    provenance: formula.provenance,
  }
}

export function calcUseCaseCostBreakdown(
  useCaseInput: UseCaseProfile | string,
  vendorInput: Vendor | string,
  tier: ModelTier,
  options?: {
    withBatch?: boolean
    withCache?: boolean
    dataset?: PricingRuntimeDataset
  }
): UseCaseCostBreakdown {
  const dataset = options?.dataset
  const useCase = typeof useCaseInput === "string" ? findUseCaseById(useCaseInput, dataset) : useCaseInput
  const vendor = typeof vendorInput === "string" ? findVendorById(vendorInput, dataset) : vendorInput
  const model = findModelByTier(vendor, tier)
  const withBatch = options?.withBatch ?? false
  const withCache = options?.withCache ?? false

  const cacheHitRate = getCacheHitRate(dataset)
  const cacheDiscount = getCacheDiscountRate(vendor.id, dataset)
  const batchDiscount = getBatchDiscountRate(dataset)

  const effectiveInputTokens = useCase.avgInputTokens * useCase.overheadMultiplier
  const effectiveOutputTokens = useCase.avgOutputTokens * useCase.overheadMultiplier
  const inputCostBeforeDiscounts = (effectiveInputTokens / 1_000_000) * model.inputPricePerMTok * 1000
  const outputCostBeforeDiscounts = (effectiveOutputTokens / 1_000_000) * model.outputPricePerMTok * 1000

  const cacheSavings = withCache
    ? inputCostBeforeDiscounts * cacheHitRate.value * cacheDiscount.value
    : 0

  const inputAfterCache = inputCostBeforeDiscounts - cacheSavings
  const batchSavings = withBatch
    ? (inputAfterCache + outputCostBeforeDiscounts) * batchDiscount.value
    : 0

  const extraCostPer1K = useCase.extraCostPer1KRequests[vendor.id] ?? 0
  const costPer1K = inputAfterCache + outputCostBeforeDiscounts - batchSavings + extraCostPer1K

  const formula = buildFormulaTrace("use_case_cost_per_1k_v1", [
    buildInput("avgInputTokens", "Input medio / request", useCase.avgInputTokens, useCase.provenance.avgInputTokens, `workload:${useCase.id}`, "tokens/request"),
    buildInput("avgOutputTokens", "Output medio / request", useCase.avgOutputTokens, useCase.provenance.avgOutputTokens, `workload:${useCase.id}`, "tokens/request"),
    buildInput("overheadMultiplier", "Multiplicador overhead", useCase.overheadMultiplier, useCase.provenance.overheadMultiplier, `workload:${useCase.id}`, "x"),
    ...buildVerifiedPriceInputs(model),
    buildInput("extraCostPer1KRequests", "Extras por 1K", extraCostPer1K, extraCostPer1K > 0 ? useCase.provenance.extraCostPer1KRequests : "derived", `workload:${useCase.id}`, "USD/1K"),
    buildInput("cacheHitRate", "Cache hit rate", withCache ? cacheHitRate.value : 0, withCache ? cacheHitRate.provenance : "derived", withCache ? cacheHitRate.id : "cache-disabled", "share"),
    buildInput("cacheDiscountRate", "Descuento cache", withCache ? cacheDiscount.value : 0, withCache ? cacheDiscount.provenance : "derived", withCache ? cacheDiscount.id : "cache-disabled", "share"),
    buildInput("batchDiscountRate", "Descuento batch", withBatch ? batchDiscount.value : 0, withBatch ? batchDiscount.provenance : "derived", withBatch ? batchDiscount.id : "batch-disabled", "share"),
  ], costPer1K, dataset)

  return {
    vendor,
    model,
    useCase,
    costPer1K: roundCurrency(costPer1K),
    breakdown: {
      effectiveInputTokens: roundCurrency(effectiveInputTokens),
      effectiveOutputTokens: roundCurrency(effectiveOutputTokens),
      inputCostBeforeDiscounts: roundCurrency(inputCostBeforeDiscounts),
      outputCostBeforeDiscounts: roundCurrency(outputCostBeforeDiscounts),
      cacheSavings: roundCurrency(cacheSavings),
      batchSavings: roundCurrency(batchSavings),
      extraCostPer1K: roundCurrency(extraCostPer1K),
    },
    formula,
    provenance: formula.provenance,
  }
}

export function calcDegradationCostBreakdown(
  vendorInput: Vendor | string,
  dailyRequests: number,
  daysPerMonth: number,
  useCaseInput: UseCaseProfile | string,
  options?: {
    withBatch?: boolean
    withCache?: boolean
    dataset?: PricingRuntimeDataset
  }
): DegradationBreakdown {
  const dataset = options?.dataset
  const vendor = typeof vendorInput === "string" ? findVendorById(vendorInput, dataset) : vendorInput
  const useCase = typeof useCaseInput === "string" ? findUseCaseById(useCaseInput, dataset) : useCaseInput
  const weights = getDegradationWeights(dataset)
  const monthly1K = (dailyRequests * daysPerMonth) / 1000

  const fast = calcUseCaseCostBreakdown(useCase, vendor, "fast", options)
  const balanced = calcUseCaseCostBreakdown(useCase, vendor, "balanced", options)
  const premium = calcUseCaseCostBreakdown(useCase, vendor, "premium", options)

  const fastCost = fast.costPer1K * monthly1K * weights.fast.value
  const balancedCost = balanced.costPer1K * monthly1K * weights.balanced.value
  const premiumCost = premium.costPer1K * monthly1K * weights.premium.value
  const total = fastCost + balancedCost + premiumCost

  const formula = buildFormulaTrace("degradation_mix_80_15_5_v1", [
    buildInput("fastCost", "Coste rapido", fastCost, fast.provenance, fast.formula.formulaId, "USD/month"),
    buildInput("balancedCost", "Coste equilibrado", balancedCost, balanced.provenance, balanced.formula.formulaId, "USD/month"),
    buildInput("premiumCost", "Coste premium", premiumCost, premium.provenance, premium.formula.formulaId, "USD/month"),
    buildInput("fastWeight", "Peso rapido", weights.fast.value, weights.fast.provenance, weights.fast.id, "share"),
    buildInput("balancedWeight", "Peso equilibrado", weights.balanced.value, weights.balanced.provenance, weights.balanced.id, "share"),
    buildInput("premiumWeight", "Peso premium", weights.premium.value, weights.premium.provenance, weights.premium.id, "share"),
  ], total, dataset)

  return {
    vendor,
    useCase,
    dailyRequests,
    daysPerMonth,
    total: roundCurrency(total),
    fastCost: roundCurrency(fastCost),
    balancedCost: roundCurrency(balancedCost),
    premiumCost: roundCurrency(premiumCost),
    formula,
    provenance: formula.provenance,
  }
}

export function resolveRoutingRecommendation(input: {
  useCaseId: string
  complexity: number
  costSensitivity: "high" | "medium" | "low"
  dailyRequests: number
}, dataset?: PricingRuntimeDataset): RoutingDecision {
  const resolvedDataset = getDataset(dataset)
  const useCase = findUseCaseById(input.useCaseId, resolvedDataset)
  const scored = resolvedDataset.routingRules
    .map((rule) => {
      let score = 0
      let match = true
      const condition = rule.condition
      if (condition.useCase && condition.useCase !== input.useCaseId) match = false
      else if (condition.useCase) score += 3
      if (condition.complexityMin !== undefined && input.complexity < condition.complexityMin) match = false
      else if (condition.complexityMin !== undefined) score += 2
      if (condition.complexityMax !== undefined && input.complexity > condition.complexityMax) match = false
      else if (condition.complexityMax !== undefined) score += 2
      if (condition.costSensitivity && condition.costSensitivity !== input.costSensitivity) match = false
      else if (condition.costSensitivity) score += 1
      if (condition.volumeMin && input.dailyRequests < condition.volumeMin) match = false
      else if (condition.volumeMin) score += 1
      return { rule, score, match }
    })
    .filter((item) => item.match)
    .sort((left, right) => right.score - left.score)

  const selectedRule = scored[0]?.rule ?? resolvedDataset.routingRules[0]
  const vendor = findVendorById(selectedRule.vendorId, resolvedDataset)
  const model = findModelByTier(vendor, selectedRule.modelTier)

  return {
    vendor,
    model,
    useCase,
    rule: selectedRule,
    matchedRules: scored.map((item) => ({ rule: item.rule, score: item.score })),
    provenance: selectedRule.provenance,
  }
}

export function calcRoleCostBreakdown(
  roleInput: RoleProfile | string,
  vendorInput: Vendor | string,
  options?: {
    teamSize?: number
    billingPreference?: "monthly" | "annual"
    dailyRequestsPerUser?: number
    daysPerMonth?: number
    withBatch?: boolean
    withCache?: boolean
    dataset?: PricingRuntimeDataset
  }
): RoleCostBreakdown {
  const dataset = options?.dataset
  const role = typeof roleInput === "string" ? findRoleById(roleInput, dataset) : roleInput
  const vendor = typeof vendorInput === "string" ? findVendorById(vendorInput, dataset) : vendorInput
  const vendorTarget = role.vendorTargets[vendor.id]
  if (!vendorTarget) {
    throw new Error(`Role ${role.id} has no target config for vendor ${vendor.id}`)
  }

  const model = findModelByTier(vendor, vendorTarget.modelTier)
  const seatPlan = findSeatPlanByName(vendor, vendorTarget.seatPlanName)
  const teamSize = options?.teamSize ?? role.defaultTeamSize
  const billingPreference = options?.billingPreference ?? role.billingPreference
  const dailyRequestsPerUser = options?.dailyRequestsPerUser ?? role.dailyRequestsPerUser
  const daysPerMonth = options?.daysPerMonth ?? role.daysPerMonth
  const withCache = options?.withCache ?? role.withCache
  const withBatch = options?.withBatch ?? role.withBatch

  const useCaseBreakdown = calcUseCaseCostBreakdown(role.primaryUseCaseId, vendor, vendorTarget.modelTier, {
    withBatch,
    withCache,
    dataset,
  })

  const monthlyRequestsPerUser = dailyRequestsPerUser * daysPerMonth
  const monthly1KPerUser = monthlyRequestsPerUser / 1000
  const apiMonthlyCostPerUser = useCaseBreakdown.costPer1K * monthly1KPerUser
  const seatCostPerUser = pickSeatRate(seatPlan, billingPreference)
  const toolingCostPerUser = role.explicitToolingCostPerUser[vendor.id] ?? 0
  const monthlyPerUser = seatCostPerUser + apiMonthlyCostPerUser + toolingCostPerUser
  const monthlyTotal = monthlyPerUser * teamSize

  const monthlyFormula = buildFormulaTrace("role_total_monthly_v1", [
    buildInput("teamSize", "Tamano del equipo", teamSize, role.provenance.defaultTeamSize, `role:${role.id}`, "users"),
    buildInput("seatCostPerUser", "Coste asiento / usuario", seatCostPerUser, seatCostPerUser > 0 ? "verified" : "editorial", seatPlan ? `seat:${vendor.id}:${seatPlan.name}` : `seat:none:${vendor.id}`, "USD/user/month"),
    buildInput("apiMonthlyCostPerUser", "Coste API / usuario", apiMonthlyCostPerUser, useCaseBreakdown.provenance, useCaseBreakdown.formula.formulaId, "USD/user/month"),
    buildInput("explicitToolingCostPerUser", "Tooling explicito / usuario", toolingCostPerUser, toolingCostPerUser > 0 ? role.provenance.explicitToolingCostPerUser : "derived", `role:${role.id}`, "USD/user/month"),
  ], monthlyTotal, dataset)

  const annualFormula = buildFormulaTrace("role_total_annual_v1", [
    buildInput("roleMonthlyTotal", "Coste mensual del rol", monthlyTotal, monthlyFormula.provenance, monthlyFormula.formulaId, "USD/month"),
  ], monthlyTotal * 12, dataset)

  return {
    vendor,
    role,
    model,
    seatPlan,
    teamSize,
    billingPreference,
    monthlyRequestsPerUser,
    seatCostPerUser: roundCurrency(seatCostPerUser),
    apiMonthlyCostPerUser: roundCurrency(apiMonthlyCostPerUser),
    toolingCostPerUser: roundCurrency(toolingCostPerUser),
    monthlyPerUser: roundCurrency(monthlyPerUser),
    monthlyTotal: roundCurrency(monthlyTotal),
    annualTotal: roundCurrency(monthlyTotal * 12),
    useCaseBreakdown,
    formula: monthlyFormula,
    annualFormula,
    provenance: monthlyFormula.provenance,
  }
}

export function buildMethodologySummary(dataset?: PricingRuntimeDataset) {
  const resolvedDataset = getDataset(dataset)
  const positiveModelPrices = resolvedDataset.vendors.reduce((acc, vendor) => acc + vendor.models.length * 2, 0)
  const positiveSeatPrices = resolvedDataset.vendors.reduce(
    (acc, vendor) =>
      acc +
      vendor.seatPlans.reduce((planAcc, seatPlan) => {
        return planAcc + (seatPlan.priceMonthly > 0 ? 1 : 0) + (seatPlan.priceAnnual > 0 ? 1 : 0)
      }, 0),
    0
  )

  const assumptionCounts = resolvedDataset.pricingAssumptions.reduce<Record<ProvenanceKind, number>>((acc, assumption) => {
    acc[assumption.provenance] += 1
    return acc
  }, {
    verified: 0,
    measured: 0,
    derived: 0,
    estimated: 0,
    editorial: 0,
  })

  return {
    formulasVersion: resolvedDataset.pricingFormulasVersion,
    assumptionsVersion: resolvedDataset.pricingAssumptionsVersion,
    formulasCount: resolvedDataset.pricingFormulas.length,
    assumptionsCount: resolvedDataset.pricingAssumptions.length,
    workloadsCount: resolvedDataset.useCases.length,
    scenariosCount: resolvedDataset.scenarios.length,
    routingRulesCount: resolvedDataset.routingRules.length,
    roleProfilesCount: resolvedDataset.roleProfiles.length,
    verifiedPriceInputs: positiveModelPrices + positiveSeatPrices,
    assumptionCounts,
  }
}

export {
  DEFAULT_RUNTIME_DATASET,
  findAssumption,
  findRoleById,
  findScenarioById,
  findUseCaseById,
}
