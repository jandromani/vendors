"use client"

import { useMemo, useState } from "react"

import {
  pricingAssumptionsVersion,
  pricingFormulas,
  pricingFormulasVersion,
  routingRules,
  scenarios,
  type AssumptionOverrideRecord,
  type AssumptionRecord,
  type ProvenanceLegendItem,
  type RoleProfile,
  type TelemetryRegistry,
  type TelemetrySource,
  type UseCaseProfile,
  type Vendor,
} from "@/lib/vendor-data"
import {
  buildMethodologySummary,
  calcRoleCostBreakdown,
  calcUseCaseCostBreakdown,
  resolveRoutingRecommendation,
  type PricingRuntimeDataset,
} from "@/lib/pricing-math"
import {
  mergeAssumptionsWithRuntimeSignals,
  mergeTelemetryIntoRoleProfiles,
  mergeTelemetryIntoWorkloads,
  summarizeTelemetryCoverage,
} from "@/lib/pricing-runtime-merge"
import { cn } from "@/lib/utils"
import { ProvenanceBadge } from "@/components/provenance-badge"
import {
  Activity,
  BarChart3,
  DatabaseZap,
  Gauge,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"

export interface AssumptionOverridesRegistry {
  version?: string
  updatedAt?: string | null
  updatedBy?: string | null
  overrides?: AssumptionOverrideRecord[]
}

export interface BaseAssumptionsRegistry {
  version: string
  provenanceLegend: ProvenanceLegendItem[]
  assumptions: AssumptionRecord[]
}

interface PricingControlLabProps {
  vendors: Vendor[]
  baseAssumptions: BaseAssumptionsRegistry
  baseWorkloads: UseCaseProfile[]
  baseRoles: RoleProfile[]
  initialOverrides: AssumptionOverridesRegistry
  initialTelemetry: TelemetryRegistry
  governance: {
    autonomousMode?: boolean
    manualEditsLocked?: boolean
    protocolVersion?: string | null
  }
  runtimeState: {
    lastRunAt?: string | null
    lastRunStatus?: string | null
    lastRunSummary?: string | null
    telemetrySources?: number
    appliedAssumptionOverrides?: number
    sourceHealth?: Array<Record<string, unknown>>
  }
}

interface OverrideDraft {
  value: number
  pinned: boolean
  reason: string
}

const vendorColors: Record<string, string> = {
  claude: "text-orange-400",
  chatgpt: "text-emerald-400",
  gemini: "text-blue-400",
}

function fmtUsd(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(3)}`
}

function fmtShare(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a"
  return `${(value * 100).toFixed(0)}%`
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildDefaultTelemetrySource(index: number, roleId: string, useCaseId: string): TelemetrySource {
  const now = new Date().toISOString()
  return {
    id: `telemetry-draft-${index}`,
    label: "Nueva fuente medida",
    status: "draft",
    roleProfileId: roleId,
    useCaseId,
    sampleWindowDays: 14,
    sampleSizeRequests: 10000,
    sampleSizeUsers: 10,
    avgInputTokens: 500,
    avgOutputTokens: 500,
    overheadMultiplier: 1.1,
    avgRequestsPerUserPerDay: 25,
    cacheHitRate: 0.4,
    batchHitRate: 0.05,
    confidence: 0.75,
    sourceLabel: "Manual draft",
    recordedAt: now,
    notes: "",
  }
}

export function PricingControlLab({
  vendors,
  baseAssumptions,
  baseWorkloads,
  baseRoles,
  initialOverrides,
  initialTelemetry,
  governance,
  runtimeState,
}: PricingControlLabProps) {
  const readOnly = Boolean(governance.autonomousMode && governance.manualEditsLocked)
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, OverrideDraft>>(() => {
    const entries = initialOverrides.overrides ?? []
    return Object.fromEntries(entries.map((item) => [item.id, {
      value: item.value,
      pinned: true,
      reason: item.reason ?? "",
    }]))
  })
  const [telemetrySources, setTelemetrySources] = useState<TelemetrySource[]>(initialTelemetry.sources)
  const [selectedRoleId, setSelectedRoleId] = useState(baseRoles[0]?.id ?? "knowledge_worker")
  const [selectedUseCaseId, setSelectedUseCaseId] = useState(baseWorkloads[0]?.id ?? "chat")
  const [routingComplexity, setRoutingComplexity] = useState(3)
  const [routingCostSensitivity, setRoutingCostSensitivity] = useState<"high" | "medium" | "low">("medium")
  const [routingDailyRequests, setRoutingDailyRequests] = useState(10000)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<{ ok: boolean; message: string } | null>(null)

  const draftOverrides = useMemo(() => {
    return Object.entries(overrideDrafts)
      .filter(([, draft]) => draft.pinned)
      .map(([id, draft]) => ({
        id,
        value: draft.value,
        reason: draft.reason || null,
      }))
  }, [overrideDrafts])

  const mergedAssumptions = useMemo(() => {
    return mergeAssumptionsWithRuntimeSignals(
      baseAssumptions.assumptions,
      { overrides: draftOverrides },
      { ...initialTelemetry, sources: telemetrySources }
    ) as AssumptionRecord[]
  }, [baseAssumptions.assumptions, draftOverrides, initialTelemetry, telemetrySources])

  const mergedUseCases = useMemo(() => {
    return mergeTelemetryIntoWorkloads(
      baseWorkloads,
      { ...initialTelemetry, sources: telemetrySources }
    ) as UseCaseProfile[]
  }, [baseWorkloads, initialTelemetry, telemetrySources])

  const mergedRoles = useMemo(() => {
    return mergeTelemetryIntoRoleProfiles(
      baseRoles,
      { ...initialTelemetry, sources: telemetrySources }
    ) as RoleProfile[]
  }, [baseRoles, initialTelemetry, telemetrySources])

  const runtimeDataset = useMemo<PricingRuntimeDataset>(() => ({
    vendors,
    useCases: mergedUseCases,
    roleProfiles: mergedRoles,
    routingRules,
    scenarios,
    pricingAssumptions: mergedAssumptions,
    pricingFormulas,
    pricingFormulasVersion,
    pricingAssumptionsVersion,
  }), [mergedAssumptions, mergedRoles, mergedUseCases, vendors])

  const telemetrySummary = useMemo(() => {
    return summarizeTelemetryCoverage(
      mergedUseCases,
      mergedRoles,
      { ...initialTelemetry, sources: telemetrySources }
    )
  }, [initialTelemetry, mergedRoles, mergedUseCases, telemetrySources])

  const methodologySummary = useMemo(() => buildMethodologySummary(runtimeDataset), [runtimeDataset])

  const roleResults = useMemo(() => {
    return vendors.map((vendor) => calcRoleCostBreakdown(selectedRoleId, vendor, {
      dataset: runtimeDataset,
    }))
  }, [runtimeDataset, selectedRoleId, vendors])

  const useCaseResults = useMemo(() => {
    return vendors.map((vendor) => ({
      vendor,
      breakdown: calcUseCaseCostBreakdown(selectedUseCaseId, vendor, "balanced", {
        dataset: runtimeDataset,
      }),
    }))
  }, [runtimeDataset, selectedUseCaseId, vendors])

  const routingResult = useMemo(() => {
    return resolveRoutingRecommendation({
      useCaseId: selectedUseCaseId,
      complexity: routingComplexity,
      costSensitivity: routingCostSensitivity,
      dailyRequests: routingDailyRequests,
    }, runtimeDataset)
  }, [routingComplexity, routingCostSensitivity, routingDailyRequests, runtimeDataset, selectedUseCaseId])

  const selectedRole = mergedRoles.find((role) => role.id === selectedRoleId) ?? mergedRoles[0]
  const selectedUseCase = mergedUseCases.find((useCase) => useCase.id === selectedUseCaseId) ?? mergedUseCases[0]
  const teamScenario = useMemo(() => {
    if (!selectedRole || !selectedUseCase) return null
    return {
      dailyInputTokens: Math.round(selectedRole.defaultTeamSize * selectedRole.dailyRequestsPerUser * selectedUseCase.avgInputTokens),
      dailyOutputTokens: Math.round(selectedRole.defaultTeamSize * selectedRole.dailyRequestsPerUser * selectedUseCase.avgOutputTokens),
    }
  }, [selectedRole, selectedUseCase])

  async function handleSave() {
    if (readOnly) {
      setSaveState({
        ok: false,
        message: "La edición manual está bloqueada. El runtime autopilot es el único dueño de assumptions y telemetría.",
      })
      return
    }

    setSaving(true)
    setSaveState(null)
    try {
      const response = await fetch("/api/internal/pricing-runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assumptionOverrides: draftOverrides,
          telemetrySources,
          updatedBy: "internal-lab",
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      setSaveState({
        ok: true,
        message: `Guardado local completado · ${result.overridesCount} overrides · ${result.telemetryCount} fuentes`,
      })
    } catch (error) {
      setSaveState({
        ok: false,
        message: `No pude guardar los cambios: ${error instanceof Error ? error.message : "error desconocido"}`,
      })
    } finally {
      setSaving(false)
    }
  }

  function updateOverrideValue(assumptionId: string, value: number) {
    if (readOnly) return
    setOverrideDrafts((current) => ({
      ...current,
      [assumptionId]: {
        value,
        pinned: true,
        reason: current[assumptionId]?.reason ?? "",
      },
    }))
  }

  function updateOverrideReason(assumptionId: string, reason: string) {
    if (readOnly) return
    setOverrideDrafts((current) => ({
      ...current,
      [assumptionId]: {
        value: current[assumptionId]?.value ?? mergedAssumptions.find((item) => item.id === assumptionId)?.value ?? 0,
        pinned: true,
        reason,
      },
    }))
  }

  function resetOverride(assumptionId: string) {
    if (readOnly) return
    setOverrideDrafts((current) => {
      const next = { ...current }
      delete next[assumptionId]
      return next
    })
  }

  function updateTelemetrySource(index: number, field: keyof TelemetrySource, value: string | number) {
    if (readOnly) return
    setTelemetrySources((current) => current.map((source, sourceIndex) => {
      if (sourceIndex !== index) return source
      return {
        ...source,
        [field]: value,
      }
    }))
  }

  function removeTelemetrySource(index: number) {
    if (readOnly) return
    setTelemetrySources((current) => current.filter((_, sourceIndex) => sourceIndex !== index))
  }

  function addTelemetrySource() {
    if (readOnly) return
    setTelemetrySources((current) => [
      ...current,
      buildDefaultTelemetrySource(current.length + 1, selectedRoleId, selectedUseCaseId),
    ])
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <DatabaseZap className="w-4 h-4 text-muted-foreground" />
            Señales medidas
          </div>
          <div className="mt-3 text-3xl font-bold text-foreground">{telemetrySummary.activeSources}</div>
          <div className="mt-1 text-xs text-muted-foreground">fuentes activas de telemetría</div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            Workloads medidos
          </div>
          <div className="mt-3 text-3xl font-bold text-foreground">{telemetrySummary.measuredWorkloads}</div>
          <div className="mt-1 text-xs text-muted-foreground">perfiles con datos observados</div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Requests observados
          </div>
          <div className="mt-3 text-3xl font-bold text-foreground">{telemetrySummary.totalObservedRequests.toLocaleString("es-ES")}</div>
          <div className="mt-1 text-xs text-muted-foreground">en la muestra activa</div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            Overrides activos
          </div>
          <div className="mt-3 text-3xl font-bold text-foreground">{draftOverrides.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">assumptions fijados manualmente</div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Control Lab</div>
            <h2 className="text-2xl font-bold text-foreground">Editar assumptions y recalcular sin tocar claims</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Esta consola separa claramente las dos capas editables del sistema: los assumptions operativos y la
              telemetría real. Todo lo demás sigue viniendo de claims verificados, fórmulas versionadas y un catálogo
              cerrado de vendors, roles y workloads.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (readOnly) return
                setOverrideDrafts(Object.fromEntries((initialOverrides.overrides ?? []).map((item) => [item.id, {
                  value: item.value,
                  pinned: true,
                  reason: item.reason ?? "",
                }])))
                setTelemetrySources(initialTelemetry.sources)
                setSaveState(null)
              }}
              disabled={readOnly}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reset draft
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || readOnly}
              className="inline-flex items-center gap-2 rounded-xl border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? "Guardando..." : "Guardar en JSON"}
            </button>
          </div>
        </div>

        {saveState && (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              saveState.ok
                ? "border-emerald-800/50 bg-emerald-950/20 text-emerald-200"
                : "border-red-800/50 bg-red-950/20 text-red-200"
            )}
          >
            {saveState.message}
          </div>
        )}

        {readOnly && (
          <div className="rounded-xl border border-cyan-800/50 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
            El modo autónomo está activo. La edición manual está bloqueada y esta consola funciona como panel de observación del runtime autopilot.
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Assumptions registry</h3>
              <p className="text-xs text-muted-foreground">Cada valor se puede fijar con override o dejar que lo gobierne la base/telemetría.</p>
            </div>
            <div className="text-xs text-muted-foreground">{baseAssumptions.version}</div>
          </div>
          <div className="space-y-4">
            {baseAssumptions.assumptions.map((assumption) => {
              const runtimeAssumption = mergedAssumptions.find((item) => item.id === assumption.id) ?? assumption
              const draft = overrideDrafts[assumption.id]
              const activeValue = draft?.pinned ? draft.value : runtimeAssumption.value
              const isPinned = Boolean(draft?.pinned)
              return (
                <div key={assumption.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{assumption.label}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{assumption.id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProvenanceBadge kind={runtimeAssumption.provenance} />
                      {isPinned && <ProvenanceBadge kind="editorial" label="Override" />}
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{runtimeAssumption.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Valor activo</label>
                      <input
                        type="number"
                        step="any"
                        value={activeValue}
                        onChange={(event) => updateOverrideValue(assumption.id, toNumber(event.target.value, runtimeAssumption.value))}
                        disabled={readOnly}
                        className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Motivo del override</label>
                      <input
                        type="text"
                        value={draft?.reason ?? ""}
                        onChange={(event) => updateOverrideReason(assumption.id, event.target.value)}
                        placeholder="Ej: ajustar con datos del piloto"
                        disabled={readOnly}
                        className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => resetOverride(assumption.id)}
                        disabled={readOnly}
                        className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Base: <span className="font-mono text-foreground">{assumption.value} {assumption.unit}</span>
                    {" · "}
                    Runtime: <span className="font-mono text-foreground">{runtimeAssumption.value} {assumption.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Metodología activa</h3>
              <p className="text-xs text-muted-foreground">Resumen del dataset draft que se está usando para recalcular.</p>
            </div>
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Formulas</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{methodologySummary.formulasCount}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Assumptions</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{methodologySummary.assumptionsCount}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Workloads</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{methodologySummary.workloadsCount}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-muted-foreground">Roles</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{methodologySummary.roleProfilesCount}</div>
            </div>
          </div>

          <div className="space-y-3">
            {baseAssumptions.provenanceLegend.map((item) => (
              <div key={item.kind} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-1.5">
                <ProvenanceBadge kind={item.kind} />
                <div className="text-sm text-foreground">{item.label}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
            Último ciclo runtime: <span className="text-foreground">{runtimeState.lastRunStatus ?? "never"}</span>
            {" · "}
            telemetría {runtimeState.telemetrySources ?? 0}
            {" · "}
            overrides {runtimeState.appliedAssumptionOverrides ?? 0}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Telemetría real de uso</h3>
            <p className="text-xs text-muted-foreground">Estas fuentes recalibran workloads y requests por puesto cuando están activas.</p>
          </div>
          <button
            type="button"
            onClick={addTelemetrySource}
            disabled={readOnly}
            className="rounded-xl border border-border/60 bg-background/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Añadir fuente
          </button>
        </div>

        <div className="space-y-4">
          {telemetrySources.map((source, index) => (
            <div key={source.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-foreground">{source.label}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">{source.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <ProvenanceBadge kind={source.status === "active" ? "measured" : "editorial"} label={source.status} />
                  <button
                    type="button"
                    onClick={() => removeTelemetrySource(index)}
                    disabled={readOnly}
                    className="rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Label</label>
                  <input
                    type="text"
                    value={source.label}
                    onChange={(event) => updateTelemetrySource(index, "label", event.target.value)}
                    disabled={readOnly}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Use case</label>
                  <select
                    value={source.useCaseId ?? ""}
                    onChange={(event) => updateTelemetrySource(index, "useCaseId", event.target.value)}
                    disabled={readOnly}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground"
                  >
                    {baseWorkloads.map((workload) => (
                      <option key={workload.id} value={workload.id}>{workload.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Role</label>
                  <select
                    value={source.roleProfileId ?? ""}
                    onChange={(event) => updateTelemetrySource(index, "roleProfileId", event.target.value)}
                    disabled={readOnly}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground"
                  >
                    {baseRoles.map((role) => (
                      <option key={role.id} value={role.id}>{role.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ["sampleSizeRequests", "Requests", source.sampleSizeRequests ?? 0],
                  ["sampleSizeUsers", "Usuarios", source.sampleSizeUsers ?? 0],
                  ["avgInputTokens", "Avg input", source.avgInputTokens ?? 0],
                  ["avgOutputTokens", "Avg output", source.avgOutputTokens ?? 0],
                  ["avgRequestsPerUserPerDay", "Req/usr/dia", source.avgRequestsPerUserPerDay ?? 0],
                  ["overheadMultiplier", "Overhead", source.overheadMultiplier ?? 0],
                  ["cacheHitRate", "Cache hit", source.cacheHitRate ?? 0],
                  ["batchHitRate", "Batch hit", source.batchHitRate ?? 0],
                  ["confidence", "Confianza", source.confidence ?? 0],
                  ["sampleWindowDays", "Ventana", source.sampleWindowDays ?? 0],
                ].map(([field, label, value]) => (
                  <div key={field}>
                    <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</label>
                    <input
                      type="number"
                      step="any"
                      value={value}
                      onChange={(event) => updateTelemetrySource(index, field as keyof TelemetrySource, toNumber(event.target.value))}
                      disabled={readOnly}
                      className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Estado</label>
                  <select
                    value={source.status}
                    onChange={(event) => updateTelemetrySource(index, "status", event.target.value as TelemetrySource["status"])}
                    disabled={readOnly}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground"
                  >
                    <option value="active">active</option>
                    <option value="draft">draft</option>
                    <option value="disabled">disabled</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Origen</label>
                  <input
                    type="text"
                    value={source.sourceLabel ?? ""}
                    onChange={(event) => updateTelemetrySource(index, "sourceLabel", event.target.value)}
                    disabled={readOnly}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Impacto instantáneo del draft</h3>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-base font-semibold text-foreground">Coste por puesto</h4>
                <p className="text-xs text-muted-foreground">Recalculo usando roles y workloads ya calibrados con telemetría.</p>
              </div>
              <select
                value={selectedRoleId}
                onChange={(event) => setSelectedRoleId(event.target.value)}
                className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
              >
                {mergedRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {roleResults.map((result) => (
                <div key={result.vendor.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
                  <div className={cn("text-sm font-semibold", vendorColors[result.vendor.id])}>{result.vendor.name}</div>
                  <div className="text-2xl font-bold font-mono text-foreground">{fmtUsd(result.monthlyTotal)}</div>
                  <div className="text-xs text-muted-foreground">
                    {result.role.dailyRequestsPerUser.toLocaleString("es-ES")} req/usr/dia · {result.role.primaryUseCaseId}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ProvenanceBadge kind={result.provenance} />
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {result.formula.formulaId}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-base font-semibold text-foreground">Escenario derivado del equipo</h4>
                <p className="text-xs text-muted-foreground">Traduce el puesto seleccionado a tokens diarios agregados.</p>
              </div>
              <ProvenanceBadge kind="derived" />
            </div>

            {selectedRole && selectedUseCase && teamScenario && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-muted-foreground">Input tokens / dia</div>
                  <div className="mt-1 font-mono text-foreground">{teamScenario.dailyInputTokens.toLocaleString("es-ES")}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-muted-foreground">Output tokens / dia</div>
                  <div className="mt-1 font-mono text-foreground">{teamScenario.dailyOutputTokens.toLocaleString("es-ES")}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-muted-foreground">Workload</div>
                  <div className="mt-1 text-foreground">{selectedUseCase.label}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-muted-foreground">Procedencia</div>
                  <div className="mt-1 flex gap-2">
                    <ProvenanceBadge kind={selectedUseCase.provenance.avgInputTokens} label="tokens" />
                    <ProvenanceBadge kind={selectedRole.provenance.dailyRequestsPerUser} label="req" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-base font-semibold text-foreground">Coste por caso de uso</h4>
                <p className="text-xs text-muted-foreground">Tier equilibrado con assumptions y telemetría del draft.</p>
              </div>
              <select
                value={selectedUseCaseId}
                onChange={(event) => setSelectedUseCaseId(event.target.value)}
                className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
              >
                {mergedUseCases.map((useCase) => (
                  <option key={useCase.id} value={useCase.id}>{useCase.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {useCaseResults.map(({ vendor, breakdown }) => (
                <div key={vendor.id} className="rounded-xl border border-border/60 bg-background/40 p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className={cn("text-sm font-semibold", vendorColors[vendor.id])}>{vendor.name}</div>
                    <div className="text-xs text-muted-foreground">
                      input {selectedUseCase.avgInputTokens.toLocaleString("es-ES")} · output {selectedUseCase.avgOutputTokens.toLocaleString("es-ES")} · overhead x{selectedUseCase.overheadMultiplier}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold font-mono text-foreground">{fmtUsd(breakdown.costPer1K)}</div>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <ProvenanceBadge kind={breakdown.provenance} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-base font-semibold text-foreground">Routing recomendado</h4>
                <p className="text-xs text-muted-foreground">La política sigue siendo editorial, pero el coste downstream sí se recalibra.</p>
              </div>
              <ProvenanceBadge kind={routingResult.provenance} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Complejidad</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={routingComplexity}
                  onChange={(event) => setRoutingComplexity(Math.min(5, Math.max(1, toNumber(event.target.value, 3))))}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm font-mono text-foreground"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Coste</label>
                <select
                  value={routingCostSensitivity}
                  onChange={(event) => setRoutingCostSensitivity(event.target.value as "high" | "medium" | "low")}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Req/dia</label>
                <input
                  type="number"
                  value={routingDailyRequests}
                  onChange={(event) => setRoutingDailyRequests(toNumber(event.target.value, 10000))}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm font-mono text-foreground"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
              <div className={cn("text-sm font-semibold", vendorColors[routingResult.vendor.id])}>
                {routingResult.vendor.name} · {routingResult.model.name}
              </div>
              <div className="text-sm text-foreground">{routingResult.rule.reason}</div>
              <div className="text-xs text-muted-foreground">
                matched rules: {routingResult.matchedRules.length} · top score {routingResult.matchedRules[0]?.score ?? 0}
              </div>
            </div>

            <div className="space-y-2">
              {routingResult.matchedRules.slice(0, 3).map((match, index) => (
                <div key={`${match.rule.vendorId}-${index}`} className="rounded-lg border border-border/60 bg-background/30 p-3">
                  <div className="text-xs font-semibold text-foreground">
                    {index + 1}. {match.rule.vendorId} · {match.rule.modelTier}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    score {match.score} · {match.rule.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Señales medidas activas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {telemetrySources.filter((source) => source.status === "active").map((source) => (
            <div key={source.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{source.label}</div>
                <ProvenanceBadge kind="measured" />
              </div>
              <div className="text-xs text-muted-foreground">
                {source.useCaseId} · {source.roleProfileId}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-card/30 p-2">
                  <div className="text-muted-foreground">Req</div>
                  <div className="font-mono text-foreground">{source.sampleSizeRequests?.toLocaleString("es-ES") ?? "n/a"}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/30 p-2">
                  <div className="text-muted-foreground">Confianza</div>
                  <div className="font-mono text-foreground">{fmtShare(source.confidence)}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/30 p-2">
                  <div className="text-muted-foreground">Cache</div>
                  <div className="font-mono text-foreground">{fmtShare(source.cacheHitRate)}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/30 p-2">
                  <div className="text-muted-foreground">Batch</div>
                  <div className="font-mono text-foreground">{fmtShare(source.batchHitRate)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {Array.isArray(runtimeState.sourceHealth) && runtimeState.sourceHealth.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card/50 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Salud de ingesta</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {runtimeState.sourceHealth.map((entry, index) => {
              const status = typeof entry.status === "string" ? entry.status : "unknown"
              return (
                <div key={`${String(entry.sourceId ?? index)}`} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">{String(entry.label ?? entry.sourceId ?? `source-${index}`)}</div>
                    <ProvenanceBadge kind={status === "ok" ? "measured" : status === "disabled" ? "editorial" : "estimated"} label={status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    rows {String(entry.rowCount ?? 0)} · connector {String(entry.connectorType ?? "n/a")}
                  </div>
                  {typeof entry.error === "string" && entry.error.length > 0 && (
                    <div className="text-xs text-red-300">{entry.error}</div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
