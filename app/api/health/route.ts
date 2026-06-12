import { NextResponse } from "next/server"

import agentState from "@/data/pricing-agent-state.json"
import truthState from "@/data/pricing-truth-state.json"
import surfaceState from "@/data/pricing-surface-state.json"
import runtimeState from "@/data/pricing-runtime-state.json"
import { buildFreshnessStatus, getAgeHours } from "@/lib/automation-status"
import { vendors, trackedVendors } from "@/lib/vendor-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface MinimalState {
  lastRunAt?: string | null
  lastRunStatus?: string | null
  lastRunSummary?: string | null
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

  const lastRunAgeH = getAgeHours(agent.lastRunAt)
  const freshness = buildFreshnessStatus(agent.lastRunAt)

  const checks = {
    agentLastRunHours: lastRunAgeH,
    freshnessLevel: freshness.level,
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
      freshness,
      automation: {
        scheduler: "vercel-cron -> github-actions -> git commit -> vercel redeploy",
        expectedRunHour: "07:00 Europe/Madrid",
      },
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
