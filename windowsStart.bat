@echo off
setlocal

cd /d "%~dp0"

set "NODE_EXE=node"

where node >nul 2>nul
if %errorlevel% neq 0 (
echo System Node not found, trying VS Code...

```
set "VSCODE_NODE=%LOCALAPPDATA%\Programs\Microsoft VS Code\resources\app\node.exe"

if exist "%VSCODE_NODE%" (
    set "NODE_EXE=%VSCODE_NODE%"
) else (
    echo No Node.js found (system or VS Code).
    pause
    exit /b 1
)
```

)

if not exist node_modules (
echo Installing dependencies...
%NODE_EXE% node_modules\npm\bin\npm-cli.js install
)

echo Starting server...
%NODE_EXE% node_modules\npm\bin\npm-cli.js start

pause
