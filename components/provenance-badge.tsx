"use client"

import { cn } from "@/lib/utils"
import type { ProvenanceKind } from "@/lib/vendor-data"

const PROVENANCE_STYLES: Record<ProvenanceKind, { label: string; className: string }> = {
  verified: {
    label: "Verificado",
    className: "border-emerald-800/50 bg-emerald-950/30 text-emerald-300",
  },
  measured: {
    label: "Medido",
    className: "border-cyan-800/50 bg-cyan-950/30 text-cyan-300",
  },
  derived: {
    label: "Derivado",
    className: "border-sky-800/50 bg-sky-950/30 text-sky-300",
  },
  estimated: {
    label: "Estimado",
    className: "border-amber-800/50 bg-amber-950/30 text-amber-300",
  },
  editorial: {
    label: "Editorial",
    className: "border-violet-800/50 bg-violet-950/30 text-violet-300",
  },
}

export function ProvenanceBadge({
  kind,
  label,
  className,
}: {
  kind: ProvenanceKind
  label?: string
  className?: string
}) {
  const style = PROVENANCE_STYLES[kind]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
        style.className,
        className
      )}
    >
      {label ?? style.label}
    </span>
  )
}
