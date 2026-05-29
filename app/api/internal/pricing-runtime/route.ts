import fs from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"

const numericSchema = z.number().finite()

const assumptionOverrideSchema = z.object({
  id: z.string().min(1),
  value: numericSchema,
  reason: z.string().max(240).nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

const telemetrySourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["active", "draft", "disabled"]),
  useCaseId: z.string().min(1).optional(),
  roleProfileId: z.string().min(1).optional(),
  sampleWindowDays: numericSchema.optional(),
  sampleSizeRequests: numericSchema.optional(),
  sampleSizeUsers: numericSchema.optional(),
  avgInputTokens: numericSchema.optional(),
  avgOutputTokens: numericSchema.optional(),
  overheadMultiplier: numericSchema.optional(),
  avgRequestsPerUserPerDay: numericSchema.optional(),
  cacheHitRate: numericSchema.min(0).max(1).optional(),
  batchHitRate: numericSchema.min(0).max(1).optional(),
  confidence: numericSchema.min(0).max(1).optional(),
  sourceLabel: z.string().max(160).optional(),
  recordedAt: z.string().optional(),
  notes: z.string().max(400).optional(),
})

const requestSchema = z.object({
  assumptionOverrides: z.array(assumptionOverrideSchema),
  telemetrySources: z.array(telemetrySourceSchema),
  updatedBy: z.string().max(80).optional(),
})

const dataDir = path.join(process.cwd(), "data")
const assumptionOverridesPath = path.join(dataDir, "pricing-assumption-overrides.json")
const telemetryPath = path.join(dataDir, "pricing-telemetry.json")
const governancePath = path.join(dataDir, "pricing-runtime-governance.json")
const runtimeStatePath = path.join(dataDir, "pricing-runtime-state.json")

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function GET() {
  const governance = await readJsonFile(governancePath, {
    autonomousMode: false,
    manualEditsLocked: false,
  })
  const assumptionOverrides = await readJsonFile(assumptionOverridesPath, {
    version: "pricing-assumption-overrides-v1",
    updatedAt: null,
    updatedBy: null,
    overrides: [],
  })
  const telemetry = await readJsonFile(telemetryPath, {
    version: "pricing-telemetry-v1",
    updatedAt: null,
    sources: [],
  })
  const runtimeState = await readJsonFile(runtimeStatePath, {
    lastRunStatus: "never",
    lastRunSummary: "Sin ciclos del runtime autopilot todavía.",
  })

  return NextResponse.json({
    governance,
    assumptionOverrides,
    telemetry,
    runtimeState,
  })
}

export async function POST(request: Request) {
  const governance = await readJsonFile(governancePath, {
    autonomousMode: false,
    manualEditsLocked: false,
  })
  if (governance.autonomousMode && governance.manualEditsLocked) {
    return NextResponse.json(
      {
        ok: false,
        error: "manual_edits_locked",
        message: "Runtime autopilot owns assumptions and telemetry while autonomous mode is active.",
      },
      { status: 423 }
    )
  }

  const payload = requestSchema.parse(await request.json())
  const updatedAt = new Date().toISOString()

  await fs.writeFile(
    assumptionOverridesPath,
    `${JSON.stringify({
      version: "pricing-assumption-overrides-v1",
      updatedAt,
      updatedBy: payload.updatedBy ?? "internal-lab",
      overrides: payload.assumptionOverrides.map((override) => ({
        ...override,
        updatedAt: override.updatedAt ?? updatedAt,
      })),
    }, null, 2)}\n`,
    "utf8"
  )

  await fs.writeFile(
    telemetryPath,
    `${JSON.stringify({
      version: "pricing-telemetry-v1",
      updatedAt,
      sources: payload.telemetrySources,
    }, null, 2)}\n`,
    "utf8"
  )

  return NextResponse.json({
    ok: true,
    updatedAt,
    overridesCount: payload.assumptionOverrides.length,
    telemetryCount: payload.telemetrySources.length,
  })
}
