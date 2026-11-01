# Builds the ScriptModLoader pack into ScriptModLoader\dist\ and checks it.
# Usage (from anywhere): powershell -ExecutionPolicy Bypass -File ScriptModLoader\build.ps1
# Needs: node, python, and the tools in ..\tools\bin (repak, retoc) and ..\tools\listpak.py.
$ErrorActionPreference = 'Stop'

$modDir   = $PSScriptRoot
$toolsDir = Join-Path (Split-Path $modDir -Parent) 'tools'
$repak    = Join-Path $toolsDir 'bin\repak\repak.exe'
$retoc    = Join-Path $toolsDir 'bin\retoc\retoc.exe'
$listpak  = Join-Path $toolsDir 'listpak.py'
$src      = Join-Path $modDir 'src'
$dist     = Join-Path $modDir 'dist'
$name     = 'zzz_PBZ_ScriptModLoader_P'
$pak      = Join-Path $dist "$name.pak"
$utoc     = Join-Path $dist "$name.utoc"
$ucas     = Join-Path $dist "$name.ucas"

function Fail($message) { Write-Host "BUILD FAILED: $message" -ForegroundColor Red; exit 1 }
function Step($message) { Write-Host "== $message" }

foreach ($tool in $repak, $retoc, $listpak) {
    if (-not (Test-Path $tool)) { Fail "missing tool: $tool" }
}

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

Step 'pack (pak version 11, mount point ../../../)'
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $dist | Out-Null
& $repak pack --version V11 --mount-point '../../../' --quiet $src $pak
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pak)) { Fail 'repak pack failed' }

Step 'IoStore stubs (.utoc/.ucas)'
& $retoc to-zen --version UE5_7 $pak $utoc | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $utoc) -or -not (Test-Path $ucas)) { Fail 'retoc to-zen failed' }

Step 'verify pak contents against src (byte for byte)'
$check = Join-Path $env:TEMP "sml-verify-$PID"
if (Test-Path $check) { Remove-Item $check -Recurse -Force }
# listpak.py prints its summary line to stderr, which 'Stop' would treat as an error
$ErrorActionPreference = 'Continue'
python $listpak $pak '' --extract $check 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'listpak.py failed' }
$ErrorActionPreference = 'Stop'
$files = Get-ChildItem $src -Recurse -File
$extracted = @(Get-ChildItem $check -Recurse -File)
if ($extracted.Count -ne $files.Count) { Fail "pak holds $($extracted.Count) files, source has $($files.Count)" }
foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length + 1)
    $copy = Join-Path $check $rel
    if (-not (Test-Path $copy) -or (Get-FileHash $f.FullName).Hash -ne (Get-FileHash $copy).Hash) { Fail "pak entry differs from source: $rel" }
}
Remove-Item $check -Recurse -Force

Step 'result'
Get-ChildItem $dist | ForEach-Object { '   {0}  {1} bytes' -f $_.Name, $_.Length }
Write-Host 'BUILD OK' -ForegroundColor Green
