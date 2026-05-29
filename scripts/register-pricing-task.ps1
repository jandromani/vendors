$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = "node"
$scriptPath = Join-Path $projectRoot "scripts\pricing-agents.mjs"
$taskName = "AI Vendor Pricing Agents"

$action = New-ScheduledTaskAction `
  -Execute $nodeCommand `
  -Argument "`"$scriptPath`" --force" `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -Daily -At 7:00AM

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Daily pricing watch for Claude, ChatGPT and Gemini at 07:00." `
  -Force

Write-Output "Scheduled task '$taskName' registered."
