"use client"

import { useState, useMemo } from "react"
import { vendors, useCases } from "@/lib/vendor-data"
import { calcDegradationCostBreakdown, calcUseCaseCostBreakdown } from "@/lib/pricing-math"
import { cn } from "@/lib/utils"
import { MessageSquare, Database, Bot, Code2, FileText, Zap, Trophy, TrendingDown, Info } from "lucide-react"
import { ProvenanceBadge } from "@/components/provenance-badge"

const ICON_MAP: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="w-4 h-4" />,
  Database:      <Database className="w-4 h-4" />,
  Bot:           <Bot className="w-4 h-4" />,
  Code2:         <Code2 className="w-4 h-4" />,
  FileText:      <FileText className="w-4 h-4" />,
  Zap:           <Zap className="w-4 h-4" />,
}

const vendorColors: Record<string, string> = {
  claude:  "text-orange-400",
  chatgpt: "text-emerald-400",
  gemini:  "text-blue-400",
}
const vendorBars: Record<string, string> = {
  claude:  "bg-orange-500",
  chatgpt: "bg-emerald-500",
  gemini:  "bg-blue-500",
}
const vendorBadge: Record<string, string> = {
  claude:  "bg-orange-900/50 text-orange-300",
  chatgpt: "bg-emerald-900/50 text-emerald-300",
  gemini:  "bg-blue-900/50 text-blue-300",
}
const vendorBorder: Record<string, string> = {
  claude:  "border-orange-800/50",
  chatgpt: "border-emerald-800/50",
  gemini:  "border-blue-800/50",
}
const vendorBg: Record<string, string> = {
  claude:  "from-orange-950/40 to-orange-900/10",
  chatgpt: "from-emerald-950/40 to-emerald-900/10",
  gemini:  "from-blue-950/40 to-blue-900/10",
}

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  if (n >= 1)    return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  return `$${n.toFixed(4)}`
}

export function RealTCOCalculator() {
  const [selectedUseCase, setSelectedUseCase] = useState("chat")
  const [dailyRequests, setDailyRequests]     = useState(1000)
  const [daysPerMonth, setDaysPerMonth]       = useState(22)
  const [withBatch, setWithBatch]             = useState(false)
  const [withCache, setWithCache]             = useState(false)
  const [showDegradation, setShowDegradation] = useState(false)

  const useCase = useCases.find(u => u.id === selectedUseCase)!

  // Cost per 1K requests for balanced tier (representative)
  const per1KResults = useMemo(() => {
    return vendors.map(v => ({
      vendor: v,
      breakdown: calcUseCaseCostBreakdown(useCase, v, "balanced", { withBatch, withCache }),
    }))
  }, [useCase, withBatch, withCache])

  // Monthly cost (balanced tier, no degradation)
  const monthlyResults = useMemo(() => {
    const monthly1K = (dailyRequests * daysPerMonth) / 1000
    return per1KResults.map(r => ({
      ...r,
      monthly: r.breakdown.costPer1K * monthly1K,
    }))
  }, [per1KResults, dailyRequests, daysPerMonth])

  // Degradation model (80/15/5)
  const degradationResults = useMemo(() => {
    return vendors.map(v => ({
      vendor: v,
      breakdown: calcDegradationCostBreakdown(v, dailyRequests, daysPerMonth, useCase, { withBatch, withCache }),
    }))
  }, [useCase, dailyRequests, daysPerMonth, withBatch, withCache])

  const activeResults = showDegradation
    ? degradationResults.map(r => ({ vendor: r.vendor, monthly: r.breakdown.total, deg: r.breakdown, provenance: r.breakdown.provenance }))
    : monthlyResults.map(r => ({ vendor: r.vendor, monthly: r.monthly, deg: null, provenance: r.breakdown.provenance }))

  const minMonthly = Math.min(...activeResults.map(r => r.monthly))
  const maxMonthly = Math.max(...activeResults.map(r => r.monthly))

  // Savings from degradation vs all-premium
  const allPremiumCost = useMemo(() => {
    return vendors.reduce((sum, v) => {
      const monthly1K = (dailyRequests * daysPerMonth) / 1000
      return sum + calcUseCaseCostBreakdown(useCase, v, "premium", { withBatch: false, withCache: false }).costPer1K * monthly1K
    }, 0) / vendors.length
  }, [useCase, dailyRequests, daysPerMonth])

  const cheapestDegCost = Math.min(...degradationResults.map(r => r.breakdown.total))
  const degradationSaving = allPremiumCost > 0 ? ((allPremiumCost - cheapestDegCost) / allPremiumCost * 100) : 0

  // Unit economics table across all use cases for balanced tier
  const unitEconomicsTable = useMemo(() => {
    return useCases.map(uc => ({
      useCase: uc,
      costs: vendors.map(v => ({
        vendor: v,
        breakdown: calcUseCaseCostBreakdown(uc, v, "balanced", { withBatch: false, withCache: false }),
      })),
    }))
  }, [])

  return (
    <div className="space-y-8">

      {/* Controls */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg text-foreground">TCO Real por Caso de Uso</h3>
          <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-0.5">Tier equilibrado · overhead incluido</span>
          <ProvenanceBadge kind="estimated" />
        </div>

        {/* Use case selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tipo de uso</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {useCases.map(uc => (
              <button
                key={uc.id}
                onClick={() => setSelectedUseCase(uc.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs text-left transition-all",
                  selectedUseCase === uc.id
                    ? "bg-foreground text-background border-foreground font-medium"
                    : "bg-card/40 text-muted-foreground border-border/60 hover:border-border"
                )}
              >
                {ICON_MAP[uc.icon]}
                <span>{uc.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed pt-1">{useCase.description}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-0.5">
            <span>Tokens input avg: <span className="font-mono text-foreground">{useCase.avgInputTokens.toLocaleString("es-ES")}</span></span>
            <span>Tokens output avg: <span className="font-mono text-foreground">{useCase.avgOutputTokens.toLocaleString("es-ES")}</span></span>
            <span>Multiplicador overhead: <span className="font-mono text-foreground">×{useCase.overheadMultiplier}</span></span>
          </div>
        </div>

        {/* Volume */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Requests / día</label>
            <input
              type="number"
              value={dailyRequests}
              onChange={e => setDailyRequests(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Días / mes</label>
            <input
              type="number"
              value={daysPerMonth}
              onChange={e => setDaysPerMonth(Math.min(31, Math.max(1, parseInt(e.target.value) || 22)))}
              className="w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="col-span-2 flex items-end gap-4 pb-0.5">
            <label className={cn("flex items-center gap-2 text-sm cursor-pointer select-none px-4 py-2 rounded-xl border transition-all", withBatch ? "border-foreground bg-foreground text-background" : "border-border/60 text-muted-foreground hover:border-border")}>
              <input type="checkbox" checked={withBatch} onChange={e => setWithBatch(e.target.checked)} className="sr-only" />
              Batch API <span className="font-mono text-xs">−50%</span>
            </label>
            <label className={cn("flex items-center gap-2 text-sm cursor-pointer select-none px-4 py-2 rounded-xl border transition-all", withCache ? "border-foreground bg-foreground text-background" : "border-border/60 text-muted-foreground hover:border-border")}>
              <input type="checkbox" checked={withCache} onChange={e => setWithCache(e.target.checked)} className="sr-only" />
              Cache hits <span className="font-mono text-xs">−50/75/90%</span>
            </label>
          </div>
        </div>

        {/* Degradation toggle */}
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
          <label className={cn("flex items-center gap-3 text-sm cursor-pointer select-none flex-1")}>
            <div
              onClick={() => setShowDegradation(!showDegradation)}
              className={cn("relative w-10 h-5 rounded-full transition-colors cursor-pointer", showDegradation ? "bg-foreground" : "bg-muted")}
            >
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform", showDegradation && "translate-x-5")} />
            </div>
            <span className="text-foreground font-medium">Modelo de degradación inteligente (80/15/5)</span>
          </label>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>80% tier rápido · 15% equilibrado · 5% premium</span>
          </div>
        </div>
      </div>

      {/* Result cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activeResults.map(({ vendor, monthly, deg, provenance }) => {
          const isCheapest = monthly === minMonthly
          const pct = maxMonthly > 0 ? (monthly / maxMonthly) * 100 : 0
          const savingPct = monthly < maxMonthly ? ((maxMonthly - monthly) / maxMonthly * 100) : 0
          const per1K = monthlyResults.find(r => r.vendor.id === vendor.id)?.breakdown.costPer1K ?? 0

          return (
            <div
              key={vendor.id}
              className={cn(
                "rounded-2xl border bg-gradient-to-b p-5 space-y-4 relative overflow-hidden",
                vendorBorder[vendor.id], vendorBg[vendor.id],
                isCheapest && "ring-2 ring-offset-2 ring-offset-background",
                isCheapest && (vendor.id === "claude" ? "ring-orange-500/60" : vendor.id === "chatgpt" ? "ring-emerald-500/60" : "ring-blue-500/60")
              )}
            >
              {isCheapest && (
                <div className={cn("absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full", vendorBadge[vendor.id])}>
                  <Trophy className="w-3 h-3" /> Menor TCO
                </div>
              )}

              <div>
                <div className={cn("text-sm font-semibold", vendorColors[vendor.id])}>{vendor.name}</div>
                <div className="text-xs text-muted-foreground">{showDegradation ? "Distribución 80/15/5" : "Tier equilibrado"}</div>
              </div>

              <div>
                <div className="text-3xl font-bold font-mono text-foreground">{fmt(monthly)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">/ mes · {(dailyRequests * daysPerMonth).toLocaleString("es-ES")} requests</div>
              </div>

              {/* Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Coste relativo</span>
                  <span className="font-mono">{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-700", vendorBars[vendor.id])} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Degradation breakdown */}
              {showDegradation && deg && (
                <div className="space-y-1 text-xs rounded-lg bg-muted/20 p-3">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Rápido (80%)</span>
                    <span className="font-mono text-foreground">{fmt(deg.fastCost)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Equilibrado (15%)</span>
                    <span className="font-mono text-foreground">{fmt(deg.balancedCost)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Premium (5%)</span>
                    <span className="font-mono text-foreground">{fmt(deg.premiumCost)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
                <div>Por 1K req: <span className="font-mono text-foreground">{fmt(per1K)}</span></div>
                <div>Overhead: <span className="font-mono text-foreground">×{useCase.overheadMultiplier}</span></div>
                {!isCheapest && <div className="col-span-2 flex items-center gap-1 text-muted-foreground">
                  <TrendingDown className="w-3 h-3" />
                  {savingPct.toFixed(0)}% más caro que mínimo
                </div>}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <ProvenanceBadge kind={provenance} />
                <span className="text-[10px] font-mono text-muted-foreground">
                  {showDegradation && deg ? deg.formula.formulaId : monthlyResults.find(r => r.vendor.id === vendor.id)?.breakdown.formula.formulaId}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Degradation saving highlight */}
      {showDegradation && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-foreground">Ahorro estimado con enrutamiento inteligente</div>
            <div className="text-xs text-muted-foreground">Comparado con usar solo tier premium sin optimización</div>
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-400">{degradationSaving.toFixed(0)}%</div>
        </div>
      )}

      {/* Unit economics table */}
      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h3 className="font-semibold text-foreground">Economía unitaria por caso de uso</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Coste por 1.000 requests · Tier equilibrado · Sin batch ni caché · Overhead de producción incluido</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caso de uso</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overhead</th>
                {vendors.map(v => (
                  <th key={v.id} className={cn("text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide", vendorColors[v.id])}>{v.name}</th>
                ))}
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mas barato</th>
              </tr>
            </thead>
            <tbody>
              {unitEconomicsTable.map(({ useCase: uc, costs }, i) => {
                const minC = Math.min(...costs.map(c => c.breakdown.costPer1K))
                const winner = costs.find(c => c.breakdown.costPer1K === minC)!
                return (
                  <tr key={uc.id} className={cn("border-b border-border/20 hover:bg-muted/10 transition-colors", i % 2 === 0 ? "" : "bg-muted/5")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{ICON_MAP[uc.icon]}</span>
                        <span className="text-foreground">{uc.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">×{uc.overheadMultiplier}</td>
                    {costs.map(({ vendor: v, breakdown }) => (
                      <td key={v.id} className={cn("px-5 py-3 text-right font-mono text-sm", breakdown.costPer1K === minC ? "font-bold text-foreground" : "text-muted-foreground")}>
                        {breakdown.costPer1K === minC && <span className="mr-1 text-[10px]">★</span>}
                        {fmt(breakdown.costPer1K)}
                      </td>
                    ))}
                    <td className={cn("px-5 py-3 text-right text-xs font-semibold", vendorColors[winner.vendor.id])}>
                      {winner.vendor.name}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
