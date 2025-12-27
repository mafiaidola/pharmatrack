# Running MedTrack in Cursor IDE

## Quick Start (5 Minutes)

### 1. Clone and Open in Cursor

1. Push your code to GitHub
2. In Cursor: `File` → `Open Folder`
3. Select the `medtrack` folder
4. Click "Yes, I trust the authors" when prompted

### 2. Install Prerequisites (One-time)

**Check what you have:**
- Open Cursor terminal: `Ctrl+` ` (backtick) or `View` → `Terminal`
- Run: `python --version` (need 3.11+)
- Run: `node --version` (need 18+)
- Run: `yarn --version` (if not installed: `npm install -g yarn`)

**Install MongoDB:**
- **Easy Option**: Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free cloud database)
- **Local Option**: Download from https://www.mongodb.com/try/download/community

### 3. Automated Setup

**Option A: Use Setup Script (Recommended)**

**Windows:**
```bash
setup.bat
```

**macOS/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

This will:
- Create virtual environments
- Install all dependencies
- Create .env files
- Optionally seed demo data

**Option B: Manual Setup**

See `SETUP_GUIDE.md` for step-by-step instructions.

### 4. Configure Environment

**Backend (.env):**
```env
MONGO_URL=mongodb://localhost:27017
# OR for MongoDB Atlas:
# MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net

DB_NAME=medtrack_database
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=your-secret-key-here
```

**Frontend (.env):**
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 5. Run the Application

**Split Terminal in Cursor:**
1. Open terminal: `Ctrl+` `
2. Click the split terminal icon (or `Ctrl+Shift+5`)
3. Now you have two terminals side by side

**Terminal 1 - Backend:**
```bash
cd backend

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Start backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**Terminal 2 - Frontend:**
```bash
cd frontend
yarn start
```

Browser will automatically open at `http://localhost:3000`

### 6. Login

**Default Language:** Arabic (RTL layout)
**Switch to English:** Click language switcher in top right

**Demo Credentials:**
- Super Admin: `admin` / `admin123`
- GM: `gm_john` / `gm123`
- Manager: `manager_sarah` / `manager123`
- Medical Rep: `rep_mike` / `rep123`

## Cursor-Specific Features

### 1. Split View for Code
- `Ctrl+\` to split editor
- Work on backend and frontend simultaneously

### 2. Integrated Terminal
- `Ctrl+` ` to toggle terminal
- Multiple terminals for backend/frontend
- Terminal tabs at bottom

### 3. Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "server:app",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8001"
      ],
      "cwd": "${workspaceFolder}/backend",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/backend"
      }
    }
  ]
}
```

### 4. AI Features

**Cursor AI Commands:**
- `Ctrl+K` - AI command palette
- `Ctrl+L` - Chat with AI about code
- Ask: "Explain this code" or "How to add a new feature"

### 5. Git Integration

**Push to GitHub:**
1. Click Source Control icon (left sidebar)
2. Stage changes (+ icon)
3. Write commit message
4. Click ✓ to commit
5. Click `...` → `Push`

## Common Cursor Issues

### Issue: Terminal doesn't recognize commands
**Solution:** Restart Cursor after installing Node/Python/Yarn

### Issue: Python not found in Cursor
**Solution:**
1. `Ctrl+Shift+P`
2. Type "Python: Select Interpreter"
3. Choose the venv interpreter: `./backend/venv/bin/python`

### Issue: Port already in use
**Solution:**
```bash
# In Cursor terminal
# Windows:
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8001 | xargs kill -9
```

### Issue: Changes not reflecting
**Solution:**
1. Backend: Check if uvicorn is in `--reload` mode
2. Frontend: Clear browser cache (`Ctrl+Shift+Del`)
3. Hard refresh: `Ctrl+Shift+R`

## Development Workflow in Cursor

### 1. Make Changes
- Edit files in Cursor
- Changes auto-reload (backend & frontend)

### 2. Test Changes
- Backend: Check terminal for errors
- Frontend: Browser auto-refreshes
- API Docs: http://localhost:8001/docs

### 3. Use Cursor AI
- Select code → `Ctrl+K` → Ask to refactor/improve
- Chat with AI about bugs: `Ctrl+L`
- Generate code: "Create a new endpoint for..."

### 4. Debug
- Add `print()` statements in Python
- Use `console.log()` in JavaScript
- Check browser console (F12)
- Check Cursor terminal for backend errors

### 5. Commit Changes
- Stage files in Source Control
- Write meaningful commit messages
- Push to GitHub regularly

## Useful Cursor Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Command Palette | `Ctrl+Shift+P` | `Cmd+Shift+P` |
| Quick Open | `Ctrl+P` | `Cmd+P` |
| Terminal | `Ctrl+` ` | `Ctrl+` ` |
| Split Editor | `Ctrl+\` | `Cmd+\` |
| AI Chat | `Ctrl+L` | `Cmd+L` |
| AI Command | `Ctrl+K` | `Cmd+K` |
| Find in Files | `Ctrl+Shift+F` | `Cmd+Shift+F` |
| Go to Definition | `F12` | `F12` |
| Format Document | `Shift+Alt+F` | `Shift+Opt+F` |

## Recommended Extensions for Cursor

1. **Python** (Microsoft)
2. **ESLint** (for JavaScript linting)
3. **Prettier** (code formatting)
4. **GitLens** (enhanced Git)
5. **Thunder Client** (API testing)
6. **MongoDB for VS Code** (database management)

## Project Structure for Development

```
medtrack/
├── backend/              # Python FastAPI
│   ├── server.py       # Main API file (edit this often)
│   ├── venv/           # Virtual environment (don't edit)
│   └── .env           # Config (edit MongoDB URL here)
├── frontend/            # React app
│   ├── src/
│   │   ├── pages/      # Main pages (edit these often)
│   │   ├── components/ # Reusable components
│   │   ├── i18n/       # Translations (AR/EN)
│   │   └── utils/      # Helper functions
│   └── .env           # Config (edit API URL here)
└── scripts/             # Database scripts
    └── seed_data.py   # Demo data
```

## Tips for Success

1. **Keep both terminals running** - Backend and Frontend
2. **Check terminals for errors** - Most issues show there first
3. **Use Cursor AI** - Ask it to explain errors
4. **Test in browser console** - F12 to see frontend errors
5. **Check API docs** - http://localhost:8001/docs for backend
6. **Commit often** - Small, frequent commits are better
7. **Use language switcher** - Test both Arabic and English
8. **Test on mobile** - Resize browser to check responsive design

## Getting Help

1. **Check terminal output** for error messages
2. **Browser console (F12)** for frontend errors
3. **API documentation** at http://localhost:8001/docs
4. **Ask Cursor AI**: `Ctrl+L` and describe your issue
5. **Check SETUP_GUIDE.md** for detailed troubleshooting

## Success Checklist

- [ ] Cursor IDE installed and project opened
- [ ] Prerequisites installed (Python, Node, Yarn, MongoDB)
- [ ] Dependencies installed (ran setup script)
- [ ] .env files configured
- [ ] Backend running on port 8001
- [ ] Frontend running on port 3000
- [ ] Can login with demo credentials
- [ ] Both Arabic and English work
- [ ] Can navigate between pages

---

**You're all set!** Happy coding in Cursor! 🚀