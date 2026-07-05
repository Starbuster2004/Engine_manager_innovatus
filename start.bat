@echo off
title EngineTrace — Smart Warehouse Management
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   EngineTrace — Warehouse Management System  ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    pause
    exit /b 1
)

:: Activate venv and install backend deps
echo [1/4] Setting up backend...
cd /d "%~dp0backend"
if not exist "venv" (
    echo       Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo       Installing dependencies first time...
    pip install -r requirements.txt --quiet
) else (
    call venv\Scripts\activate.bat
)

:: Seed database if needed
echo [2/4] Checking database...
python seed.py

:: Install frontend deps
echo [3/4] Setting up frontend...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo       Installing dependencies...
    call npm install
)

:: Start both servers
echo [4/4] Starting servers...
echo.
echo  Backend:  http://localhost:8000  (FastAPI)
echo  Frontend: http://localhost:3000  (Next.js)
echo.
echo  Login credentials:
echo    Operator:      operator1 / Op3r@tor!2026
echo    Supervisor:    supervisor1 / Sup3rv!sor2026
echo    Plant Manager: manager1 / M@nager!2026
echo.
echo  Press Ctrl+C to stop both servers.
echo.

:: Start backend in background
cd /d "%~dp0backend"
start /b cmd /c "call venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app"

:: Start frontend (foreground)
cd /d "%~dp0frontend"
call npm run dev
