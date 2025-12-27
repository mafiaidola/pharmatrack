# MedTrack - Troubleshooting Guide

## Quick Diagnostic

Run this command to check your environment:

```bash
python --version && node --version && yarn --version && mongosh --version
```

You should see:
- Python 3.11+
- Node 18+
- Yarn 1.22+
- MongoDB 6.0+

---

## Common Issues by Category

### 1. Installation Issues

#### Python Not Found
**Symptoms:** `python: command not found` or `python3: command not found`

**Solutions:**
1. **Install Python:**
   - Windows: https://python.org → Download → Check "Add to PATH"
   - macOS: `brew install python@3.11`
   - Linux: `sudo apt install python3.11`

2. **Add to PATH:**
   - Windows: System Properties → Environment Variables → Add Python path
   - macOS/Linux: Add to `~/.bashrc` or `~/.zshrc`:
     ```bash
     export PATH="/usr/local/bin/python3:$PATH"
     ```

3. **Restart Terminal/Cursor**

#### Node.js Not Found
**Symptoms:** `node: command not found` or `npm: command not found`

**Solutions:**
1. **Install Node.js:**
   - All platforms: https://nodejs.org → Download LTS version

2. **Verify installation:**
   ```bash
   node --version
   npm --version
   ```

3. **Restart Terminal/Cursor**

#### Yarn Not Found
**Symptoms:** `yarn: command not found`

**Solution:**
```bash
npm install -g yarn
```

If npm also not found, install Node.js first.

---

### 2. MongoDB Issues

#### MongoDB Not Running
**Symptoms:** 
- `Connection refused` error
- `Failed to connect to MongoDB`

**Solutions:**

**Windows:**
```cmd
# Start as Administrator
net start MongoDB

# Or start manually
"C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe" --dbpath="C:\data\db"
```

**macOS:**
```bash
# Using Homebrew
brew services start mongodb-community

# Or manually
mongod --config /usr/local/etc/mongod.conf
```

**Linux:**
```bash
sudo systemctl start mongod
sudo systemctl enable mongod  # Auto-start on boot
```

**Verify it's running:**
```bash
mongosh --eval "db.adminCommand('ping')"
```

#### MongoDB Connection String Wrong
**Symptoms:** Backend won't start, connection errors

**Solution:**
Check `backend/.env`:

**Local MongoDB:**
```env
MONGO_URL=mongodb://localhost:27017
```

**MongoDB Atlas:**
```env
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/
```

**Docker MongoDB:**
```env
MONGO_URL=mongodb://mongodb:27017
```

#### MongoDB Atlas Issues
**Symptoms:** `Network error`, `Authentication failed`

**Solutions:**
1. **Whitelist IP Address:**
   - Atlas Dashboard → Network Access → Add IP Address
   - Add `0.0.0.0/0` for development (not recommended for production)

2. **Check Credentials:**
   - Use database user credentials (not Atlas account)
   - Special characters in password need URL encoding

3. **Connection String:**
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/DATABASE_NAME?retryWrites=true&w=majority
   ```

---

### 3. Backend Issues

#### Virtual Environment Issues
**Symptoms:** 
- `No module named 'fastapi'`
- Import errors

**Solutions:**

**Recreate venv:**
```bash
cd backend
rm -rf venv  # Windows: rmdir /s venv
python -m venv venv

# Activate
source venv/bin/activate  # Windows: venv\Scripts\activate

# Reinstall
pip install --upgrade pip
pip install -r requirements.txt
```

#### Port 8001 Already in Use
**Symptoms:** `Address already in use`

**Solutions:**

**Find and kill process:**
```bash
# Windows
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:8001 | xargs kill -9
```

**Or use different port:**
```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8002
```
Then update `frontend/.env`: `REACT_APP_BACKEND_URL=http://localhost:8002`

#### Backend Won't Start
**Symptoms:** Errors when running `uvicorn`

**Solutions:**

1. **Check for syntax errors:**
   ```bash
   python server.py  # Should show any import errors
   ```

2. **Verify all dependencies installed:**
   ```bash
   pip list | grep fastapi
   pip list | grep motor
   ```

3. **Check MongoDB connection:**
   - Verify MongoDB is running
   - Check MONGO_URL in .env

4. **View detailed error:**
   ```bash
   uvicorn server:app --reload --host 0.0.0.0 --port 8001 --log-level debug
   ```

#### JWT/Authentication Errors
**Symptoms:** `Invalid token`, `Signature verification failed`

**Solution:**
Check `backend/.env` has JWT_SECRET:
```env
JWT_SECRET=your-secret-key-here
```

Generate new secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

### 4. Frontend Issues

#### Port 3000 Already in Use
**Symptoms:** `Port 3000 is already in use`

**Solutions:**

**Option 1 - Kill existing process:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9
```

**Option 2 - Use different port:**
When prompted, type `y` to run on another port (3001, 3002, etc.)

#### Dependencies Not Installing
**Symptoms:** `yarn install` fails

**Solutions:**

1. **Clear cache:**
   ```bash
   cd frontend
   rm -rf node_modules yarn.lock
   yarn cache clean
   yarn install
   ```

2. **Use npm as fallback:**
   ```bash
   npm install
   npm start
   ```

3. **Check Node version:**
   ```bash
   node --version  # Should be 18+
   ```

#### Blank White Page
**Symptoms:** Frontend loads but shows blank page

**Solutions:**

1. **Check browser console (F12):**
   - Look for error messages
   - Check Network tab for failed requests

2. **Verify backend is running:**
   ```bash
   curl http://localhost:8001/api/
   ```

3. **Check REACT_APP_BACKEND_URL:**
   - Should be `http://localhost:8001`
   - No trailing slash

4. **Clear browser cache:**
   - Ctrl+Shift+Del → Clear cache
   - Hard refresh: Ctrl+Shift+R

5. **Rebuild:**
   ```bash
   cd frontend
   rm -rf node_modules build
   yarn install
   yarn start
   ```

#### CORS Errors
**Symptoms:** 
- `CORS policy` errors in console
- `Access-Control-Allow-Origin` errors

**Solution:**
Check `backend/.env`:
```env
CORS_ORIGINS=http://localhost:3000
```

Restart backend after changing.

---

### 5. Database Issues

#### Database Not Seeding
**Symptoms:** `seed_data.py` fails or no demo data

**Solutions:**

1. **Check MongoDB is running:**
   ```bash
   mongosh --eval "db.adminCommand('ping')"
   ```

2. **Run seed script correctly:**
   ```bash
   cd backend
   source venv/bin/activate
   python ../scripts/seed_data.py
   ```

3. **Clear existing data first:**
   ```bash
   mongosh
   use medtrack_database
   db.dropDatabase()
   exit
   # Then run seed script again
   ```

#### Can't Login After Seeding
**Symptoms:** Login fails with correct credentials

**Solutions:**

1. **Verify users were created:**
   ```bash
   mongosh
   use medtrack_database
   db.users.find()
   ```

2. **Re-seed database:**
   ```bash
   cd backend
   source venv/bin/activate
   python ../scripts/seed_data.py
   ```

3. **Check backend logs** for authentication errors

---

### 6. Language/Translation Issues

#### Arabic Not Displaying Correctly
**Symptoms:** Text shows as squares or gibberish

**Solutions:**

1. **Check browser supports Arabic:**
   - Update browser to latest version

2. **Verify font loaded:**
   - Open browser DevTools (F12)
   - Network tab → Filter "tajawal"
   - Font should load from Google Fonts

3. **Clear browser cache**

#### RTL Layout Not Working
**Symptoms:** Arabic shows in LTR layout

**Solutions:**

1. **Check localStorage:**
   ```javascript
   // In browser console (F12)
   localStorage.getItem('language')  // Should be 'ar'
   ```

2. **Manually set:**
   ```javascript
   localStorage.setItem('language', 'ar')
   location.reload()
   ```

3. **Check HTML dir attribute:**
   - Inspect `<html>` tag
   - Should have `dir="rtl"` for Arabic

---

### 7. GPS/Location Issues

#### GPS Permission Denied
**Symptoms:** Location features don't work

**Solutions:**

1. **Grant browser permission:**
   - Click lock icon in address bar
   - Allow location access

2. **Check browser settings:**
   - Chrome: Settings → Privacy → Site Settings → Location
   - Firefox: Preferences → Privacy → Permissions → Location

3. **Use HTTPS in production:**
   - Some browsers require HTTPS for geolocation

#### Location Not Accurate
**Symptoms:** GPS shows wrong location

**Solutions:**

1. **Enable high accuracy:**
   - Already enabled in code
   - Check device GPS is on

2. **Test on mobile:**
   - Mobile devices have better GPS

3. **Wait for better signal:**
   - GPS needs time to get accurate fix

---

### 8. Cursor-Specific Issues

#### Python Interpreter Not Found
**Symptoms:** Cursor can't find Python

**Solution:**
1. Press `Ctrl+Shift+P`
2. Type "Python: Select Interpreter"
3. Choose: `./backend/venv/bin/python`

#### Terminal Commands Not Working
**Symptoms:** Commands like `python` not recognized

**Solution:**
1. Restart Cursor
2. Check system PATH includes Python/Node
3. Open new terminal in Cursor

#### Code Not Auto-Reloading
**Symptoms:** Changes don't reflect

**Solutions:**
1. **Backend:** Check `--reload` flag is used
2. **Frontend:** Check React dev server is running
3. Restart both servers

---

### 9. Production Deployment Issues

#### Environment Variables Not Set
**Symptoms:** App fails in production

**Solution:**
Set all required environment variables:

**Backend:**
```env
MONGO_URL=<production-mongodb-url>
DB_NAME=medtrack_database
JWT_SECRET=<secure-random-string>
CORS_ORIGINS=<production-frontend-url>
```

**Frontend:**
```env
REACT_APP_BACKEND_URL=<production-backend-url>
```

#### Build Fails
**Symptoms:** `yarn build` or docker build fails

**Solutions:**

1. **Check for errors in code**
2. **Update dependencies:**
   ```bash
   yarn upgrade
   ```
3. **Check disk space**
4. **Increase Node memory:**
   ```bash
   NODE_OPTIONS=--max-old-space-size=4096 yarn build
   ```

---

## Diagnostic Commands

### Check All Services

```bash
# Python
python --version

# Node & npm
node --version
npm --version

# Yarn
yarn --version

# MongoDB
mongosh --version
mongosh --eval "db.adminCommand('ping')"

# Backend dependencies
cd backend && pip list

# Frontend dependencies
cd frontend && yarn list
```

### Check Ports

```bash
# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :8001
netstat -ano | findstr :27017

# macOS/Linux
lsof -ti:3000
lsof -ti:8001
lsof -ti:27017
```

### Check Logs

```bash
# Backend logs (while running)
# Check terminal output

# MongoDB logs
# Windows: C:\Program Files\MongoDB\Server\6.0\log\mongod.log
# macOS: /usr/local/var/log/mongodb/mongo.log
# Linux: /var/log/mongodb/mongod.log
```

---

## Still Having Issues?

### Create Detailed Bug Report

Include:
1. **Operating System** (Windows/macOS/Linux + version)
2. **Versions:**
   ```bash
   python --version
   node --version
   yarn --version
   ```
3. **Error Message** (full text)
4. **What you tried**
5. **Screenshots** if relevant

### Clean Slate Approach

If nothing works, start fresh:

```bash
# 1. Backup any changes
git commit -am "Backup before reset"

# 2. Clean everything
rm -rf backend/venv
rm -rf frontend/node_modules
rm -rf frontend/build

# 3. Reset code
git reset --hard origin/main

# 4. Run setup again
./setup.sh  # or setup.bat on Windows
```

---

## Prevention Tips

1. **Always use virtual environment** for Python
2. **Commit .env.example** but never .env
3. **Test both languages** after changes
4. **Keep dependencies updated** (but test after updating)
5. **Use consistent Node/Python versions** across team
6. **Document custom setup steps** for your environment
7. **Regular database backups** in development

---

**Most issues are environment-related. When in doubt, recreate venv and node_modules!**
