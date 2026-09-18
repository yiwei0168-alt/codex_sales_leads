param(
  [string]$ManifestPath = "tmp\rag-v3-visual-review\blank-review-manifest.json"
)
$ErrorActionPreference = "Stop"
$workspace = (Get-Location).Path
$resolvedManifestPath = Join-Path $workspace $ManifestPath
$manifest = Get-Content -LiteralPath $resolvedManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$powerPoint = New-Object -ComObject PowerPoint.Application
try {
  $pptxItems = @($manifest.items | Where-Object {
    $_.sourceType -eq "pptx" -or
      ($null -ne $_.source -and $_.source.EndsWith(".pptx", [System.StringComparison]::OrdinalIgnoreCase))
  })
  foreach ($sourceGroup in ($pptxItems | Group-Object { if ($_.sourcePath) { $_.sourcePath } else { $_.source } })) {
    $presentation = $powerPoint.Presentations.Open($sourceGroup.Name, $true, $true, $false)
    try {
      foreach ($item in $sourceGroup.Group) {
        if ($item.reviewId) {
          $output = Join-Path (Split-Path $resolvedManifestPath) ("images\{0}.png" -f $item.reviewId)
          $unit = [int]$item.unitIndex
        } else {
          $deckDir = Join-Path $workspace ("tmp\rag-v3-visual-review\pptx-{0:D2}" -f [int]$item.index)
          New-Item -ItemType Directory -Force -Path $deckDir | Out-Null
          foreach ($legacyUnit in $item.blankUnits) {
            $legacyOutput = Join-Path $deckDir ("slide-{0:D3}.png" -f [int]$legacyUnit)
            $presentation.Slides.Item([int]$legacyUnit).Export($legacyOutput, "PNG", 1600, 900)
          }
          continue
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
        $presentation.Slides.Item($unit).Export($output, "PNG", 1600, 900)
      }
    } finally {
      $presentation.Close()
    }
  }
} finally {
  $powerPoint.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
}
