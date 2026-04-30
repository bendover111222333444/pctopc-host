@echo off

set "NODE_HOME=C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VisualStudio\NodeJs"
set "PATH=%NODE_HOME%;%NODE_HOME%\node_modules\npm\bin;%PATH%"

cd /d "C:\Users\1058022\Downloads\pctopc-server-main (2)\pctopc-server-main"

if not exist node_modules (
echo Installing dependencies...
npm install
)

echo Starting server...
npm start

pause
