import {
  actionEnvelopeSchema,
  auditFinalSchema,
  buildOperationFingerprint,
  describeFinalPayload,
  genericActionJsonSchema,
  mapperFinalSchema,
  operationSchema,
  researchFinalSchema,
  scoutFinalSchema,
} from "./pricing-schemas.mjs"
import {
  buildToolManifest,
  findCatalogTarget,
  validateToolInput,
} from "./pricing-tools.mjs"

const MAX_VALIDATION_RETRIES = 2
const MAX_RATIONALE_LENGTH = 280

function clipJson(value, limit = 3000) {
  const raw = JSON.stringify(value, null, 2)
  if (raw.length <= limit) return raw
  return `${raw.slice(0, limit)}...`
}

function normalizeLookupKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function buildPrompt({ agent, inputPayload, transcript, toolManifest, providerInfo }) {
  const guardrails = [
    "You are part of a pricing watch pipeline. Follow the protocol exactly.",
    "You may only output a JSON object with keys decision, rationale, toolName, toolInput, finalPayload.",
    "You may request at most one tool per turn.",
    "If you do not have enough evidence, finish with a conservative finalPayload that rejects or returns insufficient_evidence.",
    "Never invent prices, vendors, models, seat plans, URLs, or fields.",
    "Only use source evidence from tool results or the explicit input payload.",
    "Only use whitelisted entity names from the catalog tool or from the incoming payload.",
    "If a value is not explicitly present in evidence, do not propose it.",
    "Prefer false negatives over false positives.",
    "Do not exhaust the step budget unnecessarily. If several relevant checks return no pricing signal, finalize conservatively.",
  ]

  const agentEfficiencyHint =
    agent.id === "ScoutAgent"
      ? [
          "",
          "Scout efficiency rule:",
          "After reading the source catalog and watch state, if you check a handful of official/news sources and still find no candidate item with explicit pricing relevance after the cutoff date, finalize conservatively instead of exploring every remaining source.",
        ]
      : []

  const responseEncodingRules =
    providerInfo.provider === "openai" || providerInfo.provider === "openrouter"
      ? [
          "Because the provider uses strict structured outputs, toolInput and finalPayload must be null or compact JSON strings representing the object value.",
          'Example tool call encoding: {"decision":"tool_call","rationale":"...","toolName":"read_source","toolInput":"{\\"sourceId\\":\\"openai-news-rss\\",\\"limit\\":5}","finalPayload":null}',
          'Example final encoding: {"decision":"final","rationale":"...","toolName":null,"toolInput":null,"finalPayload":"{\\"status\\":\\"ok\\",\\"candidates\\":[],\\"notes\\":[\\"No changes\\"]}"}',
        ]
      : [
          'If calling a tool: {"decision":"tool_call","rationale":"...","toolName":"allowed_tool","toolInput":{...},"finalPayload":null}',
          'If finishing: {"decision":"final","rationale":"...","toolName":null,"toolInput":null,"finalPayload":{...}}',
        ]

  return [
    `Agent: ${agent.id}`,
    `Provider: ${providerInfo.provider}`,
    `Model: ${providerInfo.model}`,
    "",
    "Mission:",
    agent.mission,
    "",
    "Hard guardrails:",
    ...guardrails.map((item, index) => `${index + 1}. ${item}`),
    "",
    "Allowed tools:",
    ...toolManifest.map((tool) => `- ${tool.name}: ${tool.description}. Input: ${tool.inputShape}`),
    ...agentEfficiencyHint,
    "",
    "Required final payload contract:",
    describeFinalPayload(agent.id),
    "",
    "Input payload JSON:",
    clipJson(inputPayload, 4500),
    "",
    "Transcript JSON:",
    clipJson(transcript, 7000),
    "",
    "Response protocol:",
    ...responseEncodingRules,
  ].join("\n")
}

function summarizeToolResult(result) {
  const raw = JSON.stringify(result, null, 2)
  if (raw.length <= 2500) {
    return result
  }

  return {
    truncated: true,
    originalLength: raw.length,
    preview: `${raw.slice(0, 2500)}...`,
  }
}

function normalizeRawAction(rawAction) {
  if (!rawAction || typeof rawAction !== "object") {
    return rawAction
  }

  if (typeof rawAction.rationale === "string" && rawAction.rationale.length > MAX_RATIONALE_LENGTH) {
    return {
      ...rawAction,
      rationale: rawAction.rationale.slice(0, MAX_RATIONALE_LENGTH),
    }
  }

  return rawAction
}

function buildConservativeFallbackPayload(agentId) {
  if (agentId === "ScoutAgent") {
    return {
      status: "insufficient_evidence",
      candidates: [],
      notes: ["Agent reached the step limit and was closed conservatively by the orchestrator."],
    }
  }

  if (agentId === "ResearchAgent") {
    return {
      status: "insufficient_evidence",
      evidenceBundles: [],
      notes: ["Agent reached the step limit and was closed conservatively by the orchestrator."],
    }
  }

  if (agentId === "MappingAgent") {
    return {
      status: "insufficient_evidence",
      operations: [],
      rejectedEvidence: [],
      notes: ["Agent reached the step limit and was closed conservatively by the orchestrator."],
    }
  }

  return {
    status: "insufficient_evidence",
    approvedOperations: [],
    rejectedOperations: [],
    summary: "Agent reached the step limit and was closed conservatively by the orchestrator.",
  }
}

async function runAgent({
  agent,
  modelClient,
  toolRegistry,
  inputPayload,
  providerInfo,
}) {
  const transcript = [
    {
      type: "input",
      payload: inputPayload,
    },
  ]

  const toolManifest = buildToolManifest(agent.allowedTools, toolRegistry)
  const trace = []

  for (let stepNumber = 1; stepNumber <= agent.maxSteps; stepNumber += 1) {
    const prompt = buildPrompt({
      agent,
      inputPayload,
      transcript,
      toolManifest,
      providerInfo,
    })

    let validationFeedback = null

    for (let attempt = 1; attempt <= MAX_VALIDATION_RETRIES + 1; attempt += 1) {
      const effectivePrompt = validationFeedback
        ? `${prompt}\n\nValidation feedback from orchestrator:\n${validationFeedback}`
        : prompt

      const action = actionEnvelopeSchema.parse(
        normalizeRawAction(
          await modelClient.generateAction({
            agentId: agent.id,
            prompt: effectivePrompt,
            responseSchema: genericActionJsonSchema,
            stepNumber,
          })
        )
      )

      if (action.decision === "tool_call") {
        if (!action.toolName || !action.toolInput || action.finalPayload !== null) {
          validationFeedback =
            "Tool call invalid. Provide toolName + toolInput and set finalPayload to null."
          continue
        }

        if (!agent.allowedTools.includes(action.toolName)) {
          validationFeedback = `Tool ${action.toolName} is not allowed for ${agent.id}.`
          continue
        }

        const tool = toolRegistry[action.toolName]
        if (!tool) {
          validationFeedback = `Tool ${action.toolName} does not exist.`
          continue
        }

        let validatedToolInput
        try {
          validatedToolInput = validateToolInput(action.toolName, action.toolInput)
        } catch (error) {
          validationFeedback = `Tool input invalid for ${action.toolName}: ${error instanceof Error ? error.message : String(error)}`
          continue
        }

        const toolResult = await tool.execute(validatedToolInput)
        const traceEntry = {
          stepNumber,
          attempt,
          decision: "tool_call",
          rationale: action.rationale,
          toolName: action.toolName,
          toolInput: validatedToolInput,
          toolResult: summarizeToolResult(toolResult),
        }
        trace.push(traceEntry)
        transcript.push({
          type: "tool_result",
          toolName: action.toolName,
          toolInput: validatedToolInput,
          toolResult: traceEntry.toolResult,
        })
        validationFeedback = null
        break
      }

      if (!action.finalPayload || action.toolName !== null || action.toolInput !== null) {
        validationFeedback =
          "Final response invalid. Provide finalPayload and set toolName/toolInput to null."
        continue
      }

      const finalResult = agent.finalSchema.parse(action.finalPayload)
      trace.push({
        stepNumber,
        attempt,
        decision: "final",
        rationale: action.rationale,
        finalPayload: finalResult,
      })

      return {
        result: finalResult,
        trace,
      }
    }
  }

  const fallbackResult = agent.finalSchema.parse(buildConservativeFallbackPayload(agent.id))
  trace.push({
    stepNumber: agent.maxSteps + 1,
    attempt: 1,
    decision: "final",
    rationale: "The agent exceeded its step budget, so the orchestrator emitted a conservative fallback result.",
    finalPayload: fallbackResult,
  })

  return {
    result: fallbackResult,
    trace,
  }
}

function fieldAllowedForTarget(targetType, field) {
  if (targetType === "model") {
    return field === "inputPricePerMTok" || field === "outputPricePerMTok"
  }
  return field === "priceMonthly" || field === "priceAnnual"
}

function buildModelPairKey(operation) {
  return [
    operation.vendorId,
    normalizeLookupKey(operation.targetName),
    operation.sourceUrl,
  ].join("|")
}

function enforceModelInputOutputPairs(validOperations) {
  const groupedModelOperations = new Map()
  const stillValid = []
  const rejected = []

  for (const operation of validOperations) {
    if (operation.targetType !== "model") {
      stillValid.push(operation)
      continue
    }

    const key = buildModelPairKey(operation)
    if (!groupedModelOperations.has(key)) {
      groupedModelOperations.set(key, [])
    }
    groupedModelOperations.get(key).push(operation)
  }

  for (const operations of groupedModelOperations.values()) {
    const uniqueFields = new Set(operations.map((item) => item.field))
    const hasInput = uniqueFields.has("inputPricePerMTok")
    const hasOutput = uniqueFields.has("outputPricePerMTok")

    if (hasInput && hasOutput && uniqueFields.size === 2) {
      stillValid.push(...operations)
      continue
    }

    for (const operation of operations) {
      rejected.push({
        operationFingerprint: buildOperationFingerprint(operation),
        reason:
          "Model pricing updates require a complete input/output pair from the same source before approval.",
      })
    }
  }

  return {
    valid: stillValid,
    rejected,
  }
}

function strictlyValidateApprovedOperations({
  approvedOperations,
  evidenceBundles,
  pricingCatalog,
}) {
  const evidenceByUrl = new Map(evidenceBundles.map((item) => [item.articleUrl, item]))
  const prelimValid = []
  const rejected = []

  for (const rawOperation of approvedOperations) {
    const operation = operationSchema.parse(rawOperation)
    const fingerprint = buildOperationFingerprint(operation)

    if (!fieldAllowedForTarget(operation.targetType, operation.field)) {
      rejected.push({
        operationFingerprint: fingerprint,
        reason: `Field ${operation.field} is not compatible with ${operation.targetType}.`,
      })
      continue
    }

    const catalogTarget = findCatalogTarget(
      pricingCatalog,
      operation.vendorId,
      operation.targetType,
      operation.targetName
    )
    if (!catalogTarget) {
      rejected.push({
        operationFingerprint: fingerprint,
        reason: `Target ${operation.targetName} is not whitelisted in the catalog.`,
      })
      continue
    }

    if (!catalogTarget.allowedFields.includes(operation.field)) {
      rejected.push({
        operationFingerprint: fingerprint,
        reason: `Field ${operation.field} is not allowed for ${operation.targetName}.`,
      })
      continue
    }

    const evidence = evidenceByUrl.get(operation.sourceUrl)
    if (!evidence) {
      rejected.push({
        operationFingerprint: fingerprint,
        reason: "No evidence bundle exists for the proposed sourceUrl.",
      })
      continue
    }

    if (evidence.vendorId !== operation.vendorId) {
      rejected.push({
        operationFingerprint: fingerprint,
        reason: "Evidence vendor does not match the proposed operation vendor.",
      })
      continue
    }

    const matchedNumericMention = evidence.numericMentions.some(
      (mention) => mention.value === operation.value
    )
    if (!matchedNumericMention) {
      rejected.push({
        operationFingerprint: fingerprint,
        reason: "Proposed value does not appear as a numeric mention in the evidence bundle.",
      })
      continue
    }

    if (operation.confidence < 0.9 || evidence.confidence < 0.85) {
      rejected.push({
        operationFingerprint: fingerprint,
        reason: "Confidence is below the strict approval threshold.",
      })
      continue
    }

    prelimValid.push({
      ...operation,
      auditNote: rawOperation.auditNote,
    })
  }

  const pairValidation = enforceModelInputOutputPairs(prelimValid)

  return {
    valid: pairValidation.valid,
    rejected: [...rejected, ...pairValidation.rejected],
  }
}

export async function runPricingOrchestrator({
  modelClient,
  toolRegistry,
  pricingCatalog,
  cutoffDate,
}) {
  const providerInfo = {
    provider: modelClient.provider,
    model: modelClient.model,
  }

  const agents = [
    {
      id: "ScoutAgent",
      maxSteps: 8,
      allowedTools: ["read_watch_state", "list_sources", "read_source", "search_google_news"],
      finalSchema: scoutFinalSchema,
      mission:
        "Discover recent candidate items that are likely about pricing, billing, token cost, or seat-plan changes for Claude, ChatGPT, and Gemini. Only keep conservative candidates with clear pricing relevance.",
    },
    {
      id: "ResearchAgent",
      maxSteps: 10,
      allowedTools: ["read_article", "extract_alias_windows", "extract_money_mentions", "get_catalog"],
      finalSchema: researchFinalSchema,
      mission:
        "Open candidate articles, extract hard evidence, and decide whether each candidate contains a real pricing-change signal. Return evidence bundles only when the article text supports them.",
    },
    {
      id: "MappingAgent",
      maxSteps: 8,
      allowedTools: ["get_catalog", "get_current_snapshot"],
      finalSchema: mapperFinalSchema,
      mission:
        "Map evidence bundles to concrete whitelisted website update operations. Only produce operations for explicit numeric pricing fields. If a claim cannot be mapped safely, reject it.",
    },
    {
      id: "AuditAgent",
      maxSteps: 8,
      allowedTools: ["get_catalog", "get_current_snapshot"],
      finalSchema: auditFinalSchema,
      mission:
        "Act as a strict approval gate. Approve only operations that are fully supported by evidence, whitelisted by the catalog, conservative enough for automated publication, and for model pricing require a complete input/output pair from the same source.",
    },
  ]

  const scoutInput = {
    protocolVersion: "pricing-agentic-v2",
    cutoffDate: cutoffDate.toISOString(),
    maxCandidates: 12,
    vendorIds: pricingCatalog.vendors.map((vendor) => vendor.id),
  }
  const scout = await runAgent({
    agent: agents[0],
    modelClient,
    toolRegistry,
    inputPayload: scoutInput,
    providerInfo,
  })

  const researchInput = {
    protocolVersion: "pricing-agentic-v2",
    candidates: scout.result.candidates,
    evidencePolicy: {
      requireNumericPricingEvidence: true,
      preferOfficialSources: true,
      rejectAmbiguousArticles: true,
    },
  }
  const research = await runAgent({
    agent: agents[1],
    modelClient,
    toolRegistry,
    inputPayload: researchInput,
    providerInfo,
  })

  const mappingInput = {
    protocolVersion: "pricing-agentic-v2",
    evidenceBundles: research.result.evidenceBundles,
    mappingPolicy: {
      allowTargetTypes: ["model", "seatPlan"],
      allowFields: ["inputPricePerMTok", "outputPricePerMTok", "priceMonthly", "priceAnnual"],
      requireSourceUrl: true,
      requireEvidenceSnippet: true,
    },
  }
  const mapping = await runAgent({
    agent: agents[2],
    modelClient,
    toolRegistry,
    inputPayload: mappingInput,
    providerInfo,
  })

  const operationsWithFingerprints = mapping.result.operations.map((operation) => ({
    ...operation,
    operationFingerprint: buildOperationFingerprint(operation),
  }))

  const auditInput = {
    protocolVersion: "pricing-agentic-v2",
    evidenceBundles: research.result.evidenceBundles,
    operations: operationsWithFingerprints,
    auditPolicy: {
      minOperationConfidence: 0.9,
      minEvidenceConfidence: 0.85,
      rejectNonWhitelistedTargets: true,
      rejectNonNumericChanges: true,
      requirePairedModelPrices: true,
    },
  }
  const audit = await runAgent({
    agent: agents[3],
    modelClient,
    toolRegistry,
    inputPayload: auditInput,
    providerInfo,
  })

  const strictAudit = strictlyValidateApprovedOperations({
    approvedOperations: audit.result.approvedOperations,
    evidenceBundles: research.result.evidenceBundles,
    pricingCatalog,
  })

  return {
    provider: providerInfo.provider,
    model: providerInfo.model,
    protocolVersion: "pricing-agentic-v2",
    cutoffDate: cutoffDate.toISOString(),
    scout,
    research,
    mapping,
    audit,
    approvedOperations: strictAudit.valid,
    strictlyRejectedOperations: strictAudit.rejected,
  }
}
