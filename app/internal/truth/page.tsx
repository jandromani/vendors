import fs from "node:fs/promises"
import path from "node:path"

import Link from "next/link"

export const dynamic = "force-dynamic"

type LooseRecord = Record<string, unknown>

interface TruthState extends LooseRecord {
  lastRunAt?: string | null
  lastRunStatus?: string | null
  lastRunSummary?: string | null
  provider?: string | null
  model?: string | null
  protocolVersion?: string | null
  totalClaims?: number
  publishableUpdates?: number
  appliedUpdates?: number
  needsAttention?: number
  verdictCounts?: Record<string, number>
}

interface SourceReference extends LooseRecord {
  sourceId?: string
  url?: string
  title?: string
  snippet?: string
  observedValue?: number | null
}

interface ClaimVerdict extends LooseRecord {
  claimId?: string
  verdict?: string
  currentValue?: number | null
  proposedValue?: number | null
  confidence?: number
  freshnessStatus?: string
  patchAllowed?: boolean
  reason?: string
  verifiedAt?: string
  usedSources?: SourceReference[]
}

interface JudgeRun extends LooseRecord {
  claimId?: string
  vendorId?: string
  targetType?: string
  targetName?: string
  field?: string
  currentValue?: number | null
  sourceIds?: string[]
  publishRule?: string
  autoPatch?: boolean
  evidenceBundle?: LooseRecord
  result?: ClaimVerdict | null
  trace?: LooseRecord[]
  mode?: string
}

interface TruthRun extends LooseRecord {
  runId?: string | null
  runAt?: string | null
  status?: string | null
  provider?: string | null
  model?: string | null
  protocolVersion?: string | null
  summary?: string | null
  needsAttention?: number
  verdictCounts?: Record<string, number>
  claimInventory?: {
    totalClaims?: number
    autoPatchClaims?: number
    manualOnlyClaims?: number
  }
  evidenceCollector?: {
    result?: {
      sourceHealth?: Array<LooseRecord>
    }
  }
  claimVerdicts?: ClaimVerdict[]
  judgeRuns?: JudgeRun[]
  publishableOperations?: LooseRecord[]
  blockedOperations?: LooseRecord[]
  appliedOperations?: LooseRecord[]
}

interface SearchParamsShape {
  runId?: string | string[]
  vendor?: string | string[]
  verdict?: string | string[]
  field?: string | string[]
  claim?: string | string[]
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
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
  if (status === "updated" || status === "verified" || status === "confirmed") {
    return "border-emerald-800/50 bg-emerald-950/20 text-emerald-300"
  }
  if (status === "needs_review" || status === "stale_review_needed") {
    return "border-amber-800/50 bg-amber-950/20 text-amber-300"
  }
  if (status === "conflict_hold" || status === "unverifiable" || status === "error") {
    return "border-red-800/50 bg-red-950/20 text-red-300"
  }
  return "border-border/60 bg-background/40 text-muted-foreground"
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "n/a"
  return String(value)
}

function getClaimLabel(run: JudgeRun) {
  return `${run.vendorId ?? "vendor"} · ${run.targetName ?? "target"} · ${run.field ?? "field"}`
}

export default async function InternalTruthPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>
}) {
  const dataDir = path.join(process.cwd(), "data")
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const state = await readJsonFile<TruthState>(path.join(dataDir, "pricing-truth-state.json"), {})
  const runHistory = await readJsonFile<TruthRun[]>(path.join(dataDir, "pricing-truth-runs.json"), [])
  const lastRun = await readJsonFile<TruthRun | null>(path.join(dataDir, "pricing-truth-last-run.json"), null)

  const runs = runHistory.length > 0 ? runHistory : lastRun ? [lastRun] : []
  const filters = {
    runId: normalizeParam(resolvedSearchParams.runId).trim(),
    vendor: normalizeParam(resolvedSearchParams.vendor).trim(),
    verdict: normalizeParam(resolvedSearchParams.verdict).trim(),
    field: normalizeParam(resolvedSearchParams.field).trim(),
    claim: normalizeParam(resolvedSearchParams.claim).trim(),
  }

  const vendorOptions = [...new Set(runs.flatMap((run) => (run.judgeRuns ?? []).map((item) => item.vendorId).filter(Boolean) as string[]))].sort()
  const verdictOptions = [...new Set(runs.flatMap((run) => (run.claimVerdicts ?? []).map((item) => item.verdict).filter(Boolean) as string[]))].sort()
  const fieldOptions = [...new Set(runs.flatMap((run) => (run.judgeRuns ?? []).map((item) => item.field).filter(Boolean) as string[]))].sort()

  const filteredRuns = runs.filter((run) => {
    if (filters.runId && !(run.runId ?? "").toLowerCase().includes(filters.runId.toLowerCase())) {
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
              href="/internal/agents"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver orquestador
            </Link>
            <Link
              href="/internal/lab"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Runtime lab
            </Link>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Internal Truth Graph
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
              Jueces por dato y verificación de verdad
            </h1>
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Esta vista enseña cómo el sistema convierte la web en claims verificables, resuelve fuentes oficiales,
              juzga cada dato y decide si puede autopublicarse o si debe quedarse bloqueado/revisado.
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Estado</div>
            <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(state.lastRunStatus ?? "never")}`}>
              {state.lastRunStatus ?? "never"}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{state.lastRunSummary ?? "Sin resumen"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Última verificación</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{formatDateTime(state.lastRunAt)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{state.protocolVersion ?? "Sin protocolo"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Provider</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.provider ?? "Sin provider"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{state.model ?? "Sin modelo"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Claims</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.totalClaims ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              publishable {state.publishableUpdates ?? 0} · applied {state.appliedUpdates ?? 0}
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Atención</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.needsAttention ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              confirmados {state.verdictCounts?.confirmed ?? 0} · conflictos {state.verdictCounts?.conflict_hold ?? 0}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Filtros</h2>
              <p className="text-xs text-muted-foreground">
                Filtra por run, vendor, verdict, campo o claim para inspección forense.
              </p>
            </div>
            <Link
              href="/internal/truth"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpiar filtros
            </Link>
          </div>

          <form className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Run ID</span>
              <input
                type="text"
                name="runId"
                defaultValue={filters.runId}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Vendor</span>
              <select
                name="vendor"
                defaultValue={filters.vendor}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos</option>
                {vendorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Verdict</span>
              <select
                name="verdict"
                defaultValue={filters.verdict}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos</option>
                {verdictOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Campo</span>
              <select
                name="field"
                defaultValue={filters.field}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos</option>
                {fieldOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Claim</span>
              <input
                type="text"
                name="claim"
                defaultValue={filters.claim}
                placeholder="chatgpt|model|gpt4o|inputPricePerMTok"
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <div className="md:col-span-6 flex justify-end">
              <button
                type="submit"
                className="rounded-xl border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Aplicar filtros
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-foreground">Historial del truth graph</h2>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">
              {filteredRuns.length} de {runs.length} ejecuciones
            </span>
          </div>

          {filteredRuns.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-8 text-sm text-muted-foreground">
              No hay ejecuciones de truth graph que coincidan con los filtros.
            </div>
          )}

          {filteredRuns.map((run, index) => {
            const filteredJudgeRuns = (run.judgeRuns ?? []).filter((judgeRun) => {
              if (filters.vendor && judgeRun.vendorId !== filters.vendor) return false
              if (filters.field && judgeRun.field !== filters.field) return false
              if (filters.claim && !(judgeRun.claimId ?? "").toLowerCase().includes(filters.claim.toLowerCase())) return false
              if (filters.verdict && judgeRun.result?.verdict !== filters.verdict) return false
              return true
            })

            const visibleVerdicts = filteredJudgeRuns.map((judgeRun) => judgeRun.result?.verdict).filter(Boolean) as string[]
            const runSourceHealth = run.evidenceCollector?.result?.sourceHealth ?? []
            const modeCounts = filteredJudgeRuns.reduce<Record<string, number>>((accumulator, judgeRun) => {
              const key = judgeRun.mode ?? "judge"
              accumulator[key] = (accumulator[key] ?? 0) + 1
              return accumulator
            }, {})

            return (
              <details
                key={run.runId ?? `truth-run-${index}`}
                open={index === 0}
                className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden"
              >
                <summary className="cursor-pointer list-none px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-foreground">
                      {run.runId ?? `Truth Run ${index + 1}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(run.runAt)} · {run.provider ?? "sin provider"} · {run.model ?? "sin modelo"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(run.status ?? "unknown")}`}>
                      {run.status ?? "unknown"}
                    </span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                      claims {run.claimInventory?.totalClaims ?? 0}
                    </span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                      visibles {filteredJudgeRuns.length}
                    </span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                      updates {run.publishableOperations?.length ?? 0}
                    </span>
                  </div>
                </summary>

                <div className="border-t border-border/60 px-6 py-6 space-y-6">
                  <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Resumen</div>
                      <div className="mt-2 text-sm text-foreground">{run.summary ?? "Sin resumen"}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Verdicts</div>
                      <div className="mt-2 text-sm text-foreground">
                        confirmed {run.verdictCounts?.confirmed ?? 0} · update {run.verdictCounts?.update_required ?? 0}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        stale {run.verdictCounts?.stale_review_needed ?? 0} · conflict {run.verdictCounts?.conflict_hold ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Publication Gate</div>
                      <div className="mt-2 text-sm text-foreground">
                        publishable {run.publishableOperations?.length ?? 0} · blocked {run.blockedOperations?.length ?? 0}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        applied {run.appliedOperations?.length ?? 0} · atención {run.needsAttention ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fuentes</div>
                      <div className="mt-2 text-sm text-foreground">
                        ok {runSourceHealth.filter((item) => item.status === "ok").length}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        error {runSourceHealth.filter((item) => item.status !== "ok").length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4 md:col-span-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Judge Modes</div>
                      <div className="mt-2 text-sm text-foreground">
                        deterministic {modeCounts.deterministic ?? 0} · judge {modeCounts.judge ?? 0} · fallback {modeCounts.fallback ?? 0}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        La capa de juez solo escala al modelo cuando el bundle es lo bastante estrecho; si no, cierra el claim de forma conservadora.
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/60 bg-background/20 p-5 space-y-3">
                    <h3 className="text-lg font-semibold text-foreground">Source Health</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {runSourceHealth.map((source, sourceIndex) => (
                        <div key={`${run.runId}-source-${sourceIndex}`} className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="text-sm font-medium text-foreground">{String(source.label ?? source.sourceId ?? "source")}</div>
                            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(String(source.status ?? "unknown"))}`}>
                              {String(source.status ?? "unknown")}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">{String(source.url ?? "")}</div>
                          {typeof source.error === "string" && source.error.length > 0 ? (
                            <div className="text-xs text-red-300">{source.error}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="text-lg font-semibold text-foreground">Claims</h3>
                      <div className="text-xs text-muted-foreground">
                        verdicts visibles: {visibleVerdicts.length}
                      </div>
                    </div>

                    {filteredJudgeRuns.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground">
                        Ningún claim de esta ejecución coincide con los filtros activos.
                      </div>
                    )}

                    {filteredJudgeRuns.map((judgeRun, judgeIndex) => (
                      <details
                        key={`${run.runId}-claim-${judgeRun.claimId ?? judgeIndex}`}
                        className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden"
                      >
                        <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-foreground">{getClaimLabel(judgeRun)}</div>
                            <div className="text-xs text-muted-foreground">
                              current {formatNumber(judgeRun.currentValue)} · proposed {formatNumber(judgeRun.result?.proposedValue)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(judgeRun.result?.verdict ?? "unknown")}`}>
                              {judgeRun.result?.verdict ?? "unknown"}
                            </span>
                            <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                              confidence {judgeRun.result?.confidence ?? 0}
                            </span>
                            <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                              {judgeRun.autoPatch ? "autoPatch" : "manual"}
                            </span>
                          </div>
                        </summary>

                        <div className="border-t border-border/60 px-5 py-5 space-y-5">
                          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reason</div>
                              <div className="mt-2 text-sm text-foreground">{judgeRun.result?.reason ?? "Sin reason"}</div>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Freshness</div>
                              <div className="mt-2 text-sm text-foreground">{judgeRun.result?.freshnessStatus ?? "unknown"}</div>
                              <div className="mt-1 text-xs text-muted-foreground">publishRule {String(judgeRun.publishRule ?? "n/a")}</div>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Verified At</div>
                              <div className="mt-2 text-sm text-foreground">{formatDateTime(judgeRun.result?.verifiedAt)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{judgeRun.mode ?? "judge"}</div>
                            </div>
                          </section>

                          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                              <h4 className="text-base font-semibold text-foreground">Used Sources</h4>
                              {(judgeRun.result?.usedSources ?? []).length === 0 && (
                                <div className="text-sm text-muted-foreground">Sin fuentes usadas.</div>
                              )}
                              {(judgeRun.result?.usedSources ?? []).map((source, sourceIndex) => (
                                <div key={`${judgeRun.claimId}-used-${sourceIndex}`} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
                                  <div className="text-sm font-medium text-foreground">{source.title ?? source.sourceId}</div>
                                  <div className="text-xs text-muted-foreground">{source.url}</div>
                                  <div className="text-xs text-foreground">{source.snippet}</div>
                                  <div className="text-[11px] text-muted-foreground">observed {formatNumber(source.observedValue)}</div>
                                </div>
                              ))}
                            </div>

                            <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                              <h4 className="text-base font-semibold text-foreground">Evidence Bundle</h4>
                              <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                                {formatJson(judgeRun.evidenceBundle)}
                              </pre>
                            </div>
                          </section>

                          <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                            <h4 className="text-base font-semibold text-foreground">Trace</h4>
                            <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                              {formatJson(judgeRun.trace)}
                            </pre>
                          </section>
                        </div>
                      </details>
                    ))}
                  </section>

                  <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-foreground">Publishable Operations</h3>
                        <span className="text-xs text-muted-foreground">{run.publishableOperations?.length ?? 0}</span>
                      </div>
                      <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                        {formatJson(run.publishableOperations ?? [])}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-foreground">Blocked Operations</h3>
                        <span className="text-xs text-muted-foreground">{run.blockedOperations?.length ?? 0}</span>
                      </div>
                      <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                        {formatJson(run.blockedOperations ?? [])}
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
