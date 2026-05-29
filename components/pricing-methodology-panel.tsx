import {
  pricingAssumptions,
  pricingFormulas,
  pricingFormulasVersion,
  pricingAssumptionsVersion,
  provenanceLegend,
  telemetryCoverage,
} from "@/lib/vendor-data"
import { buildMethodologySummary } from "@/lib/pricing-math"
import { ProvenanceBadge } from "@/components/provenance-badge"

export function PricingMethodologyPanel() {
  const summary = buildMethodologySummary()
  const featuredAssumptions = pricingAssumptions.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-muted-foreground">Inputs verificados</div>
          <div className="mt-1 text-foreground font-semibold">{summary.verifiedPriceInputs}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-muted-foreground">Formulas versionadas</div>
          <div className="mt-1 text-foreground font-semibold">{summary.formulasCount} · {pricingFormulasVersion}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-muted-foreground">Assumptions registry</div>
          <div className="mt-1 text-foreground font-semibold">{summary.assumptionsCount} · {pricingAssumptionsVersion}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-muted-foreground">Perfiles / escenarios</div>
          <div className="mt-1 text-foreground font-semibold">{summary.roleProfilesCount} roles · {summary.scenariosCount} escenarios</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            telemetría activa {telemetryCoverage.activeSources} · workloads medidos {telemetryCoverage.measuredWorkloads}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Formula Layer</div>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Cada resultado tiene fórmula explícita</h3>
          </div>
          <div className="space-y-3">
            {pricingFormulas.map((formula) => (
              <div key={formula.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{formula.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{formula.id}</div>
                  </div>
                  <ProvenanceBadge kind="derived" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{formula.description}</p>
                <pre className="rounded-lg border border-border/50 bg-muted/20 p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
{formula.expression}
                </pre>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Provenance</div>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Estados de procedencia</h3>
            </div>
            <div className="space-y-3">
              {provenanceLegend.map((item) => (
                <div key={item.kind} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-1.5">
                  <ProvenanceBadge kind={item.kind} />
                  <div className="text-sm text-foreground">{item.label}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Assumptions Layer</div>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Supuestos versionados y visibles</h3>
            </div>
            <div className="space-y-3">
              {featuredAssumptions.map((assumption) => (
                <div key={assumption.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-semibold text-foreground">{assumption.label}</div>
                    <ProvenanceBadge kind={assumption.provenance} />
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{assumption.description}</div>
                  <div className="text-xs font-mono text-foreground">
                    {assumption.value} {assumption.unit}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
