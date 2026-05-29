"use client"

import { useState, useMemo } from "react"
import { vendors, scenarios, type Scenario } from "@/lib/vendor-data"
import { calcScenarioTokenCostBreakdown } from "@/lib/pricing-math"
import { cn } from "@/lib/utils"
import { TrendingDown, Trophy, Calculator } from "lucide-react"
import { ProvenanceBadge } from "@/components/provenance-badge"

const TIER_LABELS = { fast: "Rápido", balanced: "Equilibrado", premium: "Premium" }

interface CellResult {
  cost: number
  isLowest: boolean
}

export function CostCalculator() {
  const [selectedScenario, setSelectedScenario] = useState(scenarios[1].id)
  const [selectedTier, setSelectedTier] = useState<"fast" | "balanced" | "premium">("balanced")
  const [customInput, setCustomInput] = useState("")
  const [customOutput, setCustomOutput] = useState("")
  const [customDays, setCustomDays] = useState("")

  const scenario = scenarios.find(s => s.id === selectedScenario)!

  const effectiveInput  = customInput  ? parseInt(customInput)  : scenario.inputTokensPerDay
  const effectiveOutput = customOutput ? parseInt(customOutput) : scenario.outputTokensPerDay
  const effectiveDays   = customDays   ? parseInt(customDays)   : scenario.daysPerMonth

  const effectiveScenario: Scenario = {
    ...scenario,
    inputTokensPerDay: effectiveInput,
    outputTokensPerDay: effectiveOutput,
    daysPerMonth: effectiveDays,
    provenance: {
      inputTokensPerDay: customInput ? "estimated" : scenario.provenance.inputTokensPerDay,
      outputTokensPerDay: customOutput ? "estimated" : scenario.provenance.outputTokensPerDay,
      daysPerMonth: customDays ? "estimated" : scenario.provenance.daysPerMonth,
    },
  }

  const results = useMemo(() => {
    return vendors.map(vendor => {
      const breakdown = calcScenarioTokenCostBreakdown(effectiveScenario, vendor, selectedTier)
      return { vendor, model: breakdown.model, cost: breakdown.monthlyCost, breakdown }
    })
  }, [selectedTier, effectiveScenario])

  const minCost = Math.min(...results.map(r => r.cost))
  const maxCost = Math.max(...results.map(r => r.cost))

  // Full scenario table
  const tierModels = useMemo(() => {
    return vendors.map(v => ({
      vendor: v,
      model: v.models.find(m => m.tier === selectedTier)!,
    }))
  }, [selectedTier])

  const allScenarioResults = useMemo(() => {
    return scenarios.map(sc => {
      const costs = tierModels.map(({ vendor }) => ({
        vendorId: vendor.id,
        cost: calcScenarioTokenCostBreakdown(sc, vendor, selectedTier).monthlyCost
      }))
      const minC = Math.min(...costs.map(c => c.cost))
      return { scenario: sc, costs, minC }
    })
  }, [selectedTier, tierModels])

  const formatCost = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
    if (n >= 1) return `$${n.toFixed(1)}`
    return `$${n.toFixed(3)}`
  }

  const fmtTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return `${n}`
  }

  const tierColors: Record<string, string> = {
    claude:  "text-orange-400",
    chatgpt: "text-emerald-400",
    gemini:  "text-blue-400",
  }

  const tierBars: Record<string, string> = {
    claude:  "bg-orange-500",
    chatgpt: "bg-emerald-500",
    gemini:  "bg-blue-500",
  }

  return (
    <section className="space-y-8">
      {/* Controls */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg text-foreground">Calculadora de Coste Mensual</h2>
          <ProvenanceBadge kind="estimated" />
        </div>

        {/* Tier Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tier de modelo</label>
          <div className="flex gap-2 flex-wrap">
            {(["fast", "balanced", "premium"] as const).map(tier => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={cn(
                  "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                  selectedTier === tier
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card/40 text-muted-foreground border-border/60 hover:border-border"
                )}
              >
                {TIER_LABELS[tier]}
              </button>
            ))}
          </div>
          {/* Model reference per vendor */}
          <div className="flex gap-4 flex-wrap pt-1">
            {vendors.map(v => {
              const m = v.models.find(mo => mo.tier === selectedTier)!
              return (
                <span key={v.id} className="text-xs text-muted-foreground">
                  <span className={cn("font-medium", tierColors[v.id])}>{v.name}</span>
                  {" → "}{m.name} {m.version} (${m.inputPricePerMTok}/${m.outputPricePerMTok} por MTok)
                </span>
              )
            })}
          </div>
        </div>

        {/* Scenario Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Escenario base</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {scenarios.map(sc => (
              <button
                key={sc.id}
                onClick={() => { setSelectedScenario(sc.id); setCustomInput(""); setCustomOutput(""); setCustomDays("") }}
                className={cn(
                  "px-3 py-2 rounded-lg border text-xs text-left transition-all",
                  selectedScenario === sc.id && !customInput && !customOutput
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card/40 text-muted-foreground border-border/60 hover:border-border"
                )}
              >
                <div className="font-semibold text-[10px] uppercase tracking-wide mb-0.5">{sc.id}</div>
                <div>{sc.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom override */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Personalizar (tokens/día)</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Input tokens/día", value: customInput, setter: setCustomInput, placeholder: fmtTokens(scenario.inputTokensPerDay) },
              { label: "Output tokens/día", value: customOutput, setter: setCustomOutput, placeholder: fmtTokens(scenario.outputTokensPerDay) },
              { label: "Días/mes", value: customDays, setter: setCustomDays, placeholder: String(scenario.daysPerMonth) },
            ].map(field => (
              <div key={field.label} className="space-y-1">
                <label className="text-[10px] text-muted-foreground">{field.label}</label>
                <input
                  type="number"
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.map(({ vendor, model, cost, breakdown }) => {
          const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0
          const isCheapest = cost === minCost
          const savings = ((maxCost - cost) / maxCost * 100)

          return (
            <div
              key={vendor.id}
              className={cn(
                "rounded-2xl border p-5 space-y-4 relative overflow-hidden transition-all",
                vendor.bgGradient, vendor.borderColor,
                isCheapest && "ring-2 ring-offset-2 ring-offset-background",
                isCheapest && (vendor.id === "claude" ? "ring-orange-500/60" : vendor.id === "chatgpt" ? "ring-emerald-500/60" : "ring-blue-500/60")
              )}
            >
              {isCheapest && (
                <div className={cn("absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full", vendor.badgeColor)}>
                  <Trophy className="w-3 h-3" />
                  Más barato
                </div>
              )}
              <div>
                <div className={cn("text-sm font-semibold", vendor.textColor)}>{vendor.name}</div>
                <div className="text-xs text-muted-foreground">{model.name} {model.version}</div>
              </div>

              <div>
                <div className="text-3xl font-bold font-mono text-foreground">{formatCost(cost)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">por mes</div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Coste relativo</span>
                  <span className="font-mono">{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", tierBars[vendor.id])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {!isCheapest && maxCost > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>{savings.toFixed(0)}% más caro que el mínimo</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
                <div>Input: <span className="font-mono text-foreground">${model.inputPricePerMTok}/MTok</span></div>
                <div>Output: <span className="font-mono text-foreground">${model.outputPricePerMTok}/MTok</span></div>
                <div>In/día: <span className="font-mono text-foreground">{fmtTokens(effectiveInput)}</span></div>
                <div>Out/día: <span className="font-mono text-foreground">{fmtTokens(effectiveOutput)}</span></div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <ProvenanceBadge kind={breakdown.provenance} />
                <span className="text-[10px] font-mono text-muted-foreground">{breakdown.formula.formulaId}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Full scenario table */}
      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h3 className="font-semibold text-foreground">Tabla completa de escenarios — Tier: {TIER_LABELS[selectedTier]}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Coste mensual por escenario y vendor (USD). Verde = más barato del escenario.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escenario</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">In/día</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Out/día</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Días</th>
                {vendors.map(v => (
                  <th key={v.id} className={cn("text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide", tierColors[v.id])}>
                    {v.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allScenarioResults.map(({ scenario: sc, costs, minC }, idx) => (
                <tr
                  key={sc.id}
                  className={cn("border-b border-border/30 transition-colors hover:bg-muted/10", idx % 2 === 0 ? "" : "bg-muted/5")}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{sc.id}</td>
                  <td className="px-4 py-3 text-foreground">{sc.label}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{fmtTokens(sc.inputTokensPerDay)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{fmtTokens(sc.outputTokensPerDay)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{sc.daysPerMonth}d</td>
                  {costs.map(({ vendorId, cost }) => (
                    <td key={vendorId} className={cn("px-4 py-3 text-right font-mono text-sm", cost === minC ? "font-bold text-foreground" : "text-muted-foreground")}>
                      {cost === minC && <span className="mr-1 text-[10px]">★</span>}
                      {formatCost(cost)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
