param(
  [Parameter(Mandatory = $true)]
  [string]$PackageName,

  [Parameter(Mandatory = $true)]
  [string]$Fingerprints
)

$fingerprintList = $Fingerprints.Split(",") `
  | ForEach-Object { $_.Trim() } `
  | Where-Object { $_ -ne "" }

if ($fingerprintList.Count -eq 0) {
  throw "At least one SHA256 fingerprint is required."
}

$assetLinks = @(
  @{
    relation = @("delegate_permission/common.handle_all_urls")
    target   = @{
      namespace                = "android_app"
      package_name             = $PackageName
      sha256_cert_fingerprints = @($fingerprintList)
    }
  }
)

$wellKnownDir = Join-Path $PSScriptRoot "..\\client\\public\\.well-known"
New-Item -ItemType Directory -Force -Path $wellKnownDir | Out-Null

$outputPath = Join-Path $wellKnownDir "assetlinks.json"
$json = ConvertTo-Json -Depth 8 -InputObject $assetLinks
$json | Set-Content -Path $outputPath -Encoding UTF8

Write-Output "Wrote: $outputPath"
