#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Create a new project from the Claude-Starter template — cleanly, with its own
  fresh git history (no template history, no leftover remote).

.DESCRIPTION
  Prefers the GitHub template path (gh repo create --template) when the GitHub CLI
  is installed and authenticated. Otherwise falls back to a local copy of this
  template folder. Either way it ends with a clean repo: hooks made executable,
  a fresh `git init`, and one initial commit.

.PARAMETER Name
  Name of the new project (and the new directory / GitHub repo).

.PARAMETER Path
  Parent directory to create the project in. Defaults to the current directory.

.PARAMETER Private
  Create the GitHub repo as private (template path only). Default: $true.

.PARAMETER Local
  Force the local-copy path even if gh is available (e.g. offline, or no remote yet).

.EXAMPLE
  ./new-project.ps1 my-app
.EXAMPLE
  ./new-project.ps1 my-app -Path C:\Work -Local
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Name,
  [string]$Path = (Get-Location).Path,
  [bool]$Private = $true,
  [switch]$Local
)

$ErrorActionPreference = 'Stop'

$TemplateRepo = 'KyleSullivan321/Claude-Starter'
$TemplateDir  = $PSScriptRoot   # this script lives at the template root
$Dest         = Join-Path $Path $Name

if (Test-Path $Dest) { throw "Destination already exists: $Dest" }

function Initialize-CleanRepo([string]$dir) {
  Push-Location $dir
  try {
    if (-not (Test-Path '.git')) { & git init -q }
    & git add -A
    # Mark hooks executable in the index AFTER staging, so the bit survives the commit.
    Get-ChildItem '.claude/hooks' -Filter '*.sh' -ErrorAction SilentlyContinue | ForEach-Object {
      & git update-index --chmod=+x ".claude/hooks/$($_.Name)" 2>$null
    }
    & git -c commit.gpgsign=false commit -q -m "Initial commit from Claude-Starter template"
    Write-Host "Initialized clean git repo with one commit." -ForegroundColor Green
  } finally { Pop-Location }
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
$ghReady = $false
if ($gh -and -not $Local) {
  try { & gh auth status *> $null; $ghReady = ($LASTEXITCODE -eq 0) } catch { $ghReady = $false }
}

if ($ghReady) {
  Write-Host "Creating GitHub repo '$Name' from template $TemplateRepo ..." -ForegroundColor Cyan
  $vis = if ($Private) { '--private' } else { '--public' }
  & gh repo create $Name --template $TemplateRepo $vis --clone
  if ($LASTEXITCODE -ne 0) { throw "gh repo create failed." }
  # gh clones into the current dir; move it to the requested Path if different.
  if ((Resolve-Path $Path).Path -ne (Get-Location).Path) {
    Move-Item -Path (Join-Path (Get-Location).Path $Name) -Destination $Dest
  }
  Push-Location $Dest
  try {
    Get-ChildItem '.claude/hooks' -Filter '*.sh' -ErrorAction SilentlyContinue | ForEach-Object {
      & git update-index --add --chmod=+x $_.FullName 2>$null
    }
  } finally { Pop-Location }
  Write-Host "Done. GitHub repo created with fresh history (template repos start clean)." -ForegroundColor Green
}
else {
  if ($Local) { Write-Host "Local mode requested." -ForegroundColor Cyan }
  else { Write-Host "gh CLI not available/authenticated — using local copy." -ForegroundColor Yellow }

  Write-Host "Copying template -> $Dest ..." -ForegroundColor Cyan
  # Copy the working tree WITHOUT the template's .git (clean history) or local overrides.
  $exclude = @('.git', '.claude/settings.local.json')
  New-Item -ItemType Directory -Path $Dest -Force | Out-Null
  Get-ChildItem -Path $TemplateDir -Force | Where-Object { $_.Name -ne '.git' } | ForEach-Object {
    Copy-Item $_.FullName -Destination $Dest -Recurse -Force
  }
  $localOverride = Join-Path $Dest '.claude/settings.local.json'
  if (Test-Path $localOverride) { Remove-Item $localOverride -Force }

  Initialize-CleanRepo $Dest
  Write-Host "No remote set. Add one later with: git remote add origin <url>; git push -u origin main" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. cd '$Dest'"
Write-Host "  2. Fill in CLAUDE.md (Project specifics / Conventions / Gotchas)."
Write-Host "  3. Prune any skill/agent/command/hook you won't use."
Write-Host "  4. Start: /spec -> review -> fresh session -> /plan -> /ship"
