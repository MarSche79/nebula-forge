# Replace the schema prefix throughout the Master Agent files
# Usage: .\scripts\fix-master-prefix.ps1 -NewPrefix "cr1234_"
#
# Discover your prefix by opening any of your already-cloned agents'
# settings.mcs.yml — the schemaName is "<prefix>_AgentName"

param(
  [Parameter(Mandatory=$true)]
  [string]$NewPrefix,
  [string]$OldPrefix = "crdb9_"
)

$base = Join-Path (Split-Path -Parent $PSScriptRoot) "Copilot-Studio-Clones\Nebula Forge Master Agent"

if (-not (Test-Path -LiteralPath $base)) {
  Write-Error "Master Agent folder not found: $base"
  exit 1
}

Write-Host "`nReplacing '$OldPrefix' → '$NewPrefix' in Master Agent files...`n"

$count = 0
Get-ChildItem -LiteralPath $base -Recurse -File -Include "*.yml","*.yaml" | ForEach-Object {
  $c = Get-Content -LiteralPath $_.FullName -Raw
  $new = $c -replace [regex]::Escape($OldPrefix), $NewPrefix
  if ($c -ne $new) {
    Set-Content -LiteralPath $_.FullName -Value $new -NoNewline
    Write-Host "  ✓ $($_.FullName.Replace($base + '\', ''))"
    $count++
  }
}

Write-Host "`n$count file(s) updated.`n"
