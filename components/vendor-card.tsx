"use client"

import { Vendor, Model } from "@/lib/vendor-data"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Zap, Scale, Crown, Check } from "lucide-react"

const tierIcon = {
  fast: <Zap className="w-3.5 h-3.5" />,
  balanced: <Scale className="w-3.5 h-3.5" />,
  premium: <Crown className="w-3.5 h-3.5" />,
}
const tierLabel = { fast: "Rápido", balanced: "Equilibrado", premium: "Premium" }

function ModelRow({ model, vendorColor, badgeColor }: { model: Model; vendorColor: string; badgeColor: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-sm">{model.name}</span>
          <span className="text-muted-foreground text-xs">{model.version}</span>
          {model.badge && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", badgeColor)}>
              {model.badge}
            </span>
          )}
        </div>
        <div className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground")}>
          {tierIcon[model.tier]}
          <span>{tierLabel[model.tier]}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Input / MTok</div>
          <div className="font-mono font-bold text-foreground text-sm">${model.inputPricePerMTok.toFixed(2)}</div>
        </div>
        <div className="rounded-md bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Output / MTok</div>
          <div className="font-mono font-bold text-foreground text-sm">${model.outputPricePerMTok.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {model.features.slice(0, 3).map(f => (
            <span key={f} className="text-[10px] bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded">{f}</span>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-2">{model.contextWindow} ctx</span>
      </div>
    </div>
  )
}

function SeatPlanRow({ plan }: { plan: Vendor["seatPlans"][number] }) {
  const hasMonthlyPrice = plan.priceMonthly > 0
  const hasAnnualPrice = plan.priceAnnual > 0
  const showsSplitBilling =
    hasMonthlyPrice &&
    hasAnnualPrice &&
    Math.abs(plan.priceMonthly - plan.priceAnnual) > 0.001

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-sm text-foreground">{plan.name}</span>
        <div className="text-right">
          {!hasMonthlyPrice && !hasAnnualPrice ? (
            <span className="text-muted-foreground text-xs italic">Precio negociado</span>
          ) : showsSplitBilling ? (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensual</div>
              <div>
                <span className="font-mono font-bold text-foreground text-sm">${plan.priceMonthly}</span>
                <span className="text-muted-foreground text-xs">/asiento/mes</span>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Anual</div>
              <div>
                <span className="font-mono font-bold text-foreground text-sm">${plan.priceAnnual}</span>
                <span className="text-muted-foreground text-xs">/asiento/mes</span>
              </div>
            </div>
          ) : hasAnnualPrice ? (
            <>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {hasMonthlyPrice ? "Tarifa publicada" : "Anual"}
              </div>
              <div>
                <span className="font-mono font-bold text-foreground text-sm">${plan.priceAnnual}</span>
                <span className="text-muted-foreground text-xs">/asiento/mes</span>
              </div>
            </>
          ) : hasMonthlyPrice ? (
            <>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensual</div>
              <div>
                <span className="font-mono font-bold text-foreground text-sm">${plan.priceMonthly}</span>
                <span className="text-muted-foreground text-xs">/asiento/mes</span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground text-xs italic">Precio negociado</span>
          )}
        </div>
      </div>
      {plan.minSeats && (
        <div className="text-[10px] text-muted-foreground">
          Mín. {plan.minSeats} asientos{plan.maxSeats ? ` — Máx. ${plan.maxSeats}` : ""}
        </div>
      )}
      <ul className="space-y-1">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Check className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/70" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function VendorCard({ vendor }: { vendor: Vendor }) {
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-b p-6 space-y-6 h-full", vendor.borderColor, vendor.bgGradient)}>
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className={cn("text-2xl font-bold", vendor.textColor)}>{vendor.name}</h2>
          <span className="text-xs text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">{vendor.company}</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{vendor.tagline}</p>
      </div>

      {/* Models */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Modelos API</h3>
        <div className="space-y-2">
          {vendor.models.map(model => (
            <ModelRow key={model.name} model={model} vendorColor={vendor.color} badgeColor={vendor.badgeColor} />
          ))}
        </div>
      </div>

      {/* Seat Plans */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Planes por asiento</h3>
        <div className="space-y-2">
          {vendor.seatPlans.map(plan => (
            <SeatPlanRow key={plan.name} plan={plan} />
          ))}
        </div>
      </div>
    </div>
  )
}
