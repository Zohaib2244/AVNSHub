@echo off
setlocal
cd /d "%~dp0"

echo Starting AVN Hub...
call npm run dev
if errorlevel 1 (
  echo AVN Hub did not start correctly.
  echo If this is your first run, try install.bat first.
  pause
  exit /b 1
)
