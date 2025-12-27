# MedTrack - Cursor IDE Checklist

## Before You Start

### Prerequisites Check
- [ ] Cursor IDE installed
- [ ] Python 3.11+ installed (`python --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Yarn installed (`yarn --version`) - If not: `npm install -g yarn`
- [ ] MongoDB installed OR MongoDB Atlas account ready

## Setup Steps

### 1. Open Project in Cursor
- [ ] Cloned repository from GitHub
- [ ] Opened `medtrack` folder in Cursor (`File` → `Open Folder`)
- [ ] Clicked "Yes, I trust the authors" when prompted

### 2. Run Setup Script
Choose one:

**Option A - Automated (Recommended):**
- [ ] Windows: Double-click `setup.bat` OR in terminal: `setup.bat`
- [ ] macOS/Linux: In terminal: `chmod +x setup.sh && ./setup.sh`

**Option B - Manual:**
- [ ] Followed steps in `SETUP_GUIDE.md`

### 3. Configure Environment Files

**backend/.env:**
- [ ] File created (from .env.example)
- [ ] `MONGO_URL` configured
- [ ] `JWT_SECRET` set to secure random string
- [ ] `CORS_ORIGINS` set to `http://localhost:3000`

**frontend/.env:**
- [ ] File created (from .env.example)
- [ ] `REACT_APP_BACKEND_URL` set to `http://localhost:8001`

### 4. Database Setup
- [ ] MongoDB is running (local or Atlas)
- [ ] Connection tested (backend can connect)
- [ ] Database seeded with demo data (`python scripts/seed_data.py`)

### 5. Start Application

**Backend Terminal:**
- [ ] Opened terminal in Cursor (`Ctrl+` `)
- [ ] Navigated to backend: `cd backend`
- [ ] Activated venv: 
  - Windows: `venv\Scripts\activate`
  - macOS/Linux: `source venv/bin/activate`
- [ ] Started server: `uvicorn server:app --reload --host 0.0.0.0 --port 8001`
- [ ] Seeing: "Uvicorn running on http://0.0.0.0:8001"

**Frontend Terminal:**
- [ ] Opened new terminal (split or new tab)
- [ ] Navigated to frontend: `cd frontend`
- [ ] Started frontend: `yarn start`
- [ ] Browser opened at `http://localhost:3000`

## Verification

### Visual Check
- [ ] Login page loads in Arabic (default)
- [ ] Language switcher visible (top right)
- [ ] Can switch to English
- [ ] Tajawal font displays correctly for Arabic
- [ ] Roboto font displays correctly for English
- [ ] RTL layout works for Arabic
- [ ] LTR layout works for English

### Functionality Check
- [ ] Can login with: `admin` / `admin123`
- [ ] Dashboard loads after login
- [ ] Sidebar navigation works
- [ ] Can switch between pages (Clinics, Visits, Orders, etc.)
- [ ] Language switcher works in dashboard
- [ ] User info shows in sidebar
- [ ] Can logout

### Features Check
- [ ] **Super Admin**: Can see organizations, create users
- [ ] **GM/Manager**: Can see users, GPS tracking
- [ ] **Medical Rep**: Can add clinics, log visits
- [ ] GPS permission requested when enabling tracking
- [ ] All forms and modals work
- [ ] Toast notifications appear

## Common Issues & Quick Fixes

### MongoDB Connection Failed
- [ ] Check MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`
- [ ] Verify MONGO_URL in backend/.env
- [ ] If using Atlas, check IP whitelist

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:8001 | xargs kill -9
```
- [ ] Killed process on port 8001 or 3000

### Python/Node Not Found
- [ ] Restarted Cursor after installing Python/Node
- [ ] Checked PATH environment variable
- [ ] Reinstalled with "Add to PATH" option

### Virtual Environment Issues
- [ ] Deleted venv folder
- [ ] Recreated: `python -m venv venv`
- [ ] Reinstalled: `pip install -r requirements.txt`

### Frontend Dependencies Issues
- [ ] Deleted node_modules and yarn.lock
- [ ] Ran `yarn install` again
- [ ] Cleared browser cache (Ctrl+Shift+Del)

## Development Workflow

### Daily Workflow
1. [ ] Open Cursor
2. [ ] Start backend terminal (activate venv, run uvicorn)
3. [ ] Start frontend terminal (run yarn start)
4. [ ] Make changes to code
5. [ ] Test in browser
6. [ ] Commit changes
7. [ ] Push to GitHub

### Making Changes
- [ ] Backend changes auto-reload (with --reload flag)
- [ ] Frontend changes auto-reload (React hot reload)
- [ ] Database changes require restart
- [ ] .env changes require restart

### Testing
- [ ] Check terminal for backend errors
- [ ] Check browser console (F12) for frontend errors
- [ ] Test API at: http://localhost:8001/docs
- [ ] Test different user roles
- [ ] Test both Arabic and English
- [ ] Test mobile view (resize browser)

### Using Cursor AI
- [ ] Select code → `Ctrl+K` → Ask to improve
- [ ] `Ctrl+L` → Chat about bugs or features
- [ ] Ask: "Explain this code"
- [ ] Ask: "How to add a new feature"
- [ ] Ask: "Debug this error"

## Before Pushing to GitHub

- [ ] All features working
- [ ] No console errors
- [ ] Both languages tested
- [ ] All user roles tested
- [ ] .env files NOT committed (in .gitignore)
- [ ] Meaningful commit message written
- [ ] Code formatted (Shift+Alt+F)

## Cursor Keyboard Shortcuts Reference

| Action | Shortcut |
|--------|----------|
| Command Palette | `Ctrl+Shift+P` |
| Quick File Open | `Ctrl+P` |
| Toggle Terminal | `Ctrl+` ` |
| Split Terminal | `Ctrl+Shift+5` |
| Split Editor | `Ctrl+\\` |
| AI Chat | `Ctrl+L` |
| AI Command | `Ctrl+K` |
| Find in Files | `Ctrl+Shift+F` |
| Format Code | `Shift+Alt+F` |
| Go to Definition | `F12` |
| Toggle Sidebar | `Ctrl+B` |

## Need Help?

Check these files in order:
1. [ ] `CURSOR_SETUP.md` - Cursor-specific instructions
2. [ ] `SETUP_GUIDE.md` - Detailed setup guide
3. [ ] `README.md` - Full project documentation
4. [ ] `DOCKER_SETUP.md` - Docker alternative (optional)

Ask Cursor AI:
- [ ] `Ctrl+L` → Describe your issue
- [ ] Paste error message and ask for help

## Success Criteria

✅ You're ready to develop when:
- Backend terminal shows "Uvicorn running"
- Frontend browser opened at localhost:3000
- Can login with demo credentials
- Dashboard loads with all features
- Both Arabic and English work perfectly
- Can navigate all pages without errors
- GPS features work (with browser permission)
- All CRUD operations functional

---

## Quick Reference Commands

**Backend:**
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

**Frontend:**
```bash
cd frontend
yarn start
```

**Seed Database:**
```bash
cd backend
source venv/bin/activate
python ../scripts/seed_data.py
```

**Test API:**
- Swagger: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

**Demo Logins:**
- admin / admin123
- gm_john / gm123
- manager_sarah / manager123
- rep_mike / rep123

---

**Happy Coding in Cursor! 🚀**
