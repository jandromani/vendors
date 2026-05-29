import crypto from "node:crypto"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { describeToolInput, toolInputSchemas } from "./pricing-schemas.mjs"

export function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex")
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

export function decodeXmlEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
  }

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function stripHtml(value) {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
}

export function normalizeLink(baseUrl, maybeRelative) {
  if (!maybeRelative) return baseUrl
  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return maybeRelative
  }
}

function extractTag(block, tag) {
  const expression = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")
  const match = block.match(expression)
  if (!match) return ""
  return decodeXmlEntities(match[1]).trim()
}

export function clipText(value, limit = 1200) {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}...`
}

export function normalizeLookupKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function computeCandidateId(sourceId, title, link, publishedAt) {
  return sha1(`${sourceId}|${title}|${link}|${publishedAt}`)
}

function parseRssItems(xml, source) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0])
  return blocks
    .map((block) => {
      const title = stripHtml(extractTag(block, "title"))
      const summary = stripHtml(extractTag(block, "description"))
      const link = normalizeLink(source.url, stripHtml(extractTag(block, "link")))
      const publishedAt = normalizeDate(stripHtml(extractTag(block, "pubDate")))
      if (!title) return null
      return {
        candidateId: computeCandidateId(source.id, title, link, publishedAt),
        sourceId: source.id,
        sourceLabel: source.label,
        sourceKind: source.kind,
        vendorHint: source.vendorHint,
        official: source.official,
        title,
        summary,
        link,
        publishedAt,
      }
    })
    .filter((item) => item !== null)
}

function parseHtmlNewsItems(html, source) {
  const candidates = []
  const linkMatches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  for (const match of linkMatches) {
    const href = match[1]
    const title = stripHtml(match[2])
    if (!title || title.length < 30) continue

    const looksLikeNews =
      href.includes("/news") ||
      href.includes("/changelog") ||
      /announce|launch|pricing|billing|plan|token|cost/i.test(title)
    if (!looksLikeNews) continue

    const link = normalizeLink(source.url, href)
    const publishedAt = new Date().toISOString()
    candidates.push({
      candidateId: computeCandidateId(source.id, title, link, publishedAt),
      sourceId: source.id,
      sourceLabel: source.label,
      sourceKind: source.kind,
      vendorHint: source.vendorHint,
      official: source.official,
      title,
      summary: "",
      link,
      publishedAt,
    })
  }

  const deduped = new Map()
  for (const item of candidates) {
    deduped.set(`${item.title}|${item.link}`, item)
  }
  return [...deduped.values()].slice(0, 60)
}

function buildGoogleNewsUrl(query) {
  const encodedQuery = encodeURIComponent(query)
  return `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`
}

function isRetryableChallenge(html) {
  if (typeof html !== "string" || !html) return false
  return /Enable JavaScript and cookies to continue|Checking if the site connection is secure|<title>\s*Just a moment/i.test(html)
}

function isOpenAiDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === "openai.com" ||
      hostname.endsWith(".openai.com") ||
      hostname === "help.openai.com" ||
      hostname === "developers.openai.com"
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findBrowserExecutablePath() {
  const explicitPath = process.env.PRICING_BROWSER_EXECUTABLE_PATH
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath
  }

  if (process.platform === "win32") {
    const candidates = [
      process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : null,
      process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : null,
      process.env["LOCALAPPDATA"] ? path.join(process.env["LOCALAPPDATA"], "Microsoft", "Edge", "Application", "msedge.exe") : null,
      process.env["PROGRAMFILES"] ? path.join(process.env["PROGRAMFILES"], "Google", "Chrome", "Application", "chrome.exe") : null,
      process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : null,
    ].filter(Boolean)
    return candidates.find((candidate) => existsSync(candidate)) ?? null
  }

  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
    ]
    return candidates.find((candidate) => existsSync(candidate)) ?? null
  }

  const linuxCandidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ]
  return linuxCandidates.find((candidate) => existsSync(candidate)) ?? null
}

async function loadPlaywrightChromium() {
  try {
    const playwright = await import("playwright")
    if (playwright?.chromium) return playwright.chromium
  } catch {}

  try {
    const playwrightCore = await import("playwright-core")
    if (playwrightCore?.chromium) return playwrightCore.chromium
  } catch {}

  throw new Error("No Playwright runtime is available for browser fallback.")
}

async function fetchTextWithBrowser(url, timeoutMs = 45_000) {
  const chromium = await loadPlaywrightChromium()
  const executablePath = findBrowserExecutablePath()
  let context = null
  let userDataDir = null

  try {
    userDataDir = mkdtempSync(path.join(os.tmpdir(), "pricing-browser-"))
    const launchOptions = {
      headless: true,
      timeout: timeoutMs,
      locale: "en-US",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1600 },
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    }

    if (!executablePath && process.platform === "win32") {
      launchOptions.channel = "msedge"
    } else if (executablePath) {
      launchOptions.executablePath = executablePath
    }

    context = await chromium.launchPersistentContext(userDataDir, launchOptions)
    const page = await context.newPage()
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    })

    try {
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(timeoutMs, 10_000),
      })
    } catch {
      // Some official pages keep connections open; DOM content is enough for our parsers.
    }

    const title = await page.title().catch(() => "")
    const bodyText = await page.locator("body").innerText().catch(() => "")
    if (isRetryableChallenge(bodyText) || /just a moment/i.test(title)) {
      throw new Error(`Browser fallback still received a challenge page for ${url}`)
    }

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title || url)}</title></head><body><article>${escapeHtml(bodyText)}</article></body></html>`
  } finally {
    await context?.close().catch(() => {})
    if (userDataDir) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  }
}

export async function fetchText(url, timeoutMs = 25_000) {
  const openAiDomain = isOpenAiDomain(url)
  const maxAttempts = openAiDomain ? 5 : 2
  let lastError = null
  let shouldTryBrowserFallback = false

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; pricing-agent-orchestrator/2.0)",
          Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      })

      const body = await response.text()
      const gotChallenge = isRetryableChallenge(body)

      if (!response.ok || gotChallenge) {
        const reason = !response.ok ? `HTTP ${response.status}` : "challenge page"
        const error = new Error(`${reason} on ${url}`)
        lastError = error
        if (openAiDomain) {
          shouldTryBrowserFallback = true
        }

        const retryableStatus = response.status === 403 || response.status === 408 || response.status === 429 || response.status >= 500
        const shouldRetry = attempt < maxAttempts && (retryableStatus || gotChallenge)
        if (!shouldRetry) {
          break
        }

        await sleep(450 * attempt)
        continue
      }

      return body
    } catch (error) {
      lastError = error
      if (openAiDomain) {
        shouldTryBrowserFallback = true
      }
      if (attempt >= maxAttempts) {
        break
      }
      await sleep(450 * attempt)
    } finally {
      clearTimeout(timer)
    }
  }

  if (openAiDomain && shouldTryBrowserFallback) {
    try {
      return await fetchTextWithBrowser(url, Math.max(timeoutMs, 45_000))
    } catch (browserError) {
      const browserMessage = browserError instanceof Error ? browserError.message : String(browserError)
      const upstreamMessage = lastError instanceof Error ? lastError.message : `Unable to fetch ${url}`
      throw new Error(`${upstreamMessage}. Browser fallback failed: ${browserMessage}`)
    }
  }

  throw lastError ?? new Error(`Unable to fetch ${url}`)
}

export function parseTitleFromHtml(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? stripHtml(match[1]) : "Untitled article"
}

export function extractMoneyMentionsFromText(text) {
  const matches = []
  const expressions = [
    /(?:US\$|\$)\s*([0-9]+(?:[.,][0-9]+)?)/g,
    /\b([0-9]+(?:[.,][0-9]+)?)\s*(?:USD|EUR)\b/gi,
  ]

  for (const expression of expressions) {
    for (const match of text.matchAll(expression)) {
      const raw = match[0]
      const value = Number(String(match[1]).replace(",", "."))
      if (!Number.isFinite(value)) continue
      const index = match.index ?? 0
      const start = Math.max(0, index - 80)
      const end = Math.min(text.length, index + raw.length + 120)
      matches.push({
        raw,
        value,
        snippet: clipText(text.slice(start, end), 260),
      })
    }
  }

  const unique = new Map()
  for (const item of matches) {
    unique.set(`${item.raw}|${item.snippet}`, item)
  }
  return [...unique.values()].slice(0, 20)
}

function extractAliasWindows(vendorCatalog, text) {
  const windows = []
  const lower = text.toLowerCase()

  for (const model of vendorCatalog.models) {
    for (const alias of model.aliases) {
      const index = lower.indexOf(alias.toLowerCase())
      if (index === -1) continue
      const start = Math.max(0, index - 140)
      const end = Math.min(text.length, index + alias.length + 240)
      windows.push({
        targetType: "model",
        targetName: model.name,
        aliasUsed: alias,
        snippet: clipText(text.slice(start, end), 320),
      })
      break
    }
  }

  for (const seatPlan of vendorCatalog.seatPlans) {
    for (const alias of seatPlan.aliases) {
      const index = lower.indexOf(alias.toLowerCase())
      if (index === -1) continue
      const start = Math.max(0, index - 140)
      const end = Math.min(text.length, index + alias.length + 240)
      windows.push({
        targetType: "seatPlan",
        targetName: seatPlan.name,
        aliasUsed: alias,
        snippet: clipText(text.slice(start, end), 320),
      })
      break
    }
  }

  return windows.slice(0, 20)
}

export function buildToolRegistry({
  sourceCatalog,
  pricingCatalog,
  state,
  overrides,
  cutoffDate,
}) {
  const seenIds = new Set(Array.isArray(state.seenItemIds) ? state.seenItemIds : [])

  async function readConfiguredSource(source, limit = 10) {
    const body = await fetchText(source.url)
    const parsed = source.kind === "rss" ? parseRssItems(body, source) : parseHtmlNewsItems(body, source)
    return parsed
      .filter((item) => new Date(item.publishedAt).getTime() >= cutoffDate.getTime())
      .filter((item) => !seenIds.has(item.candidateId))
      .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime())
      .slice(0, limit)
  }

  const registry = {
    list_sources: {
      name: "list_sources",
      description: "Lists the only approved source catalogue and Google News vendor searches.",
      inputSchema: toolInputSchemas.list_sources,
      async execute() {
        return {
          officialSources: sourceCatalog.officialSources,
          googleNewsQueries: sourceCatalog.googleNewsQueries.map((item) => ({
            id: item.id,
            label: item.label,
            vendorId: item.vendorId,
          })),
        }
      },
    },
    read_source: {
      name: "read_source",
      description: "Fetches and parses one approved official source. Returns only recent unseen items.",
      inputSchema: toolInputSchemas.read_source,
      async execute(input) {
        const source = sourceCatalog.officialSources.find((item) => item.id === input.sourceId)
        if (!source) {
          throw new Error(`Unknown sourceId: ${input.sourceId}`)
        }
        const items = await readConfiguredSource(source, input.limit ?? 10)
        return {
          sourceId: source.id,
          sourceLabel: source.label,
          official: source.official,
          vendorHint: source.vendorHint,
          items,
        }
      },
    },
    search_google_news: {
      name: "search_google_news",
      description: "Runs a Google News RSS search for one vendor pricing query and returns recent unseen items.",
      inputSchema: toolInputSchemas.search_google_news,
      async execute(input) {
        const queryConfig = sourceCatalog.googleNewsQueries.find((item) => item.vendorId === input.vendorId)
        if (!queryConfig) {
          throw new Error(`No Google News query configured for ${input.vendorId}`)
        }
        const source = {
          id: queryConfig.id,
          label: queryConfig.label,
          kind: "rss",
          url: buildGoogleNewsUrl(queryConfig.query),
          vendorHint: input.vendorId,
          official: false,
        }
        const items = await readConfiguredSource(source, input.limit ?? 10)
        return {
          sourceId: source.id,
          sourceLabel: source.label,
          official: false,
          vendorHint: input.vendorId,
          items,
        }
      },
    },
    read_article: {
      name: "read_article",
      description: "Fetches one article URL and returns normalized text, title, money mentions, and a fingerprint.",
      inputSchema: toolInputSchemas.read_article,
      async execute(input) {
        const html = await fetchText(input.url, 20_000)
        const articleTitle = parseTitleFromHtml(html)
        const articleText = clipText(stripHtml(html), 12000)
        return {
          url: input.url,
          articleTitle,
          articleText,
          articleFingerprint: sha1(articleText),
          moneyMentions: extractMoneyMentionsFromText(articleText),
        }
      },
    },
    get_catalog: {
      name: "get_catalog",
      description: "Returns the strict whitelist of vendors, model names, seat plans, aliases, and updatable fields.",
      inputSchema: toolInputSchemas.get_catalog,
      async execute() {
        return pricingCatalog
      },
    },
    get_current_snapshot: {
      name: "get_current_snapshot",
      description: "Returns the current overrides file so agents can compare against already-applied values.",
      inputSchema: toolInputSchemas.get_current_snapshot,
      async execute() {
        return overrides
      },
    },
    read_watch_state: {
      name: "read_watch_state",
      description: "Returns the last run state, seen item count, and cutoff date for this cycle.",
      inputSchema: toolInputSchemas.read_watch_state,
      async execute() {
        return {
          lastRunAt: state.lastRunAt ?? null,
          lastRunStatus: state.lastRunStatus ?? "never",
          seenItemCount: seenIds.size,
          cutoffDate: cutoffDate.toISOString(),
        }
      },
    },
    extract_alias_windows: {
      name: "extract_alias_windows",
      description: "Given vendorId + text, returns snippets around only whitelisted model and seat plan aliases.",
      inputSchema: toolInputSchemas.extract_alias_windows,
      async execute(input) {
        const vendorCatalog = pricingCatalog.vendors.find((item) => item.id === input.vendorId)
        if (!vendorCatalog) {
          throw new Error(`Unknown vendorId: ${input.vendorId}`)
        }
        return {
          vendorId: input.vendorId,
          windows: extractAliasWindows(vendorCatalog, input.text),
        }
      },
    },
    extract_money_mentions: {
      name: "extract_money_mentions",
      description: "Extracts dollar or USD numeric mentions from text with surrounding snippets.",
      inputSchema: toolInputSchemas.extract_money_mentions,
      async execute(input) {
        return {
          matches: extractMoneyMentionsFromText(input.text),
        }
      },
    },
  }

  return registry
}

export function buildToolManifest(toolNames, registry) {
  return toolNames.map((toolName) => {
    const tool = registry[toolName]
    return {
      name: tool.name,
      description: tool.description,
      inputShape: describeToolInput(tool.name),
    }
  })
}

export function validateToolInput(toolName, input) {
  const schema = toolInputSchemas[toolName]
  if (!schema) throw new Error(`Missing tool input schema for ${toolName}`)
  return schema.parse(input ?? {})
}

export function findCatalogTarget(pricingCatalog, vendorId, targetType, targetName) {
  const vendor = pricingCatalog.vendors.find((item) => item.id === vendorId)
  if (!vendor) return null
  const list = targetType === "model" ? vendor.models : vendor.seatPlans
  const normalizedTargetName = normalizeLookupKey(targetName)
  return list.find((item) => normalizeLookupKey(item.name) === normalizedTargetName) ?? null
}
