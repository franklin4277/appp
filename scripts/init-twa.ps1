param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestUrl,

  [string]$OutputDir = "mobile\\twa"
)

$bubblewrap = Get-Command bubblewrap.cmd -ErrorAction SilentlyContinue
if (-not $bubblewrap) {
  throw "bubblewrap.cmd not found. Install first: npm.cmd i -g @bubblewrap/cli"
}

$absoluteOutput = Join-Path $PSScriptRoot "..\\$OutputDir"
New-Item -ItemType Directory -Force -Path $absoluteOutput | Out-Null

Push-Location $absoluteOutput
try {
  & bubblewrap.cmd init --manifest $ManifestUrl
  Write-Output "TWA project initialized at: $absoluteOutput"
} finally {
  Pop-Location
}
