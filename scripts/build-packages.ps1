# Build ZIP packages for each Nebula Forge agent
# Optionally takes a hashtable of tunnel URLs to substitute into ai-plugin.json
#
# Usage:
#   .\scripts\build-packages.ps1
#   .\scripts\build-packages.ps1 -Tunnels @{ "nebula-hr"="https://abc-3001.use.devtunnels.ms" }
#
# Outputs ZIP files into dist/packages/

param(
  [hashtable]$Tunnels = @{}
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "dist\packages"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$agents = @(
  @{ name="nebula-hr";          port=3001 }
  @{ name="nebula-materials";   port=3002 }
  @{ name="nebula-exploration"; port=3003 }
  @{ name="nebula-science";     port=3004 }
  @{ name="nebula-safety";      port=3005 }
  @{ name="nebula-engineering"; port=3006 }
  @{ name="nebula-logistics";   port=3007 }
  @{ name="nebula-comms";       port=3008 }
  @{ name="nebula-medbay";      port=3009 }
)

# Stable, deterministic GUIDs so re-builds keep the same Teams App ID
$guidMap = @{
  "nebula-hr"          = "a1111111-1111-4111-8111-111111111111"
  "nebula-materials"   = "a2222222-2222-4222-8222-222222222222"
  "nebula-exploration" = "a3333333-3333-4333-8333-333333333333"
  "nebula-science"     = "a4444444-4444-4444-8444-444444444444"
  "nebula-safety"      = "a5555555-5555-4555-8555-555555555555"
  "nebula-engineering" = "a6666666-6666-4666-8666-666666666666"
  "nebula-logistics"   = "a7777777-7777-4777-8777-777777777777"
  "nebula-comms"       = "a8888888-8888-4888-8888-888888888888"
  "nebula-medbay"      = "a9999999-9999-4999-8999-999999999999"
}

Write-Host "`n🌌 Building Nebula Forge agent packages...`n"

foreach ($a in $agents) {
  $name    = $a.name
  $port    = $a.port
  $appPkg  = Join-Path $root "agents\$name\appPackage"
  $stage   = Join-Path $root "dist\stage\$name"
  $zipPath = Join-Path $outDir "$name.zip"

  if (-not (Test-Path $appPkg)) {
    Write-Warning "  ⚠️  $name — appPackage not found, skipping"
    continue
  }

  # Stage a clean copy
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  $sourceItems = Get-ChildItem -LiteralPath $appPkg
  foreach ($item in $sourceItems) {
    Copy-Item -LiteralPath $item.FullName -Destination $stage -Recurse -Force
  }

  # 1) Substitute TEAMS_APP_ID placeholder
  $manifestPath = Join-Path $stage "manifest.json"
  $manifest = Get-Content $manifestPath -Raw
  $manifest = $manifest -replace '\$\{\{TEAMS_APP_ID\}\}', $guidMap[$name]
  Set-Content -Path $manifestPath -Value $manifest -NoNewline

  # 2) Substitute MCP URL if a tunnel was provided
  if ($Tunnels.ContainsKey($name)) {
    $pluginPath = Join-Path $stage "ai-plugin.json"
    $plugin = Get-Content $pluginPath -Raw
    $localUrl = "http://localhost:$port/mcp"
    $tunnelUrl = $Tunnels[$name].TrimEnd("/") + "/mcp"
    $plugin = $plugin -replace [regex]::Escape($localUrl), $tunnelUrl
    Set-Content -Path $pluginPath -Value $plugin -NoNewline
    Write-Host "  🔗 $name — MCP URL set to $tunnelUrl"
  } else {
    Write-Host "  ⚠️  $name — using localhost (replace before deploying!)"
  }

  # 3) Create the ZIP
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $items = Get-ChildItem -LiteralPath $stage
  Compress-Archive -LiteralPath $items.FullName -DestinationPath $zipPath -Force

  $sizeKB = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
  Write-Host "  ✅ $name → dist\packages\$name.zip ($sizeKB KB)"
}

Write-Host "`n🎉 All packages built!`n"
Write-Host "Output directory: $outDir"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open https://m365.cloud.microsoft/chat OR https://copilotstudio.microsoft.com"
Write-Host "  2. Use 'Upload custom app' / 'Import agent' and select a .zip from dist\packages\"
Write-Host ""
