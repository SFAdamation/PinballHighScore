# Run this ON THE PINBALL CABINET PC (not this dev machine) to find the real
# paths for config.json. It checks common locations first, then falls back to
# a full C: search if nothing turns up.
#
# Usage:  powershell -ExecutionPolicy Bypass -File discover-paths.ps1

Write-Host "`n== Looking for PinUP Popper database (PUPMaster.db) ==" -ForegroundColor Cyan
$db = Get-ChildItem -Path C:\PinUPSystem -Recurse -Filter 'PUPMaster.db' -ErrorAction SilentlyContinue
if (-not $db) {
  Write-Host "Not found under C:\PinUPSystem, searching all of C:\ (this may take a minute)..."
  $db = Get-ChildItem -Path C:\ -Recurse -Filter 'PUPMaster.db' -ErrorAction SilentlyContinue
}
$db | ForEach-Object { Write-Host $_.FullName }

Write-Host "`n== Looking for POPMedia folder (backglass/table/wheel images) ==" -ForegroundColor Cyan
$media = Get-ChildItem -Path C:\PinUPSystem -Recurse -Directory -Filter 'POPMedia' -ErrorAction SilentlyContinue
if (-not $media) {
  $media = Get-ChildItem -Path C:\ -Recurse -Directory -Filter 'POPMedia' -ErrorAction SilentlyContinue
}
$media | ForEach-Object {
  Write-Host $_.FullName
  Get-ChildItem $_.FullName -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'backglass|table|wheel|loading' } |
    ForEach-Object { Write-Host "  -> $($_.FullName)" }
}

Write-Host "`n== Looking for HighScores text files (written by PINemHi / PinUP Popper) ==" -ForegroundColor Cyan
$hs = Get-ChildItem -Path C:\PinUPSystem -Recurse -Directory -Filter 'HighScores' -ErrorAction SilentlyContinue
if (-not $hs) {
  $hs = Get-ChildItem -Path C:\ -Recurse -Directory -Filter 'HighScores' -ErrorAction SilentlyContinue
}
$hs | ForEach-Object {
  Write-Host $_.FullName
  $sample = Get-ChildItem $_.FullName -Filter '*.txt' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($sample) {
    Write-Host "  sample file: $($sample.Name)"
    Write-Host "  --- contents ---"
    Get-Content $sample.FullName | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" }
    Write-Host "  ----------------"
  }
}

Write-Host "`nCopy the paths above into config.json (see config.example.json). If a category" -ForegroundColor Yellow
Write-Host "found nothing, PINemHi/Popper may not have scraped scores yet for a table -" -ForegroundColor Yellow
Write-Host "play a game and check its high score screen in Popper, then rerun this script." -ForegroundColor Yellow
