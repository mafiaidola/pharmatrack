@echo off
REM MedTrack Setup Script for Windows

echo ========================================
echo MedTrack Setup Script
echo ========================================
echo.

REM Check prerequisites
echo Checking prerequisites...

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Python is required but not installed. Please install Python 3.11+
    pause
    exit /b 1
)

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is required but not installed. Please install Node.js 18+
    pause
    exit /b 1
)

where yarn >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Yarn is required but not installed. Run: npm install -g yarn
    pause
    exit /b 1
)

echo [OK] Python found
echo [OK] Node.js found
echo [OK] Yarn found
echo.

REM Backend setup
echo Setting up backend...
cd backend

if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing Python dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt

if not exist ".env" (
    echo Creating .env file from template...
    copy .env.example .env
    echo Please edit backend\.env and configure your MongoDB connection
)

echo [OK] Backend setup complete
cd ..
echo.

REM Frontend setup
echo Setting up frontend...
cd frontend

echo Installing Node dependencies...
yarn install

if not exist ".env" (
    echo Creating .env file from template...
    copy .env.example .env
)

echo [OK] Frontend setup complete
cd ..
echo.

REM Database seeding
echo ========================================
set /p seed="Do you want to seed the database with demo data? (Y/N): "

if /i "%seed%"=="Y" (
    echo Seeding database...
    cd backend
    call venv\Scripts\activate.bat
    python ..\scripts\seed_data.py
    cd ..
    echo [OK] Database seeded
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To start the application:
echo.
echo Terminal 1 - Backend:
echo   cd backend
echo   venv\Scripts\activate.bat
echo   uvicorn server:app --reload --host 0.0.0.0 --port 8001
echo.
echo Terminal 2 - Frontend:
echo   cd frontend
echo   yarn start
echo.
echo Then open http://localhost:3000 in your browser
echo.
echo Demo credentials:
echo   Super Admin: admin / admin123
echo   GM: gm_john / gm123
echo   Manager: manager_sarah / manager123
echo   Medical Rep: rep_mike / rep123
echo.
pause