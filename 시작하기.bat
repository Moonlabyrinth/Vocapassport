@echo off
pushd "%~dp0"
title Word Test Manager

set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
set "NEXT=node_modules\next\dist\bin\next"
set "PATH=%PATH%;%ProgramFiles%\nodejs"

REM Shared cloud database (Neon) so this PC and the website show the SAME data.
REM (To use a separate OFFLINE local copy instead, delete the next line.)
set "DATABASE_URL=postgresql://neondb_owner:npg_DHaNCKm68gXd@ep-solitary-king-aodsgqy8.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

echo ==================================================
echo    Word Test Manager  -  daneo siheom gwanli
echo ==================================================
echo.

REM If a server is already running, just open the browser and exit
powershell -NoProfile -Command "try{$null=Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 2;exit 0}catch{exit 1}"
if %errorlevel%==0 (
  echo Already running. Opening browser...
  start "" http://localhost:3000
  timeout /t 2 >nul
  popd
  exit /b
)

REM First run only: install components
if not exist "node_modules" (
  echo [Setup] Installing components. This may take a few minutes...
  call npm install
)

REM Build if not built yet
if not exist ".next\BUILD_ID" (
  echo [Setup] Building the app. Please wait...
  "%NODE%" "%NEXT%" build
)

echo.
echo Starting the server...
echo The browser will open automatically when it is ready.
echo To STOP the program, just close this black window.
echo.

REM Open the browser once the server responds (waits in background)
start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 90;$i++){try{$null=Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 2;Start-Process 'http://localhost:3000';break}catch{Start-Sleep -Seconds 1}}"

REM Run the production server (most stable)
"%NODE%" "%NEXT%" start

echo.
echo Program stopped. You can close this window.
popd
pause
