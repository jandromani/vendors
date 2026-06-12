import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] ?? fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env ${name}`)
  }
  return value
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} on ${url}: ${await response.text()}`)
  }

  return response.json()
}

async function waitForDeploymentUrl({ repo, sha, githubToken, timeoutMs, pollMs }) {
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pricing-agents-vercel-promote",
  }

  const deadline = Date.now() + timeoutMs
  let lastReason = "Deployment not found yet."

  while (Date.now() < deadline) {
    const deploymentsUrl = new URL(`https://api.github.com/repos/${repo}/deployments`)
    deploymentsUrl.searchParams.set("sha", sha)
    deploymentsUrl.searchParams.set("per_page", "20")

    const deployments = await fetchJson(deploymentsUrl, headers)
    const deployment = deployments.find(
      (candidate) => `${candidate.environment ?? ""}`.toLowerCase() === "production"
    )

    if (!deployment) {
      lastReason = `No Vercel deployment found yet for commit ${sha}.`
      await sleep(pollMs)
      continue
    }

    const statuses = await fetchJson(deployment.statuses_url, headers)
    const successStatus = statuses.find(
      (status) =>
        status.state === "success" &&
        typeof (status.environment_url ?? status.target_url) === "string"
    )

    if (successStatus) {
      return {
        deploymentId: deployment.id,
        deploymentUrl: successStatus.environment_url ?? successStatus.target_url,
        productionEnvironment: deployment.production_environment === true,
      }
    }

    const failureStatus = statuses.find((status) => status.state === "error" || status.state === "failure")
    if (failureStatus) {
      throw new Error(
        `Vercel deployment ${deployment.id} failed before promotion: ${failureStatus.description ?? failureStatus.state}`
      )
    }

    lastReason = `Deployment ${deployment.id} exists but is not READY yet.`
    await sleep(pollMs)
  }

  throw new Error(`Timed out waiting for Vercel deployment URL. Last reason: ${lastReason}`)
}

async function promoteDeployment(url) {
  const vercelToken = getRequiredEnv("VERCEL_TOKEN")
  const vercelScope = process.env.VERCEL_SCOPE
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx"
  const args = ["-y", "vercel@latest", "promote", url, "--token", vercelToken, "--yes"]

  if (vercelScope) {
    args.push("--scope", vercelScope)
  }

  const { stdout, stderr } = await execFileAsync(npxCommand, args, {
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  })

  return `${stdout}${stderr}`.trim()
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || getArg("--repo")
  const sha = process.env.TARGET_SHA || getArg("--sha")
  const githubToken = process.env.GITHUB_TOKEN || process.env.PROMOTION_GITHUB_TOKEN
  const timeoutMs = Number(getArg("--timeout-seconds", "900")) * 1000
  const pollMs = Number(getArg("--poll-seconds", "15")) * 1000
  const dryRun = hasFlag("--dry-run")

  if (!repo) throw new Error("Missing target repo. Use GITHUB_REPOSITORY or --repo.")
  if (!sha) throw new Error("Missing target sha. Use TARGET_SHA or --sha.")
  if (!githubToken) throw new Error("Missing GitHub token. Use GITHUB_TOKEN or PROMOTION_GITHUB_TOKEN.")

  const deployment = await waitForDeploymentUrl({
    repo,
    sha,
    githubToken,
    timeoutMs,
    pollMs,
  })

  console.log(
    JSON.stringify(
      {
        deploymentId: deployment.deploymentId,
        deploymentUrl: deployment.deploymentUrl,
        productionEnvironment: deployment.productionEnvironment,
        mode: dryRun ? "dry-run" : "promote",
      },
      null,
      2
    )
  )

  if (dryRun) {
    return
  }

  const output = await promoteDeployment(deployment.deploymentUrl)
  if (output) {
    console.log(output)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
