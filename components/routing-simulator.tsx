"use client"

import { useCallback, useMemo, useState } from "react"
import { useCases, vendors, type ModelTier } from "@/lib/vendor-data"
import {
  calcDegradationCostBreakdown,
  calcUseCaseCostBreakdown,
  resolveRoutingRecommendation,
} from "@/lib/pricing-math"
import { cn } from "@/lib/utils"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Layers,
  Shield,
  TrendingDown,
  Zap,
} from "lucide-react"
import { ProvenanceBadge } from "@/components/provenance-badge"

const vendorColors: Record<string, string> = {
  claude: "text-orange-400",
  chatgpt: "text-emerald-400",
  gemini: "text-blue-400",
}
const vendorBorder: Record<string, string> = {
  claude: "border-orange-700",
  chatgpt: "border-emerald-700",
  gemini: "border-blue-700",
}
const vendorBg: Record<string, string> = {
  claude: "bg-orange-950/40",
  chatgpt: "bg-emerald-950/40",
  gemini: "bg-blue-950/40",
}
const vendorBar: Record<string, string> = {
  claude: "bg-orange-500",
  chatgpt: "bg-emerald-500",
  gemini: "bg-blue-500",
}
const vendorBadge: Record<string, string> = {
  claude: "bg-orange-900/60 text-orange-300 border border-orange-700/50",
  chatgpt: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50",
  gemini: "bg-blue-900/60 text-blue-300 border border-blue-700/50",
}

const TIERS: Record<ModelTier, string> = {
  fast: "Rapido",
  balanced: "Equilibrado",
  premium: "Premium",
}

const COMPLEXITY_LABELS = ["", "Muy simple", "Simple", "Medio", "Complejo", "Muy complejo"]
const VOLUME_PRESETS = [100, 1_000, 10_000, 100_000, 1_000_000]

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(3)}`
}

function fmtReq(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}

export function RoutingSimulator() {
  const [useCase, setUseCase] = useState("coding")
  const [complexity, setComplexity] = useState(3)
  const [costSensitivity, setCostSensitivity] = useState<"high" | "medium" | "low">("medium")
  const [dailyRequests, setDailyRequests] = useState(10_000)
  const [rawInput, setRawInput] = useState("10000")
  const [dataSensitivity, setDataSensitivity] = useState<"public" | "internal" | "confidential">("internal")
  const [withBatch, setWithBatch] = useState(false)
  const [withCache, setWithCache] = useState(false)
  const [degradation, setDegradation] = useState(false)
  const [showJson, setShowJson] = useState(false)

  const handleRawInput = useCallback((value: string) => {
    setRawInput(value)
    const parsed = parseInt(value.replace(/[^0-9]/g, ""), 10)
    if (!isNaN(parsed) && parsed > 0) setDailyRequests(parsed)
  }, [])

  const handlePreset = useCallback((value: number) => {
    setDailyRequests(value)
    setRawInput(String(value))
  }, [])

  const result = useMemo(() => {
    const decision = resolveRoutingRecommendation({
      useCaseId: useCase,
      complexity,
      costSensitivity,
      dailyRequests,
    })

    const monthly1K = (dailyRequests * 22) / 1000

    const compCosts = vendors.map((vendor) => ({
      vendor,
      breakdown: calcUseCaseCostBreakdown(decision.useCase, vendor, decision.rule.modelTier, {
        withBatch,
        withCache,
      }),
    }))

    const maxPerK = Math.max(...compCosts.map((item) => item.breakdown.costPer1K))
    const recPerK = compCosts.find((item) => item.vendor.id === decision.vendor.id)?.breakdown.costPer1K ?? 0
    const recMonthly = recPerK * monthly1K

    const tierCosts = (["fast", "balanced", "premium"] as ModelTier[]).map((tier) => {
      const breakdown = calcUseCaseCostBreakdown(decision.useCase, decision.vendor, tier, {
        withBatch,
        withCache,
      })
      return {
        tier,
        label: TIERS[tier],
        breakdown,
        perK: breakdown.costPer1K,
        monthly: breakdown.costPer1K * monthly1K,
      }
    })

    const degradResults = vendors.map((vendor) => ({
      vendor,
      breakdown: calcDegradationCostBreakdown(vendor, dailyRequests, 22, decision.useCase, {
        withBatch,
        withCache,
      }),
    }))

    const cheapestDeg = Math.min(...degradResults.map((item) => item.breakdown.total))
    const allSameMonthly = recPerK * monthly1K
    const savingPct =
      allSameMonthly > 0 ? Math.max(0, ((allSameMonthly - cheapestDeg) / allSameMonthly) * 100) : 0

    type Flag = { label: string; level: "warn" | "ok" | "info" }
    const flags: Flag[] = []
    if (dataSensitivity === "confidential") {
      flags.push({ label: "Datos confidenciales: requiere VPC, Enterprise o gobierno fuerte.", level: "warn" })
    }
    if (dailyRequests > 5_000 && costSensitivity === "high") {
      flags.push({ label: "Alto volumen y coste crítico: Batch API debería estar activado.", level: "warn" })
    }
    if (useCase === "agent" && complexity >= 4) {
      flags.push({ label: "Los agentes complejos arrastran overhead alto y más varianza de coste.", level: "warn" })
    }
    if (costSensitivity === "high" && complexity <= 2) {
      flags.push({ label: "Perfil bueno para routing mixto y fuerte ahorro por degradación.", level: "ok" })
    }
    if (dailyRequests >= 100_000) {
      flags.push({ label: "Volumen enterprise: merece negociación de descuentos y observabilidad real.", level: "info" })
    }

    return {
      decision,
      compCosts,
      maxPerK,
      recPerK,
      recMonthly,
      tierCosts,
      degradResults,
      cheapestDeg,
      savingPct,
      flags,
      monthly1K,
    }
  }, [complexity, costSensitivity, dailyRequests, dataSensitivity, degradation, useCase, withBatch, withCache])

  const {
    decision,
    compCosts,
    maxPerK,
    recPerK,
    recMonthly,
    tierCosts,
    degradResults,
    cheapestDeg,
    savingPct,
    flags,
    monthly1K,
  } = result

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="flex items-center gap-2 mb-6">
          <GitBranch className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg text-foreground">Simulador de Enrutamiento</h3>
          <span className="hidden sm:inline text-[11px] text-muted-foreground border border-border/60 rounded px-2 py-0.5 ml-1">
            Sensibilidad total
          </span>
          <ProvenanceBadge kind="editorial" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tipo de tarea</label>
            <div className="flex flex-col gap-1.5">
              {useCases.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setUseCase(item.id)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs text-left transition-all duration-150",
                    useCase === item.id
                      ? "bg-foreground text-background border-foreground font-semibold"
                      : "bg-card/40 text-muted-foreground border-border/60 hover:border-foreground/40 hover:text-foreground"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Complejidad</label>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{COMPLEXITY_LABELS[complexity]}</span>
                <span className="font-mono text-xs text-muted-foreground">{complexity}/5</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={complexity}
                onChange={(event) => setComplexity(Number(event.target.value))}
                className="w-full accent-foreground cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Simple</span>
                <span>Complejo</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sensibilidad al coste</label>
              {(["high", "medium", "low"] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setCostSensitivity(level)}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-xs text-left transition-all duration-150",
                    costSensitivity === level
                      ? "bg-foreground text-background border-foreground font-semibold"
                      : "bg-card/40 text-muted-foreground border-border/60 hover:border-foreground/40 hover:text-foreground"
                  )}
                >
                  {level === "high" ? "Alta (coste primero)" : level === "medium" ? "Media (equilibrio)" : "Baja (calidad primero)"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Requests / dia</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={rawInput}
                  onChange={(event) => handleRawInput(event.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                  placeholder="e.g. 1000000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                  {fmtReq(dailyRequests)}/d
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {VOLUME_PRESETS.map((value) => (
                  <button
                    key={value}
                    onClick={() => handlePreset(value)}
                    className={cn(
                      "px-1.5 py-1.5 text-[10px] rounded-lg border transition-all duration-150 font-mono",
                      dailyRequests === value
                        ? "bg-foreground text-background border-foreground font-bold"
                        : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    )}
                  >
                    {value >= 1_000_000 ? "1M" : value >= 1_000 ? `${value / 1000}K` : value}
                  </button>
                ))}
              </div>

              <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Requests / mes (22d)</span>
                <span className="font-mono text-xs text-foreground font-semibold">{fmtReq(dailyRequests * 22)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sensibilidad de datos</label>
              {(["public", "internal", "confidential"] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setDataSensitivity(level)}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-xs text-left transition-all duration-150",
                    dataSensitivity === level
                      ? "bg-foreground text-background border-foreground font-semibold"
                      : "bg-card/40 text-muted-foreground border-border/60 hover:border-foreground/40 hover:text-foreground"
                  )}
                >
                  {level === "public" ? "Publica" : level === "internal" ? "Interna" : "Confidencial"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Optimizaciones activas</label>
              <label className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-150", withCache ? "border-foreground/40 bg-muted/20" : "border-border/60 bg-card/40")}>
                <input type="checkbox" checked={withCache} onChange={(event) => setWithCache(event.target.checked)} className="accent-foreground" />
                <div>
                  <div className="text-xs font-medium text-foreground">Cache de prompts</div>
                  <div className="text-[10px] text-muted-foreground">-50% a -90% en input</div>
                </div>
              </label>
              <label className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-150", withBatch ? "border-foreground/40 bg-muted/20" : "border-border/60 bg-card/40")}>
                <input type="checkbox" checked={withBatch} onChange={(event) => setWithBatch(event.target.checked)} className="accent-foreground" />
                <div>
                  <div className="text-xs font-medium text-foreground">Batch API</div>
                  <div className="text-[10px] text-muted-foreground">-50% en tokens</div>
                </div>
              </label>
              <label className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-150", degradation ? "border-foreground/40 bg-muted/20" : "border-border/60 bg-card/40")}>
                <input type="checkbox" checked={degradation} onChange={(event) => setDegradation(event.target.checked)} className="accent-foreground" />
                <div>
                  <div className="text-xs font-medium text-foreground">Degradacion 80/15/5</div>
                  <div className="text-[10px] text-muted-foreground">Routing mixto por complejidad</div>
                </div>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Alertas de governance</label>
              {flags.length === 0 ? (
                <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Configuracion limpia, sin alertas
                </div>
              ) : (
                <div className="space-y-1.5">
                  {flags.map((flag, index) => (
                    <div
                      key={index}
                      className={cn(
                        "rounded-lg border p-2.5 text-[11px] flex items-start gap-2 leading-relaxed",
                        flag.level === "warn" && "border-amber-800/40 bg-amber-950/20 text-amber-400",
                        flag.level === "ok" && "border-emerald-800/40 bg-emerald-950/20 text-emerald-400",
                        flag.level === "info" && "border-blue-800/40 bg-blue-950/20 text-blue-400"
                      )}
                    >
                      {flag.level === "warn" && <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                      {flag.level === "ok" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                      {flag.level === "info" && <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                      {flag.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={cn("rounded-2xl border p-6 space-y-4", vendorBorder[decision.vendor.id], vendorBg[decision.vendor.id])}>
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vendor recomendado</span>
          </div>

          <div>
            <div className={cn("text-4xl font-black tracking-tight", vendorColors[decision.vendor.id])}>{decision.vendor.name}</div>
            <div className="text-sm font-semibold text-foreground mt-1">{decision.model.name} {decision.model.version}</div>
            <span className={cn("inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full font-semibold mt-1.5", vendorBadge[decision.vendor.id])}>
              {TIERS[decision.rule.modelTier]}
            </span>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">{decision.rule.reason}</p>

          <div className="flex flex-wrap gap-2">
            <ProvenanceBadge kind={decision.provenance} />
            <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground font-mono">
              {decision.matchedRules.length} reglas
            </span>
          </div>

          {decision.rule.optimization && (
            <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-400 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              Optimizacion sugerida: <span className="font-bold uppercase ml-1">{decision.rule.optimization}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="rounded-xl bg-muted/20 border border-border/40 px-4 py-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Coste estimado / mes</div>
              <div className="text-3xl font-black font-mono text-foreground mt-0.5">
                {degradation
                  ? fmtUSD(degradResults.find((item) => item.vendor.id === decision.vendor.id)?.breakdown.total ?? 0)
                  : fmtUSD(recMonthly)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {fmtReq(dailyRequests)} req/dia · 22 dias
                {degradation ? " · modelo 80/15/5" : ""}
              </div>
            </div>

            <div className="rounded-xl bg-muted/20 border border-border/40 px-4 py-2 flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Coste por 1K requests</span>
              <span className="font-mono text-sm font-semibold text-foreground">{fmtUSD(recPerK)}/1K</span>
            </div>

            <div className="rounded-xl bg-muted/20 border border-border/40 px-4 py-2 flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Formula activa</span>
              <span className="font-mono text-[10px] text-foreground">
                {compCosts.find((item) => item.vendor.id === decision.vendor.id)?.breakdown.formula.formulaId}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Comparativa · {TIERS[decision.rule.modelTier]}
            </span>
          </div>

          <div className="space-y-3">
            {compCosts.map(({ vendor, breakdown }) => {
              const perK = breakdown.costPer1K
              const pct = maxPerK > 0 ? (perK / maxPerK) * 100 : 0
              const isRec = vendor.id === decision.vendor.id
              const monthly = perK * monthly1K
              const degRow = degradResults.find((item) => item.vendor.id === vendor.id)?.breakdown
              const displayedCost = degradation ? (degRow?.total ?? 0) : monthly

              return (
                <div
                  key={vendor.id}
                  className={cn(
                    "rounded-xl border p-3 space-y-2 transition-all duration-200",
                    isRec ? `${vendorBorder[vendor.id]} ${vendorBg[vendor.id]}` : "border-border/40 bg-card/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-bold", vendorColors[vendor.id])}>{vendor.name}</span>
                      {isRec && <span className="text-[10px] bg-foreground text-background px-1.5 py-0.5 rounded font-black">REC</span>}
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold text-foreground">
                        {fmtUSD(displayedCost)}<span className="text-[10px] text-muted-foreground">/mes</span>
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">{fmtUSD(perK)}/1K req</div>
                    </div>
                  </div>

                  <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", vendorBar[vendor.id])} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <ProvenanceBadge kind={breakdown.provenance} />
                    <span className="text-[10px] font-mono text-muted-foreground">{breakdown.formula.formulaId}</span>
                  </div>

                  {degradation && degRow && (
                    <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                      <div className="text-center">
                        <div className="font-semibold text-foreground">{fmtUSD(degRow.fastCost)}</div>
                        <div>Rapido 80%</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-foreground">{fmtUSD(degRow.balancedCost)}</div>
                        <div>Medio 15%</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-foreground">{fmtUSD(degRow.premiumCost)}</div>
                        <div>Premium 5%</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Tiers de {decision.vendor.name}
            </div>
            {tierCosts.map((item) => (
              <div
                key={item.tier}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 border text-xs transition-all",
                  item.tier === decision.rule.modelTier ? "border-foreground/30 bg-muted/20 text-foreground" : "border-border/30 text-muted-foreground"
                )}
              >
                <span className={item.tier === decision.rule.modelTier ? "font-semibold" : ""}>{item.label}</span>
                <div className="text-right font-mono">
                  <span className={item.tier === decision.rule.modelTier ? "font-bold text-foreground" : ""}>{fmtUSD(item.monthly)}/mes</span>
                  <span className="text-muted-foreground text-[10px] ml-1">({fmtUSD(item.perK)}/1K)</span>
                </div>
              </div>
            ))}
          </div>

          {degradation && savingPct > 0 && (
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Ahorro con 80/15/5
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">vs. un único tier recomendado</div>
              </div>
              <div className="text-3xl font-black font-mono text-emerald-400">{savingPct.toFixed(0)}%</div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 space-y-4">
          <button onClick={() => setShowJson((value) => !value)} className="w-full flex items-center justify-between group">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Regla aplicada</span>
            </div>
            {showJson
              ? <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />}
          </button>

          {showJson && (
            <pre className="rounded-xl bg-muted/20 border border-border/40 p-4 text-[11px] font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap">
{JSON.stringify({
  condition: {
    use_case: useCase,
    complexity,
    cost_sensitivity: costSensitivity,
    daily_requests: dailyRequests,
    data_sensitivity: dataSensitivity,
  },
  route_to: {
    vendor: decision.vendor.id,
    model: `${decision.model.name} ${decision.model.version}`,
    tier: decision.rule.modelTier,
  },
  optimizations: {
    batch: withBatch,
    cache: withCache,
    degradation,
    suggested: decision.rule.optimization ?? null,
  },
  provenance: decision.provenance,
  matched_rules: decision.matchedRules.map((item) => ({
    vendor: item.rule.vendorId,
    tier: item.rule.modelTier,
    score: item.score,
  })),
  reason: decision.rule.reason,
}, null, 2)}
            </pre>
          )}

          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Economia unitaria</div>
            {[
              { label: "Por request", val: fmtUSD(recPerK / 1000) },
              { label: "Por 1K requests", val: fmtUSD(recPerK) },
              { label: "Por 10K requests", val: fmtUSD(recPerK * 10) },
              { label: "Por 100K requests", val: fmtUSD(recPerK * 100) },
              { label: "Coste diario", val: fmtUSD(recPerK * (dailyRequests / 1000)) },
              { label: "Coste semanal (5d)", val: fmtUSD(recPerK * (dailyRequests / 1000) * 5) },
              { label: "Coste mensual (22d)", val: fmtUSD(recMonthly) },
              { label: "Coste anual", val: fmtUSD(recMonthly * 12) },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg px-3 py-1.5 border border-border/30 bg-card/20 text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-mono font-semibold text-foreground">{row.val}</span>
              </div>
            ))}
          </div>

          {degradation && (
            <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3 space-y-1">
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Menor coste mensual (80/15/5)</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {degradResults.find((item) => item.breakdown.total === cheapestDeg)?.vendor.name}
                </span>
                <span className="font-mono text-lg font-black text-foreground">{fmtUSD(cheapestDeg)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
