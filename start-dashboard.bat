@echo off
setlocal enabledelayedexpansion
title EGX Dashboard
cd /d "%~dp0"

echo ============================================
echo    EGX Swing-Trading Dashboard
echo ============================================
echo.

REM --- prerequisite: Node / npm on PATH ---
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm / Node.js was not found on your PATH.
  echo         Install Node.js 18+ from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

REM --- first run: install dependencies if missing ---
if not exist "node_modules\" (
  echo [setup] Installing launcher dependencies ^(first run^)...
  call npm install || goto :fail
)
if not exist "backend\node_modules\" (
  echo [setup] Installing backend + frontend + python deps ^(first run^)...
  call npm run setup || goto :fail
)

REM --- ensure the portfolio data file exists ---
if not exist "backend\data\portfolio_data.json" (
  echo [setup] Generating portfolio data from build_portfolio_v3.py...
  call npm run gen
)

REM --- free ports from any previous run that did not shut down cleanly ---
echo [ports] Releasing 8001 / 3001 / 5173 if still in use...
powershell -NoProfile -Command "8001,3001,5173 | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

REM --- open the browser ~7s after the servers begin starting (skippable) ---
if not defined EGX_NO_BROWSER (
  start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 7; Start-Process 'http://localhost:5173'"
)

echo.
echo [run] Starting bridge :8001  +  backend :3001  +  frontend :5173
echo       Your browser will open at http://localhost:5173
echo       Keep this window open. Press Ctrl+C to stop all services.
echo.

call npm run dev

echo.
echo [stopped] Dashboard services have stopped.
pause
exit /b 0

:fail
echo.
echo [ERROR] Dependency installation failed. See the messages above.
pause
exit /b 1
