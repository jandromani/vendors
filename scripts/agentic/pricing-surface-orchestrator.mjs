import { clipText, fetchText, normalizeLookupKey, parseTitleFromHtml, stripHtml } from './pricing-tools.mjs'

const SURFACE_PROTOCOL_VERSION = 'pricing-surface-v1'
const DEFAULT_FETCH_TIMEOUT_MS = 30_000

function nowIso() {
  return new Date().toISOString()
}

function normalizeList(values = []) {
  return values.map((value) => normalizeLookupKey(String(value))).filter(Boolean)
}

function compareLists(current = [], expected = []) {
  const currentKeys = normalizeList(current)
  const expectedKeys = normalizeList(expected)
  const missing = expected.filter((value) => !currentKeys.includes(normalizeLookupKey(value)))
  const unexpected = current.filter((value) => !expectedKeys.includes(normalizeLookupKey(value)))
  return {
    verified: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
  }
}

async function loadSource(source) {
  const fetchedAt = nowIso()
  try {
    const html = await fetchText(source.url, DEFAULT_FETCH_TIMEOUT_MS)
    const text = stripHtml(html)
    return {
      sourceId: source.id,
      label: source.label,
      url: source.url,
      status: 'ok',
      fetchedAt,
      title: parseTitleFromHtml(html),
      text,
    }
  } catch (error) {
    return {
      sourceId: source.id,
      label: source.label,
      url: source.url,
      status: 'error',
      fetchedAt,
      title: source.label,
      text: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runSurfaceVerificationOrchestrator({
  surfaceRegistry,
  truthRegistry,
  currentVendors,
}) {
  const vendorsById = new Map(currentVendors.map((vendor) => [vendor.id, vendor]))
  const sourcesById = new Map((truthRegistry.truthSources ?? []).map((source) => [source.id, source]))
  const cache = new Map()

  async function getSource(sourceId) {
    if (cache.has(sourceId)) return cache.get(sourceId)
    const source = sourcesById.get(sourceId)
    if (!source) {
      const missing = {
        sourceId,
        label: sourceId,
        url: '',
        status: 'error',
        fetchedAt: nowIso(),
        title: sourceId,
        text: '',
        error: `Unknown sourceId: ${sourceId}`,
      }
      cache.set(sourceId, missing)
      return missing
    }

    const resolved = await loadSource(source)
    cache.set(sourceId, resolved)
    return resolved
  }

  const checks = []

  for (const [vendorId, policy] of Object.entries(surfaceRegistry.vendors ?? {})) {
    const vendor = vendorsById.get(vendorId)
    if (!vendor) {
      checks.push({
        checkId: `${vendorId}::inventory`,
        vendorId,
        kind: 'inventory',
        label: `Vendor inventory for ${vendorId}`,
        status: 'needs_review',
        details: { reason: 'Vendor is missing from the current snapshot.' },
      })
      continue
    }

    const lineupCheck = compareLists(
      (vendor.models ?? []).map((model) => model.name),
      policy.modelLineup ?? []
    )
    checks.push({
      checkId: `${vendorId}::model-lineup`,
      vendorId,
      kind: 'model_lineup',
      label: `${vendor.name} model lineup`,
      status: lineupCheck.verified ? 'verified' : 'needs_review',
      details: {
        expected: policy.modelLineup ?? [],
        current: (vendor.models ?? []).map((model) => model.name),
        missing: lineupCheck.missing,
        unexpected: lineupCheck.unexpected,
      },
    })

    const seatCheck = compareLists(
      (vendor.seatPlans ?? []).map((plan) => plan.name),
      policy.seatPlanNames ?? []
    )
    checks.push({
      checkId: `${vendorId}::seat-plans`,
      vendorId,
      kind: 'seat_plan_names',
      label: `${vendor.name} seat plan names`,
      status: seatCheck.verified ? 'verified' : 'needs_review',
      details: {
        expected: policy.seatPlanNames ?? [],
        current: (vendor.seatPlans ?? []).map((plan) => plan.name),
        missing: seatCheck.missing,
        unexpected: seatCheck.unexpected,
      },
    })

    for (const signal of policy.requiredSignals ?? []) {
      const sourceResults = await Promise.all((signal.sourceIds ?? []).map((sourceId) => getSource(sourceId)))
      const healthySources = sourceResults.filter((source) => source.status === 'ok')
      const matcher = new RegExp(signal.pattern, 'i')
      const matchedSource = healthySources.find((source) => matcher.test(source.text))
      checks.push({
        checkId: `${vendorId}::signal::${signal.id}`,
        vendorId,
        kind: 'critical_signal',
        label: signal.label,
        status:
          matchedSource
            ? 'verified'
            : healthySources.length === 0
              ? 'unverifiable'
              : 'needs_review',
        details: {
          sourceIds: signal.sourceIds,
          matchedSourceId: matchedSource?.sourceId ?? null,
          snippet: matchedSource ? clipText(matchedSource.text, 280) : null,
          sourceHealth: sourceResults.map((source) => ({
            sourceId: source.sourceId,
            status: source.status,
            error: source.error ?? null,
          })),
        },
      })
    }
  }

  const counts = checks.reduce((accumulator, check) => {
    accumulator[check.status] = (accumulator[check.status] ?? 0) + 1
    return accumulator
  }, {})

  const status =
    (counts.needs_review ?? 0) > 0
      ? 'needs_review'
      : (counts.unverifiable ?? 0) > 0
        ? 'partial'
        : 'verified'

  return {
    protocolVersion: SURFACE_PROTOCOL_VERSION,
    runAt: nowIso(),
    status,
    totalChecks: checks.length,
    verifiedChecks: counts.verified ?? 0,
    needsReview: counts.needs_review ?? 0,
    unverifiableChecks: counts.unverifiable ?? 0,
    checks,
    summary:
      status === 'verified'
        ? 'Surface graph confirmó lineup, nombres de plan y señales críticas.'
        : `Surface graph dejó ${(counts.needs_review ?? 0) + (counts.unverifiable ?? 0)} comprobaciones con drift o bloqueo.`,
  }
}
