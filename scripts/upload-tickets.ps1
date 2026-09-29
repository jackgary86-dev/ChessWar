# Creates Chess War labels, milestones and issues on GitHub from docs/tickets.json.
# Uploads one issue every 10 seconds. Safe to re-run: issues whose title already exists are skipped.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts\upload-tickets.ps1
# Requires the GitHub CLI, signed in:  gh auth login

param(
  [string]$Repo = "jackgary86-dev/ChessWar",
  [int]$DelaySeconds = 10
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
$tickets = Get-Content -Raw -Encoding UTF8 (Join-Path $root "docs\tickets.json") | ConvertFrom-Json

gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI is not signed in. Run: gh auth login" }

# Labels
$labelColors = @{ "art"="c5a3ff"; "qa"="d93f0b"; "release"="0e8a16"; "checker"="fbca04"; "demo"="1d76db"; "artifacts"="5319e7" }
$labels = $tickets | ForEach-Object { $_.labels } | Sort-Object -Unique
foreach ($l in $labels) {
  $c = if ($labelColors.ContainsKey($l)) { $labelColors[$l] } else { "ededed" }
  gh label create $l --repo $Repo --color $c --force | Out-Null
  Write-Host "label   $l"
}
foreach ($s in "sev:blocker","sev:major","sev:minor","sev:cosmetic") {
  gh label create $s --repo $Repo --color "b60205" --force | Out-Null
}

# Milestones (in ticket order)
$existingMs = gh api "repos/$Repo/milestones?state=all&per_page=100" --jq ".[].title"
$milestones = @()
foreach ($t in $tickets) { if ($milestones -notcontains $t.milestone) { $milestones += $t.milestone } }
foreach ($m in $milestones) {
  if ($existingMs -contains $m) { Write-Host "exists  milestone $m"; continue }
  gh api "repos/$Repo/milestones" -f title="$m" | Out-Null
  Write-Host "created milestone $m"
}

# Issues, one every $DelaySeconds seconds
$existing = gh issue list --repo $Repo --state all --limit 500 --json title --jq ".[].title"
$i = 0; $made = 0
foreach ($t in $tickets) {
  $i++
  if ($existing -contains $t.title) { Write-Host ("[{0}/{1}] skip    {2}" -f $i, $tickets.Count, $t.title); continue }
  if ($made -gt 0) { Start-Sleep -Seconds $DelaySeconds }
  $bodyFile = Join-Path $root $t.file
  $ghArgs = @("issue","create","--repo",$Repo,"--title",$t.title,"--body-file",$bodyFile,"--milestone",$t.milestone)
  foreach ($l in $t.labels) { $ghArgs += @("--label",$l) }
  $url = & gh @ghArgs
  if ($LASTEXITCODE -ne 0) { throw "Failed on: $($t.title). Re-run the script to continue from here." }
  $made++
  Write-Host ("[{0}/{1}] created {2}  {3}" -f $i, $tickets.Count, $t.title, $url)
}
Write-Host "Done. Created $made issues."
