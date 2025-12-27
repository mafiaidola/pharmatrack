#!/bin/bash

# MedTrack Setup Script for Unix/macOS/Linux

echo "========================================"
echo "MedTrack Setup Script"
echo "========================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required but not installed. Aborting."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed. Aborting."; exit 1; }
command -v yarn >/dev/null 2>&1 || { echo "Yarn is required but not installed. Run: npm install -g yarn"; exit 1; }

echo "✓ Python found: $(python3 --version)"
echo "✓ Node.js found: $(node --version)"
echo "✓ Yarn found: $(yarn --version)"
echo ""

# Backend setup
echo "Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please edit backend/.env and configure your MongoDB connection"
fi

echo "✓ Backend setup complete"
cd ..
echo ""

# Frontend setup
echo "Setting up frontend..."
cd frontend

echo "Installing Node dependencies..."
yarn install

if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
fi

echo "✓ Frontend setup complete"
cd ..
echo ""

# Database seeding
echo "========================================"
echo "Do you want to seed the database with demo data? (y/n)"
read -r response

if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
    echo "Seeding database..."
    cd backend
    source venv/bin/activate
    python ../scripts/seed_data.py
    cd ..
    echo "✓ Database seeded"
fi

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "To start the application:"
echo ""
echo "Terminal 1 - Backend:"
echo "  cd backend"
echo "  source venv/bin/activate"
echo "  uvicorn server:app --reload --host 0.0.0.0 --port 8001"
echo ""
echo "Terminal 2 - Frontend:"
echo "  cd frontend"
echo "  yarn start"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
echo "Demo credentials:"
echo "  Super Admin: admin / admin123"
echo "  GM: gm_john / gm123"
echo "  Manager: manager_sarah / manager123"
echo "  Medical Rep: rep_mike / rep123"
echo ""