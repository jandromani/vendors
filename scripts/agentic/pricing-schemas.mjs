import { z } from "zod"

export const vendorIdSchema = z.enum(["claude", "chatgpt", "gemini", "githubcopilot", "m365copilot"])
export const decisionSchema = z.enum(["tool_call", "final"])
export const operationTargetTypeSchema = z.enum(["model", "seatPlan"])
export const operationFieldSchema = z.enum([
  "inputPricePerMTok",
  "outputPricePerMTok",
  "priceMonthly",
  "priceAnnual",
])

export const actionEnvelopeSchema = z.object({
  decision: decisionSchema,
  rationale: z.string().min(1).max(280),
  toolName: z.string().min(1).max(80).nullable(),
  toolInput: z.record(z.any()).nullable(),
  finalPayload: z.record(z.any()).nullable(),
})

export const candidateItemSchema = z.object({
  candidateId: z.string().min(8).max(80),
  sourceId: z.string().min(1).max(80),
  sourceLabel: z.string().min(1).max(120),
  vendorId: vendorIdSchema,
  title: z.string().min(1).max(500),
  summary: z.string().max(1000),
  link: z.string().url(),
  publishedAt: z.string().datetime(),
  relevanceScore: z.number().min(0).max(1),
  relevanceReason: z.string().min(1).max(280),
})

export const scoutFinalSchema = z.object({
  status: z.enum(["ok", "insufficient_evidence"]),
  candidates: z.array(candidateItemSchema).max(12),
  notes: z.array(z.string().min(1).max(280)).max(6),
})

export const numericMentionSchema = z.object({
  raw: z.string().min(1).max(80),
  value: z.number().positive(),
  snippet: z.string().min(1).max(320),
})

export const evidenceBundleSchema = z.object({
  candidateId: z.string().min(8).max(80),
  vendorId: vendorIdSchema,
  articleUrl: z.string().url(),
  articleTitle: z.string().min(1).max(500),
  sourceReliability: z.enum(["official", "secondary"]),
  changeDetected: z.boolean(),
  changeType: z.enum(["model_pricing", "seat_plan_pricing", "unknown"]),
  targetHints: z.array(z.string().min(1).max(120)).max(8),
  numericMentions: z.array(numericMentionSchema).max(12),
  evidenceSnippets: z.array(z.string().min(1).max(320)).max(4),
  conclusion: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
})

export const researchFinalSchema = z.object({
  status: z.enum(["ok", "insufficient_evidence"]),
  evidenceBundles: z.array(evidenceBundleSchema).max(12),
  notes: z.array(z.string().min(1).max(280)).max(6),
})

export const operationSchema = z.object({
  vendorId: vendorIdSchema,
  targetType: operationTargetTypeSchema,
  targetName: z.string().min(1).max(120),
  field: operationFieldSchema,
  value: z.number().positive(),
  currency: z.literal("USD"),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().min(1).max(500),
  evidenceSnippet: z.string().min(1).max(320),
  rationale: z.string().min(1).max(280),
  confidence: z.number().min(0).max(1),
})

export const mapperFinalSchema = z.object({
  status: z.enum(["ok", "insufficient_evidence"]),
  operations: z.array(operationSchema).max(24),
  rejectedEvidence: z.array(z.object({
    candidateId: z.string().min(8).max(80),
    reason: z.string().min(1).max(280),
  })).max(12),
  notes: z.array(z.string().min(1).max(280)).max(6),
})

export const auditedOperationSchema = operationSchema.extend({
  auditNote: z.string().min(1).max(280),
})

export const auditFinalSchema = z.object({
  status: z.enum(["approved", "partially_approved", "rejected", "insufficient_evidence"]),
  approvedOperations: z.array(auditedOperationSchema).max(24),
  rejectedOperations: z.array(z.object({
    operationFingerprint: z.string().min(8).max(120),
    reason: z.string().min(1).max(280),
  })).max(24),
  summary: z.string().min(1).max(280),
})

export const toolInputSchemas = {
  list_sources: z.object({}).strict(),
  read_source: z.object({
    sourceId: z.string().min(1).max(80),
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  search_google_news: z.object({
    vendorId: vendorIdSchema,
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  read_article: z.object({
    url: z.string().url(),
  }).strict(),
  get_catalog: z.object({}).strict(),
  get_current_snapshot: z.object({}).strict(),
  read_watch_state: z.object({}).strict(),
  extract_alias_windows: z.object({
    vendorId: vendorIdSchema,
    text: z.string().min(1).max(15000),
  }).strict(),
  extract_money_mentions: z.object({
    text: z.string().min(1).max(15000),
  }).strict(),
}

export const genericActionJsonSchema = {
  type: "OBJECT",
  properties: {
    decision: {
      type: "STRING",
      enum: ["tool_call", "final"],
    },
    rationale: {
      type: "STRING",
    },
    toolName: {
      type: "STRING",
      nullable: true,
    },
    toolInput: {
      type: "OBJECT",
      nullable: true,
    },
    finalPayload: {
      type: "OBJECT",
      nullable: true,
    },
  },
  required: ["decision", "rationale", "toolName", "toolInput", "finalPayload"],
}

export function describeToolInput(toolName) {
  const descriptions = {
    list_sources: "{}",
    read_source: '{ "sourceId": string, "limit"?: 1..20 }',
    search_google_news: '{ "vendorId": "claude" | "chatgpt" | "gemini" | "githubcopilot" | "m365copilot", "limit"?: 1..20 }',
    read_article: '{ "url": "https://..." }',
    get_catalog: "{}",
    get_current_snapshot: "{}",
    read_watch_state: "{}",
    extract_alias_windows: '{ "vendorId": "...", "text": "article text" }',
    extract_money_mentions: '{ "text": "article text" }',
  }
  return descriptions[toolName] ?? "{}"
}

export function describeFinalPayload(agentId) {
  const descriptions = {
    ScoutAgent:
      'Return { "status": "ok" | "insufficient_evidence", "candidates": Candidate[], "notes": string[] }',
    ResearchAgent:
      'Return { "status": "ok" | "insufficient_evidence", "evidenceBundles": EvidenceBundle[], "notes": string[] }',
    MappingAgent:
      'Return { "status": "ok" | "insufficient_evidence", "operations": Operation[], "rejectedEvidence": [...], "notes": string[] }',
    AuditAgent:
      'Return { "status": "approved" | "partially_approved" | "rejected" | "insufficient_evidence", "approvedOperations": AuditedOperation[], "rejectedOperations": [...], "summary": string }',
  }
  return descriptions[agentId] ?? "{}"
}

export function buildOperationFingerprint(operation) {
  return [
    operation.vendorId,
    operation.targetType,
    operation.targetName,
    operation.field,
    operation.value,
    operation.sourceUrl,
  ].join("|")
}
