$ErrorActionPreference = "Stop"
$workspace = (Get-Location).Path
$manifestPath = Join-Path $workspace "tmp\rag-v3-visual-review\blank-review-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$powerPoint = New-Object -ComObject PowerPoint.Application
try {
  foreach ($item in $manifest.items) {
    if (-not $item.source.EndsWith(".pptx", [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    $deckDir = Join-Path $workspace ("tmp\rag-v3-visual-review\pptx-{0:D2}" -f [int]$item.index)
    New-Item -ItemType Directory -Force -Path $deckDir | Out-Null
    $presentation = $powerPoint.Presentations.Open($item.source, $true, $true, $false)
    try {
      foreach ($unit in $item.blankUnits) {
        $output = Join-Path $deckDir ("slide-{0:D3}.png" -f [int]$unit)
        $presentation.Slides.Item([int]$unit).Export($output, "PNG", 1600, 900)
      }
    } finally {
      $presentation.Close()
    }
  }
} finally {
  $powerPoint.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
}
