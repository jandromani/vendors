"use client"

import { useMemo, useState } from "react"
import { roleProfiles, useCases, vendors } from "@/lib/vendor-data"
import { calcRoleCostBreakdown } from "@/lib/pricing-math"
import { cn } from "@/lib/utils"
import { ProvenanceBadge } from "@/components/provenance-badge"
import { BriefcaseBusiness, Building2, Calculator, ShieldCheck, Users } from "lucide-react"

const vendorColors: Record<string, string> = {
  claude: "text-orange-400",
  chatgpt: "text-emerald-400",
  gemini: "text-blue-400",
}

const vendorBorders: Record<string, string> = {
  claude: "border-orange-800/50",
  chatgpt: "border-emerald-800/50",
  gemini: "border-blue-800/50",
}

const vendorBackgrounds: Record<string, string> = {
  claude: "from-orange-950/40 to-orange-900/10",
  chatgpt: "from-emerald-950/40 to-emerald-900/10",
  gemini: "from-blue-950/40 to-blue-900/10",
}

function fmtUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(3)}`
}

export function RoleCostPlanner() {
  const [selectedRoleId, setSelectedRoleId] = useState(roleProfiles[0]?.id ?? "knowledge_worker")
  const [teamSize, setTeamSize] = useState(roleProfiles[0]?.defaultTeamSize ?? 25)
  const [dailyRequestsPerUser, setDailyRequestsPerUser] = useState(roleProfiles[0]?.dailyRequestsPerUser ?? 35)
  const [billingPreference, setBillingPreference] = useState<"monthly" | "annual">(roleProfiles[0]?.billingPreference ?? "annual")

  const selectedRole = roleProfiles.find((role) => role.id === selectedRoleId) ?? roleProfiles[0]
  const useCase = useCases.find((item) => item.id === selectedRole.primaryUseCaseId) ?? useCases[0]
  const workloadProvenance =
    useCase.provenance.avgInputTokens === "measured" || useCase.provenance.overheadMultiplier === "measured"
      ? "measured"
      : "estimated"
  const roleTrafficProvenance = selectedRole.provenance.dailyRequestsPerUser === "measured" ? "measured" : "estimated"

  const results = useMemo(() => {
    return vendors.map((vendor) =>
      calcRoleCostBreakdown(selectedRole, vendor, {
        teamSize,
        dailyRequestsPerUser,
        billingPreference,
      })
    )
  }, [billingPreference, dailyRequestsPerUser, selectedRole, teamSize])

  const minMonthly = Math.min(...results.map((item) => item.monthlyTotal))

  const handleRoleChange = (roleId: string) => {
    const role = roleProfiles.find((item) => item.id === roleId)
    if (!role) return
    setSelectedRoleId(roleId)
    setTeamSize(role.defaultTeamSize)
    setDailyRequestsPerUser(role.dailyRequestsPerUser)
    setBillingPreference(role.billingPreference)
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 space-y-6">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg text-foreground">Planificador por puesto y equipo</h3>
          <span className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-0.5">
            Seat + API + tooling
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Perfil de puesto</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {roleProfiles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleRoleChange(role.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all space-y-2",
                    selectedRoleId === role.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:border-border"
                  )}
                >
                  <div className="font-semibold text-sm">{role.label}</div>
                  <p className="text-xs leading-relaxed opacity-90">{role.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Equipo</label>
                <input
                  type="number"
                  value={teamSize}
                  onChange={(event) => setTeamSize(Math.max(1, parseInt(event.target.value) || 1))}
                  className="w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Requests / usuario / dia</label>
                <input
                  type="number"
                  value={dailyRequestsPerUser}
                  onChange={(event) => setDailyRequestsPerUser(Math.max(1, parseInt(event.target.value) || 1))}
                  className="w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Billing seat plan</label>
              <div className="flex gap-2">
                {(["annual", "monthly"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setBillingPreference(mode)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm transition-all",
                      billingPreference === mode
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/60 bg-card/40 text-muted-foreground"
                    )}
                  >
                    {mode === "annual" ? "Anual" : "Mensual"}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                Modelo activo del puesto
              </div>
              <div className="flex flex-wrap gap-2">
                <ProvenanceBadge kind={workloadProvenance} label="Workload" />
                <ProvenanceBadge kind={roleTrafficProvenance} label="Traffic" />
                <ProvenanceBadge kind="editorial" label="Seat strategy" />
                <ProvenanceBadge kind="derived" label="Formulas trazables" />
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Caso principal: <span className="text-foreground">{useCase.label}</span> ·
                sensibilidad de datos: <span className="text-foreground">{selectedRole.dataSensitivity}</span> ·
                cache {selectedRole.withCache ? "on" : "off"} ·
                batch {selectedRole.withBatch ? "on" : "off"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.map((result) => {
          const isWinner = result.monthlyTotal === minMonthly
          return (
            <div
              key={result.vendor.id}
              className={cn(
                "rounded-2xl border bg-gradient-to-b p-5 space-y-4 relative overflow-hidden",
                vendorBorders[result.vendor.id],
                vendorBackgrounds[result.vendor.id],
                isWinner && "ring-2 ring-offset-2 ring-offset-background"
              )}
            >
              {isWinner && (
                <div className="absolute top-3 right-3 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                  Menor coste
                </div>
              )}

              <div>
                <div className={cn("text-sm font-semibold", vendorColors[result.vendor.id])}>{result.vendor.name}</div>
                <div className="text-xs text-muted-foreground">
                  {result.model.name} · {result.seatPlan?.name ?? "Sin asiento dedicado"}
                </div>
              </div>

              <div>
                <div className="text-3xl font-bold font-mono text-foreground">{fmtUsd(result.monthlyTotal)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">/ mes · {teamSize} usuarios</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border/50 bg-background/30 p-3">
                  <div className="text-muted-foreground">Seat / usuario</div>
                  <div className="mt-1 font-mono text-foreground">{fmtUsd(result.seatCostPerUser)}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/30 p-3">
                  <div className="text-muted-foreground">API / usuario</div>
                  <div className="mt-1 font-mono text-foreground">{fmtUsd(result.apiMonthlyCostPerUser)}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/30 p-3">
                  <div className="text-muted-foreground">Tooling / usuario</div>
                  <div className="mt-1 font-mono text-foreground">{fmtUsd(result.toolingCostPerUser)}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/30 p-3">
                  <div className="text-muted-foreground">Anual total</div>
                  <div className="mt-1 font-mono text-foreground">{fmtUsd(result.annualTotal)}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <ProvenanceBadge kind={result.formula.provenance} />
                <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {result.formula.formulaId}
                </span>
              </div>

              <div className="text-[11px] text-muted-foreground leading-relaxed">
                {result.monthlyRequestsPerUser.toLocaleString("es-ES")} requests/usuario/mes ·
                billing {result.billingPreference} ·
                use case {result.role.primaryUseCaseId}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-foreground">Desglose por vendor</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seat plan + API + tooling por usuario y total del equipo.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{selectedRole.label}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seat plan</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seat / usr</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">API / usr</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tooling / usr</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mes / usr</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mes equipo</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anual</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr
                  key={result.vendor.id}
                  className={cn(
                    "border-b border-border/20 hover:bg-muted/10 transition-colors",
                    index % 2 === 0 ? "" : "bg-muted/5"
                  )}
                >
                  <td className={cn("px-5 py-3 font-semibold", vendorColors[result.vendor.id])}>{result.vendor.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {result.seatPlan?.name ?? "Sin asiento"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-foreground">{fmtUsd(result.seatCostPerUser)}</td>
                  <td className="px-5 py-3 text-right font-mono text-foreground">{fmtUsd(result.apiMonthlyCostPerUser)}</td>
                  <td className="px-5 py-3 text-right font-mono text-foreground">{fmtUsd(result.toolingCostPerUser)}</td>
                  <td className="px-5 py-3 text-right font-mono text-foreground">{fmtUsd(result.monthlyPerUser)}</td>
                  <td className="px-5 py-3 text-right font-mono text-foreground">{fmtUsd(result.monthlyTotal)}</td>
                  <td className="px-5 py-3 text-right font-mono text-foreground">{fmtUsd(result.annualTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            Fórmula mensual activa
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <div className="text-xs font-mono text-muted-foreground">{results[0]?.formula.formulaId}</div>
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
              `teamSize * (seatCostPerUser + apiMonthlyCostPerUser + explicitToolingCostPerUser)`
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            Lectura operativa
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            El componente de asiento parte de precios verificados cuando el plan es público. El componente API es
            matemático, pero depende del workload del puesto y por tanto su procedencia agregada será normalmente
            `estimada`. El total del equipo no inventa nada: suma explícitamente lo verificado y lo asumido.
          </p>
        </div>
      </div>
    </div>
  )
}
