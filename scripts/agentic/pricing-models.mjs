function sanitizeJsonText(value) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const OPENAI_ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: {
      type: "string",
      enum: ["tool_call", "final"],
    },
    rationale: {
      type: "string",
    },
    toolName: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    toolInput: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    finalPayload: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
  required: ["decision", "rationale", "toolName", "toolInput", "finalPayload"],
}

const DEFAULT_OPENROUTER_FREE_FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "poolside/laguna-m.1:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/owl-alpha",
]
const MODEL_REQUEST_TIMEOUT_MS = 20_000
const MODEL_RETRY_DELAYS_MS = [0, 1_200]

function getOpenRouterFallbackModels() {
  const configured = (process.env.PRICING_AGENT_OPENROUTER_FALLBACK_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  const selected = configured.length > 0 ? configured : DEFAULT_OPENROUTER_FREE_FALLBACK_MODELS
  return [...new Set(selected)].slice(0, 3)
}

async function fetchJsonWithTimeout(url, options, timeoutMs = MODEL_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function extractChatCompletionText(payload, providerName) {
  const content = payload?.choices?.[0]?.message?.content

  if (typeof content === "string" && content.trim()) {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const merged = content
      .map((part) => {
        if (typeof part === "string") return part
        if (part?.type === "text" && typeof part.text === "string") return part.text
        return ""
      })
      .join("")
      .trim()

    if (merged) {
      return merged
    }
  }

  const errorMessage = payload?.choices?.[0]?.error?.message
  if (typeof errorMessage === "string" && errorMessage) {
    throw new Error(`${providerName} returned a choice error: ${errorMessage}`)
  }

  throw new Error(`${providerName} returned no structured JSON text.`)
}

function extractOpenAiOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const textParts = []
  let refusalText = null

  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        textParts.push(part.text)
      }
      if (part?.type === "refusal") {
        refusalText =
          typeof part.refusal === "string"
            ? part.refusal
            : typeof part.text === "string"
              ? part.text
              : refusalText
      }
    }
  }

  if (refusalText) {
    throw new Error(`OpenAI returned a refusal: ${refusalText}`)
  }

  const merged = textParts.join("").trim()
  if (merged) {
    return merged
  }

  throw new Error("OpenAI returned no structured JSON text.")
}

async function callGemini({ apiKey, model, prompt, responseSchema, temperature }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetchJsonWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gemini HTTP ${response.status}: ${body}`)
  }

  const payload = await response.json()
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim()
  if (!text) {
    throw new Error("Gemini returned no JSON text.")
  }

  return JSON.parse(sanitizeJsonText(text))
}

async function callOpenAi({ apiKey, model, prompt, responseSchema }) {
  void responseSchema
  const response = await fetchJsonWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      reasoning: {
        effort: "medium",
      },
      text: {
        format: {
          type: "json_schema",
          name: "pricing_action_envelope",
          schema: OPENAI_ACTION_SCHEMA,
          strict: true,
        },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI HTTP ${response.status}: ${body}`)
  }

  const payload = await response.json()
  const text = extractOpenAiOutputText(payload)
  const parsed = JSON.parse(sanitizeJsonText(text))

  return {
    decision: parsed.decision,
    rationale: parsed.rationale,
    toolName: parsed.toolName,
    toolInput: parseEmbeddedJsonObject("toolInput", parsed.toolInput),
    finalPayload: parseEmbeddedJsonObject("finalPayload", parsed.finalPayload),
  }
}

async function callOpenRouter({ apiKey, model, prompt, responseSchema }) {
  const useFallbackPool = model === "openrouter/free"
  const fallbackModels = getOpenRouterFallbackModels()
  const response = await fetchJsonWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://ideavista.app",
      "X-OpenRouter-Title": "AI Vendor Compare Pricing Agents",
    },
    body: JSON.stringify({
      ...(useFallbackPool ? { models: fallbackModels, route: "fallback" } : { model }),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 2200,
      plugins: [{ id: "response-healing" }],
      provider: {
        allow_fallbacks: true,
        require_parameters: true,
      },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pricing_action_envelope",
          strict: true,
          schema: OPENAI_ACTION_SCHEMA,
        },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenRouter HTTP ${response.status}: ${body}`)
  }

  const payload = await response.json()
  const text = extractChatCompletionText(payload, "OpenRouter")
  const parsed = JSON.parse(sanitizeJsonText(text))

  return {
    decision: parsed.decision,
    rationale: parsed.rationale,
    toolName: parsed.toolName,
    toolInput: parseEmbeddedJsonObject("toolInput", parsed.toolInput),
    finalPayload: parseEmbeddedJsonObject("finalPayload", parsed.finalPayload),
  }
}

function parseEmbeddedJsonObject(fieldName, value) {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== "string") {
    throw new Error(`OpenAI returned ${fieldName} in a non-string format.`)
  }

  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`OpenAI returned ${fieldName} as JSON that is not an object.`)
  }

  return parsed
}

function buildMockAction(agentId, stepNumber) {
  if (agentId === "ScoutAgent") {
    if (stepNumber === 1) {
      return {
        decision: "tool_call",
        rationale: "Need the whitelisted source catalog before selecting sources.",
        toolName: "list_sources",
        toolInput: {},
        finalPayload: null,
      }
    }

    if (stepNumber === 2) {
      return {
        decision: "tool_call",
        rationale: "Read one official source to exercise the scout tool path.",
        toolName: "read_source",
        toolInput: {
          sourceId: "openai-news-rss",
          limit: 5,
        },
        finalPayload: null,
      }
    }

    return {
      decision: "final",
      rationale: "Mock mode returns no candidates after the smoke-check tool calls.",
      toolName: null,
      toolInput: null,
      finalPayload: {
        status: "ok",
        candidates: [],
        notes: ["Mock provider active. No real LLM scouting was executed."],
      },
    }
  }

  if (agentId === "ResearchAgent") {
    return {
      decision: "final",
      rationale: "No candidates to research in mock mode.",
      toolName: null,
      toolInput: null,
      finalPayload: {
        status: "ok",
        evidenceBundles: [],
        notes: ["Mock provider active. Research stage short-circuited."],
      },
    }
  }

  if (agentId === "MappingAgent") {
    return {
      decision: "final",
      rationale: "No evidence bundles to map in mock mode.",
      toolName: null,
      toolInput: null,
      finalPayload: {
        status: "ok",
        operations: [],
        rejectedEvidence: [],
        notes: ["Mock provider active. Mapping stage short-circuited."],
      },
    }
  }

  if (agentId === "DatumJudgeAgent") {
    return {
      decision: "final",
      rationale: "Mock mode closes claim verification conservatively.",
      toolName: null,
      toolInput: null,
      finalPayload: {
        claimId: "mock-claim",
        verdict: "stale_review_needed",
        currentValue: null,
        proposedValue: null,
        confidence: 0.8,
        freshnessStatus: "stale",
        patchAllowed: false,
        usedSources: [],
        reason: "Mock provider active. Datum judge was not executed against a live model.",
      },
    }
  }

  return {
    decision: "final",
    rationale: "No operations to audit in mock mode.",
    toolName: null,
    toolInput: null,
    finalPayload: {
      status: "insufficient_evidence",
      approvedOperations: [],
      rejectedOperations: [],
      summary: "Mock provider active. Audit stage produced no approvals.",
    },
  }
}

export function createModelClient({ provider, model, apiKey }) {
  if (provider === "mock") {
    return {
      provider: "mock",
      model: "mock-agent-brain",
      async generateAction({ agentId, prompt, responseSchema, stepNumber }) {
        void prompt
        void responseSchema
        return buildMockAction(agentId, stepNumber)
      },
    }
  }

  if (provider === "gemini") {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for the Gemini provider.")
    }

    return {
      provider: "gemini",
      model,
      async generateAction({ agentId, prompt, responseSchema, stepNumber }) {
        void agentId
        void stepNumber

        let lastError = null
        for (const delayMs of MODEL_RETRY_DELAYS_MS) {
          if (delayMs > 0) {
            await sleep(delayMs)
          }

          try {
            return await callGemini({
              apiKey,
              model,
              prompt,
              responseSchema,
              temperature: 0.1,
            })
          } catch (error) {
            lastError = error
          }
        }

        throw lastError ?? new Error("Gemini call failed without a concrete error.")
      },
    }
  }

  if (provider === "openai") {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for the OpenAI provider.")
    }

    return {
      provider: "openai",
      model,
      async generateAction({ agentId, prompt, responseSchema, stepNumber }) {
        void agentId
        void stepNumber

        let lastError = null
        for (const delayMs of MODEL_RETRY_DELAYS_MS) {
          if (delayMs > 0) {
            await sleep(delayMs)
          }

          try {
            return await callOpenAi({
              apiKey,
              model,
              prompt,
              responseSchema,
            })
          } catch (error) {
            lastError = error
          }
        }

        throw lastError ?? new Error("OpenAI call failed without a concrete error.")
      },
    }
  }

  if (provider === "openrouter") {
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for the OpenRouter provider.")
    }

    return {
      provider: "openrouter",
      model,
      async generateAction({ agentId, prompt, responseSchema, stepNumber }) {
        void agentId
        void stepNumber

        let lastError = null
        for (const delayMs of MODEL_RETRY_DELAYS_MS) {
          if (delayMs > 0) {
            await sleep(delayMs)
          }

          try {
            return await callOpenRouter({
              apiKey,
              model,
              prompt,
              responseSchema,
            })
          } catch (error) {
            lastError = error
          }
        }

        throw lastError ?? new Error("OpenRouter call failed without a concrete error.")
      },
    }
  }

  throw new Error(`Unsupported pricing agent provider: ${provider}`)
}
