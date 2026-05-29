import fs from "node:fs/promises"
import path from "node:path"

const RUNTIME_PROTOCOL_VERSION = "pricing-runtime-v1"

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nowIso() {
  return new Date().toISOString()
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw)
  } catch {
    return clone(fallback)
  }
}

function parseCsvLine(line) {
  const cells = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\""
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (character === "," && !inQuotes) {
      cells.push(current)
      current = ""
      continue
    }
    current += character
  }

  cells.push(current)
  return cells.map((cell) => cell.trim())
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/g).filter(Boolean)
  if (lines.length === 0) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  })
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeTelemetryRow(row) {
  return {
    id: String(row.id ?? "").trim(),
    label: String(row.label ?? "").trim(),
    status: String(row.status ?? "draft").trim() || "draft",
    useCaseId: String(row.useCaseId ?? "").trim() || undefined,
    roleProfileId: String(row.roleProfileId ?? "").trim() || undefined,
    sampleWindowDays: toFiniteNumber(row.sampleWindowDays),
    sampleSizeRequests: toFiniteNumber(row.sampleSizeRequests),
    sampleSizeUsers: toFiniteNumber(row.sampleSizeUsers),
    avgInputTokens: toFiniteNumber(row.avgInputTokens),
    avgOutputTokens: toFiniteNumber(row.avgOutputTokens),
    overheadMultiplier: toFiniteNumber(row.overheadMultiplier),
    avgRequestsPerUserPerDay: toFiniteNumber(row.avgRequestsPerUserPerDay),
    cacheHitRate: toFiniteNumber(row.cacheHitRate),
    batchHitRate: toFiniteNumber(row.batchHitRate),
    confidence: toFiniteNumber(row.confidence),
    sourceLabel: String(row.sourceLabel ?? "").trim() || undefined,
    recordedAt: String(row.recordedAt ?? "").trim() || undefined,
    notes: String(row.notes ?? "").trim() || undefined,
  }
}

async function readSourcePayload(rootDir, source) {
  const connector = source.connector ?? {}
  if (connector.type === "csv_file") {
    const filePath = path.resolve(rootDir, connector.path)
    const content = await fs.readFile(filePath, "utf8")
    return parseCsv(content)
  }

  if (connector.type === "json_file") {
    const filePath = path.resolve(rootDir, connector.path)
    return await readJson(filePath, [])
  }

  if (connector.type === "http_json") {
    const response = await fetch(connector.url, {
      headers: connector.headers ?? {},
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  }

  throw new Error(`Unsupported runtime connector type: ${connector.type}`)
}

function dedupeTelemetrySources(sources) {
  const registry = new Map()
  for (const source of sources) {
    if (!source.id) continue
    const current = registry.get(source.id)
    if (!current) {
      registry.set(source.id, source)
      continue
    }
    const currentTimestamp = current.recordedAt ? Date.parse(current.recordedAt) : 0
    const nextTimestamp = source.recordedAt ? Date.parse(source.recordedAt) : 0
    if (nextTimestamp >= currentTimestamp) {
      registry.set(source.id, source)
    }
  }
  return [...registry.values()]
}

function roundNumber(value, decimals = 4) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function buildMeasuredAssumptionOverrides(telemetrySources, governance) {
  const guardrails = governance.guardrails ?? {}
  const minConfidence = guardrails.minSourceConfidence ?? 0.8
  const minSampleRequests = guardrails.minSampleRequestsPerSource ?? 5000
  const minWeightedRequests = guardrails.minWeightedRequestsForMeasuredOverride ?? 25000
  const allowedIds = new Set(guardrails.allowedAssumptionOverrideIds ?? [])
  const maxCacheHitRate = guardrails.maxCacheHitRate ?? 0.95
  const minCacheHitRate = guardrails.minCacheHitRate ?? 0.05

  const eligibleSources = telemetrySources.filter((source) => {
    return (
      source.status === "active" &&
      typeof source.cacheHitRate === "number" &&
      typeof source.sampleSizeRequests === "number" &&
      source.sampleSizeRequests >= minSampleRequests &&
      (source.confidence ?? 0) >= minConfidence
    )
  })

  const totalRequests = eligibleSources.reduce((sum, source) => sum + (source.sampleSizeRequests ?? 0), 0)
  if (
    !allowedIds.has("optimization.cache_hit_rate_default") ||
    totalRequests < minWeightedRequests ||
    eligibleSources.length === 0
  ) {
    return []
  }

  const weightedAverage =
    eligibleSources.reduce((sum, source) => {
      return sum + source.cacheHitRate * source.sampleSizeRequests
    }, 0) / totalRequests
  const boundedValue = Math.max(minCacheHitRate, Math.min(maxCacheHitRate, weightedAverage))

  return [
    {
      id: "optimization.cache_hit_rate_default",
      value: roundNumber(boundedValue),
      provenance: "measured",
      reason: `Autopilot override from ${eligibleSources.length} telemetry sources and ${totalRequests} measured requests.`,
      updatedAt: nowIso(),
    },
  ]
}

export async function runRuntimeAutopilot({
  rootDir,
  governanceFile,
  sourceRegistryFile,
  telemetryFile,
  assumptionOverridesFile,
  previousState,
}) {
  const governance = await readJson(governanceFile, {
    version: "pricing-runtime-governance-v1",
    autonomousMode: false,
    manualEditsLocked: false,
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    guardrails: {},
  })
  const sourceRegistry = await readJson(sourceRegistryFile, {
    version: "pricing-runtime-sources-v1",
    sources: [],
  })

  const runAt = nowIso()
  if (!governance.autonomousMode) {
    const disabledRun = {
      runAt,
      status: "disabled",
      protocolVersion: governance.protocolVersion ?? RUNTIME_PROTOCOL_VERSION,
      autonomousMode: false,
      manualEditsLocked: governance.manualEditsLocked ?? false,
      summary: "Runtime autopilot desactivado por gobernanza.",
      sourceHealth: [],
      ingestedTelemetry: [],
      appliedAssumptionOverrides: [],
    }
    return {
      telemetry: await readJson(telemetryFile, { version: "pricing-telemetry-v1", updatedAt: null, sources: [] }),
      assumptionOverrides: await readJson(assumptionOverridesFile, {
        version: "pricing-assumption-overrides-v1",
        updatedAt: null,
        updatedBy: null,
        overrides: [],
      }),
      state: {
        ...previousState,
        lastRunAt: runAt,
        lastRunStatus: "disabled",
        lastRunSummary: disabledRun.summary,
        protocolVersion: disabledRun.protocolVersion,
        autonomousMode: false,
        manualEditsLocked: disabledRun.manualEditsLocked,
        sourceHealth: [],
        telemetrySources: 0,
        appliedAssumptionOverrides: 0,
      },
      run: disabledRun,
    }
  }

  const sourceHealth = []
  const ingestedTelemetry = []
  for (const source of sourceRegistry.sources ?? []) {
    if (source.status === "disabled") {
      sourceHealth.push({
        sourceId: source.id,
        label: source.label,
        status: "disabled",
      })
      continue
    }

    try {
      const payload = await readSourcePayload(rootDir, source)
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : []
      const normalized = rows
        .map((row) => normalizeTelemetryRow(row))
        .filter((row) => row.id && row.label)
      ingestedTelemetry.push(...normalized)
      sourceHealth.push({
        sourceId: source.id,
        label: source.label,
        status: "ok",
        connectorType: source.connector?.type ?? "unknown",
        rowCount: normalized.length,
      })
    } catch (error) {
      sourceHealth.push({
        sourceId: source.id,
        label: source.label,
        status: "error",
        connectorType: source.connector?.type ?? "unknown",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const dedupedTelemetry = dedupeTelemetrySources(ingestedTelemetry)
  const assumptionOverrides = buildMeasuredAssumptionOverrides(dedupedTelemetry, governance)
  const telemetryOutput = {
    version: "pricing-telemetry-v1",
    updatedAt: runAt,
    sources: dedupedTelemetry,
  }
  const assumptionOverrideOutput = {
    version: "pricing-assumption-overrides-v1",
    updatedAt: runAt,
    updatedBy: "runtime-autopilot",
    overrides: assumptionOverrides,
  }

  const okSources = sourceHealth.filter((entry) => entry.status === "ok").length
  const status = sourceHealth.some((entry) => entry.status === "error") ? "partially_updated" : "updated"
  const summary = `Runtime autopilot ingirió ${dedupedTelemetry.length} fuentes de telemetría y aplicó ${assumptionOverrides.length} overrides medidos.`
  const run = {
    runAt,
    status,
    protocolVersion: governance.protocolVersion ?? RUNTIME_PROTOCOL_VERSION,
    autonomousMode: true,
    manualEditsLocked: governance.manualEditsLocked ?? true,
    summary,
    sourceHealth,
    ingestedTelemetry: dedupedTelemetry,
    appliedAssumptionOverrides: assumptionOverrides,
    sourceRegistryVersion: sourceRegistry.version ?? null,
    sourceCounts: {
      configured: (sourceRegistry.sources ?? []).length,
      ok: okSources,
      errors: sourceHealth.filter((entry) => entry.status === "error").length,
    },
  }

  const state = {
    lastRunAt: runAt,
    lastRunStatus: status,
    lastRunSummary: summary,
    protocolVersion: run.protocolVersion,
    autonomousMode: true,
    manualEditsLocked: governance.manualEditsLocked ?? true,
    sourceHealth,
    telemetrySources: dedupedTelemetry.length,
    appliedAssumptionOverrides: assumptionOverrides.length,
  }

  return {
    telemetry: telemetryOutput,
    assumptionOverrides: assumptionOverrideOutput,
    state,
    run,
  }
}
