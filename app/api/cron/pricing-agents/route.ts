import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MADRID_TIMEZONE = "Europe/Madrid"

function getExpectedSecrets() {
  const cronSecret = process.env.CRON_SECRET ?? process.env.AUTOMATION_TRIGGER_SECRET ?? ""
  const githubToken = process.env.GITHUB_ACTIONS_TRIGGER_TOKEN ?? ""
  const repository =
    process.env.GITHUB_ACTIONS_REPOSITORY ??
    (
      process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
        ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
        : ""
    )
  const workflow = process.env.GITHUB_ACTIONS_WORKFLOW_FILE ?? "pricing-agents.yml"
  const ref = process.env.GITHUB_ACTIONS_REF ?? process.env.VERCEL_GIT_COMMIT_REF ?? "main"

  return {
    cronSecret,
    githubToken,
    repository,
    workflow,
    ref,
  }
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ""
}

function isMadridSevenAm() {
  const madridHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: MADRID_TIMEZONE,
    }).format(new Date())
  )

  return madridHour === 7
}

async function dispatchWorkflow(request: NextRequest, initiator: "vercel-cron" | "manual-api") {
  const { cronSecret, githubToken, repository, workflow, ref } = getExpectedSecrets()
  const suppliedToken = getBearerToken(request)

  if (!cronSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing CRON_SECRET or AUTOMATION_TRIGGER_SECRET in runtime environment.",
      },
      { status: 500 }
    )
  }

  if (suppliedToken !== cronSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized trigger.",
      },
      { status: 401 }
    )
  }

  const missing = [
    !githubToken ? "GITHUB_ACTIONS_TRIGGER_TOKEN" : null,
    !repository ? "GITHUB_ACTIONS_REPOSITORY or VERCEL_GIT_REPO_*" : null,
  ].filter(Boolean)

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Missing runtime config: ${missing.join(", ")}`,
      },
      { status: 500 }
    )
  }

  if (initiator === "vercel-cron" && !isMadridSevenAm()) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "Cron invoked outside the 07:00 Europe/Madrid window. Skipping duplicate DST slot.",
        checkedAt: new Date().toISOString(),
      },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          force: "true",
          initiator,
        },
      }),
    }
  )

  const raw = await response.text()
  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `GitHub dispatch failed with ${response.status}.`,
        body: raw || null,
      },
      { status: 502 }
    )
  }

  return NextResponse.json(
    {
      ok: true,
      dispatchedAt: new Date().toISOString(),
      repository,
      workflow,
      ref,
      initiator,
      scheduler: "vercel-cron -> github-actions -> git commit -> vercel redeploy",
      openRouterConfiguredInVercel: Boolean(process.env.OPENROUTER_API_KEY),
    },
    {
      status: 202,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}

export async function GET(request: NextRequest) {
  return dispatchWorkflow(request, "vercel-cron")
}

export async function POST(request: NextRequest) {
  return dispatchWorkflow(request, "manual-api")
}
