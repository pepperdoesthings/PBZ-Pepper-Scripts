# Builds every mod and gathers the built files in dist\ProjectPBZ at the repository root, so the
# contents of dist\ can be copied straight into the game's root folder.
# Usage (from anywhere): powershell -ExecutionPolicy Bypass -File tools\build-all.ps1
#
# 1. EarnedProgression\build.ps1 (syntax check, tests, copy, byte-for-byte check) -> EarnedProgression\dist
# 2. Replaces dist\ProjectPBZ with the mods' dist\ProjectPBZ folders and checks the copies by hash.
# Stops at the first failure and leaves the output folder untouched in that case.
# The mods need Mods Menu (https://www.nexusmods.com/phantombladezero/mods/149), which players
# install themselves; nothing of it is built or copied here.
$ErrorActionPreference = 'Stop'

$root   = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'dist\ProjectPBZ'
$mods   = @('EarnedProgression')

function Fail($message) { Write-Host "BUILD-ALL FAILED: $message" -ForegroundColor Red; exit 1 }
function Step($message) { Write-Host "== $message" -ForegroundColor Cyan }

# 1: build each mod with its own script
foreach ($mod in $mods) {
    $script = Join-Path $root "$mod\build.ps1"
    if (-not (Test-Path $script)) { Fail "missing $script" }
    Step "building $mod"
    & powershell -ExecutionPolicy Bypass -File $script
    if ($LASTEXITCODE -ne 0) { Fail "$mod did not build (see the lines above)" }
}

# 2: the output folder at the root, rebuilt from scratch so files a mod no longer has do not linger
Step "updating $outDir"
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Force $outDir | Out-Null

$copied = @()
foreach ($mod in $mods) {
    $modOut = Join-Path $root "$mod\dist\ProjectPBZ"
    $files = @(Get-ChildItem $modOut -Recurse -File)
    if ($files.Count -eq 0) { Fail "$mod\dist\ProjectPBZ is empty" }
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($modOut.Length + 1)
        $target = Join-Path $outDir $rel
        if (Test-Path $target) { Fail "two mods write the same file: $rel" }
        New-Item -ItemType Directory -Force (Split-Path $target -Parent) | Out-Null
        Copy-Item $f.FullName $target
        $copied += [pscustomobject]@{ Rel = $rel; Source = $f.FullName }
    }
}

Step 'checking the copies'
foreach ($c in $copied) {
    if ((Get-FileHash $c.Source).Hash -ne (Get-FileHash (Join-Path $outDir $c.Rel)).Hash) { Fail "copy differs from the build: $($c.Rel)" }
}

Step 'result'
Get-ChildItem $outDir -Recurse -File | Sort-Object FullName | ForEach-Object { '   {0,-90} {1,8} bytes' -f $_.FullName.Substring($outDir.Length + 1), $_.Length }
Write-Host 'BUILD-ALL OK' -ForegroundColor Green
