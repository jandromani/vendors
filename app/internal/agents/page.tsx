import fs from "node:fs/promises"
import path from "node:path"

import Link from "next/link"

export const dynamic = "force-dynamic"

type LooseRecord = Record<string, unknown>

interface AgentTraceEntry extends LooseRecord {
  stepNumber?: number
  attempt?: number
  decision?: string
  rationale?: string
  toolName?: string
  toolInput?: LooseRecord | null
  toolResult?: unknown
  finalPayload?: LooseRecord | null
}

interface AgentRunBlock {
  result?: LooseRecord | null
  trace?: AgentTraceEntry[]
}

interface DossierEntry extends LooseRecord {
  runId?: string | null
  runAt?: string | null
  provider?: string | null
  model?: string | null
  protocolVersion?: string | null
  cutoffDate?: string | null
  status?: string | null
  systemError?: string | null
  vendorIdsInvolved?: string[]
  agentStatuses?: Record<string, string>
  scout?: AgentRunBlock | null
  research?: AgentRunBlock | null
  mapping?: AgentRunBlock | null
  audit?: AgentRunBlock | null
  approvedOperations?: LooseRecord[]
  strictlyRejectedOperations?: LooseRecord[]
  appliedOperations?: LooseRecord[]
}

interface StateShape extends LooseRecord {
  lastRunAt?: string | null
  lastRunStatus?: string | null
  lastRunSummary?: string | null
  provider?: string | null
  model?: string | null
  protocolVersion?: string | null
  truthVerification?: {
    lastRunStatus?: string | null
    totalClaims?: number
    needsAttention?: number
    publishableUpdates?: number
  }
  surfaceVerification?: {
    lastRunAt?: string | null
    lastRunStatus?: string | null
    lastRunSummary?: string | null
    totalChecks?: number
    verifiedChecks?: number
    needsReview?: number
    unverifiableChecks?: number
  }
  runtimeAutopilot?: {
    lastRunAt?: string | null
    lastRunStatus?: string | null
    lastRunSummary?: string | null
    telemetrySources?: number
    appliedAssumptionOverrides?: number
    autonomousMode?: boolean
    manualEditsLocked?: boolean
  }
}

interface LogEntry extends LooseRecord {
  runId?: string | null
  runAt?: string | null
  status?: string | null
  provider?: string | null
  model?: string | null
  scoutCandidates?: number
  researchEvidenceBundles?: number
  mappedOperations?: number
  strictApprovals?: number
  strictRejections?: number
  summary?: string | null
}

const AGENT_NAMES = ["ScoutAgent", "ResearchAgent", "MappingAgent", "AuditAgent"] as const

interface SearchParamsShape {
  runId?: string | string[]
  status?: string | string[]
  vendor?: string | string[]
  agent?: string | string[]
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin fecha"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(parsed)
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2)
}

function getStatusTone(status?: string | null) {
  if (status === "approved" || status === "updated" || status === "ok") {
    return "border-emerald-800/50 bg-emerald-950/20 text-emerald-300"
  }
  if (status === "partially_approved" || status === "no_changes") {
    return "border-amber-800/50 bg-amber-950/20 text-amber-300"
  }
  if (status === "rejected" || status === "error" || status === "blocked") {
    return "border-red-800/50 bg-red-950/20 text-red-300"
  }
  return "border-border/60 bg-background/40 text-muted-foreground"
}

function getAgentStatus(agent: AgentRunBlock | null | undefined) {
  const status = agent?.result?.status
  return typeof status === "string" ? status : "sin estado"
}

function getTraceLabel(entry: AgentTraceEntry) {
  if (entry.decision === "tool_call") {
    return `${entry.decision} · ${entry.toolName ?? "tool"}`
  }
  return `${entry.decision ?? "final"}`
}

function normalizeParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

function getRunStatus(run: DossierEntry, runLog?: LogEntry) {
  if (typeof run.status === "string") return run.status
  if (typeof runLog?.status === "string") return runLog.status
  return "sin estado"
}

function resolveAgentBlock(run: DossierEntry, agentName: string) {
  if (agentName === "ScoutAgent") return run.scout
  if (agentName === "ResearchAgent") return run.research
  if (agentName === "MappingAgent") return run.mapping
  if (agentName === "AuditAgent") return run.audit
  return null
}

function getLiveReadiness(state: StateShape) {
  const summary = state.lastRunSummary ?? "Sin datos de configuración"
  const quotaBlocked = summary.includes("insufficient_quota") || summary.includes("\"code\":402")

  if (
    (state.provider === "gemini" && summary.includes("GEMINI_API_KEY")) ||
    (state.provider === "openai" && summary.includes("OPENAI_API_KEY")) ||
    (state.provider === "openrouter" && summary.includes("OPENROUTER_API_KEY"))
  ) {
    return {
      label: "Bloqueado por configuración",
      detail:
        state.provider === "openai"
          ? "Falta OPENAI_API_KEY, así que la ejecución live no puede arrancar y el sistema deja trazado un dossier de error."
          : state.provider === "openrouter"
            ? "Falta OPENROUTER_API_KEY, así que la ejecución live no puede arrancar y el sistema deja trazado un dossier de error."
          : "Falta GEMINI_API_KEY, así que la ejecución live no puede arrancar y el sistema deja trazado un dossier de error.",
      tone: "border-red-800/50 bg-red-950/20 text-red-200",
    }
  }

  if (quotaBlocked) {
    return {
      label: "Bloqueado por cuota",
      detail:
        "La API del proveedor respondió con insufficient_quota. El orquestador está bien cableado, pero la cuenta activa no puede completar ejecuciones reales ahora mismo.",
      tone: "border-red-800/50 bg-red-950/20 text-red-200",
    }
  }

  if (state.provider === "mock") {
    return {
      label: "Modo mock",
      detail: "El pipeline está sano, pero las decisiones del orquestador no están pasando aún por un proveedor real.",
      tone: "border-amber-800/50 bg-amber-950/20 text-amber-200",
    }
  }

  if (state.provider === "gemini") {
    return {
      label: "Listo para live",
      detail: "Gemini está configurado como cerebro del orquestador y la siguiente ejecución real puede dejar un dossier live.",
      tone: "border-emerald-800/50 bg-emerald-950/20 text-emerald-200",
    }
  }

  if (state.provider === "openai") {
    return {
      label: "Listo para live",
      detail: "OpenAI está configurado como cerebro del orquestador y la siguiente ejecución real puede dejar un dossier live.",
      tone: "border-emerald-800/50 bg-emerald-950/20 text-emerald-200",
    }
  }

  if (state.provider === "openrouter") {
    return {
      label: "Listo para live",
      detail: "OpenRouter está configurado como router del orquestador y puede usar modelos gratuitos compatibles con structured outputs.",
      tone: "border-emerald-800/50 bg-emerald-950/20 text-emerald-200",
    }
  }

  return {
    label: "Configuración pendiente",
    detail: "Todavía no hay una señal clara del proveedor activo del orquestador.",
    tone: "border-border/60 bg-background/40 text-muted-foreground",
  }
}

function collectVendorIdsFromRun(run: DossierEntry) {
  if (Array.isArray(run.vendorIdsInvolved)) {
    return run.vendorIdsInvolved.filter((item): item is string => typeof item === "string")
  }

  const vendorIds = new Set<string>()
  const pushFromItems = (items: unknown) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (item && typeof item === "object" && typeof (item as { vendorId?: unknown }).vendorId === "string") {
        vendorIds.add((item as { vendorId: string }).vendorId)
      }
    }
  }

  pushFromItems(run.scout?.result?.candidates)
  pushFromItems(run.research?.result?.evidenceBundles)
  pushFromItems(run.mapping?.result?.operations)
  pushFromItems(run.audit?.result?.approvedOperations)
  pushFromItems(run.approvedOperations)
  pushFromItems(run.appliedOperations)

  return [...vendorIds]
}

function renderAgentBlock(label: string, agent: AgentRunBlock | null | undefined) {
  const trace = Array.isArray(agent?.trace) ? agent.trace : []
  const result = agent?.result ?? null
  const status = getAgentStatus(agent)

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{label}</h2>
          <p className="text-xs text-muted-foreground">Resultado final + traza validada por el orquestador</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(status)}`}>
          {status}
        </span>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Final Payload</div>
        <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
          {formatJson(result)}
        </pre>
      </div>

      <div className="space-y-3">
        {trace.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
            Sin pasos registrados.
          </div>
        )}

        {trace.map((entry, index) => (
          <details key={`${label}-${index}`} className="rounded-xl border border-border/60 bg-background/30">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-foreground">
                  Paso {entry.stepNumber ?? index + 1}
                </span>
                <span className="text-xs text-muted-foreground">
                  Intento {entry.attempt ?? 1}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getTraceLabel(entry)}
                </span>
              </div>
            </summary>
            <div className="border-t border-border/50 px-4 py-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rationale</div>
                <div className="mt-1 text-sm text-foreground">{entry.rationale ?? "Sin rationale"}</div>
              </div>

              {entry.toolInput !== undefined && (
                <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tool Input</div>
                  <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {formatJson(entry.toolInput)}
                  </pre>
                </div>
              )}

              {entry.toolResult !== undefined && (
                <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tool Result</div>
                  <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {formatJson(entry.toolResult)}
                  </pre>
                </div>
              )}

              {entry.finalPayload !== undefined && (
                <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Final Payload</div>
                  <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {formatJson(entry.finalPayload)}
                  </pre>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

export default async function InternalAgentsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>
}) {
  const dataDir = path.join(process.cwd(), "data")
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const state = await readJsonFile<StateShape>(path.join(dataDir, "pricing-agent-state.json"), {})
  const log = await readJsonFile<LogEntry[]>(path.join(dataDir, "pricing-agent-log.json"), [])
  const dossierHistory = await readJsonFile<DossierEntry[]>(
    path.join(dataDir, "pricing-agent-dossiers.json"),
    []
  )
  const lastRun = await readJsonFile<DossierEntry | null>(
    path.join(dataDir, "pricing-agent-last-run.json"),
    null
  )

  const runs = dossierHistory.length > 0 ? dossierHistory : lastRun ? [lastRun] : []
  const latestLog = log[0]
  const logByRunId = new Map(
    log.map((entry) => [entry.runId ?? `log-${entry.runAt ?? "unknown"}`, entry])
  )
  const readiness = getLiveReadiness(state)
  const filters = {
    runId: normalizeParam(resolvedSearchParams.runId).trim(),
    status: normalizeParam(resolvedSearchParams.status).trim(),
    vendor: normalizeParam(resolvedSearchParams.vendor).trim(),
    agent: normalizeParam(resolvedSearchParams.agent).trim(),
  }
  const selectedAgent = filters.agent || "all"
  const statusOptions = [...new Set(runs.map((run, index) => {
    const runLog =
      (run.runId ? logByRunId.get(run.runId) : undefined) ??
      (index === 0 ? latestLog : undefined)
    return getRunStatus(run, runLog)
  }))].filter(Boolean)
  const vendorOptions = [...new Set(runs.flatMap((run) => collectVendorIdsFromRun(run)))].sort()

  const filteredRuns = runs.filter((run, index) => {
    const runLog =
      (run.runId ? logByRunId.get(run.runId) : undefined) ??
      (index === 0 ? latestLog : undefined)
    const runStatus = getRunStatus(run, runLog)
    const vendorIds = collectVendorIdsFromRun(run)

    if (filters.runId && !(run.runId ?? "").toLowerCase().includes(filters.runId.toLowerCase())) {
      return false
    }

    if (filters.status && runStatus !== filters.status) {
      return false
    }

    if (filters.vendor && !vendorIds.includes(filters.vendor)) {
      return false
    }

    if (selectedAgent !== "all" && !resolveAgentBlock(run, selectedAgent)) {
      return false
    }

    return true
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <header className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Volver a la comparativa
            </Link>
            <Link
              href="/internal/lab"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Runtime lab
            </Link>
            <Link
              href="/internal/truth"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver truth graph
            </Link>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Internal Agent Dossier
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
              Ejecuciones del sistema agéntico de pricing
            </h1>
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Vista interna del orquestador, con estado actual, histórico de ejecuciones y detalle agente por
              agente de cada dossier persistido.
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ultimo estado</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.lastRunStatus ?? "desconocido"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{state.lastRunSummary ?? "Sin resumen"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ultima ejecucion</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{formatDateTime(state.lastRunAt)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{state.protocolVersion ?? "Sin protocolo"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Provider</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.provider ?? "Sin provider"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{state.model ?? "Sin modelo"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Runs guardados</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{runs.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ultimo log: {latestLog?.status ?? "sin datos"}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Truth Graph</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {state.truthVerification?.lastRunStatus ?? "sin estado"}
              </div>
            </div>
            <Link
              href="/internal/truth"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Abrir claims verificados
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Claims</div>
              <div className="mt-1 text-foreground">{state.truthVerification?.totalClaims ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Atención</div>
              <div className="mt-1 text-foreground">{state.truthVerification?.needsAttention ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Updates publicables</div>
              <div className="mt-1 text-foreground">{state.truthVerification?.publishableUpdates ?? 0}</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Surface Graph</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {state.surfaceVerification?.lastRunStatus ?? "sin estado"}
              </div>
            </div>
            <Link
              href="/internal/surface"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Abrir naming y lineup
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Checks</div>
              <div className="mt-1 text-foreground">{state.surfaceVerification?.totalChecks ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Verificados</div>
              <div className="mt-1 text-foreground">{state.surfaceVerification?.verifiedChecks ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Review</div>
              <div className="mt-1 text-foreground">{state.surfaceVerification?.needsReview ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Unverifiable</div>
              <div className="mt-1 text-foreground">{state.surfaceVerification?.unverifiableChecks ?? 0}</div>
            </div>
          </div>
          {state.surfaceVerification?.lastRunSummary && (
            <div className="mt-3 rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
              {state.surfaceVerification.lastRunSummary}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Runtime Autopilot</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {state.runtimeAutopilot?.lastRunStatus ?? "sin estado"}
              </div>
            </div>
            <Link
              href="/internal/lab"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Abrir panel de observación
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Último ciclo</div>
              <div className="mt-1 text-foreground">{formatDateTime(state.runtimeAutopilot?.lastRunAt)}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Telemetría</div>
              <div className="mt-1 text-foreground">{state.runtimeAutopilot?.telemetrySources ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Overrides</div>
              <div className="mt-1 text-foreground">{state.runtimeAutopilot?.appliedAssumptionOverrides ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Lock manual</div>
              <div className="mt-1 text-foreground">
                {state.runtimeAutopilot?.autonomousMode && state.runtimeAutopilot?.manualEditsLocked ? "Activo" : "Inactivo"}
              </div>
            </div>
          </div>
          {state.runtimeAutopilot?.lastRunSummary && (
            <div className="mt-3 rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
              {state.runtimeAutopilot.lastRunSummary}
            </div>
          )}
        </section>

        <section className={`rounded-2xl border p-5 space-y-2 ${readiness.tone}`}>
          <div className="text-xs uppercase tracking-[0.2em]">Readiness live</div>
          <div className="text-lg font-semibold">{readiness.label}</div>
          <p className="text-sm leading-relaxed">{readiness.detail}</p>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Filtros</h2>
              <p className="text-xs text-muted-foreground">
                Filtra por `runId`, estado, vendor o agente para inspección rápida.
              </p>
            </div>
            <Link
              href="/internal/agents"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpiar filtros
            </Link>
          </div>

          <form className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Run ID</span>
              <input
                type="text"
                name="runId"
                defaultValue={filters.runId}
                placeholder="2026-04-23..."
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Estado</span>
              <select
                name="status"
                defaultValue={filters.status}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos</option>
                {statusOptions.map((statusOption) => (
                  <option key={statusOption} value={statusOption}>
                    {statusOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Vendor</span>
              <select
                name="vendor"
                defaultValue={filters.vendor}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos</option>
                {vendorOptions.map((vendorOption) => (
                  <option key={vendorOption} value={vendorOption}>
                    {vendorOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Agente</span>
              <select
                name="agent"
                defaultValue={selectedAgent === "all" ? "" : selectedAgent}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos</option>
                {AGENT_NAMES.map((agentName) => (
                  <option key={agentName} value={agentName}>
                    {agentName}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Aplicar filtros
              </button>
            </div>
          </form>

          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span className="rounded-full border border-border/60 px-3 py-1">
              runs visibles {filteredRuns.length}
            </span>
            {filters.runId && <span className="rounded-full border border-border/60 px-3 py-1">runId: {filters.runId}</span>}
            {filters.status && <span className="rounded-full border border-border/60 px-3 py-1">estado: {filters.status}</span>}
            {filters.vendor && <span className="rounded-full border border-border/60 px-3 py-1">vendor: {filters.vendor}</span>}
            {selectedAgent !== "all" && (
              <span className="rounded-full border border-border/60 px-3 py-1">agente: {selectedAgent}</span>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-foreground">Historial de dossiers</h2>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">
              {filteredRuns.length} de {runs.length} ejecuciones
            </span>
          </div>

          {runs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-8 text-sm text-muted-foreground">
              Todavia no hay dossiers persistidos para mostrar.
            </div>
          )}

          {runs.length > 0 && filteredRuns.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-8 text-sm text-muted-foreground">
              Ninguna ejecución coincide con los filtros actuales.
            </div>
          )}

          {filteredRuns.map((run, index) => {
            const originalIndex = runs.indexOf(run)
            const runLog =
              (run.runId ? logByRunId.get(run.runId) : undefined) ??
              (originalIndex === 0 ? latestLog : undefined)
            const approvedOperations = Array.isArray(run.approvedOperations) ? run.approvedOperations : []
            const appliedOperations = Array.isArray(run.appliedOperations) ? run.appliedOperations : []
            const strictRejections = Array.isArray(run.strictlyRejectedOperations)
              ? run.strictlyRejectedOperations
              : []
            const visibleAgentBlocks =
              selectedAgent === "all"
                ? AGENT_NAMES.map((agentName) => [agentName, resolveAgentBlock(run, agentName)] as const)
                : [[selectedAgent, resolveAgentBlock(run, selectedAgent)] as const]

            return (
              <details
                key={run.runId ?? `run-${index}`}
                open={index === 0}
                className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden"
              >
                <summary className="cursor-pointer list-none px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-foreground">
                      {run.runId ?? `Ejecucion ${index + 1}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(run.runAt)} · {run.provider ?? "sin provider"} · {run.model ?? "sin modelo"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(runLog?.status ?? "no_changes")}`}>
                      {runLog?.status ?? "sin estado"}
                    </span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                      aprobadas {approvedOperations.length}
                    </span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                      aplicadas {appliedOperations.length}
                    </span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                      rechazadas {strictRejections.length}
                    </span>
                  </div>
                </summary>

                <div className="border-t border-border/60 px-6 py-6 space-y-6">
                  {run.systemError && (
                    <section className="rounded-2xl border border-red-800/50 bg-red-950/20 p-5 space-y-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-red-300">System Error</div>
                      <div className="text-sm font-medium text-red-100">
                        La ejecución se interrumpió antes de que el orquestador pudiera completar el ciclo.
                      </div>
                      <div className="text-sm leading-relaxed text-red-200">{run.systemError}</div>
                    </section>
                  )}

                  <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Scout</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {Array.isArray(run.scout?.result?.candidates) ? run.scout?.result?.candidates.length : 0}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">candidatos</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Research</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {Array.isArray(run.research?.result?.evidenceBundles) ? run.research?.result?.evidenceBundles.length : 0}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">bundles de evidencia</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mapping</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {Array.isArray(run.mapping?.result?.operations) ? run.mapping?.result?.operations.length : 0}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">operaciones propuestas</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Audit</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {approvedOperations.length}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">operaciones aprobadas</div>
                    </div>
                  </section>

                  <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {visibleAgentBlocks.map(([label, agentBlock]) => renderAgentBlock(label, agentBlock))}
                  </section>

                  <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-foreground">Approved Operations</h3>
                        <span className="text-xs text-muted-foreground">{approvedOperations.length}</span>
                      </div>
                      <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                        {formatJson(approvedOperations)}
                      </pre>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-foreground">Applied Operations</h3>
                        <span className="text-xs text-muted-foreground">{appliedOperations.length}</span>
                      </div>
                      <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                        {formatJson(appliedOperations)}
                      </pre>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-foreground">Strict Rejections</h3>
                        <span className="text-xs text-muted-foreground">{strictRejections.length}</span>
                      </div>
                      <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                        {formatJson(strictRejections)}
                      </pre>
                    </div>
                  </section>
                </div>
              </details>
            )
          })}
        </section>
      </main>
    </div>
  )
}
