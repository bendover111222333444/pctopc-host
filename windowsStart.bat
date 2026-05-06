@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "CONFIG=%SCRIPT_DIR%node_path.txt"
set "FOUND_NODE="

echo === Node.js Finder (Safe Mode) ===
echo.

:: ─── Load existing config if present ─────────────────────────────

if exist "!CONFIG!" (
    for /f "usebackq tokens=1,2 delims==" %%A in ("!CONFIG!") do (
        set "%%A=%%B"
    )

    if defined NODE_EXE if exist "!NODE_EXE!" (
        if exist "!NODE_DIR!\npm.cmd" (
            set "FOUND_NODE=!NODE_EXE!"
            goto :found
        )
    )
)

:: ─── Find node.exe (PATH) ────────────────────────────────────────

where node >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%i in ('where node') do (
        call :checkNode "%%i"
        if defined FOUND_NODE goto :found
    )
)

echo node not in PATH, checking common locations...

:: ─── Common locations ────────────────────────────────────────────

for %%p in (
    "%ProgramFiles%\nodejs"
    "%ProgramFiles(x86)%\nodejs"
    "%LOCALAPPDATA%\Programs\nodejs"
    "%APPDATA%\npm"
) do (
    if exist "%%~p\node.exe" (
        call :checkNode "%%~p\node.exe"
        if defined FOUND_NODE goto :found
    )
)

echo Not found in common locations, running full scan...

:: ─── Deep file scan (no execution) ───────────────────────────────

for %%d in (C D E F G) do (
    if exist "%%d:\" (
        for /f "tokens=*" %%f in ('dir /s /b "%%d:\node.exe" 2^>nul') do (
            call :checkNode "%%f"
            if defined FOUND_NODE goto :found
        )
    )
)

if not defined FOUND_NODE (
    echo ERROR: node.exe not found on this PC.
    pause
    exit /b 1
)

:: ─── Found valid Node folder ─────────────────────────────────────

:found
for %%i in ("!FOUND_NODE!") do set "NODE_DIR=%%~dpi"
set "NODE_DIR=!NODE_DIR:~0,-1!"

echo Found node.exe: !FOUND_NODE!

:: ─── Validate npm ONLY by files (no execution) ───────────────────

if not exist "!NODE_DIR!\npm.cmd" (
    echo Skipping: no npm.cmd
    goto :eof
)

if not exist "!NODE_DIR!\node_modules\npm" (
    echo Skipping: incomplete npm folder
    goto :eof
)

if not exist "!NODE_DIR!\node_modules\npm\package.json" (
    echo Skipping: broken npm install
    goto :eof
)

set "NPM=!NODE_DIR!\npm.cmd"

echo Valid Node + npm found:
echo Node: !FOUND_NODE!
echo npm : !NPM!
echo.

:: ─── Save config ─────────────────────────────────────────────────

echo NODE_DIR=!NODE_DIR!>  "!CONFIG!"
echo NODE_EXE=!FOUND_NODE!>> "!CONFIG!"
echo NPM=!NPM!>>            "!CONFIG!"

:: ─── Use it ──────────────────────────────────────────────────────

set "PATH=!NODE_DIR!;!PATH!"
cd /d "!SCRIPT_DIR!"

if not exist "!SCRIPT_DIR!node_modules\" (
    echo node_modules not found, running npm install...
    call "!NPM!" install
) else (
    echo node_modules already exists, skipping install.
)

echo.
echo Starting project...
call "!NPM!" start

pause
exit /b


:: ─── Function ────────────────────────────────────────────────────

:checkNode
set "TEST_NODE=%~1"

for %%i in ("%TEST_NODE%") do set "TEST_DIR=%%~dpi"
set "TEST_DIR=%TEST_DIR:~0,-1%"

if not exist "%TEST_DIR%\node.exe" exit /b
if not exist "%TEST_DIR%\npm.cmd" exit /b

REM only accept if structure looks valid
if not exist "%TEST_DIR%\node_modules\npm" exit /b

set "FOUND_NODE=%TEST_NODE%"
exit /b
