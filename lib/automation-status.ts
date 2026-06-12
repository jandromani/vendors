export interface FreshnessStatus {
  ageHours: number | null
  ageDays: number | null
  level: "fresh" | "warning" | "stale" | "unknown"
  label: string
  detail: string
  badgeTone: string
  panelTone: string
}

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function getAgeHours(iso: string | null | undefined, nowMs = Date.now()): number | null {
  if (!iso) return null
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) return null
  return round((nowMs - timestamp) / 36e5)
}

export function formatAgeCompact(ageHours: number | null) {
  if (ageHours === null) return "Sin timestamp"
  if (ageHours < 1) return "hace menos de 1h"
  if (ageHours < 24) return `hace ${round(ageHours)}h`
  const days = round(ageHours / 24)
  return `hace ${days}d`
}

export function buildFreshnessStatus(
  lastRunAt: string | null | undefined,
  {
    warningHours = 30,
    staleHours = 48,
    label = "ciclo de agentes",
  }: {
    warningHours?: number
    staleHours?: number
    label?: string
  } = {}
): FreshnessStatus {
  const ageHours = getAgeHours(lastRunAt)

  if (ageHours === null) {
    return {
      ageHours: null,
      ageDays: null,
      level: "unknown",
      label: "Sin ejecución registrada",
      detail: `Todavía no hay un timestamp fiable para el ${label}.`,
      badgeTone: "border-border/60 bg-card/40 text-muted-foreground",
      panelTone: "border-border/60 bg-card/40 text-muted-foreground",
    }
  }

  const ageDays = round(ageHours / 24)

  if (ageHours >= staleHours) {
    return {
      ageHours,
      ageDays,
      level: "stale",
      label: `Foto congelada · ${formatAgeCompact(ageHours)}`,
      detail: `El ${label} lleva ${formatAgeCompact(ageHours)} sin refrescarse. En producción esto suele significar que el scheduler o la ruta de persistencia no están empujando datos nuevos al deploy.`,
      badgeTone: "border-red-800/50 bg-red-950/20 text-red-200",
      panelTone: "border-red-800/50 bg-red-950/20 text-red-200",
    }
  }

  if (ageHours >= warningHours) {
    return {
      ageHours,
      ageDays,
      level: "warning",
      label: `Refresh retrasado · ${formatAgeCompact(ageHours)}`,
      detail: `El ${label} supera la ventana esperada de refresh diario. La web aún puede ser válida, pero ya no conviene venderla como actualización de hoy.`,
      badgeTone: "border-amber-800/50 bg-amber-950/20 text-amber-200",
      panelTone: "border-amber-800/50 bg-amber-950/20 text-amber-200",
    }
  }

  return {
    ageHours,
    ageDays,
    level: "fresh",
    label: `Refresh diario OK · ${formatAgeCompact(ageHours)}`,
    detail: `El ${label} sigue dentro de la ventana diaria esperada.`,
    badgeTone: "border-emerald-800/40 bg-emerald-950/20 text-emerald-300",
    panelTone: "border-emerald-800/40 bg-emerald-950/20 text-emerald-200",
  }
}
