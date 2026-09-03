@echo off
cd /d "%~dp0"
if not exist package.json (
  echo [ERROR] package.json not found in this folder.
  echo Please keep START-WINDOWS.bat in the same folder as package.json.
  pause
  exit /b 1
)
if not exist .env (
  echo [MVR Smart Maintenance] Restoring connected .env from .env.example...
  copy /Y .env.example .env >nul
)
if not exist node_modules (
  echo Installing packages...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check internet access and Node.js installation.
    pause
    exit /b 1
  )
)
echo Starting MVR Smart Maintenance...
call npm.cmd run dev
pause
