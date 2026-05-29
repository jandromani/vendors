#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { buildOperationFingerprint } from "./agentic/pricing-schemas.mjs"
import { createModelClient } from "./agentic/pricing-models.mjs"
import { runPricingOrchestrator } from "./agentic/pricing-orchestrator.mjs"
import { runRuntimeAutopilot } from "./agentic/pricing-runtime-autopilot.mjs"
import { runSurfaceVerificationOrchestrator } from "./agentic/pricing-surface-orchestrator.mjs"
import {
  resolvePricingSnapshot,
  runTruthVerificationOrchestrator,
} from "./agentic/pricing-truth-orchestrator.mjs"
import { buildToolRegistry } from "./agentic/pricing-tools.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, "..")
const DATA_DIR = path.join(ROOT_DIR, "data")

const OVERRIDES_FILE = path.join(DATA_DIR, "pricing-overrides.json")
const STATE_FILE = path.join(DATA_DIR, "pricing-agent-state.json")
const LOG_FILE = path.join(DATA_DIR, "pricing-agent-log.json")
const DOSSIER_FILE = path.join(DATA_DIR, "pricing-agent-last-run.json")
const DOSSIER_HISTORY_FILE = path.join(DATA_DIR, "pricing-agent-dossiers.json")
const SOURCE_CATALOG_FILE = path.join(DATA_DIR, "pricing-agent-sources.json")
const PRICING_CATALOG_FILE = path.join(DATA_DIR, "pricing-agent-catalog.json")
const BASE_VENDORS_FILE = path.join(DATA_DIR, "pricing-vendors.json")
const TRUTH_REGISTRY_FILE = path.join(DATA_DIR, "pricing-truth-registry.json")
const TRUTH_STATE_FILE = path.join(DATA_DIR, "pricing-truth-state.json")
const TRUTH_LAST_RUN_FILE = path.join(DATA_DIR, "pricing-truth-last-run.json")
const TRUTH_HISTORY_FILE = path.join(DATA_DIR, "pricing-truth-runs.json")
const SURFACE_REGISTRY_FILE = path.join(DATA_DIR, "pricing-surface-registry.json")
const SURFACE_STATE_FILE = path.join(DATA_DIR, "pricing-surface-state.json")
const SURFACE_LAST_RUN_FILE = path.join(DATA_DIR, "pricing-surface-last-run.json")
const SURFACE_HISTORY_FILE = path.join(DATA_DIR, "pricing-surface-runs.json")
const RUNTIME_GOVERNANCE_FILE = path.join(DATA_DIR, "pricing-runtime-governance.json")
const RUNTIME_SOURCE_REGISTRY_FILE = path.join(DATA_DIR, "pricing-runtime-sources.json")
const RUNTIME_STATE_FILE = path.join(DATA_DIR, "pricing-runtime-state.json")
const RUNTIME_LAST_RUN_FILE = path.join(DATA_DIR, "pricing-runtime-last-run.json")
const RUNTIME_HISTORY_FILE = path.join(DATA_DIR, "pricing-runtime-runs.json")
const RUNTIME_TELEMETRY_FILE = path.join(DATA_DIR, "pricing-telemetry.json")
const RUNTIME_ASSUMPTION_OVERRIDES_FILE = path.join(DATA_DIR, "pricing-assumption-overrides.json")

const MADRID_TIMEZONE = "Europe/Madrid"
const LOOKBACK_HOURS_DEFAULT = 96
const MAX_SEEN_ITEMS = 1200
const MAX_LOG_ENTRIES = 200
const MAX_DOSSIER_ENTRIES = 40
const MAX_TRUTH_RUN_ENTRIES = 40
const MAX_SURFACE_RUN_ENTRIES = 40
const MAX_RUNTIME_RUN_ENTRIES = 60
const PROTOCOL_VERSION = "pricing-agentic-v2"
const TRUTH_PROTOCOL_VERSION = "pricing-truth-v1"
const SURFACE_PROTOCOL_VERSION = "pricing-surface-v1"

const runtimeContext = {
  runId: null,
  provider: null,
  model: null,
  cutoffDate: null,
}

function nowIso() {
  return new Date().toISOString()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw)
  } catch {
    return clone(fallback)
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function parseEnvFile(content) {
  const parsed = {}
  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separatorIndex = line.indexOf("=")
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

async function loadLocalEnv() {
  for (const envFile of [".env.local", ".env"]) {
    try {
      const content = await fs.readFile(path.join(ROOT_DIR, envFile), "utf8")
      const parsed = parseEnvFile(content)
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }
    } catch {
      // Ignore missing local env files.
    }
  }
}

function madridHour() {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: MADRID_TIMEZONE,
    }).format(new Date())
  )
}

function shouldRunBySchedule() {
  return madridHour() === 7
}

function parseArgs() {
  const values = new Set(process.argv.slice(2))
  return {
    dryRun: values.has("--dry-run"),
    schedule: values.has("--schedule"),
    force: values.has("--force"),
    allowMock: values.has("--allow-mock"),
  }
}

function getCutoffDate(state) {
  const parsed = state?.lastRunAt ? new Date(state.lastRunAt) : null
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed
  return new Date(Date.now() - LOOKBACK_HOURS_DEFAULT * 60 * 60 * 1000)
}

function ensureNestedObject(root, key) {
  if (!root[key]) root[key] = {}
  return root[key]
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function getDefaultModelForProvider(provider) {
  if (provider === "openai") return "gpt-5.4"
  if (provider === "openrouter") return "openrouter/free"
  if (provider === "gemini") return "gemini-2.5-flash-lite"
  return "mock-agent-brain"
}

function getProviderModelEnvKey(provider) {
  if (provider === "openai") return "PRICING_AGENT_OPENAI_MODEL"
  if (provider === "openrouter") return "PRICING_AGENT_OPENROUTER_MODEL"
  if (provider === "gemini") return "PRICING_AGENT_GEMINI_MODEL"
  return null
}

function getProviderApiKey(provider, apiKeys) {
  if (provider === "openai") return apiKeys.openai
  if (provider === "openrouter") return apiKeys.openrouter
  if (provider === "gemini") return apiKeys.gemini
  return ""
}

function resolveModelForProvider(provider, configuredProvider, configuredModel) {
  if (provider === configuredProvider) return configuredModel
  const envKey = getProviderModelEnvKey(provider)
  return (envKey ? process.env[envKey] : null) ?? getDefaultModelForProvider(provider)
}

function buildProviderCandidates({
  configuredProvider,
  configuredModel,
  apiKeys,
  includeMockFallback = true,
}) {
  if (configuredProvider === "mock") {
    return [
      {
        provider: "mock",
        model: "mock-agent-brain",
        apiKey: "",
        mode: "mock",
        reason: "Configured explicitly in mock mode.",
      },
    ]
  }

  const preferred = [configuredProvider, "openrouter", "openai", "gemini"].filter(
    (provider, index, all) => all.indexOf(provider) === index && provider !== "mock"
  )

  const candidates = preferred
    .map((provider) => {
      const apiKey = getProviderApiKey(provider, apiKeys)
      if (!apiKey) return null
      return {
        provider,
        model: resolveModelForProvider(provider, configuredProvider, configuredModel),
        apiKey,
        mode: provider === configuredProvider ? "primary" : "failover",
        reason:
          provider === configuredProvider
            ? "Configured primary provider."
            : `Automatic failover from ${configuredProvider}.`,
      }
    })
    .filter(Boolean)

  if (includeMockFallback) {
    candidates.push({
      provider: "mock",
      model: "mock-agent-brain",
      apiKey: "",
      mode: "degraded",
      reason:
        candidates.length === 0
          ? "No live provider key is currently available."
          : "All live providers failed or became unavailable during the run.",
    })
  }

  return candidates
}

async function runAgentWatchWithProviderFallback({
  providerCandidates,
  toolRegistry,
  pricingCatalog,
  cutoffDate,
  preferredProvider,
  preferredModel,
}) {
  const attempts = []
  let lastError = null

  for (const candidate of providerCandidates) {
    const startedAt = nowIso()
    let modelClient = null

    try {
      modelClient = createModelClient({
        provider: candidate.provider,
        model: candidate.model,
        apiKey: candidate.apiKey,
      })
    } catch (error) {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        mode: candidate.mode,
        startedAt,
        finishedAt: nowIso(),
        status: "error",
        reason: candidate.reason,
        error: formatErrorMessage(error),
      })
      lastError = error
      continue
    }

    runtimeContext.provider = modelClient.provider
    runtimeContext.model = modelClient.model
    runtimeContext.runId = `${nowIso()}::${modelClient.provider}::${modelClient.model}`

    try {
      const dossier = await runPricingOrchestrator({
        modelClient,
        toolRegistry,
        pricingCatalog,
        cutoffDate,
      })

      attempts.push({
        provider: modelClient.provider,
        model: modelClient.model,
        mode: candidate.mode,
        startedAt,
        finishedAt: nowIso(),
        status: "ok",
        reason: candidate.reason,
      })

      return {
        dossier,
        modelClient,
        providerStrategy: {
          preferredProvider,
          preferredModel,
          selectedProvider: modelClient.provider,
          selectedModel: modelClient.model,
          degradedMode: modelClient.provider === "mock",
          failoverUsed: modelClient.provider !== preferredProvider || attempts.length > 1,
          attempts,
          summary:
            modelClient.provider === preferredProvider && attempts.length === 1
              ? `Primary provider ${preferredProvider} completed the run without failover.`
              : modelClient.provider === "mock"
                ? `Live providers could not complete the cycle. The system degraded to mock mode after ${attempts.length - 1} failed live attempt(s).`
                : `Primary provider ${preferredProvider} failed over to ${modelClient.provider}.`,
        },
      }
    } catch (error) {
      attempts.push({
        provider: modelClient.provider,
        model: modelClient.model,
        mode: candidate.mode,
        startedAt,
        finishedAt: nowIso(),
        status: "error",
        reason: candidate.reason,
        error: formatErrorMessage(error),
      })
      lastError = error
    }
  }

  const aggregateError = new Error(
    `All provider attempts failed. ${attempts.map((attempt) => `${attempt.provider}:${attempt.model}:${attempt.status}`).join(" | ")}${
      lastError ? ` :: ${formatErrorMessage(lastError)}` : ""
    }`
  )
  aggregateError.cause = lastError
  aggregateError.providerAttempts = attempts
  throw aggregateError
}

function summarizeOperations(operations) {
  if (operations.length === 0) return "Sin cambios aprobados."
  return operations
    .map((operation) => {
      const target = `${operation.vendorId}/${operation.targetName}/${operation.field}`
      return `${target}=${operation.value}`
    })
    .join(" | ")
}

function extractAgentStatus(agentRun) {
  const status = agentRun?.result?.status
  return typeof status === "string" ? status : "unknown"
}

function collectVendorIdsInvolved(dossier) {
  const vendorIds = new Set()
  const pushFromItems = (items) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (item && typeof item.vendorId === "string") {
        vendorIds.add(item.vendorId)
      }
    }
  }

  pushFromItems(dossier.scout?.result?.candidates)
  pushFromItems(dossier.research?.result?.evidenceBundles)
  pushFromItems(dossier.mapping?.result?.operations)
  pushFromItems(dossier.audit?.result?.approvedOperations)
  pushFromItems(dossier.approvedOperations)
  pushFromItems(dossier.appliedOperations)

  return [...vendorIds]
}

function collectCheckedSources(sourceCatalog) {
  return [
    ...sourceCatalog.officialSources.map((item) => item.label),
    ...sourceCatalog.googleNewsQueries.map((item) => item.label),
  ]
}

function applyOperationsToOverrides(overrides, operations) {
  const next = clone(overrides)
  next.meta = next.meta ?? {}
  next.modelPriceOverrides = next.modelPriceOverrides ?? {}
  next.seatPlanOverrides = next.seatPlanOverrides ?? {}

  const applied = []
  for (const operation of operations) {
    if (operation.targetType === "model") {
      const vendorNode = ensureNestedObject(next.modelPriceOverrides, operation.vendorId)
      const targetNode = vendorNode[operation.targetName] ?? {}
      if (targetNode[operation.field] === operation.value) continue
      vendorNode[operation.targetName] = {
        ...targetNode,
        [operation.field]: operation.value,
      }
      applied.push(operation)
      continue
    }

    const vendorNode = ensureNestedObject(next.seatPlanOverrides, operation.vendorId)
    const targetNode = vendorNode[operation.targetName] ?? {}
    if (targetNode[operation.field] === operation.value) continue
    vendorNode[operation.targetName] = {
      ...targetNode,
      [operation.field]: operation.value,
    }
    applied.push(operation)
  }

  return {
    next,
    applied,
  }
}

function applyApprovedOperations(overrides, approvedOperations, sourceCatalog, modelInfo) {
  const { next, applied } = applyOperationsToOverrides(overrides, approvedOperations)

  next.meta.timezone = MADRID_TIMEZONE
  next.meta.lastRunStatus = applied.length > 0 ? "updated" : "no_changes"
  next.meta.lastRunSummary =
    applied.length > 0
      ? `Se aplicaron ${applied.length} cambios aprobados por el sistema agéntico.`
      : "Sistema agéntico ejecutado sin cambios aprobados."
  next.meta.sourcesChecked = collectCheckedSources(sourceCatalog)
  next.meta.provider = modelInfo.provider
  next.meta.model = modelInfo.model
  next.meta.protocolVersion = modelInfo.protocolVersion
  if (applied.length > 0) {
    next.meta.updatedByAgentAt = nowIso()
  }

  return {
    next,
    applied,
  }
}

function buildTruthSummary(truthRun, appliedOperations) {
  return {
    lastRunAt: truthRun?.runAt ?? null,
    lastRunStatus: truthRun?.status ?? "never",
    lastRunSummary: truthRun?.summary ?? "Sin verificaciones de verdad todavía.",
    provider: truthRun?.provider ?? null,
    model: truthRun?.model ?? null,
    protocolVersion: truthRun?.protocolVersion ?? null,
    totalClaims: truthRun?.claimInventory?.totalClaims ?? 0,
    publishableUpdates: truthRun?.publishableOperations?.length ?? 0,
    appliedUpdates: appliedOperations.length,
    needsAttention: truthRun?.needsAttention ?? 0,
    verdictCounts: truthRun?.verdictCounts ?? {},
  }
}

function buildSurfaceSummary(surfaceRun) {
  return {
    lastRunAt: surfaceRun?.runAt ?? null,
    lastRunStatus: surfaceRun?.status ?? "never",
    lastRunSummary: surfaceRun?.summary ?? "Sin verificación surface todavía.",
    protocolVersion: surfaceRun?.protocolVersion ?? SURFACE_PROTOCOL_VERSION,
    totalChecks: surfaceRun?.totalChecks ?? 0,
    verifiedChecks: surfaceRun?.verifiedChecks ?? 0,
    needsReview: surfaceRun?.needsReview ?? 0,
    unverifiableChecks: surfaceRun?.unverifiableChecks ?? 0,
  }
}

async function appendLogEntry(entry) {
  const current = await readJson(LOG_FILE, [])
  const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, MAX_LOG_ENTRIES)
  await writeJson(LOG_FILE, next)
}

async function appendDossierEntry(entry) {
  const current = await readJson(DOSSIER_HISTORY_FILE, [])
  const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, MAX_DOSSIER_ENTRIES)
  await writeJson(DOSSIER_HISTORY_FILE, next)
}

async function appendTruthRunEntry(entry) {
  const current = await readJson(TRUTH_HISTORY_FILE, [])
  const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, MAX_TRUTH_RUN_ENTRIES)
  await writeJson(TRUTH_HISTORY_FILE, next)
}

async function appendSurfaceRunEntry(entry) {
  const current = await readJson(SURFACE_HISTORY_FILE, [])
  const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, MAX_SURFACE_RUN_ENTRIES)
  await writeJson(SURFACE_HISTORY_FILE, next)
}

async function appendRuntimeRunEntry(entry) {
  const current = await readJson(RUNTIME_HISTORY_FILE, [])
  const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, MAX_RUNTIME_RUN_ENTRIES)
  await writeJson(RUNTIME_HISTORY_FILE, next)
}

function buildBlockedAgentRun(agentName, errorMessage) {
  return {
    result: {
      status: "blocked",
      notes: [`${agentName} no pudo ejecutarse porque el ciclo se detuvo antes de tiempo.`],
      error: errorMessage,
    },
    trace: [
      {
        stepNumber: 1,
        attempt: 1,
        decision: "final",
        rationale: "The run failed during preflight or orchestration setup before this agent could execute.",
        finalPayload: {
          status: "blocked",
          notes: [`${agentName} no pudo ejecutarse porque el ciclo se detuvo antes de tiempo.`],
          error: errorMessage,
        },
      },
    ],
  }
}

function buildFatalRunArtifacts({ currentState, provider, model, errorMessage }) {
  const runAt = nowIso()
  const runId = runtimeContext.runId ?? `${runAt}::${provider}::${model}`
  const cutoffDate =
    runtimeContext.cutoffDate ??
    getCutoffDate(currentState).toISOString()

  const dossier = {
    runId,
    runAt,
    status: "error",
    provider,
    model,
    protocolVersion: PROTOCOL_VERSION,
    cutoffDate,
    systemError: errorMessage,
    scout: buildBlockedAgentRun("ScoutAgent", errorMessage),
    research: buildBlockedAgentRun("ResearchAgent", errorMessage),
    mapping: buildBlockedAgentRun("MappingAgent", errorMessage),
    audit: buildBlockedAgentRun("AuditAgent", errorMessage),
    approvedOperations: [],
    strictlyRejectedOperations: [],
    appliedOperations: [],
    vendorIdsInvolved: [],
    agentStatuses: {
      scout: "blocked",
      research: "blocked",
      mapping: "blocked",
      audit: "blocked",
    },
  }

  const logEntry = {
    runId,
    runAt,
    status: "error",
    provider,
    model,
    protocolVersion: PROTOCOL_VERSION,
    cutoffDate,
    scoutCandidates: 0,
    researchEvidenceBundles: 0,
    mappedOperations: 0,
    auditedApprovals: 0,
    strictApprovals: 0,
    strictRejections: 0,
    summary: errorMessage,
  }

  const nextState = {
    ...currentState,
    lastRunAt: runAt,
    lastRunStatus: "error",
    lastRunSummary: errorMessage,
    provider,
    model,
    protocolVersion: PROTOCOL_VERSION,
    lastRunId: runId,
  }

  return {
    dossier,
    logEntry,
    nextState,
  }
}

function buildStatePatch({ status, summary, modelClient, runId }) {
  return {
    lastRunAt: nowIso(),
    lastRunStatus: status,
    lastRunSummary: summary,
    provider: modelClient.provider,
    model: modelClient.model,
    protocolVersion: PROTOCOL_VERSION,
    lastRunId: runId,
  }
}

function buildFatalTruthRunArtifacts({ provider, model, errorMessage }) {
  const runAt = nowIso()
  const runId = runtimeContext.runId ?? `${runAt}::${provider}::${model}`

  const truthRun = {
    runId,
    runAt,
    status: "error",
    provider,
    model,
    protocolVersion: TRUTH_PROTOCOL_VERSION,
    claimInventory: {
      totalClaims: 0,
      autoPatchClaims: 0,
      manualOnlyClaims: 0,
    },
    sourceResolver: {
      result: {
        status: "blocked",
        totalClaims: 0,
        totalSources: 0,
      },
    },
    evidenceCollector: {
      result: {
        status: "blocked",
        sourceHealth: [],
      },
    },
    judgeRuns: [],
    claimVerdicts: [],
    conflictResolver: {
      result: {
        status: "blocked",
        blockedOperations: [],
      },
    },
    publicationGate: {
      result: {
        status: "blocked",
        publishableOperations: [],
      },
    },
    publishableOperations: [],
    blockedOperations: [],
    verdictCounts: {},
    needsAttention: 1,
    summary: `Truth graph no pudo ejecutarse: ${errorMessage}`,
  }

  return {
    truthRun,
    truthState: buildTruthSummary(truthRun, []),
  }
}

function buildFatalSurfaceRunArtifacts({ errorMessage }) {
  const runAt = nowIso()
  const runId = runtimeContext.runId ?? `${runAt}::${runtimeContext.provider ?? "unknown"}::${runtimeContext.model ?? "unknown"}`
  const surfaceRun = {
    runId,
    runAt,
    status: "error",
    protocolVersion: SURFACE_PROTOCOL_VERSION,
    totalChecks: 0,
    verifiedChecks: 0,
    needsReview: 0,
    unverifiableChecks: 0,
    checks: [],
    summary: `Surface graph no pudo ejecutarse: ${errorMessage}`,
  }

  return {
    surfaceRun,
    surfaceState: buildSurfaceSummary(surfaceRun),
  }
}

async function main() {
  const args = parseArgs()
  await loadLocalEnv()

  if (args.schedule && !args.force && !shouldRunBySchedule()) {
    console.log(`[Scheduler] Hora de Madrid actual: ${madridHour()}:00. Salta ejecución; solo corre a las 07:00.`)
    return
  }

  const state = await readJson(STATE_FILE, {
    lastRunAt: null,
    seenItemIds: [],
    lastRunStatus: "never",
    lastRunSummary: "Sin ejecuciones automáticas todavía.",
    provider: null,
    model: null,
    protocolVersion: null,
    lastRunId: null,
  })

  const overrides = await readJson(OVERRIDES_FILE, {
    meta: {
      timezone: MADRID_TIMEZONE,
      snapshotTakenAt: "2026-04-23T00:00:00.000Z",
      updatedByAgentAt: null,
      lastRunStatus: "never",
      lastRunSummary: "Sin ejecuciones automáticas todavía.",
      sourcesChecked: [],
    },
    modelPriceOverrides: {},
    seatPlanOverrides: {},
  })

  const sourceCatalog = await readJson(SOURCE_CATALOG_FILE, {
    officialSources: [],
    googleNewsQueries: [],
  })
  const pricingCatalog = await readJson(PRICING_CATALOG_FILE, {
    vendors: [],
  })
  const baseVendors = await readJson(BASE_VENDORS_FILE, [])
  const truthRegistry = await readJson(TRUTH_REGISTRY_FILE, {
    defaults: {
      ttlHours: 24,
      minJudgeConfidence: 0.9,
      minPublishConfidence: 0.92,
    },
    truthSources: [],
    vendorPolicies: {},
  })
  const surfaceRegistry = await readJson(SURFACE_REGISTRY_FILE, {
    vendors: {},
  })
  const previousTruthRun = await readJson(TRUTH_LAST_RUN_FILE, null)
  const previousSurfaceRun = await readJson(SURFACE_LAST_RUN_FILE, null)
  const previousRuntimeState = await readJson(RUNTIME_STATE_FILE, {
    lastRunStatus: "never",
  })

  const configuredProvider = process.env.PRICING_AGENT_PROVIDER ?? "openrouter"
  const configuredModel =
    process.env.PRICING_AGENT_MODEL ??
    (
      configuredProvider === "openai"
        ? "gpt-5.4"
        : configuredProvider === "openrouter"
          ? "openrouter/free"
          : "gemini-2.5-flash-lite"
    )
  const geminiApiKey = process.env.GEMINI_API_KEY ?? ""
  const openAiApiKey = process.env.OPENAI_API_KEY ?? ""
  const openRouterApiKey = process.env.OPENROUTER_API_KEY ?? ""

  runtimeContext.provider = configuredProvider
  runtimeContext.model = configuredModel
  runtimeContext.runId = `${nowIso()}::${configuredProvider}::${configuredModel}`
  runtimeContext.cutoffDate = null

  const cutoffDate = getCutoffDate(state)
  runtimeContext.provider = configuredProvider
  runtimeContext.model = configuredModel
  runtimeContext.runId = `${nowIso()}::${configuredProvider}::${configuredModel}`
  runtimeContext.cutoffDate = cutoffDate.toISOString()
  const toolRegistry = buildToolRegistry({
    sourceCatalog,
    pricingCatalog,
    state,
    overrides,
    cutoffDate,
  })

  const providerCandidates = buildProviderCandidates({
    configuredProvider,
    configuredModel,
    apiKeys: {
      gemini: geminiApiKey,
      openai: openAiApiKey,
      openrouter: openRouterApiKey,
    },
    includeMockFallback: true,
  })

  const {
    dossier,
    modelClient,
    providerStrategy,
  } = await runAgentWatchWithProviderFallback({
    providerCandidates,
    toolRegistry,
    pricingCatalog,
    cutoffDate,
    preferredProvider: configuredProvider,
    preferredModel: configuredModel,
  })

  const runId = `${nowIso()}::${modelClient.provider}::${modelClient.model}`
  runtimeContext.provider = modelClient.provider
  runtimeContext.model = modelClient.model
  runtimeContext.runId = runId
  console.log(`[Orchestrator] Provider=${modelClient.provider} Model=${modelClient.model}`)
  console.log(`[Orchestrator] Cutoff date=${cutoffDate.toISOString()}`)
  console.log(`[Orchestrator] Provider strategy=${providerStrategy.summary}`)

  const { next: nextOverrides, applied: newsApplied } = applyApprovedOperations(
    overrides,
    dossier.approvedOperations,
    sourceCatalog,
    {
      provider: dossier.provider,
      model: dossier.model,
      protocolVersion: dossier.protocolVersion,
    }
  )

  const currentVendors = resolvePricingSnapshot(baseVendors, nextOverrides)
  const truthRun = await runTruthVerificationOrchestrator({
    modelClient,
    truthRegistry,
    pricingCatalog,
    currentVendors,
    previousTruthRun,
  })
  const { next: truthOverrides, applied: truthApplied } = applyOperationsToOverrides(
    nextOverrides,
    truthRun.publishableOperations
  )
  truthOverrides.meta.truthVerification = {
    lastRunAt: truthRun.runAt,
    status: truthRun.status,
    needsAttention: truthRun.needsAttention,
    publishableUpdates: truthRun.publishableOperations.length,
    appliedUpdates: truthApplied.length,
  }
  truthOverrides.meta.truthSourcesChecked = truthRun.evidenceCollector.result.sourceHealth
    .filter((item) => item.status === "ok")
    .map((item) => item.label)
  if (truthApplied.length > 0) {
    truthOverrides.meta.updatedByAgentAt = nowIso()
  }

  const truthRunRecord = {
    ...truthRun,
    runId,
    appliedOperations: truthApplied.map((item) => ({
      ...item,
      operationFingerprint: buildOperationFingerprint(item),
    })),
  }
  const truthSummary = buildTruthSummary(truthRun, truthApplied)
  const combinedApplied = [...newsApplied, ...truthApplied]
  const resolvedSnapshot = resolvePricingSnapshot(baseVendors, truthOverrides)
  const surfaceRun = await runSurfaceVerificationOrchestrator({
    surfaceRegistry,
    truthRegistry,
    currentVendors: resolvedSnapshot,
    previousSurfaceRun,
  })
  const surfaceRunRecord = {
    ...surfaceRun,
    runId,
  }
  const surfaceSummary = buildSurfaceSummary(surfaceRun)

  let runtimeAutopilotSummary = previousRuntimeState
  let runtimeAutopilotRun = null
  try {
    const runtimeAutopilot = await runRuntimeAutopilot({
      rootDir: ROOT_DIR,
      governanceFile: RUNTIME_GOVERNANCE_FILE,
      sourceRegistryFile: RUNTIME_SOURCE_REGISTRY_FILE,
      telemetryFile: RUNTIME_TELEMETRY_FILE,
      assumptionOverridesFile: RUNTIME_ASSUMPTION_OVERRIDES_FILE,
      previousState: previousRuntimeState,
    })
    runtimeAutopilotSummary = runtimeAutopilot.state
    runtimeAutopilotRun = runtimeAutopilot.run

    if (!args.dryRun) {
      await writeJson(RUNTIME_TELEMETRY_FILE, runtimeAutopilot.telemetry)
      await writeJson(RUNTIME_ASSUMPTION_OVERRIDES_FILE, runtimeAutopilot.assumptionOverrides)
      await writeJson(RUNTIME_STATE_FILE, runtimeAutopilot.state)
      await writeJson(RUNTIME_LAST_RUN_FILE, runtimeAutopilot.run)
      await appendRuntimeRunEntry(runtimeAutopilot.run)
    }
  } catch (runtimeError) {
    const errorMessage = runtimeError instanceof Error ? runtimeError.message : String(runtimeError)
    runtimeAutopilotSummary = {
      ...previousRuntimeState,
      lastRunAt: nowIso(),
      lastRunStatus: "error",
      lastRunSummary: `Runtime autopilot falló: ${errorMessage}`,
    }
    runtimeAutopilotRun = {
      runAt: nowIso(),
      status: "error",
      protocolVersion: "pricing-runtime-v1",
      autonomousMode: true,
      manualEditsLocked: true,
      summary: `Runtime autopilot falló: ${errorMessage}`,
      sourceHealth: [],
      ingestedTelemetry: [],
      appliedAssumptionOverrides: [],
      error: errorMessage,
    }

    if (!args.dryRun) {
      await writeJson(RUNTIME_STATE_FILE, runtimeAutopilotSummary)
      await writeJson(RUNTIME_LAST_RUN_FILE, runtimeAutopilotRun)
      await appendRuntimeRunEntry(runtimeAutopilotRun)
    }
  }

  const seenFromScout = dossier.scout.result.candidates.map((item) => item.candidateId)
  const mergedSeen = [...new Set([...seenFromScout, ...(Array.isArray(state.seenItemIds) ? state.seenItemIds : [])])]
  const overallStatus =
    combinedApplied.length > 0
      ? "updated"
      : truthRun.status === "needs_review" || surfaceRun.status === "needs_review"
        ? "needs_review"
        : truthRun.status === "partial" || surfaceRun.status === "partial"
          ? "partial"
          : "no_changes"
  const overallSummary =
    combinedApplied.length > 0
      ? `Sistema agéntico aplicó ${combinedApplied.length} cambios en total (${newsApplied.length} por noticias, ${truthApplied.length} verificados por el truth graph).`
      : surfaceRun.status !== "verified" && surfaceRun.status !== "never"
        ? surfaceRun.summary
      : truthRun.summary
  const nextState = {
    ...state,
    seenItemIds: mergedSeen.slice(0, MAX_SEEN_ITEMS),
    ...buildStatePatch({
      status: overallStatus,
      summary: overallSummary,
      modelClient,
      runId,
    }),
    truthVerification: truthSummary,
    surfaceVerification: surfaceSummary,
    runtimeAutopilot: runtimeAutopilotSummary,
    providerStrategy,
  }

  const logEntry = {
    runId,
    runAt: nowIso(),
    status: overallStatus,
    provider: dossier.provider,
    model: dossier.model,
    protocolVersion: dossier.protocolVersion,
    cutoffDate: dossier.cutoffDate,
    scoutCandidates: dossier.scout.result.candidates.length,
    researchEvidenceBundles: dossier.research.result.evidenceBundles.length,
    mappedOperations: dossier.mapping.result.operations.length,
    auditedApprovals: dossier.audit.result.approvedOperations.length,
    strictApprovals: dossier.approvedOperations.length,
    strictRejections: dossier.strictlyRejectedOperations.length,
    truthStatus: truthRun.status,
    truthTotalClaims: truthRun.claimInventory.totalClaims,
    truthNeedsAttention: truthRun.needsAttention,
    truthPublishableUpdates: truthRun.publishableOperations.length,
    truthAppliedUpdates: truthApplied.length,
    surfaceStatus: surfaceRun.status,
    surfaceVerifiedChecks: surfaceRun.verifiedChecks,
    surfaceNeedsReview: surfaceRun.needsReview,
    surfaceUnverifiable: surfaceRun.unverifiableChecks,
    runtimeStatus: runtimeAutopilotSummary.lastRunStatus,
    runtimeTelemetrySources: runtimeAutopilotSummary.telemetrySources ?? 0,
    runtimeAssumptionOverrides: runtimeAutopilotSummary.appliedAssumptionOverrides ?? 0,
    summary: summarizeOperations(combinedApplied),
  }

  const runDossier = {
    ...dossier,
    runId,
    runAt: nowIso(),
    status: overallStatus,
    vendorIdsInvolved: collectVendorIdsInvolved(dossier),
    agentStatuses: {
      scout: extractAgentStatus(dossier.scout),
      research: extractAgentStatus(dossier.research),
      mapping: extractAgentStatus(dossier.mapping),
      audit: extractAgentStatus(dossier.audit),
    },
    appliedOperations: combinedApplied.map((item) => ({
      ...item,
      operationFingerprint: buildOperationFingerprint(item),
    })),
    truthVerification: {
      status: truthRun.status,
      summary: truthRun.summary,
      verdictCounts: truthRun.verdictCounts,
      needsAttention: truthRun.needsAttention,
      publishableUpdates: truthRun.publishableOperations.length,
      appliedUpdates: truthApplied.length,
    },
    surfaceVerification: surfaceRunRecord,
    runtimeAutopilot: runtimeAutopilotRun,
    providerStrategy,
  }

  if (args.dryRun) {
    console.log("[DryRun] No se escribieron archivos.")
    console.log(`[DryRun] Scout candidates=${dossier.scout.result.candidates.length}`)
    console.log(`[DryRun] Approved operations=${dossier.approvedOperations.length}`)
    console.log(`[DryRun] Truth claims=${truthRun.claimInventory.totalClaims}`)
    console.log(`[DryRun] Truth publishable updates=${truthRun.publishableOperations.length}`)
    console.log(`[DryRun] Surface checks=${surfaceRun.totalChecks} verified=${surfaceRun.verifiedChecks} review=${surfaceRun.needsReview}`)
    console.log(`[DryRun] Runtime autopilot=${runtimeAutopilotSummary.lastRunStatus} telemetry=${runtimeAutopilotSummary.telemetrySources ?? 0}`)
    console.log(`[DryRun] ${summarizeOperations(combinedApplied)}`)
    return
  }

  await writeJson(DOSSIER_FILE, runDossier)
  await appendDossierEntry(runDossier)
  await writeJson(STATE_FILE, nextState)
  await appendLogEntry(logEntry)
  await writeJson(OVERRIDES_FILE, truthOverrides)
  await writeJson(TRUTH_LAST_RUN_FILE, truthRunRecord)
  await appendTruthRunEntry(truthRunRecord)
  await writeJson(TRUTH_STATE_FILE, truthSummary)
  await writeJson(SURFACE_LAST_RUN_FILE, surfaceRunRecord)
  await appendSurfaceRunEntry(surfaceRunRecord)
  await writeJson(SURFACE_STATE_FILE, surfaceSummary)

  console.log(`[Orchestrator] Scout candidates=${dossier.scout.result.candidates.length}`)
  console.log(`[Orchestrator] Evidence bundles=${dossier.research.result.evidenceBundles.length}`)
  console.log(`[Orchestrator] Proposed operations=${dossier.mapping.result.operations.length}`)
  console.log(`[Orchestrator] Strict approvals=${dossier.approvedOperations.length}`)
  console.log(`[TruthGraph] Claims=${truthRun.claimInventory.totalClaims} Publishable=${truthRun.publishableOperations.length} NeedsAttention=${truthRun.needsAttention}`)
  console.log(`[SurfaceGraph] Checks=${surfaceRun.totalChecks} Verified=${surfaceRun.verifiedChecks} NeedsReview=${surfaceRun.needsReview} Unverifiable=${surfaceRun.unverifiableChecks}`)
  console.log(`[Runtime] Status=${runtimeAutopilotSummary.lastRunStatus} Telemetry=${runtimeAutopilotSummary.telemetrySources ?? 0} Overrides=${runtimeAutopilotSummary.appliedAssumptionOverrides ?? 0}`)
  console.log(`[Updater] ${summarizeOperations(combinedApplied)}`)
}

main().catch(async (error) => {
  console.error("[PricingAgents] Fatal error:", error)

  try {
    const currentState = await readJson(STATE_FILE, {
      seenItemIds: [],
    })
    const provider = runtimeContext.provider ?? process.env.PRICING_AGENT_PROVIDER ?? "openrouter"
    const model =
      runtimeContext.model ??
      process.env.PRICING_AGENT_MODEL ??
      (provider === "openai" ? "gpt-5.4" : provider === "openrouter" ? "openrouter/free" : "gemini-2.5-flash-lite")
    const errorMessage = error instanceof Error ? error.message : String(error)
    const fatalArtifacts = buildFatalRunArtifacts({
      currentState,
      provider,
      model,
      errorMessage,
    })
    const fatalTruthArtifacts = buildFatalTruthRunArtifacts({
      provider,
      model,
      errorMessage,
    })
    const fatalSurfaceArtifacts = buildFatalSurfaceRunArtifacts({
      errorMessage,
    })

    await writeJson(DOSSIER_FILE, fatalArtifacts.dossier)
    await appendDossierEntry(fatalArtifacts.dossier)
    await appendLogEntry(fatalArtifacts.logEntry)
    await writeJson(STATE_FILE, fatalArtifacts.nextState)
    await writeJson(TRUTH_LAST_RUN_FILE, fatalTruthArtifacts.truthRun)
    await appendTruthRunEntry(fatalTruthArtifacts.truthRun)
    await writeJson(TRUTH_STATE_FILE, fatalTruthArtifacts.truthState)
    await writeJson(SURFACE_LAST_RUN_FILE, fatalSurfaceArtifacts.surfaceRun)
    await appendSurfaceRunEntry(fatalSurfaceArtifacts.surfaceRun)
    await writeJson(SURFACE_STATE_FILE, fatalSurfaceArtifacts.surfaceState)
  } catch {
    // Best-effort state write on fatal errors.
  }

  process.exitCode = 1
})
