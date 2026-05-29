"use client"

import { Check } from "lucide-react"

import type { Vendor } from "@/lib/vendor-data"
import { cn } from "@/lib/utils"

export function TrackedEcosystemCard({ vendor }: { vendor: Vendor }) {
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-b p-6 space-y-5", vendor.borderColor, vendor.bgGradient)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className={cn("text-xl font-bold", vendor.textColor)}>{vendor.name}</h3>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
              {vendor.company}
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground border border-border/60 rounded-full px-2 py-1">
            Ecosistema vigilado
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{vendor.tagline}</p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Planes vigilados</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {vendor.seatPlans.map((plan) => {
            const publishedPrice =
              plan.priceMonthly > 0 && plan.priceAnnual > 0 && Math.abs(plan.priceMonthly - plan.priceAnnual) > 0.001
                ? `$${plan.priceMonthly} mensual · $${plan.priceAnnual} anual`
                : plan.priceAnnual > 0
                  ? `$${plan.priceAnnual} / usuario / mes`
                  : plan.priceMonthly > 0
                    ? `$${plan.priceMonthly} / usuario / mes`
                    : "Precio negociado"

            return (
              <div key={plan.name} className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{plan.name}</div>
                    <div className="text-xs text-muted-foreground">{publishedPrice}</div>
                  </div>
                  {plan.maxSeats ? (
                    <span className="text-[10px] text-muted-foreground">hasta {plan.maxSeats}</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">mín. {plan.minSeats ?? 1}</span>
                  )}
                </div>
                <ul className="space-y-1">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/70" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Extras</div>
          <ul className="space-y-1.5">
            {vendor.extras.map((extra) => (
              <li key={extra.label} className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{extra.label}</span>
                <span className="text-foreground text-right">{extra.price}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Señales críticas</div>
          <ul className="space-y-1.5">
            {vendor.optimizations.map((item) => (
              <li key={item.label} className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="text-foreground text-right">{item.discount}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
