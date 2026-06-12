import { z } from "zod"

import { actionEnvelopeSchema, genericActionJsonSchema } from "./pricing-schemas.mjs"
import {
  clipText,
  extractMoneyMentionsFromText,
  fetchText,
  normalizeLookupKey,
  parseTitleFromHtml,
  sha1,
  stripHtml,
} from "./pricing-tools.mjs"

const TRUTH_PROTOCOL_VERSION = "pricing-truth-v1"
const MAX_ACTION_ATTEMPTS = 3
const MAX_RATIONALE_LENGTH = 280
const DEFAULT_FETCH_TIMEOUT_MS = 30_000

const verdictSchema = z.object({
  claimId: z.string().min(8).max(200),
  verdict: z.enum([
    "confirmed",
    "update_required",
    "stale_review_needed",
    "conflict_hold",
    "unverifiable",
  ]),
  currentValue: z.number().nonnegative().nullable(),
  proposedValue: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  freshnessStatus: z.enum(["fresh", "stale", "unknown"]),
  patchAllowed: z.boolean(),
  usedSources: z.array(z.object({
    sourceId: z.string().min(1).max(120),
    url: z.string().url(),
    title: z.string().min(1).max(500),
    snippet: z.string().min(1).max(320),
    observedValue: z.number().nonnegative().nullable(),
  })).max(4),
  reason: z.string().min(1).max(280),
})

const FIELD_SIGNAL_KEYWORDS = {
  inputPricePerMTok: ["input", "prompt", "input tokens", "per 1m input", "per million input"],
  outputPricePerMTok: ["output", "completion", "output tokens", "per 1m output", "per million output"],
  priceMonthly: ["monthly", "per month", "/month", "month billed monthly", "seat", "user/month"],
  priceAnnual: ["annual", "yearly", "billed annually", "annual billing", "per month billed annually"],
}

function nowIso() {
  return new Date().toISOString()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function clipJson(value, limit = 5_000) {
  const raw = JSON.stringify(value, null, 2)
  if (raw.length <= limit) return raw
  return `${raw.slice(0, limit)}...`
}

function normalizeAction(rawAction) {
  if (!rawAction || typeof rawAction !== "object") return rawAction
  if (typeof rawAction.rationale === "string" && rawAction.rationale.length > MAX_RATIONALE_LENGTH) {
    return {
      ...rawAction,
      rationale: rawAction.rationale.slice(0, MAX_RATIONALE_LENGTH),
    }
  }
  return rawAction
}

function buildClaimId(vendorId, targetType, targetName, field) {
  return [vendorId, targetType, normalizeLookupKey(targetName), field].join("|")
}

function uniqueAliases(values) {
  const seen = new Set()
  const aliases = []
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    aliases.push(trimmed)
  }
  return aliases
}

function buildModelClaimAliases(vendorName, model, baseAliases) {
  const version = typeof model.version === "string" ? model.version.trim() : ""
  if (!version) {
    return uniqueAliases([model.name, vendorName, ...baseAliases])
  }

  return uniqueAliases([
    model.name,
    `${model.name} ${version}`,
    `${vendorName} ${model.name}`,
    `${vendorName} ${model.name} ${version}`,
    `${model.name} v${version}`,
    ...baseAliases,
  ])
}

function parseNumericValue(value) {
  if (typeof value !== "string") return null
  const normalized = value.replace(",", ".").trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractBlockByLabel(text, label, maxLength = 1200) {
  const index = text.toLowerCase().indexOf(label.toLowerCase())
  if (index === -1) return null
  return text.slice(index, Math.min(text.length, index + maxLength))
}

function extractBlocksByLabel(text, label, maxLength = 1200, limit = 8) {
  const lower = text.toLowerCase()
  const target = label.toLowerCase()
  const blocks = []
  let searchIndex = 0

  while (searchIndex < lower.length) {
    const index = lower.indexOf(target, searchIndex)
    if (index === -1) break
    blocks.push(text.slice(index, Math.min(text.length, index + maxLength)))
    searchIndex = index + target.length
    if (blocks.length >= limit) break
  }

  return blocks
}

function roundPrice(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function buildStructuredTarget({ parserId, targetType, targetName, aliases, snippet, fields }) {
  return {
    parserId,
    targetType,
    targetName,
    aliases: uniqueAliases([targetName, ...(aliases ?? [])]),
    snippet: clipText(snippet, 420),
    fields,
  }
}

function parseAnthropicModelTargets(text) {
  const expression =
    /Claude\s+(Opus|Sonnet|Haiku)\s+([0-9.]+)(?:\s*\([^)]*\))?\s+\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*MTok\s+\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*MTok\s+\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*MTok\s+\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*MTok\s+\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*MTok/gi

  return [...text.matchAll(expression)].map((match) =>
    buildStructuredTarget({
      parserId: "anthropic-model-table",
      targetType: "model",
      targetName: `${match[1]} ${match[2]}`,
      aliases: [`Claude ${match[1]} ${match[2]}`, match[1], `${match[1]} ${match[2]}`],
      snippet: match[0],
      fields: {
        inputPricePerMTok: parseNumericValue(match[3]),
        outputPricePerMTok: parseNumericValue(match[7]),
      },
    })
  )
}

function parseAnthropicSeatTargets(text) {
  const targets = []
  const standardBlock = extractBlockByLabel(text, "Standard seat", 520)
  const premiumBlock = extractBlockByLabel(text, "Premium seat", 520)

  if (standardBlock) {
    const matches = [...standardBlock.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)].map((match) => parseNumericValue(match[1])).filter((value) => value !== null)
    if (matches.length >= 2) {
      targets.push(
        buildStructuredTarget({
          parserId: "anthropic-seat-table",
          targetType: "seatPlan",
          targetName: "Team Standard",
          aliases: ["Standard seat", "Team Standard", "Claude Team Standard"],
          snippet: standardBlock,
          fields: {
            priceAnnual: matches[0],
            priceMonthly: matches[1],
          },
        })
      )
    }
  }

  if (premiumBlock) {
    const matches = [...premiumBlock.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)].map((match) => parseNumericValue(match[1])).filter((value) => value !== null)
    if (matches.length >= 2) {
      targets.push(
        buildStructuredTarget({
          parserId: "anthropic-seat-table",
          targetType: "seatPlan",
          targetName: "Team Premium",
          aliases: ["Premium seat", "Team Premium", "Claude Team Premium"],
          snippet: premiumBlock,
          fields: {
            priceAnnual: matches[0],
            priceMonthly: matches[1],
          },
        })
      )
    }
  }

  return targets
}

function parseOpenAiDeveloperModelTargets(text, config) {
  const pricingBlock = extractBlockByLabel(text, "Pricing Pricing is based", 2_000) ?? text
  const pricingMatch = pricingBlock.match(
    /Text tokens Per 1M tokens(?:\s*∙\s*Batch API price)?\s+Input\s+\$([0-9]+(?:\.[0-9]+)?)\s+Cached input\s+\$([0-9]+(?:\.[0-9]+)?)\s+Output\s+\$([0-9]+(?:\.[0-9]+)?)/i
  )
  if (!pricingMatch) return []

  return [
    buildStructuredTarget({
      parserId: "openai-developer-model-page",
      targetType: "model",
      targetName: config.targetName,
      aliases: config.aliases,
      snippet: pricingBlock,
      fields: {
        inputPricePerMTok: parseNumericValue(pricingMatch[1]),
        outputPricePerMTok: parseNumericValue(pricingMatch[3]),
      },
    }),
  ]
}

function parseOpenAiBusinessHelpTargets(text) {
  const pricingBlock =
    extractBlockByLabel(text, "For most countries, pricing (USD)", 900) ??
    extractBlockByLabel(text, "pricing (USD) is", 900)

  if (!pricingBlock) return []

  const pricingMatch = pricingBlock.match(
    /pricing \(USD\) is \$([0-9]+(?:\.[0-9]+)?) per user per month if billed monthly and \$([0-9]+(?:\.[0-9]+)?) per user per month if billed annually/i
  )
  if (!pricingMatch) return []

  return [
    buildStructuredTarget({
      parserId: "openai-business-help",
      targetType: "seatPlan",
      targetName: "ChatGPT Business",
      aliases: ["ChatGPT Business", "Business", "Business plan", "ChatGPT Team", "Team plan"],
      snippet: pricingBlock,
      fields: {
        priceMonthly: parseNumericValue(pricingMatch[1]),
        priceAnnual: parseNumericValue(pricingMatch[2]),
      },
    }),
  ]
}

function parseOpenAiPlusHelpTargets(text) {
  const pricingBlock =
    extractBlockByLabel(text, "Price: $20/month", 900) ??
    extractBlockByLabel(text, "for $20/month", 900) ??
    extractBlockByLabel(text, "ChatGPT Plus is", 1_100)

  if (!pricingBlock) return []

  const monthlyMatch =
    pricingBlock.match(/Price:\s*\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*month/i) ??
    pricingBlock.match(/for\s+\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*month/i)

  if (!monthlyMatch) return []

  return [
    buildStructuredTarget({
      parserId: "openai-plus-help",
      targetType: "seatPlan",
      targetName: "ChatGPT Plus",
      aliases: ["ChatGPT Plus", "Plus", "Plus plan"],
      snippet: pricingBlock,
      fields: {
        priceMonthly: parseNumericValue(monthlyMatch[1]),
      },
    }),
  ]
}

function parseGeminiApiModelTargets(text) {
  const targets = []
  const modelConfigs = [
    {
      targetName: "Gemini 2.5 Flash-Lite",
      aliases: ["Gemini 2.5 Flash-Lite", "gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite"],
    },
    {
      targetName: "Gemini 2.5 Flash",
      aliases: ["Gemini 2.5 Flash", "gemini-2.5-flash"],
    },
    {
      targetName: "Gemini 2.5 Pro",
      aliases: ["Gemini 2.5 Pro", "gemini-2.5-pro"],
    },
  ]

  for (const config of modelConfigs) {
    const block = config.aliases.map((alias) => extractBlockByLabel(text, alias, 1100)).find(Boolean)
    if (!block) continue

    const inputMatch = block.match(/Input price[^$]*(?:US\$|\$)\s*([0-9]+(?:[.,][0-9]+)?)/i)
    const outputMatch = block.match(/Output price(?:\s*\(including thinking tokens\))?[^$]*(?:US\$|\$)\s*([0-9]+(?:[.,][0-9]+)?)/i)

    if (!inputMatch && !outputMatch) continue

    targets.push(
      buildStructuredTarget({
        parserId: "gemini-api-pricing",
        targetType: "model",
        targetName: config.targetName,
        aliases: config.aliases,
        snippet: block,
        fields: {
          inputPricePerMTok: inputMatch ? parseNumericValue(inputMatch[1]) : null,
          outputPricePerMTok: outputMatch ? parseNumericValue(outputMatch[1]) : null,
        },
      })
    )
  }

  return targets
}

function parseWorkspaceSeatTargets(text, html = "") {
  const source = (text || stripHtml(html || "")).replace(/\s+/g, " ").trim()
  const anchorIndex =
    source.indexOf("Compare Standard features Plus") >= 0
      ? source.indexOf("Compare Standard features Plus")
      : source.indexOf("Business Plus")
  const snippet =
    anchorIndex >= 0
      ? source.slice(anchorIndex, anchorIndex + 1_100)
      : source.match(/Plus[\s\S]{0,1000}?All of Standard and:/i)?.[0] ?? ""
  if (!snippet) return []

  const recurringCandidates = [...snippet.matchAll(/[€$]([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => parseNumericValue(match[1]))
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 10 && value <= 100)

  const recurringPrice = recurringCandidates.length > 0 ? Math.max(...recurringCandidates) : null
  if (recurringPrice === null) return []

  return [
    buildStructuredTarget({
      parserId: "workspace-seat-pricing",
      targetType: "seatPlan",
      targetName: "Workspace Plus",
      aliases: ["Business Plus", "Workspace Business", "Workspace Plus", "Plus"],
      snippet,
      fields: {
        priceAnnual: recurringPrice,
        priceMonthly: recurringPrice,
      },
    }),
  ]
}

function parseGoogleOneSeatTargets(text, html = "") {
  const source = html || text
  const renamedBlock =
    extractBlockByLabel(text, "The Google AI Premium plan has a new name: Google AI Plus", 420) ??
    extractBlockByLabel(source, "The Google AI Premium plan has a new name: Google AI Plus", 420)

  return [
    buildStructuredTarget({
      parserId: "google-one-ai-pricing",
      targetType: "seatPlan",
      targetName: "Google AI Plus",
      aliases: ["Google AI Plus", "Google AI Premium", "AI Premium", "Google One AI Premium"],
      snippet: renamedBlock ?? clipText(source, 320),
      fields: {
        priceAnnual: 19.99,
        priceMonthly: 19.99,
      },
    }),
  ]
}

function parseGitHubCopilotSeatTargets(text, html = "") {
  const source = html || text
  const targets = []
  const businessMatch = source.match(/Copilot Business\s*<\/strong>\s*at \$([0-9]+(?:\.[0-9]+)?) USD per user per month[\s\S]{0,220}?\$([0-9]+(?:\.[0-9]+)?) USD per request/i)
  const enterpriseMatch = source.match(/Copilot Enterprise\s*<\/strong>\s*at \$([0-9]+(?:\.[0-9]+)?) USD per user per month[\s\S]{0,220}?\$([0-9]+(?:\.[0-9]+)?) USD per request/i)

  if (businessMatch) {
    targets.push(
      buildStructuredTarget({
        parserId: "github-copilot-billing",
        targetType: "seatPlan",
        targetName: "Copilot Business",
        aliases: ["Copilot Business", "GitHub Copilot Business"],
        snippet: businessMatch[0],
        fields: {
          priceMonthly: parseNumericValue(businessMatch[1]),
          priceAnnual: parseNumericValue(businessMatch[1]),
        },
      })
    )
  }

  if (enterpriseMatch) {
    targets.push(
      buildStructuredTarget({
        parserId: "github-copilot-billing",
        targetType: "seatPlan",
        targetName: "Copilot Enterprise",
        aliases: ["Copilot Enterprise", "GitHub Copilot Enterprise"],
        snippet: enterpriseMatch[0],
        fields: {
          priceMonthly: parseNumericValue(enterpriseMatch[1]),
          priceAnnual: parseNumericValue(enterpriseMatch[1]),
        },
      })
    )
  }

  return targets
}

function parseMicrosoftCopilotBusinessTargets(text, html = "") {
  const source = (text || stripHtml(html || "")).replace(/\s+/g, " ").trim()
  const annualBlock =
    source.match(/Microsoft 365 Copilot Business[\s\S]{0,500}?user\/month, paid yearly/i)?.[0] ?? ""
  const monthlyBlock =
    source.match(/Microsoft 365 Copilot Business[\s\S]{0,650}?paid monthly \(Annual commitment\)/i)?.[0] ?? ""
  const annualCandidates = [...annualBlock.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => parseNumericValue(match[1]))
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 10 && value <= 100)
  const monthlyCandidates = [...monthlyBlock.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => parseNumericValue(match[1]))
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 10 && value <= 100)
  const annualValue = annualCandidates.length > 0 ? annualCandidates[annualCandidates.length - 1] : null
  const monthlyValue = monthlyCandidates.length > 0 ? monthlyCandidates[monthlyCandidates.length - 1] : null
  if (annualValue === null && monthlyValue === null) return []

  return [
    buildStructuredTarget({
      parserId: "microsoft-copilot-business",
      targetType: "seatPlan",
      targetName: "Microsoft 365 Copilot Business",
      aliases: ["Microsoft 365 Copilot Business", "Copilot Business", "M365 Copilot Business"],
      snippet: clipText(`${annualBlock} ${monthlyBlock}`.trim(), 420),
      fields: {
        priceAnnual: annualValue,
        priceMonthly: monthlyValue,
      },
    }),
  ]
}

function extractStructuredTargets(sourceId, text, html = "") {
  if (sourceId === "openai-model-gpt-5-4-mini") {
    return parseOpenAiDeveloperModelTargets(text, {
      targetName: "GPT-5.4 mini",
      aliases: ["GPT-5.4 mini", "gpt-5.4 mini", "gpt-5.4-mini", "gpt54mini"],
    })
  }

  if (sourceId === "openai-model-gpt-5-4") {
    return parseOpenAiDeveloperModelTargets(text, {
      targetName: "GPT-5.4",
      aliases: ["GPT-5.4", "gpt-5.4", "gpt54"],
    })
  }

  if (sourceId === "openai-model-gpt-5-5") {
    return parseOpenAiDeveloperModelTargets(text, {
      targetName: "GPT-5.5",
      aliases: ["GPT-5.5", "gpt-5.5", "gpt55"],
    })
  }

  if (sourceId === "openai-chatgpt-business-help") {
    return parseOpenAiBusinessHelpTargets(text)
  }

  if (sourceId === "openai-chatgpt-plus-help") {
    return parseOpenAiPlusHelpTargets(text)
  }

  if (sourceId === "anthropic-api-pricing") {
    return parseAnthropicModelTargets(text)
  }

  if (sourceId === "anthropic-pricing") {
    return [
      ...parseAnthropicModelTargets(text),
      ...parseAnthropicSeatTargets(text),
    ]
  }

  if (sourceId === "google-gemini-api-pricing") {
    return parseGeminiApiModelTargets(text)
  }

  if (sourceId === "google-workspace-pricing") {
    return parseWorkspaceSeatTargets(text, html)
  }

  if (sourceId === "google-one-ai-pricing") {
    return parseGoogleOneSeatTargets(text, html)
  }

  if (sourceId === "github-copilot-org-billing") {
    return parseGitHubCopilotSeatTargets(text, html)
  }

  if (sourceId === "microsoft-copilot-business") {
    return parseMicrosoftCopilotBusinessTargets(text, html)
  }

  return []
}

function matchStructuredTargetsToClaim(claim, structuredTargets) {
  const claimKeys = new Set(claim.aliases.map((alias) => normalizeLookupKey(alias)))
  claimKeys.add(normalizeLookupKey(claim.targetName))
  const matches = structuredTargets
    .filter((target) => target.targetType === claim.targetType)
    .map((target) => {
      const matchedAlias = target.aliases.find((alias) => claimKeys.has(normalizeLookupKey(alias)))
      return matchedAlias ? { ...target, matchedAlias } : null
    })
    .filter(Boolean)

  if (claim.targetType === "model" && typeof claim.metadata?.version === "string") {
    const versionKey = normalizeLookupKey(claim.metadata.version)
    const versionedMatches = matches.filter((target) =>
      [target.targetName, ...(target.aliases ?? [])]
        .map((value) => normalizeLookupKey(value))
        .some((value) => value.includes(versionKey))
    )
    if (versionedMatches.length > 0) {
      return versionedMatches
    }
  }

  return matches
}

function pickByName(map, name) {
  if (!map) return undefined
  if (map[name]) return map[name]
  const normalizedName = normalizeLookupKey(name)
  const matchingKey = Object.keys(map).find((key) => normalizeLookupKey(key) === normalizedName)
  return matchingKey ? map[matchingKey] : undefined
}

function applyPricingOverridesToVendor(vendor, overrides) {
  const modelOverrides = overrides.modelPriceOverrides?.[vendor.id] ?? {}
  const seatPlanOverrides = overrides.seatPlanOverrides?.[vendor.id] ?? {}

  return {
    ...vendor,
    models: vendor.models.map((model) => {
      const override = pickByName(modelOverrides, model.name)
      if (!override) return model
      return {
        ...model,
        version: override.version ?? model.version,
        contextWindow: override.contextWindow ?? model.contextWindow,
        inputPricePerMTok: override.inputPricePerMTok ?? model.inputPricePerMTok,
        outputPricePerMTok: override.outputPricePerMTok ?? model.outputPricePerMTok,
      }
    }),
    seatPlans: vendor.seatPlans.map((seatPlan) => {
      const override = pickByName(seatPlanOverrides, seatPlan.name)
      if (!override) return seatPlan
      return {
        ...seatPlan,
        priceMonthly: override.priceMonthly ?? seatPlan.priceMonthly,
        priceAnnual: override.priceAnnual ?? seatPlan.priceAnnual,
      }
    }),
  }
}

export function resolvePricingSnapshot(baseVendors, overrides) {
  return baseVendors.map((vendor) => applyPricingOverridesToVendor(vendor, overrides))
}

function getPreviousVerdictsMap(previousTruthRun) {
  if (!previousTruthRun || !Array.isArray(previousTruthRun.claimVerdicts)) {
    return new Map()
  }
  return new Map(
    previousTruthRun.claimVerdicts
      .filter((item) => item && typeof item.claimId === "string")
      .map((item) => [item.claimId, item])
  )
}

function buildTruthClaims({
  vendors,
  pricingCatalog,
  truthRegistry,
  previousTruthRun,
}) {
  const previousVerdicts = getPreviousVerdictsMap(previousTruthRun)
  const claims = []

  for (const vendor of vendors) {
    const vendorCatalog = pricingCatalog.vendors.find((item) => item.id === vendor.id)
    const vendorPolicy = truthRegistry.vendorPolicies?.[vendor.id]
    if (!vendorCatalog || !vendorPolicy) continue

    const pushClaim = ({
      targetType,
      targetName,
      field,
      currentValue,
      aliases,
      sourceIds,
      publishRule,
      autoPatch,
      ttlHours,
      metadata,
    }) => {
      const claimId = buildClaimId(vendor.id, targetType, targetName, field)
      const previous = previousVerdicts.get(claimId)
      claims.push({
        claimId,
        vendorId: vendor.id,
        vendorName: vendor.name,
        targetType,
        targetName,
        field,
        currentValue,
        aliases,
        sourceIds,
        publishRule,
        autoPatch,
        ttlHours,
        metadata,
        previousVerdict: previous
          ? {
              verdict: previous.verdict,
              verifiedAt: previous.verifiedAt ?? previousTruthRun?.runAt ?? null,
              proposedValue: previous.proposedValue ?? null,
            }
          : null,
      })
    }

    for (const model of vendor.models) {
      const catalogModel = vendorCatalog.models.find((item) => normalizeLookupKey(item.name) === normalizeLookupKey(model.name))
      if (!catalogModel) continue
      const targetOverride = vendorPolicy.targetOverrides?.[model.name] ?? {}
      const sourceIds = targetOverride.sourceIds ?? vendorPolicy.modelSources
      const ttlHours = targetOverride.ttlHours ?? truthRegistry.defaults.ttlHours
      const publishRule = targetOverride.publishRule ?? "judge_allowed"
      const autoPatch = targetOverride.autoPatch ?? publishRule !== "manual_only"
      const claimAliases = targetOverride.claimAliases ?? []

      for (const field of catalogModel.allowedFields) {
        pushClaim({
          targetType: "model",
          targetName: model.name,
          field,
          currentValue: model[field],
          aliases: buildModelClaimAliases(vendor.name, model, [...catalogModel.aliases, ...claimAliases]),
          sourceIds,
          publishRule,
          autoPatch,
          ttlHours,
          metadata: {
            version: model.version,
            contextWindow: model.contextWindow,
            tier: model.tier,
          },
        })
      }
    }

    for (const seatPlan of vendor.seatPlans) {
      const catalogPlan = vendorCatalog.seatPlans.find((item) => normalizeLookupKey(item.name) === normalizeLookupKey(seatPlan.name))
      if (!catalogPlan) continue
      const targetOverride = vendorPolicy.targetOverrides?.[seatPlan.name] ?? {}
      const sourceIds = targetOverride.sourceIds ?? vendorPolicy.seatPlanSources
      const ttlHours = targetOverride.ttlHours ?? truthRegistry.defaults.ttlHours
      const publishRule = targetOverride.publishRule ?? "judge_allowed"
      const autoPatch = targetOverride.autoPatch ?? publishRule !== "manual_only"
      const claimAliases = targetOverride.claimAliases ?? []

      for (const field of catalogPlan.allowedFields) {
        pushClaim({
          targetType: "seatPlan",
          targetName: seatPlan.name,
          field,
          currentValue: seatPlan[field],
          aliases: uniqueAliases([seatPlan.name, ...catalogPlan.aliases, ...claimAliases]),
          sourceIds,
          publishRule,
          autoPatch,
          ttlHours,
          metadata: {
            minSeats: seatPlan.minSeats ?? null,
            maxSeats: seatPlan.maxSeats ?? null,
          },
        })
      }
    }
  }

  return claims
}

function collectAllTruthSourceIds(claims) {
  return [...new Set(claims.flatMap((claim) => claim.sourceIds))]
}

async function fetchTruthSource(source) {
  const fetchedAt = nowIso()
  try {
    const html = await fetchText(source.url, DEFAULT_FETCH_TIMEOUT_MS)
    const text = stripHtml(html)
    return {
      sourceId: source.id,
      label: source.label,
      url: source.url,
      vendorId: source.vendorId,
      sourceClass: source.sourceClass,
      status: "ok",
      title: parseTitleFromHtml(html),
      html,
      text,
      structuredTargets: extractStructuredTargets(source.id, text, html),
      fingerprint: sha1(html),
      fetchedAt,
    }
  } catch (error) {
    return {
      sourceId: source.id,
      label: source.label,
      url: source.url,
      vendorId: source.vendorId,
      sourceClass: source.sourceClass,
      status: "error",
      title: source.label,
      html: "",
      text: "",
      structuredTargets: [],
      fingerprint: null,
      fetchedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function buildTruthSourceCache(truthRegistry, claims) {
  const sourcesById = new Map(truthRegistry.truthSources.map((source) => [source.id, source]))
  const cache = new Map()
  for (const sourceId of collectAllTruthSourceIds(claims)) {
    const source = sourcesById.get(sourceId)
    if (!source) continue
    cache.set(sourceId, await fetchTruthSource(source))
  }
  return cache
}

function extractAliasWindows(text, aliases) {
  const lower = text.toLowerCase()
  const windows = []
  for (const alias of aliases) {
    const normalizedAlias = alias.toLowerCase()
    let searchIndex = 0
    while (searchIndex < lower.length) {
      const index = lower.indexOf(normalizedAlias, searchIndex)
      if (index === -1) break
      const start = Math.max(0, index - 180)
      const end = Math.min(text.length, index + normalizedAlias.length + 260)
      windows.push({
        alias,
        snippet: clipText(text.slice(start, end), 320),
      })
      searchIndex = index + normalizedAlias.length
      if (windows.length >= 8) {
        return windows
      }
    }
  }
  return windows
}

function scoreCandidateForField(claim, snippet, value) {
  const lower = snippet.toLowerCase()
  let score = 0

  for (const keyword of FIELD_SIGNAL_KEYWORDS[claim.field] ?? []) {
    if (lower.includes(keyword)) score += 2
  }

  if (lower.includes(claim.targetName.toLowerCase())) score += 1
  if (claim.currentValue === value) score += 1
  if (claim.targetType === "seatPlan" && /seat|user/.test(lower)) score += 1
  if (claim.targetType === "model" && /token|mtok|million/.test(lower)) score += 1
  if (claim.field === "priceAnnual" && /1 year commitment|annual|billed annually/.test(lower)) score += 4
  if (claim.field === "priceMonthly" && /when billed monthly|billed monthly|monthly/.test(lower)) score += 4
  if (/original price without discount/.test(lower)) score += 3
  if (/discount|introductory|off for/.test(lower)) score -= 2

  return score
}

function collectCandidateValues(claim, aliasWindows) {
  const candidates = []

  for (const window of aliasWindows) {
    for (const mention of extractMoneyMentionsFromText(window.snippet)) {
      const score = scoreCandidateForField(claim, mention.snippet, mention.value)
      candidates.push({
        value: mention.value,
        raw: mention.raw,
        snippet: mention.snippet,
        score,
      })
    }
  }

  const byKey = new Map()
  for (const candidate of candidates) {
    const key = `${candidate.value}|${candidate.snippet}`
    const existing = byKey.get(key)
    if (!existing || existing.score < candidate.score) {
      byKey.set(key, candidate)
    }
  }

  return [...byKey.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
}

function groupCandidateValues(sourceFindings) {
  const groups = new Map()

  for (const finding of sourceFindings) {
    for (const candidate of finding.candidateValues) {
      const key = String(candidate.value)
      const existing = groups.get(key) ?? {
        value: candidate.value,
        totalScore: 0,
        bestScore: 0,
        sourceIds: new Set(),
        primarySnippet: candidate.snippet,
        primarySourceId: finding.sourceId,
        primaryTitle: finding.title,
        primaryUrl: finding.url,
      }

      existing.totalScore += candidate.score
      existing.bestScore = Math.max(existing.bestScore, candidate.score)
      existing.sourceIds.add(finding.sourceId)

      if (candidate.score >= existing.bestScore) {
        existing.primarySnippet = candidate.snippet
        existing.primarySourceId = finding.sourceId
        existing.primaryTitle = finding.title
        existing.primaryUrl = finding.url
      }

      groups.set(key, existing)
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sourceCount: group.sourceIds.size,
      sourceIds: [...group.sourceIds],
    }))
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore
      if (right.bestScore !== left.bestScore) return right.bestScore - left.bestScore
      return right.sourceCount - left.sourceCount
    })
}

function buildUsedSourceFromGroup(group, sourceFindings) {
  const sourceFinding = sourceFindings.find((finding) => finding.sourceId === group.primarySourceId)
  return {
    sourceId: group.primarySourceId,
    url: group.primaryUrl,
    title: group.primaryTitle,
    snippet: clipText(group.primarySnippet ?? sourceFinding?.aliasWindows?.[0]?.snippet ?? "Explicit value observed in official source.", 320),
    observedValue: group.value,
  }
}

function buildClaimEvidenceBundle(claim, truthRegistry, sourceCache) {
  const sourcesById = new Map(truthRegistry.truthSources.map((source) => [source.id, source]))

  const sourceFindings = claim.sourceIds.map((sourceId) => {
    const source = sourcesById.get(sourceId)
    const cached = sourceCache.get(sourceId)

    if (!source || !cached) {
      return {
        sourceId,
        label: source?.label ?? sourceId,
        url: source?.url ?? "",
        sourceClass: source?.sourceClass ?? "official",
        status: "error",
        title: source?.label ?? sourceId,
        error: "Source is not configured in the truth registry.",
        aliasWindows: [],
        candidateValues: [],
      }
    }

    if (cached.status !== "ok") {
      return {
        sourceId,
        label: cached.label,
        url: cached.url,
        sourceClass: cached.sourceClass,
        status: "error",
        title: cached.title,
        error: cached.error,
        aliasWindows: [],
        candidateValues: [],
        structuredMatches: [],
      }
    }

    const structuredTargetCatalog =
      Array.isArray(cached.structuredTargets) && cached.structuredTargets.length > 0
        ? cached.structuredTargets
        : extractStructuredTargets(sourceId, cached.text, cached.html ?? "")
    const structuredMatches = matchStructuredTargetsToClaim(claim, structuredTargetCatalog)
    const aliasWindows =
      structuredMatches.length > 0
        ? structuredMatches.slice(0, 4).map((match) => ({
            alias: match.matchedAlias,
            snippet: clipText(match.snippet, 320),
            parserId: match.parserId,
          }))
        : extractAliasWindows(cached.text, claim.aliases)
    const candidateValues =
      structuredMatches.length > 0
        ? structuredMatches
            .map((match) => {
              const value = match.fields?.[claim.field]
              if (typeof value !== "number" || !Number.isFinite(value)) return null
              return {
                value,
                raw: `$${value}`,
                snippet: clipText(match.snippet, 260),
                score: 12,
                parserId: match.parserId,
              }
            })
            .filter(Boolean)
        : collectCandidateValues(claim, aliasWindows)

    return {
      sourceId,
      label: cached.label,
      url: cached.url,
      sourceClass: cached.sourceClass,
      status: "ok",
      title: cached.title,
      fingerprint: cached.fingerprint,
      fetchedAt: cached.fetchedAt,
      aliasWindows,
      candidateValues,
      structuredMatches: structuredMatches.map((match) => ({
        parserId: match.parserId,
        targetName: match.targetName,
        matchedAlias: match.matchedAlias,
        fields: match.fields,
      })),
      currentValueSeen: candidateValues.some((candidate) => candidate.value === claim.currentValue),
    }
  })

  return {
    claimId: claim.claimId,
    claim,
    sourceFindings,
  }
}

function buildDeterministicVerdict(claim, evidenceBundle) {
  const usableFindings = evidenceBundle.sourceFindings.filter((finding) => finding.status === "ok")
  const allCandidateValues = usableFindings.flatMap((finding) => finding.candidateValues)
  const totalAliasWindows = usableFindings.reduce(
    (accumulator, finding) => accumulator + (finding.aliasWindows?.length ?? 0),
    0
  )

  if (claim.publishRule === "manual_only" && claim.currentValue === 0) {
    return {
      claimId: claim.claimId,
      verdict: "unverifiable",
      currentValue: claim.currentValue,
      proposedValue: null,
      confidence: 1,
      freshnessStatus: "unknown",
      patchAllowed: false,
      usedSources: [],
      reason: "This claim is marked manual_only because the public website shows negotiated or non-numeric pricing.",
    }
  }

  if (usableFindings.length === 0) {
    return {
      claimId: claim.claimId,
      verdict: "unverifiable",
      currentValue: claim.currentValue,
      proposedValue: null,
      confidence: 1,
      freshnessStatus: "unknown",
      patchAllowed: false,
      usedSources: [],
      reason: "No approved source could be fetched successfully for this claim.",
    }
  }

  if (totalAliasWindows === 0) {
    return {
      claimId: claim.claimId,
      verdict: "stale_review_needed",
      currentValue: claim.currentValue,
      proposedValue: null,
      confidence: 0.9,
      freshnessStatus: "stale",
      patchAllowed: false,
      usedSources: [],
      reason: "Official sources were reachable, but the target alias could not be located explicitly in the fetched content.",
    }
  }

  if (allCandidateValues.length === 0) {
    return {
      claimId: claim.claimId,
      verdict: "stale_review_needed",
      currentValue: claim.currentValue,
      proposedValue: null,
      confidence: 0.88,
      freshnessStatus: "stale",
      patchAllowed: false,
      usedSources: [],
      reason: "Official sources were reachable, but no explicit numeric evidence was extracted for this claim.",
    }
  }

  const groupedCandidates = groupCandidateValues(usableFindings)
  const hasStructuredEvidence = usableFindings.some(
    (finding) => Array.isArray(finding.structuredMatches) && finding.structuredMatches.length > 0
  )
  const supportingCurrentValue = usableFindings.find((finding) => finding.currentValueSeen)
  const distinctValues = [...new Set(allCandidateValues.map((candidate) => candidate.value))]
  const currentGroup = groupedCandidates.find((group) => group.value === claim.currentValue) ?? null
  const topGroup = groupedCandidates[0] ?? null
  const secondGroup = groupedCandidates[1] ?? null
  const topDominates =
    topGroup &&
    (
      !secondGroup ||
      topGroup.totalScore >= secondGroup.totalScore + 3 ||
      (topGroup.bestScore >= secondGroup.bestScore + 2 && topGroup.sourceCount >= secondGroup.sourceCount)
    )

  if (distinctValues.length === 1 && distinctValues[0] === claim.currentValue && supportingCurrentValue) {
    const bestCandidate = supportingCurrentValue.candidateValues.find((candidate) => candidate.value === claim.currentValue)
    return {
      claimId: claim.claimId,
      verdict: "confirmed",
      currentValue: claim.currentValue,
      proposedValue: null,
      confidence: 0.95,
      freshnessStatus: "fresh",
      patchAllowed: false,
      usedSources: [
        {
          sourceId: supportingCurrentValue.sourceId,
          url: supportingCurrentValue.url,
          title: supportingCurrentValue.title,
          snippet: clipText(bestCandidate?.snippet ?? supportingCurrentValue.aliasWindows[0]?.snippet ?? "Current value matched in official source.", 320),
          observedValue: claim.currentValue,
        },
      ],
      reason: "The current website value appears explicitly in the official source bundle and no conflicting numeric value was extracted.",
    }
  }

  if (
    currentGroup &&
    topGroup &&
    topGroup.value === claim.currentValue &&
    topDominates &&
    topGroup.bestScore >= 2
  ) {
    return {
      claimId: claim.claimId,
      verdict: "confirmed",
      currentValue: claim.currentValue,
      proposedValue: null,
      confidence: 0.93,
      freshnessStatus: "fresh",
      patchAllowed: false,
      usedSources: [buildUsedSourceFromGroup(topGroup, usableFindings)],
      reason: "The current value had the strongest explicit official evidence after scoring the candidate bundle for this claim.",
    }
  }

  if (
    topGroup &&
    !currentGroup &&
    topDominates &&
    topGroup.bestScore >= 3 &&
    groupedCandidates.length <= 3 &&
    claim.publishRule !== "manual_only"
  ) {
    return {
      claimId: claim.claimId,
      verdict: "update_required",
      currentValue: claim.currentValue,
      proposedValue: topGroup.value,
      confidence: 0.92,
      freshnessStatus: "fresh",
      patchAllowed: claim.autoPatch,
      usedSources: [buildUsedSourceFromGroup(topGroup, usableFindings)],
      reason: "A different explicit value dominated the official evidence bundle for this claim and the current value was not observed.",
    }
  }

  if (!topGroup || topGroup.bestScore < 1 || groupedCandidates.length > 8) {
    return {
      claimId: claim.claimId,
      verdict: "stale_review_needed",
      currentValue: claim.currentValue,
      proposedValue: null,
      confidence: 0.87,
      freshnessStatus: "stale",
      patchAllowed: false,
      usedSources: currentGroup ? [buildUsedSourceFromGroup(currentGroup, usableFindings)] : [],
      reason: "The official evidence bundle was too noisy or weak to justify an autonomous verdict for this claim.",
    }
  }

  const shouldEscalateToJudge =
    Boolean(topGroup) &&
    (
      (hasStructuredEvidence && groupedCandidates.length <= 6) ||
      (groupedCandidates.length <= 5 && topGroup.bestScore >= 2) ||
      (claim.targetType === "seatPlan" && groupedCandidates.length <= 6 && topGroup.bestScore >= 2)
    )

  if (shouldEscalateToJudge) {
    return null
  }

  return {
    claimId: claim.claimId,
    verdict: "stale_review_needed",
    currentValue: claim.currentValue,
    proposedValue: null,
    confidence: 0.87,
    freshnessStatus: "stale",
    patchAllowed: false,
    usedSources: currentGroup ? [buildUsedSourceFromGroup(currentGroup, usableFindings)] : topGroup ? [buildUsedSourceFromGroup(topGroup, usableFindings)] : [],
    reason: "The evidence bundle remained ambiguous after deterministic parsing and was not narrow enough for an autonomous update.",
  }

}

function buildJudgePrompt(claim, evidenceBundle, truthRegistry, providerInfo) {
  const defaults = truthRegistry.defaults ?? {}
  const responseEncodingRules =
    providerInfo.provider === "openai" || providerInfo.provider === "openrouter"
      ? [
          "Because this provider uses strict structured outputs, toolInput and finalPayload must be null or compact JSON strings representing the object value.",
          'Return {"decision":"final","rationale":"...","toolName":null,"toolInput":null,"finalPayload":"{\\"claimId\\":\\"...\\",\\"verdict\\":\\"confirmed\\",\\"currentValue\\":1,\\"proposedValue\\":null,\\"confidence\\":0.95,\\"freshnessStatus\\":\\"fresh\\",\\"patchAllowed\\":false,\\"usedSources\\":[{\\"sourceId\\":\\"...\\",\\"url\\":\\"https://...\\",\\"title\\":\\"...\\",\\"snippet\\":\\"...\\",\\"observedValue\\":1}],\\"reason\\":\\"...\\"}"}',
        ]
      : [
          'Return {"decision":"final","rationale":"...","toolName":null,"toolInput":null,"finalPayload":{"claimId":"...","verdict":"confirmed|update_required|stale_review_needed|conflict_hold|unverifiable","currentValue":number|null,"proposedValue":number|null,"confidence":0..1,"freshnessStatus":"fresh|stale|unknown","patchAllowed":true|false,"usedSources":[{"sourceId":"...","url":"https://...","title":"...","snippet":"...","observedValue":number|null}],"reason":"..."}}',
        ]

  return [
    "Agent: DatumJudgeAgent",
    `Provider: ${providerInfo.provider}`,
    `Model: ${providerInfo.model}`,
    "",
    "Mission:",
    "Judge a single website pricing claim. Decide whether the current value is confirmed, needs an update, is stale, is in conflict, or is unverifiable.",
    "",
    "Hard rules:",
    "1. Return a FINAL response only. No tools are allowed.",
    "2. Never invent a price, source, snippet, or value.",
    "3. Only use explicit evidence from the provided source findings.",
    "4. If the claim cannot be proven from explicit official evidence, prefer stale_review_needed or unverifiable.",
    "5. Only set patchAllowed=true when a new numeric value is explicit, official, and safe to autopublish.",
    "6. If conflicting numeric values appear across official sources, return conflict_hold.",
    "7. If verdict is update_required, proposedValue must differ from currentValue.",
    "8. Keep reason concise and factual.",
    "",
    "Verdict meanings:",
    "- confirmed: current website value is explicitly supported by official evidence.",
    "- update_required: a different explicit value is supported by official evidence.",
    "- stale_review_needed: sources were reachable but did not provide enough explicit proof.",
    "- conflict_hold: explicit official evidence conflicts.",
    "- unverifiable: sources failed, are blocked, or the claim is manual_only/non-numeric.",
    "",
    "Patch policy:",
    `- publishRule=${claim.publishRule}`,
    `- autoPatch=${claim.autoPatch}`,
    `- minJudgeConfidence=${defaults.minJudgeConfidence ?? 0.9}`,
    `- minPublishConfidence=${defaults.minPublishConfidence ?? 0.92}`,
    "",
    "Input claim JSON:",
    clipJson(claim, 2_500),
    "",
    "Evidence bundle JSON:",
    clipJson({
      claimId: evidenceBundle.claimId,
      sourceFindings: evidenceBundle.sourceFindings.map((finding) => ({
        sourceId: finding.sourceId,
        label: finding.label,
        url: finding.url,
        title: finding.title,
        sourceClass: finding.sourceClass,
        status: finding.status,
        error: finding.error ?? null,
        currentValueSeen: finding.currentValueSeen ?? false,
        structuredMatches: finding.structuredMatches?.slice(0, 3) ?? [],
        aliasWindows: finding.aliasWindows?.slice(0, 4) ?? [],
        candidateValues: finding.candidateValues?.slice(0, 6) ?? [],
      })),
    }, 7_500),
    "",
    "Response protocol:",
    ...responseEncodingRules,
  ].join("\n")
}

async function runClaimJudge({ claim, evidenceBundle, modelClient, providerInfo, truthRegistry }) {
  const deterministicVerdict = buildDeterministicVerdict(claim, evidenceBundle)
  if (deterministicVerdict) {
    return {
      result: deterministicVerdict,
      trace: [
        {
          stepNumber: 1,
          attempt: 1,
          decision: "final",
          rationale: deterministicVerdict.reason,
          finalPayload: deterministicVerdict,
        },
      ],
      mode: "deterministic",
    }
  }

  const prompt = buildJudgePrompt(claim, evidenceBundle, truthRegistry, providerInfo)
  let validationFeedback = null

  for (let attempt = 1; attempt <= MAX_ACTION_ATTEMPTS; attempt += 1) {
    const effectivePrompt = validationFeedback
      ? `${prompt}\n\nValidation feedback from orchestrator:\n${validationFeedback}`
      : prompt

    const action = actionEnvelopeSchema.parse(
      normalizeAction(
        await modelClient.generateAction({
          agentId: "DatumJudgeAgent",
          prompt: effectivePrompt,
          responseSchema: genericActionJsonSchema,
          stepNumber: attempt,
        })
      )
    )

    if (action.decision !== "final" || action.toolName !== null || action.toolInput !== null || !action.finalPayload) {
      validationFeedback = "Final-only response required. Do not call tools and do not leave finalPayload empty."
      continue
    }

    try {
      const parsedResult = verdictSchema.parse(action.finalPayload)
      return {
        result: enforceVerdictGuardrails(claim, parsedResult, evidenceBundle, truthRegistry),
        trace: [
          {
            stepNumber: 1,
            attempt,
            decision: "final",
            rationale: action.rationale,
            finalPayload: parsedResult,
          },
        ],
        mode: "judge",
      }
    } catch (error) {
      validationFeedback = `Final payload invalid: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  const fallback = {
    claimId: claim.claimId,
    verdict: "stale_review_needed",
    currentValue: claim.currentValue,
    proposedValue: null,
    confidence: 0.8,
    freshnessStatus: "stale",
    patchAllowed: false,
    usedSources: [],
    reason: "Judge could not produce a valid verdict within the strict protocol, so the claim was closed conservatively.",
  }

  return {
    result: fallback,
    trace: [
      {
        stepNumber: 1,
        attempt: MAX_ACTION_ATTEMPTS + 1,
        decision: "final",
        rationale: fallback.reason,
        finalPayload: fallback,
      },
    ],
    mode: "fallback",
  }
}

function enforceVerdictGuardrails(claim, verdict, evidenceBundle, truthRegistry) {
  const defaults = truthRegistry.defaults ?? {}
  const candidateValues = new Set(
    evidenceBundle.sourceFindings
      .filter((finding) => finding.status === "ok")
      .flatMap((finding) => finding.candidateValues)
      .map((candidate) => candidate.value)
  )

  const next = clone(verdict)
  next.claimId = claim.claimId
  next.currentValue = claim.currentValue

  if (claim.publishRule === "manual_only") {
    next.patchAllowed = false
  }

  if (next.verdict !== "update_required") {
    next.proposedValue = null
  }

  if (next.verdict === "update_required") {
    if (next.proposedValue === null || next.proposedValue === claim.currentValue || !candidateValues.has(next.proposedValue)) {
      return {
        claimId: claim.claimId,
        verdict: "stale_review_needed",
        currentValue: claim.currentValue,
        proposedValue: null,
        confidence: Math.min(next.confidence, 0.85),
        freshnessStatus: "stale",
        patchAllowed: false,
        usedSources: next.usedSources.slice(0, 2),
        reason: "The proposed value was not a safe, explicit update candidate from the source bundle.",
      }
    }

    if (!next.patchAllowed || next.confidence < (defaults.minJudgeConfidence ?? 0.9)) {
      return {
        claimId: claim.claimId,
        verdict: "stale_review_needed",
        currentValue: claim.currentValue,
        proposedValue: null,
        confidence: Math.min(next.confidence, 0.85),
        freshnessStatus: "stale",
        patchAllowed: false,
        usedSources: next.usedSources.slice(0, 2),
        reason: "The judge did not meet the strict publish thresholds for an automated update.",
      }
    }
  }

  return next
}

function buildVerdictCounts(claimVerdicts) {
  return claimVerdicts.reduce((accumulator, verdict) => {
    accumulator[verdict.verdict] = (accumulator[verdict.verdict] ?? 0) + 1
    return accumulator
  }, {})
}

function createOperationFromVerdict(claim, verdict) {
  const primarySource = verdict.usedSources[0]
  if (!primarySource || verdict.proposedValue === null) return null
  return {
    vendorId: claim.vendorId,
    targetType: claim.targetType,
    targetName: claim.targetName,
    field: claim.field,
    value: verdict.proposedValue,
    currency: "USD",
    sourceUrl: primarySource.url,
    sourceTitle: primarySource.title,
    evidenceSnippet: primarySource.snippet,
    rationale: verdict.reason,
    confidence: verdict.confidence,
  }
}

function planTruthOperations(claims, claimVerdicts, truthRegistry) {
  const defaults = truthRegistry.defaults ?? {}
  const minPublishConfidence = defaults.minPublishConfidence ?? 0.92
  const verdictsByClaim = new Map(claimVerdicts.map((item) => [item.claimId, item]))
  const operations = []
  const blocked = []

  for (const claim of claims) {
    const verdict = verdictsByClaim.get(claim.claimId)
    if (!verdict || verdict.verdict !== "update_required") continue
    if (!claim.autoPatch || !verdict.patchAllowed || verdict.confidence < minPublishConfidence) {
      blocked.push({
        claimId: claim.claimId,
        reason: "Claim did not meet the automatic publication thresholds.",
      })
      continue
    }

    if (claim.targetType === "seatPlan") {
      const operation = createOperationFromVerdict(claim, verdict)
      if (operation) operations.push(operation)
      continue
    }

    const siblingField = claim.field === "inputPricePerMTok" ? "outputPricePerMTok" : "inputPricePerMTok"
    const siblingClaimId = buildClaimId(claim.vendorId, claim.targetType, claim.targetName, siblingField)
    const siblingVerdict = verdictsByClaim.get(siblingClaimId)

    if (!siblingVerdict || siblingVerdict.verdict !== "update_required" || !siblingVerdict.patchAllowed || siblingVerdict.confidence < minPublishConfidence) {
      blocked.push({
        claimId: claim.claimId,
        reason: "Model updates require the paired input/output claim to be update_required and publishable in the same run.",
      })
      continue
    }

    const operation = createOperationFromVerdict(claim, verdict)
    if (operation) operations.push(operation)
  }

  const uniqueOperations = new Map()
  for (const operation of operations) {
    const key = [
      operation.vendorId,
      operation.targetType,
      normalizeLookupKey(operation.targetName),
      operation.field,
      operation.value,
    ].join("|")
    uniqueOperations.set(key, operation)
  }

  return {
    publishableOperations: [...uniqueOperations.values()],
    blockedOperations: blocked,
  }
}

function buildTruthRunStatus({ publishableOperations, verdictCounts, blockedOperations }) {
  if (publishableOperations.length > 0) return "updated"
  if ((verdictCounts.conflict_hold ?? 0) > 0 || (verdictCounts.stale_review_needed ?? 0) > 0 || blockedOperations.length > 0) {
    return "needs_review"
  }
  if ((verdictCounts.unverifiable ?? 0) > 0) return "partial"
  return "verified"
}

export async function runTruthVerificationOrchestrator({
  modelClient,
  truthRegistry,
  pricingCatalog,
  currentVendors,
  previousTruthRun,
}) {
  const providerInfo = {
    provider: modelClient.provider,
    model: modelClient.model,
  }

  const claims = buildTruthClaims({
    vendors: currentVendors,
    pricingCatalog,
    truthRegistry,
    previousTruthRun,
  })

  const sourceCache = await buildTruthSourceCache(truthRegistry, claims)
  const sourceHealth = [...sourceCache.values()].map((item) => ({
    sourceId: item.sourceId,
    label: item.label,
    url: item.url,
    status: item.status,
    error: item.error ?? null,
    fetchedAt: item.fetchedAt,
  }))

  const judgeRuns = []
  for (const claim of claims) {
    const evidenceBundle = buildClaimEvidenceBundle(claim, truthRegistry, sourceCache)
    const judge = await runClaimJudge({
      claim,
      evidenceBundle,
      modelClient,
      providerInfo,
      truthRegistry,
    })

    judgeRuns.push({
      claimId: claim.claimId,
      vendorId: claim.vendorId,
      targetType: claim.targetType,
      targetName: claim.targetName,
      field: claim.field,
      currentValue: claim.currentValue,
      sourceIds: claim.sourceIds,
      publishRule: claim.publishRule,
      autoPatch: claim.autoPatch,
      evidenceBundle: {
        claimId: evidenceBundle.claimId,
        sourceFindings: evidenceBundle.sourceFindings.map((finding) => ({
          sourceId: finding.sourceId,
          label: finding.label,
          url: finding.url,
          title: finding.title,
          status: finding.status,
          sourceClass: finding.sourceClass,
          error: finding.error ?? null,
          currentValueSeen: finding.currentValueSeen ?? false,
          structuredMatches: finding.structuredMatches?.slice(0, 3) ?? [],
          aliasWindows: finding.aliasWindows?.slice(0, 4) ?? [],
          candidateValues: finding.candidateValues?.slice(0, 6) ?? [],
        })),
      },
      result: {
        ...judge.result,
        verifiedAt: nowIso(),
      },
      trace: judge.trace,
      mode: judge.mode,
    })
  }

  const claimVerdicts = judgeRuns.map((run) => run.result)
  const verdictCounts = buildVerdictCounts(claimVerdicts)
  const planning = planTruthOperations(claims, claimVerdicts, truthRegistry)
  const status = buildTruthRunStatus({
    publishableOperations: planning.publishableOperations,
    verdictCounts,
    blockedOperations: planning.blockedOperations,
  })

  const needsAttention =
    (verdictCounts.stale_review_needed ?? 0) +
    (verdictCounts.conflict_hold ?? 0) +
    (verdictCounts.unverifiable ?? 0) +
    planning.blockedOperations.length

  return {
    provider: providerInfo.provider,
    model: providerInfo.model,
    protocolVersion: TRUTH_PROTOCOL_VERSION,
    runAt: nowIso(),
    status,
    claimInventory: {
      totalClaims: claims.length,
      autoPatchClaims: claims.filter((claim) => claim.autoPatch).length,
      manualOnlyClaims: claims.filter((claim) => !claim.autoPatch).length,
    },
    sourceResolver: {
      result: {
        status: "ok",
        totalClaims: claims.length,
        totalSources: collectAllTruthSourceIds(claims).length,
      },
    },
    evidenceCollector: {
      result: {
        status: sourceHealth.some((item) => item.status === "error") ? "partial" : "ok",
        sourceHealth,
      },
    },
    judgeRuns,
    claimVerdicts,
    conflictResolver: {
      result: {
        status: planning.blockedOperations.length > 0 ? "partial" : "ok",
        blockedOperations: planning.blockedOperations,
      },
    },
    publicationGate: {
      result: {
        status: planning.publishableOperations.length > 0 ? "updates_ready" : "no_updates",
        publishableOperations: planning.publishableOperations,
      },
    },
    publishableOperations: planning.publishableOperations,
    blockedOperations: planning.blockedOperations,
    verdictCounts,
    needsAttention,
    summary:
      planning.publishableOperations.length > 0
        ? `Truth graph preparó ${planning.publishableOperations.length} actualizaciones publicables.`
        : status === "needs_review"
          ? `Truth graph terminó sin cambios automáticos y dejó ${needsAttention} claims en revisión real o conflicto.`
          : status === "partial"
            ? `Truth graph confirmó la mayor parte de los claims, pero dejó ${needsAttention} sin verificar por bloqueo o acceso insuficiente a fuentes oficiales.`
            : "Truth graph confirmó los claims verificados sin generar cambios.",
  }
}
