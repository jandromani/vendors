"use client"

import { vendors } from "@/lib/vendor-data"
import { cn } from "@/lib/utils"
import { Plus, Minus } from "lucide-react"

const vendorColors: Record<string, string> = {
  claude: "text-orange-400",
  chatgpt: "text-emerald-400",
  gemini: "text-blue-400",
}

const vendorBorders: Record<string, string> = {
  claude: "border-orange-800/40",
  chatgpt: "border-emerald-800/40",
  gemini: "border-blue-800/40",
}

const vendorBg: Record<string, string> = {
  claude: "bg-orange-950/20",
  chatgpt: "bg-emerald-950/20",
  gemini: "bg-blue-950/20",
}

export function ExtrasPanel() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {vendors.map(vendor => (
        <div key={vendor.id} className={cn("rounded-2xl border p-5 space-y-5", vendorBorders[vendor.id], vendorBg[vendor.id])}>
          <h3 className={cn("font-semibold text-base", vendorColors[vendor.id])}>{vendor.name}</h3>

          {/* Extras que incrementan coste */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Plus className="w-3 h-3" />
              Cargos adicionales
            </div>
            <ul className="space-y-2">
              {vendor.extras.map(e => (
                <li key={e.label} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-muted-foreground leading-relaxed">{e.label}</span>
                  <span className="text-xs font-mono text-foreground shrink-0 text-right">{e.price}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-border/40" />

          {/* Optimizaciones que reducen coste */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Minus className="w-3 h-3" />
              Optimizaciones de coste
            </div>
            <ul className="space-y-2">
              {vendor.optimizations.map(o => (
                <li key={o.label} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-muted-foreground leading-relaxed">{o.label}</span>
                  <span className="text-xs font-mono font-semibold text-emerald-400 shrink-0 text-right">{o.discount}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </section>
  )
}
