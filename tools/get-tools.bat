@echo off
rem Downloads the latest Windows release of repak into tools\bin\repak. repak unpacks the game's
rem scripts for reading (see tools\instructions.md). The download is checked against the SHA-256
rem file published with the release before it is unpacked.
rem Also checks that node (needed by the builds) and python (needed by tools\*.py) are on the PATH.
rem Uses only programs that come with Windows 10 and 11: curl, tar and certutil.
rem
rem Usage: double-click it, or run  tools\get-tools.bat  (add /nopause to skip the final pause).
setlocal EnableDelayedExpansion

set "BIN=%~dp0bin"
set "WORK=%TEMP%\pbz-get-tools"
set "FAILED=0"

for %%c in (curl.exe tar.exe certutil.exe) do (
    where %%c >nul 2>nul || (
        echo [error] %%c was not found. It ships with Windows 10 1803 and newer.
        set "FAILED=1"
    )
)
if "%FAILED%"=="1" goto :end

if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%" || (echo [error] cannot create %WORK% & set "FAILED=1" & goto :end)

call :getTool repak repak_cli-x86_64-pc-windows-msvc.zip repak.exe

echo.
echo == also needed on the PATH (not downloaded by this script)
where node >nul 2>nul && (for /f "delims=" %%v in ('node --version') do echo    node %%v) || (
    echo    [missing] node - install Node.js 18 or newer from https://nodejs.org/
    set "FAILED=1"
)
where python >nul 2>nul && (for /f "delims=" %%v in ('python --version 2^>^&1') do echo    %%v) || (
    echo    [missing] python - install Python 3 from https://www.python.org/downloads/
    set "FAILED=1"
)

rmdir /s /q "%WORK%" 2>nul

:end
echo.
if "%FAILED%"=="0" (echo GET-TOOLS OK) else (echo GET-TOOLS FAILED: see the lines above)
if /i not "%~1"=="/nopause" pause
endlocal & exit /b %FAILED%

rem ---------------------------------------------------------------------------------------
rem :getTool <name> <zip asset> <exe>
rem Downloads https://github.com/trumank/<name>/releases/latest/download/<zip asset> and its
rem .sha256, compares the hashes, and unpacks the zip into tools\bin\<name>.
:getTool
set "NAME=%~1"
set "ZIP=%~2"
set "EXE=%~3"
set "URL=https://github.com/trumank/%NAME%/releases/latest/download/%ZIP%"
echo.
echo == %NAME%  (https://github.com/trumank/%NAME%)
curl.exe -sSfL -o "%WORK%\%ZIP%" "%URL%" || (echo    [error] download failed: %URL% & set "FAILED=1" & exit /b 1)
curl.exe -sSfL -o "%WORK%\%ZIP%.sha256" "%URL%.sha256" || (echo    [error] download failed: %URL%.sha256 & set "FAILED=1" & exit /b 1)

set "WANT="
for /f "usebackq tokens=1" %%a in ("%WORK%\%ZIP%.sha256") do if not defined WANT set "WANT=%%a"
set "GOT="
for /f "delims=" %%h in ('certutil -hashfile "%WORK%\%ZIP%" SHA256 ^| findstr /v ":"') do if not defined GOT set "GOT=%%h"
set "GOT=!GOT: =!"
if /i not "!WANT!"=="!GOT!" (
    echo    [error] SHA-256 mismatch, not installed
    echo            expected !WANT!
    echo            got      !GOT!
    set "FAILED=1"
    exit /b 1
)
echo    SHA-256 ok  !GOT!

if not exist "%BIN%\%NAME%" mkdir "%BIN%\%NAME%"
tar.exe -xf "%WORK%\%ZIP%" -C "%BIN%\%NAME%" || (echo    [error] could not unpack into %BIN%\%NAME% ^(is %EXE% in use?^) & set "FAILED=1" & exit /b 1)
for /f "delims=" %%v in ('"%BIN%\%NAME%\%EXE%" --version') do echo    installed %%v  -^>  %BIN%\%NAME%\%EXE%
exit /b 0
