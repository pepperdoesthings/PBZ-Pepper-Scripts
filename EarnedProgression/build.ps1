# Builds Earned Progression into EarnedProgression\dist\ and checks it.
# Usage (from anywhere): powershell -ExecutionPolicy Bypass -File EarnedProgression\build.ps1
# Needs: node. The output is loose files for Mods Menu, no pak.
#
# dist\ProjectPBZ\Content\JavaScript\PBZModsMenu\Mods\EarnedProgression\...   the mod (copied from src)
# dist\ProjectPBZ\Content\Paks\~mods\EarnedProgression.json                   the default settings
$ErrorActionPreference = 'Stop'

$modDir   = $PSScriptRoot
$src      = Join-Path $modDir 'src'
$dist     = Join-Path $modDir 'dist'
$modRel   = 'ProjectPBZ\Content\JavaScript\PBZModsMenu\Mods\EarnedProgression'

function Fail($message) { Write-Host "BUILD FAILED: $message" -ForegroundColor Red; exit 1 }
function Step($message) { Write-Host "== $message" }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'node is not on the PATH' }
if (-not (Test-Path (Join-Path $src "$modRel\main.js"))) { Fail "missing $src\$modRel\main.js" }

Step 'syntax check'
Get-ChildItem $src, (Join-Path $modDir 'tests') -Recurse -Filter *.js | ForEach-Object {
    node --check $_.FullName
    if ($LASTEXITCODE -ne 0) { Fail "syntax error in $($_.Name)" }
}

Step 'offline tests'
Push-Location $modDir
try {
    $out = node --test 'tests/*.test.js' 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Host $out; Fail 'tests failed' }
    $pass = [regex]::Match($out, 'pass (\d+)').Groups[1].Value
    Write-Host "   $pass tests passed"
}
finally { Pop-Location }

Step 'copy src to dist'
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $dist | Out-Null
Copy-Item (Join-Path $src 'ProjectPBZ') (Join-Path $dist 'ProjectPBZ') -Recurse

Step 'default settings file (EarnedProgression.json, the same text the mod writes on first start)'
$settingsJs = Join-Path $src "$modRel\lib\Settings.js"
$settingsDir = Join-Path $dist 'ProjectPBZ\Content\Paks\~mods'
$settingsOut = Join-Path $settingsDir 'EarnedProgression.json'
New-Item -ItemType Directory -Force $settingsDir | Out-Null
node -e "require('fs').writeFileSync(process.argv[2], require(process.argv[1]).defaultsText())" $settingsJs $settingsOut
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $settingsOut)) { Fail 'could not write the default settings file' }
try { $null = Get-Content $settingsOut -Raw | ConvertFrom-Json } catch { Fail 'the default settings file is not valid JSON' }

Step 'verify dist against src (byte for byte)'
$files = @(Get-ChildItem $src -Recurse -File)
$copies = @(Get-ChildItem (Join-Path $dist 'ProjectPBZ\Content\JavaScript') -Recurse -File)
if ($copies.Count -ne $files.Count) { Fail "dist holds $($copies.Count) script files, source has $($files.Count)" }
foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length + 1)
    $copy = Join-Path $dist $rel
    if (-not (Test-Path $copy) -or (Get-FileHash $f.FullName).Hash -ne (Get-FileHash $copy).Hash) { Fail "dist file differs from source: $rel" }
}

Step 'result'
Get-ChildItem $dist -Recurse -File | ForEach-Object { '   {0}  {1} bytes' -f $_.FullName.Substring($dist.Length + 1), $_.Length }
Write-Host 'BUILD OK' -ForegroundColor Green
