@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "CONFIG=%SCRIPT_DIR%node_path.txt"
set "FOUND_NODE="

echo === Node.js Finder ===
echo.

:: ─── Find node.exe ───────────────────────────────────────────────

where node >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%i in ('where node') do (
        set "FOUND_NODE=%%i"
        goto :found
    )
)

echo node not in PATH, checking common locations...

for %%p in (
    "%ProgramFiles%\nodejs"
    "%ProgramFiles(x86)%\nodejs"
    "%LOCALAPPDATA%\Programs\nodejs"
    "%APPDATA%\npm"
) do (
    if exist "%%~p\node.exe" (
        set "FOUND_NODE=%%~p\node.exe"
        goto :found
    )
)

echo Not found in common locations, running full scan...

for %%d in (C D E F G) do (
    if exist "%%d:\" (
        for /f "tokens=*" %%f in ('dir /s /b "%%d:\node.exe" 2^>nul') do (
            if not defined FOUND_NODE set "FOUND_NODE=%%f"
        )
    )
)

if not defined FOUND_NODE (
    echo ERROR: node.exe not found on this PC.
    pause
    exit /b 1
)

:: ─── Validate node dir and npm ───────────────────────────────────

:found
for %%i in ("!FOUND_NODE!") do set "NODE_DIR=%%~dpi"
set "NODE_DIR=!NODE_DIR:~0,-1!"

echo Found node.exe: !FOUND_NODE!

if exist "!NODE_DIR!\npm.cmd" (
    set "NPM=!NODE_DIR!\npm.cmd"
) else if exist "!NODE_DIR!\npm" (
    set "NPM=!NODE_DIR!\npm"
) else (
    echo ERROR: npm not found alongside node.exe.
    pause
    exit /b 1
)

:: ─── Check node version 16+ ──────────────────────────────────────

for /f "tokens=* delims=v" %%a in ('"!FOUND_NODE!" --version') do set "NODE_VERSION=%%a"
for /f "tokens=1 delims=." %%a in ("!NODE_VERSION!") do set "NODE_MAJOR=%%a"

if !NODE_MAJOR! LSS 16 (
    echo ERROR: Node v!NODE_VERSION! is too old. Version 16+ is required.
    pause
    exit /b 1
)

echo Node v!NODE_VERSION! OK
echo npm: !NPM!
echo.

:: ─── Save config ─────────────────────────────────────────────────

echo NODE_DIR=!NODE_DIR!>  "!CONFIG!"
echo NODE_EXE=!FOUND_NODE!>> "!CONFIG!"
echo NPM=!NPM!>>            "!CONFIG!"
echo NODE_VERSION=!NODE_VERSION!>> "!CONFIG!"

echo Saved config to: !CONFIG!

:: ─── Set PATH for this session ───────────────────────────────────

set "PATH=!NODE_DIR!;!PATH!"

:: ─── cd into project and run ─────────────────────────────────────

cd /d "!SCRIPT_DIR!"

if not exist "!SCRIPT_DIR!node_modules\" (
    echo node_modules not found, running npm install...
    call npm install
) else (
    echo node_modules already exists, skipping install.
)

echo.
echo Starting project...
cd /d "!SCRIPT_DIR!"
set ELECTRON_RUN_AS_NODE=
npm start

pause