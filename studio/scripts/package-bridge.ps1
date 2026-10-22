$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSScriptRoot
$bridgeRoot = Join-Path $studioRoot 'flow-bridge'
$downloadRoot = Join-Path $studioRoot 'public/downloads'
$runtimeFiles = @(
  'manifest.json', 'background.mjs', 'core.mjs', 'trusted-input.mjs',
  'selectors.mjs', 'adapter.mjs', 'diagnostics.mjs', 'content.js', 'runner.mjs',
  'popup.html', 'popup.mjs', 'popup.css', 'README.md'
)
$filePaths = foreach ($fileName in $runtimeFiles) {
  $filePath = Join-Path $bridgeRoot $fileName
  if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
    throw "Bridge file missing: $fileName"
  }
  $filePath
}
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
$destination = Join-Path $downloadRoot 'motif-flow-bridge.zip'
Compress-Archive -LiteralPath $filePaths -DestinationPath $destination -Force
Get-Item -LiteralPath $destination | Select-Object Name, Length
