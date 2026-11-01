# Builds both mods and gathers the built files in dist\~mods at the repository root.
# Usage (from anywhere): powershell -ExecutionPolicy Bypass -File tools\build-all.ps1
#
# 1. ScriptModLoader\build.ps1   (syntax check, tests, pak, byte-for-byte check) -> ScriptModLoader\dist
# 2. EarnedProgression\build.ps1 (same; needs the loader built first)             -> EarnedProgression\dist
# 3. Copies every file of both mod dist folders into dist\~mods and checks the copies by hash.
#    dist\~mods\ScriptModLoader.json (the registry) is created if missing and never overwritten.
# Stops at the first failure and leaves dist\~mods untouched in that case.
$ErrorActionPreference = 'Stop'

$root   = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'dist\~mods'
$mods   = @('ScriptModLoader', 'EarnedProgression')

function Fail($message) { Write-Host "BUILD-ALL FAILED: $message" -ForegroundColor Red; exit 1 }
function Step($message) { Write-Host "== $message" -ForegroundColor Cyan }

# 1 and 2: build each mod with its own script, loader first
foreach ($mod in $mods) {
    $script = Join-Path $root "$mod\build.ps1"
    if (-not (Test-Path $script)) { Fail "missing $script" }
    Step "building $mod"
    & powershell -ExecutionPolicy Bypass -File $script
    if ($LASTEXITCODE -ne 0) { Fail "$mod did not build (see the lines above)" }
}

# 3: dist\~mods at the root
Step "updating $outDir"
New-Item -ItemType Directory -Force $outDir | Out-Null

$registry = Join-Path $outDir 'ScriptModLoader.json'
if (-not (Test-Path $registry)) {
    $json = '{' + "`n" + '  "mods": [' + "`n" + '    { "id": "EarnedProgression", "enabled": true }' + "`n" + '  ]' + "`n" + '}' + "`n"
    [IO.File]::WriteAllText($registry, $json, (New-Object Text.UTF8Encoding($false)))
    Write-Host '   created ScriptModLoader.json (it did not exist)'
}
else {
    Write-Host '   kept the existing ScriptModLoader.json'
}

$copied = @()
foreach ($mod in $mods) {
    $modDist = Join-Path $root "$mod\dist"
    $files = @(Get-ChildItem $modDist -File)
    if ($files.Count -eq 0) { Fail "$mod\dist is empty" }
    foreach ($f in $files) {
        Copy-Item $f.FullName (Join-Path $outDir $f.Name) -Force
        $copied += [pscustomobject]@{ Mod = $mod; Name = $f.Name; Source = $f.FullName }
    }
}

Step 'checking the copies'
foreach ($c in $copied) {
    $target = Join-Path $outDir $c.Name
    if ((Get-FileHash $c.Source).Hash -ne (Get-FileHash $target).Hash) { Fail "copy differs from the build: $($c.Name)" }
}

Step 'result'
Get-ChildItem $outDir -File | Sort-Object Name | ForEach-Object { '   {0,-38} {1,8} bytes' -f $_.Name, $_.Length }
Write-Host 'BUILD-ALL OK' -ForegroundColor Green
