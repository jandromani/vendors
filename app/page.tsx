import pricingAgentState from "@/data/pricing-agent-state.json"
import pricingRuntimeGovernance from "@/data/pricing-runtime-governance.json"
import pricingRuntimeState from "@/data/pricing-runtime-state.json"
import pricingSurfaceState from "@/data/pricing-surface-state.json"
import pricingTruthState from "@/data/pricing-truth-state.json"
import Link from "next/link"
import { pricingSnapshotMeta, trackedVendors, vendors } from "@/lib/vendor-data"
import { VendorCard } from "@/components/vendor-card"
import { CostCalculator } from "@/components/cost-calculator"
import { RealTCOCalculator } from "@/components/real-tco-calculator"
import { RoutingSimulator } from "@/components/routing-simulator"
import { FeatureMatrix } from "@/components/feature-matrix"
import { ExtrasPanel } from "@/components/extras-panel"
import { PricingMethodologyPanel } from "@/components/pricing-methodology-panel"
import { RoleCostPlanner } from "@/components/role-cost-planner"
import { TrackedEcosystemCard } from "@/components/tracked-ecosystem-card"

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
        label: `${vendor.name} (${fastModel.name})`,
        input: `$${fastModel.inputPricePerMTok.toFixed(2)}`,
        output: `$${fastModel.outputPricePerMTok.toFixed(2)}`,
        color: vendorColorMap[vendor.id] ?? "text-foreground",
        bg: vendorBgMap[vendor.id] ?? "bg-card border-border/60",
      },
    ]
  })

  const snapshotDateIso = pricingSnapshotMeta.updatedByAgentAt ?? pricingSnapshotMeta.snapshotTakenAt
  const snapshotDateLabel = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: pricingSnapshotMeta.timezone,
  }).format(new Date(snapshotDateIso))

  const agentLastRunLabel = agentState.lastRunAt
    ? new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: pricingSnapshotMeta.timezone,
      }).format(new Date(agentState.lastRunAt))
    : "Pendiente del primer ciclo"

  const autoAgentStatus =
    agentState.lastRunStatus === "updated"
      ? "Cambios detectados y aplicados automáticamente"
      : agentState.lastRunStatus === "no_changes"
        ? "Vigilancia diaria ejecutada, sin cambios detectados"
        : agentState.lastRunSummary
  const truthLastRunLabel = truthState.lastRunAt
    ? new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: pricingSnapshotMeta.timezone,
      }).format(new Date(truthState.lastRunAt))
    : "Pendiente del primer ciclo"
  const truthStatusLabel =
    truthState.lastRunStatus === "verified"
      ? "Claims confirmados sin cambios"
      : truthState.lastRunStatus === "updated"
        ? "Truth graph detectó cambios publicables"
        : truthState.lastRunSummary ?? "Sin verificación claim-by-claim todavía"
  const surfaceLastRunLabel = surfaceState.lastRunAt
    ? new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: pricingSnapshotMeta.timezone,
      }).format(new Date(surfaceState.lastRunAt))
    : "Pendiente del primer ciclo"
  const surfaceStatusLabel =
    surfaceState.lastRunStatus === "verified"
      ? "Lineup, nombres y copy crítica confirmados"
      : surfaceState.lastRunStatus === "partial"
        ? "Surface graph con validación parcial"
        : surfaceState.lastRunStatus === "needs_review"
          ? "Surface graph detectó drift editorial"
          : surfaceState.lastRunSummary ?? "Sin verificación surface todavía"
  const autonomousModeActive = Boolean(runtimeGovernance.autonomousMode)
  const manualEditsLocked = Boolean(runtimeGovernance.autonomousMode && runtimeGovernance.manualEditsLocked)
  const runtimeLastRunLabel = runtimeState.lastRunAt
    ? new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: pricingSnapshotMeta.timezone,
      }).format(new Date(runtimeState.lastRunAt))
    : "Pendiente del primer ciclo"
  const runtimeStatusLabel =
    runtimeState.lastRunStatus === "updated"
      ? "Telemetría ingerida y assumptions recalibrados"
      : runtimeState.lastRunStatus === "partially_updated"
        ? "Telemetría ingerida con incidencias parciales"
        : runtimeState.lastRunStatus === "disabled"
          ? "Runtime autopilot desactivado"
          : runtimeState.lastRunSummary ?? "Sin runtime autopilot todavía"
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
        : "Configuración pendiente"
  const providerStrategySummary =
    agentState.providerStrategy?.summary ??
    "Sin failover registrado todavía."

  const agentSteps = [
    {
      name: "ScoutAgent",
      role: "Selecciona fuentes y detecta candidatos",
      detail: "Consulta solo fuentes whitelist y propone noticias o changelogs recientes que podrían afectar al pricing.",
    },
    {
      name: "ResearchAgent",
      role: "Lee la evidencia dura",
      detail: "Abre artículos concretos, extrae ventanas de texto y menciones monetarias antes de pasar nada al mapeo.",
    },
    {
      name: "MappingAgent",
      role: "Convierte evidencia en operaciones",
      detail: "Mapea solo a targets del catálogo cerrado y prepara cambios estructurados sobre campos permitidos.",
    },
    {
      name: "AuditAgent",
      role: "Aprueba o rechaza con reglas duras",
      detail: "Exige evidencia suficiente y pares input/output para modelos antes de que el updater determinista toque la foto fija.",
    },
  ]
  const truthGraphSteps = [
    {
      name: "ClaimExtractor",
      role: "Rompe la web en datos verificables",
      detail: "Cada precio visible se transforma en un claim con vendor, target, campo, valor actual y politica de frescura.",
    },
    {
      name: "TruthSourceResolver",
      role: "Asigna solo fuentes oficiales",
      detail: "Cada claim hereda una whitelist de URLs permitidas desde el truth registry antes de leer ninguna evidencia.",
    },
    {
      name: "DatumJudgeAgent",
      role: "Juzga un dato cada vez",
      detail: "Cierra cada claim como confirmed, update_required, stale_review_needed, conflict_hold o unverifiable bajo contrato JSON estricto.",
    },
    {
      name: "PublicationGate",
      role: "Bloquea cambios inseguros",
      detail: "Solo deja pasar updates autopublicables; los claims ambiguos o manual_only se quedan auditados y sin tocar la web.",
    },
  ]
  const surfaceGraphSteps = [
    {
      name: "SnapshotInventory",
      role: "Lee la foto publicada como superficie contractual",
      detail: "Toma el lineup actual, los nombres de planes y la copy crítica que ya estamos enseñando en la web.",
    },
    {
      name: "SourceSweep",
      role: "Vuelve a leer solo first-party",
      detail: "Barre páginas oficiales aprobadas para buscar renames, shutdown notices, rate cards y cambios de naming comercial.",
    },
    {
      name: "SurfaceJudge",
      role: "Detecta drift de naming y lineup",
      detail: "Compara listas esperadas frente al snapshot actual y marca cualquier ausencia, rename o modelo inesperado.",
    },
    {
      name: "CriticalCopySignals",
      role: "Verifica la copy que sí cambia decisiones",
      detail: "Revisa señales tipo GPT-5.5 en Plus, cierre de Gemini 2.0 Flash o usage-based billing en Copilot para no dejar la home vieja.",
    },
  ]
  const runtimeSteps = [
    {
      name: "SourceRegistry",
      role: "Define las únicas fuentes medidas permitidas",
      detail: "El runtime solo ingiere CSV, JSON o HTTP declarados en una whitelist; no puede inventarse nuevas fuentes.",
    },
    {
      name: "RuntimeAutopilot",
      role: "Normaliza señales y recalibra assumptions",
      detail: "Convierte telemetría bruta en registros medidos y solo aplica overrides si supera mínimos de confianza y muestra.",
    },
    {
      name: "GovernanceGate",
      role: "Bloquea la edición manual",
      detail: "Cuando el modo autónomo está activo, la UI pasa a solo lectura y la API interna devuelve 423 ante cualquier intento de edición.",
    },
    {
      name: "RuntimeState",
      role: "Deja auditoría operativa",
      detail: "Cada ciclo persiste estado, salud de ingesta, overrides aplicados e histórico de runs para inspección forense.",
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Sticky nav */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-900 text-orange-300 text-xs font-bold border-2 border-background">A</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-900 text-emerald-300 text-xs font-bold border-2 border-background">O</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-900 text-blue-300 text-xs font-bold border-2 border-background">G</span>
            </div>
            <div>
              <span className="font-bold text-foreground text-sm">AI Vendor Compare</span>
              <span className="text-muted-foreground text-xs ml-2">Foto fija: {snapshotDateLabel}</span>
            </div>
          </div>
          <nav className="flex gap-1 text-xs text-muted-foreground flex-wrap">
            <a href="#modelos"    className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Modelos</a>
            <a href="#agentes"    className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Agentes</a>
            <a href="#ecosistemas" className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Ecosistemas</a>
            <a href="#tco-tokens" className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">TCO Tokens</a>
            <a href="#tco-real"   className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">TCO Real</a>
            <a href="#puestos"    className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Puestos</a>
            <a href="#routing"    className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Routing</a>
            <a href="#metodologia" className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Metodología</a>
            <a href="/internal/lab" className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Runtime Lab</a>
            <a href="#extras"     className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Extras</a>
            <a href="#matriz"     className="px-3 py-1.5 rounded-lg hover:bg-muted/40 hover:text-foreground transition-colors">Capacidades</a>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">

        {/* Hero */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground border border-border/60 rounded-full px-3 py-1.5 bg-card/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Datos actualizados — {autoAgentStatus}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-balance text-foreground">
            Compara los tres grandes
            <span className="block mt-1">
              <span className="text-orange-400">Claude</span>
              {" · "}
              <span className="text-emerald-400">ChatGPT</span>
              {" · "}
              <span className="text-blue-400">Gemini</span>
            </span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
            Precios API reales, TCO por caso de uso con overhead de produccion, simulador de enrutamiento
            inteligente y una capa surface que vigila renames, lineups y planes adyacentes como Copilot para que la comparación no se quede vieja.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="rounded-full border border-emerald-800/40 bg-emerald-950/20 px-3 py-1 text-emerald-300">
              {truthState.verdictCounts?.confirmed ?? 0}/{truthState.totalClaims ?? 0} claims verificados
            </span>
            <span className="rounded-full border border-violet-800/40 bg-violet-950/20 px-3 py-1 text-violet-300">
              Surface {surfaceState.verifiedChecks ?? 0}/{surfaceState.totalChecks ?? 0} checks
            </span>
            <span className={`rounded-full border px-3 py-1 ${manualEditsLocked ? "border-cyan-800/40 bg-cyan-950/20 text-cyan-300" : "border-border/60 bg-card/40 text-muted-foreground"}`}>
              {manualEditsLocked ? "Modo autónomo activo · edición manual bloqueada" : "Modo autónomo aún no bloqueado"}
            </span>
            <span className="rounded-full border border-sky-800/40 bg-sky-950/20 px-3 py-1 text-sky-300">
              Resultados derivados con fórmulas versionadas
            </span>
            <span className="rounded-full border border-amber-800/40 bg-amber-950/20 px-3 py-1 text-amber-300">
              Runtime medido · {runtimeState.telemetrySources ?? 0} señales activas
            </span>
          </div>
        </div>

        <section id="agentes" className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2 max-w-3xl">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Equipo de agentes</div>
                <h2 className="text-2xl font-bold text-foreground">Vigilancia diaria de pricing a las 07:00</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  La web mantiene una foto fija, pero cada mañana un orquestador LLM coordina agentes con
                  herramientas, mensajes JSON validados y un catalogo cerrado de targets para revisar noticias
                  y changelogs, decidir si hay cambios de facturacion y actualizar automaticamente el contenido
                  estatico solo cuando la evidencia es suficiente.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 min-w-[240px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">Ultimo ciclo</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{autoAgentStatus}</div>
                <div className="mt-1 text-xs text-muted-foreground">{agentLastRunLabel} · {pricingSnapshotMeta.timezone}</div>
                {agentState.provider && agentState.model && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {agentState.provider} · {agentState.model}
                  </div>
                )}
                {agentState.providerStrategy?.failoverUsed && (
                  <div className="mt-2 text-[11px] text-emerald-200">
                    {providerStrategySummary}
                  </div>
                )}
                <Link
                  href="/internal/agents"
                  className="mt-3 inline-flex text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
                >
                  Ver dossier interno
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {agentSteps.map((step, index) => (
                <div key={step.name} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{step.name}</span>
                    <span className="text-[10px] rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                      Agent 0{index + 1}
                    </span>
                  </div>
                  <div className="text-sm text-foreground">{step.role}</div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="text-muted-foreground">Programacion</div>
                <div className="mt-1 font-mono text-foreground">07:00 Europe/Madrid</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="text-muted-foreground">Modo de orquestacion</div>
                <div className="mt-1 text-foreground">{orchestrationMode}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="text-muted-foreground">Estado actual</div>
                <div className="mt-1 text-foreground">{agentState.lastRunSummary}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="text-muted-foreground">Failover</div>
                <div className="mt-1 text-foreground">{providerStrategySummary}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/30 p-5 space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2 max-w-3xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Truth Graph
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    Verificación claim-by-claim contra fuentes oficiales
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Después del watcher de noticias, una segunda capa convierte la web en claims, resuelve fuentes de
                    verdad y decide dato por dato si el valor sigue confirmado, debe bloquearse o puede publicarse.
                  </p>
                </div>
                <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 px-4 py-3 min-w-[260px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-sky-300">Última verificación</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{truthStatusLabel}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{truthLastRunLabel} · {pricingSnapshotMeta.timezone}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    claims {truthState.totalClaims ?? 0} · atención {truthState.needsAttention ?? 0}
                  </div>
                  <Link
                    href="/internal/truth"
                    className="mt-3 inline-flex text-xs text-sky-300 hover:text-sky-200 transition-colors"
                  >
                    Ver dossier del truth graph
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {truthGraphSteps.map((step, index) => (
                  <div key={step.name} className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{step.name}</span>
                      <span className="text-[10px] rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                        Truth 0{index + 1}
                      </span>
                    </div>
                    <div className="text-sm text-foreground">{step.role}</div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Claims revisados</div>
                  <div className="mt-1 text-foreground">{truthState.totalClaims ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Confirmados</div>
                  <div className="mt-1 text-foreground">{truthState.verdictCounts?.confirmed ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">En revisión</div>
                  <div className="mt-1 text-foreground">{truthState.needsAttention ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Updates publicables</div>
                  <div className="mt-1 text-foreground">
                    {truthState.publishableUpdates ?? 0} · applied {truthState.appliedUpdates ?? 0}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/30 p-5 space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2 max-w-3xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Surface Graph
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    Naming, lineup y copy crítica bajo verificación propia
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    No basta con tener precios buenos. Esta capa comprueba que la web siga mostrando los nombres de plan correctos,
                    el lineup actual de modelos y las señales editoriales que cambian decisiones, como renames, shutdowns o nuevos modos de facturación.
                  </p>
                </div>
                <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 px-4 py-3 min-w-[260px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-violet-300">Última verificación surface</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{surfaceStatusLabel}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{surfaceLastRunLabel} · {pricingSnapshotMeta.timezone}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    checks {surfaceState.totalChecks ?? 0} · review {surfaceState.needsReview ?? 0}
                  </div>
                  <Link
                    href="/internal/surface"
                    className="mt-3 inline-flex text-xs text-violet-300 hover:text-violet-200 transition-colors"
                  >
                    Abrir dossier surface dedicado
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {surfaceGraphSteps.map((step, index) => (
                  <div key={step.name} className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{step.name}</span>
                      <span className="text-[10px] rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                        Surface 0{index + 1}
                      </span>
                    </div>
                    <div className="text-sm text-foreground">{step.role}</div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Checks totales</div>
                  <div className="mt-1 text-foreground">{surfaceState.totalChecks ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Verificados</div>
                  <div className="mt-1 text-foreground">{surfaceState.verifiedChecks ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Needs review</div>
                  <div className="mt-1 text-foreground">{surfaceState.needsReview ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Unverifiable</div>
                  <div className="mt-1 text-foreground">{surfaceState.unverifiableChecks ?? 0}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/30 p-5 space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2 max-w-3xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Runtime Autopilot
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    Los agentes ya gobiernan assumptions y telemetría operativa
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    La tercera capa del grafo ya no se limita a verificar precios: ingiere señales reales del piloto,
                    recalibra assumptions medibles y bloquea cualquier edición manual de runtime mientras la gobernanza
                    autónoma esté activa.
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/20 px-4 py-3 min-w-[260px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Autonomía runtime</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{runtimeStatusLabel}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{runtimeLastRunLabel} · {pricingSnapshotMeta.timezone}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    telemetría {runtimeState.telemetrySources ?? 0} · overrides {runtimeState.appliedAssumptionOverrides ?? 0}
                  </div>
                  <Link
                    href="/internal/lab"
                    className="mt-3 inline-flex text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
                  >
                    {manualEditsLocked ? "Abrir panel de observación" : "Abrir runtime lab"}
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {runtimeSteps.map((step, index) => (
                  <div key={step.name} className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{step.name}</span>
                      <span className="text-[10px] rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                        Runtime 0{index + 1}
                      </span>
                    </div>
                    <div className="text-sm text-foreground">{step.role}</div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Modo autónomo</div>
                  <div className="mt-1 text-foreground">{autonomousModeActive ? "Activo" : "Inactivo"}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Lock manual</div>
                  <div className="mt-1 text-foreground">{manualEditsLocked ? "Bloqueado" : "Permitido"}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Fuentes medidas</div>
                  <div className="mt-1 text-foreground">{runtimeState.telemetrySources ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="text-muted-foreground">Overrides runtime</div>
                  <div className="mt-1 text-foreground">{runtimeState.appliedAssumptionOverrides ?? 0}</div>
                </div>
              </div>
            </div>

            {liveBlockedByMissingKey && (
              <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-4 text-xs leading-relaxed text-red-200">
                El sistema ya está cableado para correr con {
                  agentState.provider === "openai"
                    ? "OpenAI"
                    : agentState.provider === "openrouter"
                      ? "OpenRouter"
                      : "Gemini"
                }, pero esta máquina todavía no tiene la clave requerida del proveedor activo. Hasta que la añadas,
                cualquier intento live quedará registrado como error auditado y la web seguirá operando con la última
                foto fija disponible.
              </div>
            )}

            {liveBlockedByQuota && (
              <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-4 text-xs leading-relaxed text-red-200">
                El sistema sí ha llegado a la API real del proveedor activo, pero la cuenta respondió con
                `insufficient_quota`. El problema ya no es de integración ni de guardarraíles: ahora mismo es
                puramente de cuota o facturación de la cuenta conectada.
              </div>
            )}
          </div>
        </section>

        {/* Quick price comparison banner */}
        <div className="grid grid-cols-3 gap-4 rounded-2xl border border-border/60 bg-card/40 p-1 overflow-hidden">
          {quickBannerItems.map((item) => (
            <div key={item.key} className={`rounded-xl border p-4 text-center space-y-1 ${item.bg}`}>
              <div className={`text-xs font-semibold ${item.color}`}>{item.label}</div>
              <div className="text-xs text-muted-foreground">Tier rapido</div>
              <div className="flex justify-center gap-3 mt-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">Input</div>
                  <div className="font-mono font-bold text-foreground text-sm">{item.input}</div>
                </div>
                <div className="border-l border-border/40" />
                <div>
                  <div className="text-[10px] text-muted-foreground">Output</div>
                  <div className="font-mono font-bold text-foreground text-sm">{item.output}</div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">por millon de tokens</div>
            </div>
          ))}
        </div>

        {/* Vendor Cards */}
        <section id="modelos" className="space-y-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Modelos y planes</h2>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">Precios oficiales</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {vendors.map(vendor => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
        </section>

        <section id="ecosistemas" className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-foreground">Ecosistemas vigilados</h2>
              <span className="text-xs border border-violet-700/60 text-violet-300 rounded px-2 py-1 bg-violet-950/30">
                Fuera del core
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              Estos proveedores no entran todavía en la calculadora principal ni en el routing core, pero sí quedan bajo vigilancia
              oficial para detectar cambios de naming, asiento y facturación que ya están moviendo el mercado en junio.
            </p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {trackedVendors.map((vendor) => (
              <TrackedEcosystemCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
        </section>

        {/* TCO por tokens (existing calculator) */}
        <section id="tco-tokens" className="space-y-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Calculadora de tokens</h2>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">TCO por escenario · tokens/dia</span>
          </div>
          <CostCalculator />
        </section>

        {/* TCO Real — use case based */}
        <section id="tco-real" className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-foreground">TCO real por caso de uso</h2>
              <span className="text-xs border border-amber-700/60 text-amber-400 rounded px-2 py-1 bg-amber-950/30">Nuevo</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              El coste real en empresa no son solo tokens. Este modulo incluye el overhead de produccion
              (loops de agente, reintentos, RAG, sesiones largas), los cargos de herramientas integrados
              en el calculo, y el modelo de degradacion inteligente 80/15/5 que puede reducir el gasto mas de un 70%.
            </p>
          </div>
          <RealTCOCalculator />
        </section>

        <section id="puestos" className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-foreground">Coste por puesto y equipo</h2>
              <span className="text-xs border border-amber-700/60 text-amber-400 rounded px-2 py-1 bg-amber-950/30">Nuevo</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              La capa de pricing verificado ya nos permite pasar de escenarios abstractos a perfiles operativos:
              soporte, ventas, ingeniería, análisis documental o builders de agentes. Cada total separa seat,
              API y tooling, y deja clara su procedencia.
            </p>
          </div>
          <RoleCostPlanner />
        </section>

        {/* Routing Simulator */}
        <section id="routing" className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-foreground">Simulador de enrutamiento</h2>
              <span className="text-xs border border-amber-700/60 text-amber-400 rounded px-2 py-1 bg-amber-950/30">Nuevo</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              Introduce el tipo de tarea, complejidad, volumen y sensibilidad al coste — el motor de reglas
              selecciona el vendor y modelo optimos, genera el JSON de configuracion de routing y estima
              el ahorro frente a usar un unico modelo premium para todo.
            </p>
          </div>
          <RoutingSimulator />
        </section>

        <section id="metodologia" className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-foreground">Metodología y trazabilidad</h2>
              <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">Claims · assumptions · formulas</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              Esta capa separa claramente qué parte de la web está verificada contra fuentes oficiales, qué parte es
              matemática derivada y qué parte sigue siendo supuesto operativo o criterio editorial.
            </p>
          </div>
          <PricingMethodologyPanel />
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">Runtime Lab</div>
              <p className="text-xs text-muted-foreground max-w-2xl">
                {manualEditsLocked
                  ? "Panel interno de observación del runtime autónomo. Los agentes ya controlan assumptions y telemetría, así que la UI queda solo para auditoría y recálculo visible."
                  : "Consola interna para calibrar assumptions y telemetría real del piloto, con recálculo instantáneo de puestos, escenarios derivados y recomendaciones."}
              </p>
            </div>
            <Link
              href="/internal/lab"
              className="inline-flex items-center rounded-full border border-border/60 bg-background/40 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {manualEditsLocked ? "Abrir panel de observación" : "Abrir runtime lab"}
            </Link>
          </div>
        </section>

        {/* Extras & Optimizations */}
        <section id="extras" className="space-y-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Cargos extras y optimizaciones</h2>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">Lo que mueve la factura real</span>
          </div>
          <ExtrasPanel />
        </section>

        {/* Feature Matrix */}
        <section id="matriz" className="space-y-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Matriz de capacidades</h2>
            <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">Comparativa funcional</span>
          </div>
          <FeatureMatrix />
        </section>

        {/* Disclaimer */}
        <footer className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-2">
          <h3 className="font-semibold text-sm text-foreground">Notas metodologicas</h3>
          <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside leading-relaxed">
            <li>Precios API base + overrides automáticos de agentes. Foto fija actual: {snapshotDateLabel}. Estado del ultimo ciclo: {agentState.lastRunStatus}.</li>
            <li>La capa `truth graph` valida claim por claim contra fuentes oficiales. Último estado de verdad: {truthState.lastRunStatus ?? "never"} con {truthState.totalClaims ?? 0} claims revisados.</li>
            <li>La capa `surface graph` vigila lineup, nombres de planes y copy crítica. Estado actual: {surfaceState.lastRunStatus ?? "never"} con {surfaceState.totalChecks ?? 0} comprobaciones.</li>
            <li>La capa `runtime autopilot` gobierna assumptions y telemetría cuando el modo autónomo está activo. Estado actual: {runtimeState.lastRunStatus ?? "never"} con {runtimeState.telemetrySources ?? 0} señales medidas y lock manual {manualEditsLocked ? "activo" : "inactivo"}.</li>
            <li>Los resultados de coste ya se calculan con una capa formal de `assumptions + formulas + role profiles`; por eso la UI distingue datos verificados, derivados, estimados y editoriales.</li>
            <li>TCO Real: los multiplicadores de overhead (agent ×7, RAG ×1.3, realtime ×2) siguen siendo estimaciones conservadoras y deben recalibrarse con telemetría propia.</li>
            <li>El modelo de degradacion 80/15/5 asume 80% de requests de baja complejidad, 15% media y 5% premium. Es un supuesto de planificación, no un claim oficial del proveedor.</li>
            <li>El simulador de enrutamiento sigue siendo editorial: sirve para orientar decisiones, no para sustituir un router productivo con observabilidad, AB tests y límites por tenant.</li>
            <li>Los precios excluyen impuestos, plataformas terceras (Bedrock, Vertex AI) y modificadores geograficos salvo donde se indiquen.</li>
          </ul>
        </footer>
      </main>
    </div>
  )
}
