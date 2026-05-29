import fs from "node:fs/promises"
import path from "node:path"

import Link from "next/link"

import baseAssumptionsRegistry from "@/data/pricing-assumptions.json"
import baseRoleProfiles from "@/data/pricing-role-profiles.json"
import baseWorkloadProfiles from "@/data/pricing-workload-profiles.json"
import {
  PricingControlLab,
  type AssumptionOverridesRegistry,
  type BaseAssumptionsRegistry,
} from "@/components/internal/pricing-control-lab"
import { vendors, type RoleProfile, type TelemetryRegistry, type UseCaseProfile } from "@/lib/vendor-data"

export const dynamic = "force-dynamic"

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export default async function InternalLabPage() {
  const dataDir = path.join(process.cwd(), "data")
  const governance = await readJsonFile(path.join(dataDir, "pricing-runtime-governance.json"), {
    autonomousMode: false,
    manualEditsLocked: false,
    protocolVersion: null,
  }) as {
    autonomousMode?: boolean
    manualEditsLocked?: boolean
    protocolVersion?: string | null
  }
  const runtimeState = await readJsonFile(path.join(dataDir, "pricing-runtime-state.json"), {
    lastRunAt: null,
    lastRunStatus: "never",
    lastRunSummary: "Sin ciclos del runtime autopilot todavía.",
    telemetrySources: 0,
    appliedAssumptionOverrides: 0,
    sourceHealth: [],
  }) as {
    lastRunAt?: string | null
    lastRunStatus?: string | null
    lastRunSummary?: string | null
    telemetrySources?: number
    appliedAssumptionOverrides?: number
    sourceHealth?: Array<Record<string, unknown>>
  }
  const overrides = await readJsonFile(path.join(dataDir, "pricing-assumption-overrides.json"), {
    version: "pricing-assumption-overrides-v1",
    updatedAt: null,
    updatedBy: null,
    overrides: [],
  }) as AssumptionOverridesRegistry
  const telemetry = await readJsonFile(path.join(dataDir, "pricing-telemetry.json"), {
    version: "pricing-telemetry-v1",
    updatedAt: null,
    sources: [],
  }) as TelemetryRegistry

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <header className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Volver a la comparativa
            </Link>
            <Link
              href="/internal/agents"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver orquestador
            </Link>
            <Link
              href="/internal/truth"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver truth graph
            </Link>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Internal Runtime Lab
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
              {governance.autonomousMode && governance.manualEditsLocked
                ? "Observación del runtime autónomo"
                : "Assumptions, telemetría y recalculo instantáneo"}
            </h1>
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              {governance.autonomousMode && governance.manualEditsLocked
                ? "El runtime autopilot ya gobierna assumptions y telemetría. Esta consola queda en modo observación para auditar qué está midiendo, qué recalibra y con qué estado de salud."
                : "Esta consola deja tocar solo las capas operativas permitidas. Los claims de pricing siguen viniendo del truth graph, pero aquí ya podemos calibrar workloads, roles y assumptions con datos medidos del piloto."}
            </p>
          </div>
        </header>

        <PricingControlLab
          vendors={vendors}
          baseAssumptions={baseAssumptionsRegistry as BaseAssumptionsRegistry}
          baseWorkloads={baseWorkloadProfiles as UseCaseProfile[]}
          baseRoles={baseRoleProfiles as RoleProfile[]}
          initialOverrides={overrides}
          initialTelemetry={telemetry}
          governance={governance}
          runtimeState={runtimeState}
        />
      </main>
    </div>
  )
}
