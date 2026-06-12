import Link from "next/link"

import pricingAgentState from "@/data/pricing-agent-state.json"
import pricingRuntimeGovernance from "@/data/pricing-runtime-governance.json"
import pricingRuntimeState from "@/data/pricing-runtime-state.json"
import pricingSurfaceState from "@/data/pricing-surface-state.json"
import pricingTruthState from "@/data/pricing-truth-state.json"
import { CostCalculator } from "@/components/cost-calculator"
import { ExtrasPanel } from "@/components/extras-panel"
import { FeatureMatrix } from "@/components/feature-matrix"
import { PricingMethodologyPanel } from "@/components/pricing-methodology-panel"
import { RealTCOCalculator } from "@/components/real-tco-calculator"
import { RoleCostPlanner } from "@/components/role-cost-planner"
import { RoutingSimulator } from "@/components/routing-simulator"
import { TrackedEcosystemCard } from "@/components/tracked-ecosystem-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VendorCard } from "@/components/vendor-card"
import { buildFreshnessStatus } from "@/lib/automation-status"
import { pricingSnapshotMeta, trackedVendors, vendors } from "@/lib/vendor-data"

export const dynamic = "force-dynamic"

function formatDateTime(value?: string | null) {
  if (!value) return "Pendiente del primer ciclo"
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: pricingSnapshotMeta.timezone,
  }).format(new Date(value))
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: pricingSnapshotMeta.timezone,
  }).format(new Date(value))
}

export default function Home() {
  const agentState = pricingAgentState as {
    lastRunAt: string | null
    lastRunStatus: string
    lastRunSummary: string
    provider?: string | null
    model?: string | null
    protocolVersion?: string | null
    providerStrategy?: {
      selectedProvider?: string | null
      selectedModel?: string | null
      degradedMode?: boolean
      failoverUsed?: boolean
      summary?: string | null
    }
  }

  const truthState = pricingTruthState as {
    lastRunAt?: string | null
    lastRunStatus?: string | null
    lastRunSummary?: string | null
    provider?: string | null
    model?: string | null
    totalClaims?: number
    publishableUpdates?: number
    appliedUpdates?: number
    needsAttention?: number
    verdictCounts?: Record<string, number>
  }

  const surfaceState = pricingSurfaceState as {
    lastRunAt?: string | null
    lastRunStatus?: string | null
    lastRunSummary?: string | null
    protocolVersion?: string | null
    totalChecks?: number
    verifiedChecks?: number
    needsReview?: number
    unverifiableChecks?: number
  }

  const runtimeGovernance = pricingRuntimeGovernance as {
    autonomousMode?: boolean
    manualEditsLocked?: boolean
    protocolVersion?: string | null
  }

  const runtimeState = pricingRuntimeState as {
    lastRunAt?: string | null
    lastRunStatus?: string | null
    lastRunSummary?: string | null
    telemetrySources?: number
    appliedAssumptionOverrides?: number
  }

  const snapshotDateIso = pricingSnapshotMeta.updatedByAgentAt ?? pricingSnapshotMeta.snapshotTakenAt
  const snapshotDateLabel = formatLongDate(snapshotDateIso)
  const freshness = buildFreshnessStatus(agentState.lastRunAt, {
    warningHours: 30,
    staleHours: 48,
    label: "scheduler productivo",
  })

  const autonomousModeActive = Boolean(runtimeGovernance.autonomousMode)
  const manualEditsLocked = Boolean(runtimeGovernance.autonomousMode && runtimeGovernance.manualEditsLocked)

  const autoAgentStatus =
    agentState.lastRunStatus === "updated"
      ? "Cambios detectados y aplicados automaticamente"
      : agentState.lastRunStatus === "no_changes"
        ? "Vigilancia diaria ejecutada, sin cambios detectados"
        : agentState.lastRunSummary

  const truthStatusLabel =
    truthState.lastRunStatus === "verified"
      ? "Claims confirmados sin cambios"
      : truthState.lastRunStatus === "updated"
        ? "Truth graph detecto cambios publicables"
        : truthState.lastRunSummary ?? "Sin verificacion claim-by-claim todavia"

  const surfaceStatusLabel =
    surfaceState.lastRunStatus === "verified"
      ? "Lineup, nombres y copy critica confirmados"
      : surfaceState.lastRunStatus === "partial"
        ? "Surface graph con validacion parcial"
        : surfaceState.lastRunStatus === "needs_review"
          ? "Surface graph detecto drift editorial"
          : surfaceState.lastRunSummary ?? "Sin verificacion surface todavia"

  const runtimeStatusLabel =
    runtimeState.lastRunStatus === "updated"
      ? "Telemetria ingerida y assumptions recalibrados"
      : runtimeState.lastRunStatus === "partially_updated"
        ? "Telemetria ingerida con incidencias parciales"
        : runtimeState.lastRunStatus === "disabled"
          ? "Runtime autopilot desactivado"
          : runtimeState.lastRunSummary ?? "Sin runtime autopilot todavia"

  const liveBlockedByQuota =
    agentState.lastRunStatus === "error" &&
    (
      agentState.lastRunSummary.includes("insufficient_quota") ||
      agentState.lastRunSummary.includes("\"code\":402")
    )

  const liveBlockedByMissingKey =
    agentState.lastRunStatus === "error" &&
    (
      (agentState.provider === "gemini" && agentState.lastRunSummary.includes("GEMINI_API_KEY")) ||
      (agentState.provider === "openai" && agentState.lastRunSummary.includes("OPENAI_API_KEY")) ||
      (agentState.provider === "openrouter" && agentState.lastRunSummary.includes("OPENROUTER_API_KEY"))
    )

  const orchestrationMode = liveBlockedByMissingKey
    ? `${agentState.provider ?? "Proveedor"} live bloqueado`
    : liveBlockedByQuota
      ? `${agentState.provider ?? "Proveedor"} bloqueado por cuota`
      : agentState.provider === "mock"
        ? "Modo mock"
        : agentState.provider === "openrouter"
          ? "OpenRouter free"
          : agentState.provider === "gemini"
            ? "Gemini live"
            : agentState.provider === "openai"
              ? "OpenAI live"
              : "Configuracion pendiente"

  const providerStrategySummary =
    agentState.providerStrategy?.summary ?? "Sin failover registrado todavia."

  const vendorColorMap: Record<string, string> = {
    claude: "text-orange-400",
    chatgpt: "text-emerald-400",
    gemini: "text-blue-400",
  }

  const vendorBgMap: Record<string, string> = {
    claude: "bg-orange-950/30 border-orange-800/40",
    chatgpt: "bg-emerald-950/30 border-emerald-800/40",
    gemini: "bg-blue-950/30 border-blue-800/40",
  }

  const quickBannerItems = vendors.flatMap((vendor) => {
    const fastModel = vendor.models.find((model) => model.tier === "fast")
    if (!fastModel) return []
    return [
      {
        key: vendor.id,
        label: `${vendor.name} · ${fastModel.name}`,
        input: `$${fastModel.inputPricePerMTok.toFixed(2)}`,
        output: `$${fastModel.outputPricePerMTok.toFixed(2)}`,
        color: vendorColorMap[vendor.id] ?? "text-foreground",
        bg: vendorBgMap[vendor.id] ?? "bg-card border-border/60",
      },
    ]
  })

  const agentSteps = [
    {
      name: "ScoutAgent",
      role: "Busca noticias y changelogs recientes",
      detail: "Consulta solo fuentes whitelist y propone candidatos recientes relacionados con pricing o billing.",
    },
    {
      name: "ResearchAgent",
      role: "Lee evidencia dura y la normaliza",
      detail: "Abre articulos concretos, extrae ventanas de texto y menciones monetarias antes de pasar nada al mapeo.",
    },
    {
      name: "MappingAgent",
      role: "Convierte evidencia en operaciones seguras",
      detail: "Mapea solo a targets del catalogo cerrado y prepara cambios estructurados sobre campos permitidos.",
    },
    {
      name: "AuditAgent",
      role: "Aprueba o rechaza con reglas duras",
      detail: "Exige evidencia suficiente y pares input/output antes de que el updater toque la foto fija.",
    },
  ]

  const automationLayers = [
    {
      name: "Truth Graph",
      status: truthStatusLabel,
      metric: `${truthState.verdictCounts?.confirmed ?? 0}/${truthState.totalClaims ?? 0} claims`,
      accent: "border-sky-800/40 bg-sky-950/20 text-sky-200",
      href: "/internal/truth",
      detail:
        "Convierte la web en claims verificables, relee solo fuentes oficiales permitidas y decide claim por claim si el dato sigue confirmado.",
    },
    {
      name: "Surface Graph",
      status: surfaceStatusLabel,
      metric: `${surfaceState.verifiedChecks ?? 0}/${surfaceState.totalChecks ?? 0} checks`,
      accent: "border-violet-800/40 bg-violet-950/20 text-violet-200",
      href: "/internal/surface",
      detail:
        "Vigila naming, lineup y copy critica para que la web no siga vendiendo un mundo antiguo aunque el precio este bien.",
    },
    {
      name: "Runtime Autopilot",
      status: runtimeStatusLabel,
      metric: `${runtimeState.telemetrySources ?? 0} señales · ${runtimeState.appliedAssumptionOverrides ?? 0} overrides`,
      accent: "border-cyan-800/40 bg-cyan-950/20 text-cyan-200",
      href: "/internal/lab",
      detail:
        "Ingiere telemetria real, recalibra assumptions medibles y bloquea edicion manual cuando la gobernanza autonoma esta activa.",
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-1">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-orange-900 text-xs font-bold text-orange-300">A</span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-emerald-900 text-xs font-bold text-emerald-300">O</span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-blue-900 text-xs font-bold text-blue-300">G</span>
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">AI Vendor Compare</div>
                <div className="text-xs text-muted-foreground">Snapshot publicada: {snapshotDateLabel}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="/internal/agents" className="rounded-full border border-border/60 bg-card/40 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
              Dossier general
            </Link>
            <Link href="/internal/truth" className="rounded-full border border-border/60 bg-card/40 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
              Truth
            </Link>
            <Link href="/internal/surface" className="rounded-full border border-border/60 bg-card/40 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
              Surface
            </Link>
            <Link href="/internal/lab" className="rounded-full border border-border/60 bg-card/40 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
              Runtime lab
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-border/60 bg-card/50 p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${freshness.level === "fresh" ? "bg-emerald-400" : freshness.level === "warning" ? "bg-amber-400" : freshness.level === "stale" ? "bg-red-400" : "bg-slate-400"}`} />
              {freshness.label}
            </div>

            <div className="mt-6 max-w-3xl space-y-4">
              <h1 className="text-4xl font-bold leading-tight text-balance text-foreground sm:text-5xl">
                La capa de pricing de IA que no deberia quedarse vieja.
              </h1>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Comparamos Claude, ChatGPT y Gemini con datos versionados, claims verificados, vigilancia editorial de lineup y un runtime autonomo que calibra escenarios reales de uso.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                La idea no es solo mostrar precios. La idea es convertir esta web en un sistema vivo que detecta drift, sabe cuando una foto fija se ha congelado y puede volver a empujar el pipeline sin intervencion manual.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-emerald-800/40 bg-emerald-950/20 px-3 py-1 text-emerald-300">
                {truthState.verdictCounts?.confirmed ?? 0}/{truthState.totalClaims ?? 0} claims verificados
              </span>
              <span className="rounded-full border border-violet-800/40 bg-violet-950/20 px-3 py-1 text-violet-300">
                Surface {surfaceState.verifiedChecks ?? 0}/{surfaceState.totalChecks ?? 0} checks
              </span>
              <span className="rounded-full border border-sky-800/40 bg-sky-950/20 px-3 py-1 text-sky-300">
                {orchestrationMode}
              </span>
              <span className={`rounded-full border px-3 py-1 ${manualEditsLocked ? "border-cyan-800/40 bg-cyan-950/20 text-cyan-300" : "border-border/60 bg-card/40 text-muted-foreground"}`}>
                {manualEditsLocked ? "Autonomia activa · lock manual ON" : "Autonomia todavia no bloqueada"}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`rounded-[28px] border p-6 ${freshness.panelTone}`}>
              <div className="text-[11px] uppercase tracking-[0.24em]">Estado de actualizacion</div>
              <div className="mt-2 text-2xl font-bold">{freshness.label}</div>
              <p className="mt-3 text-sm leading-relaxed opacity-90">{freshness.detail}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                  <div className="text-muted-foreground">Ultimo ciclo</div>
                  <div className="mt-1 font-medium text-foreground">{formatDateTime(agentState.lastRunAt)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                  <div className="text-muted-foreground">Motor activo</div>
                  <div className="mt-1 font-medium text-foreground">{agentState.provider ?? "-"} · {agentState.model ?? "-"}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-border/60 bg-card/50 p-6">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Arquitectura operativa</div>
              <div className="mt-2 text-xl font-semibold text-foreground">Vercel cron → GitHub Actions → commit → redeploy</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                La web en produccion solo lee `data/`. Por eso el scheduler real tiene que disparar un worker que escriba, haga commit y provoque un redeploy. Sin esa frontera, Vercel se queda congelado leyendo una foto antigua.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Link href="/internal/agents" className="rounded-full border border-border/60 bg-background/40 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
                  Ver dossier interno
                </Link>
                <Link href="/api/health" className="rounded-full border border-border/60 bg-background/40 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
                  API health
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ultimo ciclo registrado</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{autoAgentStatus}</div>
            <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(agentState.lastRunAt)} · {pricingSnapshotMeta.timezone}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Truth graph</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{truthStatusLabel}</div>
            <div className="mt-2 text-xs text-muted-foreground">{truthState.totalClaims ?? 0} claims · {truthState.needsAttention ?? 0} en atencion</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Surface graph</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{surfaceStatusLabel}</div>
            <div className="mt-2 text-xs text-muted-foreground">{surfaceState.totalChecks ?? 0} checks · {surfaceState.needsReview ?? 0} review</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Runtime</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{runtimeStatusLabel}</div>
            <div className="mt-2 text-xs text-muted-foreground">{runtimeState.telemetrySources ?? 0} señales · {runtimeState.appliedAssumptionOverrides ?? 0} overrides</div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 rounded-[28px] border border-border/60 bg-card/40 p-2 lg:grid-cols-3">
          {quickBannerItems.map((item) => (
            <div key={item.key} className={`rounded-[22px] border p-5 text-center ${item.bg}`}>
              <div className={`text-xs font-semibold ${item.color}`}>{item.label}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Tier rapido</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-muted-foreground">Input</div>
                  <div className="font-mono text-lg font-bold text-foreground">{item.input}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Output</div>
                  <div className="font-mono text-lg font-bold text-foreground">{item.output}</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">por millon de tokens</div>
            </div>
          ))}
        </section>

        <Tabs defaultValue="overview" className="space-y-6">
          <div className="sticky top-[76px] z-10 overflow-x-auto rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-xl bg-transparent p-0">
              <TabsTrigger value="overview" className="rounded-xl px-4 py-2">Vista general</TabsTrigger>
              <TabsTrigger value="pricing" className="rounded-xl px-4 py-2">Precios y lineup</TabsTrigger>
              <TabsTrigger value="scenarios" className="rounded-xl px-4 py-2">Escenarios</TabsTrigger>
              <TabsTrigger value="automation" className="rounded-xl px-4 py-2">Automatizacion</TabsTrigger>
              <TabsTrigger value="method" className="rounded-xl px-4 py-2">Metodo y operacion</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[28px] border border-border/60 bg-card/40 p-6 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Que hace esta web</div>
                <h2 className="text-2xl font-bold text-foreground">Un producto de referencia, no un simple comparador</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Aqui no solo listamos precios. Validamos datos claim-by-claim, vigilamos renames y lineups comerciales, y calculamos coste por escenario, routing y puesto con separacion explicita entre dato verificado, derivado, medido y editorial.
                </p>
                <div className="grid gap-3 md:grid-cols-3 text-xs">
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Core vendors</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{vendors.length}</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Ecosistemas vigilados</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{trackedVendors.length}</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Modo</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{orchestrationMode}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-border/60 bg-card/40 p-6 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Capas activas</div>
                {automationLayers.map((layer) => (
                  <div key={layer.name} className={`rounded-2xl border p-4 ${layer.accent}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{layer.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{layer.metric}</div>
                      </div>
                      <Link href={layer.href} className="text-xs underline underline-offset-4 opacity-90 hover:opacity-100">
                        Abrir
                      </Link>
                    </div>
                    <div className="mt-3 text-sm text-foreground">{layer.status}</div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{layer.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-border/60 bg-card/40 p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Ecosistemas que ya estan moviendo junio</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    GitHub Copilot y Microsoft 365 Copilot ya forman parte del radar editorial porque los cambios de facturacion, cuotas y naming afectan decisiones de compra aunque no entren en la calculadora core.
                  </p>
                </div>
                <Link href="/internal/surface" className="rounded-full border border-border/60 bg-background/40 px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                  Ver surface graph
                </Link>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                {trackedVendors.slice(0, 2).map((vendor) => (
                  <TrackedEcosystemCard key={vendor.id} vendor={vendor} />
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-6">
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">Modelos y planes</h2>
                <span className="rounded px-2 py-1 text-xs border border-border/60 text-muted-foreground">Pricing oficial + overrides verificados</span>
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                {vendors.map((vendor) => (
                  <VendorCard key={vendor.id} vendor={vendor} />
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">Ecosistemas vigilados</h2>
                <span className="rounded px-2 py-1 text-xs border border-violet-700/60 text-violet-300 bg-violet-950/30">Fuera del core</span>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                {trackedVendors.map((vendor) => (
                  <TrackedEcosystemCard key={vendor.id} vendor={vendor} />
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">Cargos extra y matriz funcional</h2>
                <span className="rounded px-2 py-1 text-xs border border-border/60 text-muted-foreground">Lo que realmente mueve la factura</span>
              </div>
              <ExtrasPanel />
              <FeatureMatrix />
            </section>
          </TabsContent>

          <TabsContent value="scenarios" className="space-y-6">
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">Calculadora de tokens</h2>
                <span className="rounded px-2 py-1 text-xs border border-border/60 text-muted-foreground">TCO por escenario</span>
              </div>
              <CostCalculator />
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">TCO real por caso de uso</h2>
                <span className="rounded px-2 py-1 text-xs border border-amber-700/60 bg-amber-950/30 text-amber-400">Nuevo</span>
              </div>
              <RealTCOCalculator />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-foreground">Coste por puesto y equipo</h2>
                  <span className="rounded px-2 py-1 text-xs border border-amber-700/60 bg-amber-950/30 text-amber-400">Nuevo</span>
                </div>
                <RoleCostPlanner />
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-foreground">Simulador de enrutamiento</h2>
                  <span className="rounded px-2 py-1 text-xs border border-amber-700/60 bg-amber-950/30 text-amber-400">Nuevo</span>
                </div>
                <RoutingSimulator />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <section className="rounded-[28px] border border-border/60 bg-card/40 p-6 space-y-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2 max-w-3xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Equipo de agentes</div>
                  <h2 className="text-2xl font-bold text-foreground">Cuatro agentes, dos jueces y una frontera dura de publicacion</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    La parte valiosa del producto ya no es solo el comparador. Es el sistema de vigilancia, juicio y publicacion que decide si la web sigue siendo verdad o se ha quedado congelada.
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 min-w-[260px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">Ultimo ciclo persistido</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{autoAgentStatus}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(agentState.lastRunAt)} · {pricingSnapshotMeta.timezone}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{providerStrategySummary}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {agentSteps.map((step, index) => (
                  <div key={step.name} className="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{step.name}</span>
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">Agent 0{index + 1}</span>
                    </div>
                    <div className="text-sm text-foreground">{step.role}</div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[28px] border border-border/60 bg-card/40 p-6 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">La frontera que faltaba</div>
                <h3 className="text-xl font-bold text-foreground">Por que no se actualizaba dia a dia</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Porque Vercel estaba sirviendo una foto fija generada desde `data/`, pero la ruta que tenia que volver a escribir esos JSON no estaba actuando como scheduler real de produccion. Sin commits nuevos, no hay redeploy y la web se queda leyendo el 29/05 eternamente.
                </p>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4 text-sm text-foreground">
                  Nueva frontera operativa: <span className="font-semibold">Vercel cron</span> dispara un <span className="font-semibold">workflow_dispatch</span> en GitHub Actions, GitHub ejecuta los agentes con sus secrets, hace commit de `data/` y Vercel redeploya.
                </div>
              </div>

              <div className="rounded-[28px] border border-border/60 bg-card/40 p-6 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Operacion</div>
                <div className="grid gap-3 text-xs">
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Scheduler esperado</div>
                    <div className="mt-1 text-foreground">07:00 Europe/Madrid con doble slot UTC por DST</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Worker real</div>
                    <div className="mt-1 text-foreground">GitHub Actions con commit automatico de `data/`</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Secretos clave</div>
                    <div className="mt-1 text-foreground">CRON_SECRET + GITHUB_ACTIONS_TRIGGER_TOKEN + OPENROUTER_API_KEY</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-muted-foreground">Modo manual</div>
                    <div className="mt-1 text-foreground">POST seguro al mismo endpoint de cron para forzar un refresh</div>
                  </div>
                </div>
              </div>
            </section>

            {liveBlockedByMissingKey && (
              <div className="rounded-2xl border border-red-800/50 bg-red-950/20 p-5 text-sm leading-relaxed text-red-200">
                El sistema ya esta cableado para correr con el proveedor activo, pero falta la key correspondiente en el entorno donde se ejecuto el ultimo ciclo. Mientras eso no exista, cualquier run live quedara auditado como error.
              </div>
            )}

            {liveBlockedByQuota && (
              <div className="rounded-2xl border border-red-800/50 bg-red-950/20 p-5 text-sm leading-relaxed text-red-200">
                El sistema alcanzo la API real del proveedor activo, pero la cuenta respondio con `insufficient_quota`. La integracion existe; lo que falla ahora es la capacidad de la cuenta conectada.
              </div>
            )}
          </TabsContent>

          <TabsContent value="method" className="space-y-6">
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">Metodologia y trazabilidad</h2>
                <span className="rounded px-2 py-1 text-xs border border-border/60 text-muted-foreground">Claims · assumptions · formulas</span>
              </div>
              <PricingMethodologyPanel />
            </section>

            <section className="rounded-[28px] border border-border/60 bg-card/40 p-6 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Notas metodologicas</h3>
              <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-muted-foreground">
                <li>Precios API base + overrides automaticos de agentes. Foto fija publicada: {snapshotDateLabel}. Estado actual del ciclo: {agentState.lastRunStatus}.</li>
                <li>Truth graph: {truthState.lastRunStatus ?? "never"} con {truthState.totalClaims ?? 0} claims revisados y {truthState.needsAttention ?? 0} pendientes.</li>
                <li>Surface graph: {surfaceState.lastRunStatus ?? "never"} con {surfaceState.totalChecks ?? 0} comprobaciones y {surfaceState.needsReview ?? 0} drift abiertos.</li>
                <li>Runtime autopilot: {runtimeState.lastRunStatus ?? "never"} con {runtimeState.telemetrySources ?? 0} señales medidas y lock manual {manualEditsLocked ? "activo" : "inactivo"}.</li>
                <li>Los resultados de coste distinguen datos verificados, derivados, estimados y editoriales; no mezclamos heuristica con claim sin etiquetarlo.</li>
                <li>El modelo 80/15/5 y varios multiplicadores de overhead siguen siendo hipotesis operativas, no claims oficiales del proveedor.</li>
                <li>Si el refresh supera la ventana diaria, la web debe tratarse como snapshot auditado, no como fuente de ultima hora.</li>
              </ul>
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
