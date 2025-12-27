# Quick Setup Guide for Cursor IDE

## Step 1: Install Prerequisites

### Windows
1. **Node.js**: Download from https://nodejs.org/ (v18+)
2. **Python**: Download from https://www.python.org/ (v3.11+)
3. **MongoDB**: Download from https://www.mongodb.com/try/download/community
   - Or use MongoDB Atlas (cloud) - https://www.mongodb.com/cloud/atlas
4. **Yarn**: Open terminal and run `npm install -g yarn`

### macOS
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install prerequisites
brew install node python@3.11 mongodb-community yarn

# Start MongoDB
brew services start mongodb-community
```

### Linux (Ubuntu/Debian)
```bash
# Update system
sudo apt update

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Yarn
npm install -g yarn
```

## Step 2: Setup Project in Cursor

1. **Open Cursor IDE**
2. **Open the project folder** (medtrack)
3. **Open integrated terminal** (Terminal menu → New Terminal)

## Step 3: Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env file in Cursor and update values if needed
```

## Step 4: Frontend Setup

**Open a new terminal** (keep backend terminal open)

```bash
# Navigate to frontend
cd frontend

# Install dependencies
yarn install

# Create .env file
cp .env.example .env
```

## Step 5: Start MongoDB

### If using local MongoDB:

**Windows:**
```cmd
# Run as Administrator
net start MongoDB
```

**macOS:**
```bash
brew services start mongodb-community
```

**Linux:**
```bash
sudo systemctl start mongod
```

### If using MongoDB Atlas:
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free account and cluster
3. Get connection string
4. Update `MONGO_URL` in `backend/.env`
5. Whitelist your IP address in Atlas

## Step 6: Seed Database

**In a new terminal:**

```bash
# Make sure you're in the project root
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Run seed script
python ../scripts/seed_data.py
```

You should see:
```
Demo Credentials:
==================================================
Super Admin: admin / admin123
General Manager: gm_john / gm123
Manager: manager_sarah / manager123
Medical Reps: rep_mike / rep123, rep_emma / rep123
==================================================
```

## Step 7: Run the Application

### Terminal 1 - Backend:
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8001
```

### Terminal 2 - Frontend:
```bash
cd frontend
yarn start
```

Browser will automatically open at `http://localhost:3000`

## Step 8: Login and Test

1. Browser opens automatically at `http://localhost:3000`
2. You'll see Arabic login page (default)
3. Click language switcher (top right) to change to English
4. Login with: `admin` / `admin123`
5. Explore the dashboard!

## Common Issues & Solutions

### Issue: "Python not found"
**Solution:** Make sure Python is in your PATH. Reinstall Python with "Add to PATH" checked.

### Issue: "MongoDB connection failed"
**Solution:** 
1. Check if MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`
2. Verify MONGO_URL in backend/.env
3. If using Atlas, check IP whitelist

### Issue: "Port 8001 already in use"
**Solution:** 
```bash
# Find and kill process using port 8001
# Windows:
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8001 | xargs kill -9
```

### Issue: "yarn: command not found"
**Solution:** 
```bash
npm install -g yarn
```

### Issue: Frontend shows blank page
**Solution:**
1. Check browser console (F12) for errors
2. Verify REACT_APP_BACKEND_URL in frontend/.env
3. Make sure backend is running
4. Clear browser cache (Ctrl+Shift+Delete)

### Issue: CORS errors
**Solution:** Make sure backend/.env has:
```
CORS_ORIGINS=http://localhost:3000
```

## Cursor-Specific Tips

1. **Split Terminal**: Use split terminal feature to run both backend and frontend
2. **Environment Files**: Cursor will ask to trust the workspace - click "Trust"
3. **Extensions**: Install Python and JavaScript extensions for better experience
4. **Debug**: Use Cursor's debugging features with breakpoints
5. **Git Integration**: Use Cursor's built-in Git panel for version control

## VS Code Configuration (if needed)

Create `.vscode/settings.json`:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/backend/venv/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "editor.formatOnSave": true,
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Success Checklist

- [ ] MongoDB is running
- [ ] Backend dependencies installed
- [ ] Frontend dependencies installed
- [ ] .env files created and configured
- [ ] Database seeded with demo data
- [ ] Backend running on port 8001
- [ ] Frontend running on port 3000
- [ ] Can login with demo credentials
- [ ] Language switcher works
- [ ] Dashboard loads correctly

## Next Steps

1. Explore different user roles (admin, gm, manager, rep)
2. Test GPS tracking features (browser will ask for location permission)
3. Try creating clinics, logging visits, and adding orders
4. Switch between Arabic and English
5. Test on mobile view (resize browser)

## Need Help?

Check the main README.md for detailed documentation and API reference.

Happy coding! 🚀