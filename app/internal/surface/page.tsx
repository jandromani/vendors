import fs from "node:fs/promises"
import path from "node:path"

import Link from "next/link"

export const dynamic = "force-dynamic"

type LooseRecord = Record<string, unknown>

interface SurfaceState extends LooseRecord {
  lastRunAt?: string | null
  lastRunStatus?: string | null
  lastRunSummary?: string | null
  protocolVersion?: string | null
  totalChecks?: number
  verifiedChecks?: number
  needsReview?: number
  unverifiableChecks?: number
}

interface SurfaceCheck extends LooseRecord {
  checkId?: string
  vendorId?: string
  kind?: string
  label?: string
  status?: string
  details?: LooseRecord
}

interface SurfaceRun extends LooseRecord {
  runId?: string | null
  runAt?: string | null
  status?: string | null
  protocolVersion?: string | null
  totalChecks?: number
  verifiedChecks?: number
  needsReview?: number
  unverifiableChecks?: number
  summary?: string | null
  checks?: SurfaceCheck[]
}

interface SearchParamsShape {
  runId?: string | string[]
  vendor?: string | string[]
  status?: string | string[]
  kind?: string | string[]
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
  if (status === "verified" || status === "ok" || status === "confirmed") {
    return "border-emerald-800/50 bg-emerald-950/20 text-emerald-300"
  }
  if (status === "needs_review" || status === "partial") {
    return "border-amber-800/50 bg-amber-950/20 text-amber-300"
  }
  if (status === "unverifiable" || status === "error") {
    return "border-red-800/50 bg-red-950/20 text-red-300"
  }
  return "border-border/60 bg-background/40 text-muted-foreground"
}

export default async function InternalSurfacePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>
}) {
  const dataDir = path.join(process.cwd(), "data")
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const state = await readJsonFile<SurfaceState>(path.join(dataDir, "pricing-surface-state.json"), {})
  const lastRun = await readJsonFile<SurfaceRun | null>(path.join(dataDir, "pricing-surface-last-run.json"), null)
  const runHistory = await readJsonFile<SurfaceRun[]>(path.join(dataDir, "pricing-surface-runs.json"), [])

  const runs = runHistory.length > 0 ? runHistory : lastRun ? [lastRun] : []
  const filters = {
    runId: normalizeParam(resolvedSearchParams.runId).trim(),
    vendor: normalizeParam(resolvedSearchParams.vendor).trim(),
    status: normalizeParam(resolvedSearchParams.status).trim(),
    kind: normalizeParam(resolvedSearchParams.kind).trim(),
  }

  const vendorOptions = [...new Set(runs.flatMap((run) => (run.checks ?? []).map((check) => check.vendorId).filter(Boolean) as string[]))].sort()
  const statusOptions = [...new Set(runs.flatMap((run) => (run.checks ?? []).map((check) => check.status).filter(Boolean) as string[]))].sort()
  const kindOptions = [...new Set(runs.flatMap((run) => (run.checks ?? []).map((check) => check.kind).filter(Boolean) as string[]))].sort()

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
              href="/internal/truth"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver truth graph
            </Link>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Internal Surface Graph
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
              Naming, lineup y copy crítica
            </h1>
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Esta vista enseña cómo el sistema valida que la web siga usando los nombres de plan correctos,
              el lineup vigente y la copy mínima que sí cambia decisiones de compra, migración o gobierno.
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
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Último ciclo</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{formatDateTime(state.lastRunAt)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{state.protocolVersion ?? "Sin protocolo"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Checks</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.totalChecks ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">verified {state.verifiedChecks ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Needs review</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.needsReview ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">drift o ambigüedad</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Unverifiable</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{state.unverifiableChecks ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">fuente inaccesible o sin señal</div>
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Filtros</h2>
              <p className="text-xs text-muted-foreground">
                Filtra por `runId`, vendor, estado del check o tipo de verificación.
              </p>
            </div>
            <Link
              href="/internal/surface"
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
                placeholder="2026-05-29..."
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
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
                {vendorOptions.map((vendorOption) => (
                  <option key={vendorOption} value={vendorOption}>
                    {vendorOption}
                  </option>
                ))}
              </select>
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
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Tipo</span>
              <select
                name="kind"
                defaultValue={filters.kind}
                className="w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos</option>
                {kindOptions.map((kindOption) => (
                  <option key={kindOption} value={kindOption}>
                    {kindOption}
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
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-foreground">Runs del surface graph</h2>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">
              {filteredRuns.length} de {runs.length} ejecuciones
            </span>
          </div>

          {filteredRuns.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-8 text-sm text-muted-foreground">
              Ninguna ejecución coincide con los filtros actuales.
            </div>
          )}

          {filteredRuns.map((run) => {
            const checks = (run.checks ?? []).filter((check) => {
              if (filters.vendor && check.vendorId !== filters.vendor) return false
              if (filters.status && check.status !== filters.status) return false
              if (filters.kind && check.kind !== filters.kind) return false
              return true
            })

            return (
              <section key={run.runId ?? run.runAt ?? Math.random()} className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Run</div>
                    <div className="text-lg font-semibold text-foreground">{run.runId ?? "Sin runId"}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(run.runAt)}</div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(run.status ?? "unknown")}`}>
                    {run.status ?? "unknown"}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Checks</div>
                    <div className="mt-1 text-foreground">{run.totalChecks ?? 0}</div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Verified</div>
                    <div className="mt-1 text-foreground">{run.verifiedChecks ?? 0}</div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Needs review</div>
                    <div className="mt-1 text-foreground">{run.needsReview ?? 0}</div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Unverifiable</div>
                    <div className="mt-1 text-foreground">{run.unverifiableChecks ?? 0}</div>
                  </div>
                </div>

                {run.summary && (
                  <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
                    {run.summary}
                  </div>
                )}

                <div className="space-y-3">
                  {checks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
                      Ningún check visible con los filtros actuales.
                    </div>
                  )}

                  {checks.map((check) => (
                    <details key={check.checkId ?? `${check.vendorId}-${check.label}`} className="rounded-xl border border-border/60 bg-background/30">
                      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground">{check.label ?? check.checkId}</div>
                          <div className="text-xs text-muted-foreground">
                            {check.vendorId ?? "vendor"} · {check.kind ?? "kind"}
                          </div>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(check.status ?? "unknown")}`}>
                          {check.status ?? "unknown"}
                        </span>
                      </summary>
                      <div className="border-t border-border/50 px-4 py-4 space-y-3">
                        <pre className="overflow-x-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                          {formatJson(check.details ?? {})}
                        </pre>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )
          })}
        </section>
      </main>
    </div>
  )
}
