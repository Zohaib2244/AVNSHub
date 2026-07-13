@echo off
setlocal
cd /d "%~dp0"

echo Checking for Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org/ and then run this script again.
  pause
  exit /b 1
)

echo Checking for npm...
where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found.
  echo Install Node.js from https://nodejs.org/ and then run this script again.
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)

echo Ensuring environment config exists...
if not exist ".env.local" (
  if exist ".env.example" (
    copy ".env.example" ".env.local" >nul
    if errorlevel 1 (
      echo Failed to create .env.local from .env.example.
      pause
      exit /b 1
    )
    echo Created .env.local from .env.example.
  ) else (
    echo .env.example not found. Create .env.local manually.
    pause
    exit /b 1
  )
) else (
  echo .env.local already exists.
)

echo Setting up the database...
call npm run db:setup
if errorlevel 1 (
  echo Database setup failed. Check the output above.
  pause
  exit /b 1
)

echo.
echo Installation complete.
echo Double-click run.bat to launch AVN Hub.
pause
