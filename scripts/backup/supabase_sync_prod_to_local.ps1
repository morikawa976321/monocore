# Sync production Supabase -> local (dump, reset+restore, verify).
# Wrapper for Windows PowerShell; runs the bash pipeline via Git Bash.
#
# Usage (repo root):
#   .\scripts\backup\supabase_sync_prod_to_local.ps1

$ErrorActionPreference = 'Stop'

function ConvertTo-GitBashPath([string]$WinPath) {
  $p = $WinPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(.*)$') {
    return '/' + $Matches[1].ToLowerInvariant() + $Matches[2]
  }
  return $p
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bashScript = Join-Path $PSScriptRoot 'supabase_sync_prod_to_local.sh'
if (-not (Test-Path $bashScript)) {
  throw "Missing bash script: $bashScript"
}

$bashCandidates = @(
  'C:\Program Files\Git\bin\bash.exe',
  'C:\Program Files\Git\usr\bin\bash.exe'
)
$bash = $bashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bash) {
  throw 'Git Bash not found. Install Git for Windows or run scripts/backup/supabase_sync_prod_to_local.sh from WSL/Git Bash.'
}

$bashRepo = ConvertTo-GitBashPath $repoRoot
$bashScriptUnix = ConvertTo-GitBashPath $bashScript
$bashScriptDirUnix = ConvertTo-GitBashPath $PSScriptRoot

Write-Host "Running: $bashScript"
Write-Host "Repo: $repoRoot"

# Materialize LF script then execute as a file so BASH_SOURCE / relative paths work.
$cmd = @"
cd '$bashRepo' &&
tr -d '\r' < '$bashScriptUnix' > /tmp/supabase_sync_prod_to_local.sh &&
export SYNC_REPO_ROOT='$bashRepo' &&
export SYNC_SCRIPT_DIR='$bashScriptDirUnix' &&
bash /tmp/supabase_sync_prod_to_local.sh
"@
& $bash -lc $cmd
exit $LASTEXITCODE
