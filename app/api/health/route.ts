import { NextResponse } from "next/server"

import agentState from "@/data/pricing-agent-state.json"
import truthState from "@/data/pricing-truth-state.json"
import surfaceState from "@/data/pricing-surface-state.json"
import runtimeState from "@/data/pricing-runtime-state.json"
import { vendors, trackedVendors } from "@/lib/vendor-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface MinimalState {
  lastRunAt?: string | null
  lastRunStatus?: string | null
  lastRunSummary?: string | null
}

function ageHours(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.round(((Date.now() - t) / 36e5) * 10) / 10
}

export async function GET() {
  const truth = truthState as MinimalState & {
    totalClaims?: number
    verdictCounts?: Record<string, number>
  }
  const surface = surfaceState as MinimalState & {
    totalChecks?: number
    verifiedChecks?: number
  }
  const runtime = runtimeState as MinimalState
  const agent = agentState as MinimalState & { provider?: string | null }

  const truthVerified = truth.verdictCounts?.confirmed ?? 0
  const truthTotal = truth.totalClaims ?? 0
  const truthRatio = truthTotal > 0 ? truthVerified / truthTotal : 0

  const surfaceVerified = surface.verifiedChecks ?? 0
  const surfaceTotal = surface.totalChecks ?? 0
  const surfaceRatio = surfaceTotal > 0 ? surfaceVerified / surfaceTotal : 0

  const lastRunAgeH = ageHours(agent.lastRunAt)

  const checks = {
    agentLastRunHours: lastRunAgeH,
    truthRatio,
    surfaceRatio,
    runtimeStatus: runtime.lastRunStatus ?? "never",
    provider: agent.provider ?? null,
  }

  const ok =
    truthRatio >= 0.95 &&
    surfaceRatio >= 0.95 &&
    (lastRunAgeH === null || lastRunAgeH <= 36) &&
    (runtime.lastRunStatus === "updated" ||
      runtime.lastRunStatus === "partially_updated" ||
      runtime.lastRunStatus === "disabled" ||
      runtime.lastRunStatus === "never")

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checkedAt: new Date().toISOString(),
      vendors: {
        core: vendors.length,
        tracked: trackedVendors.length,
        total: vendors.length + trackedVendors.length,
      },
      checks,
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
