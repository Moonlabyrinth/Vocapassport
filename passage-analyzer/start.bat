@echo off
rem Passage Analyzer launcher (keep this file pure ASCII for cp949 cmd)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install it from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies... this runs only once.
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

start "" http://localhost:3456
node server.mjs
pause
