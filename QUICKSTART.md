# MedTrack - Quick Start Guide

## 🚀 Get Running in 5 Minutes

### For Cursor IDE Users
1. **Open** `CURSOR_SETUP.md` or `CURSOR_CHECKLIST.md`
2. **Follow** the step-by-step checklist
3. **Done!** You'll be coding in minutes

### For Other IDEs (VS Code, PyCharm, etc.)
1. **Open** `SETUP_GUIDE.md`
2. **Follow** manual setup instructions
3. **Done!** All set to develop

### Using Docker (Easiest!)
1. **Open** `DOCKER_SETUP.md`
2. **Run** `docker-compose up -d`
3. **Done!** Everything runs in containers

---

## 📋 What You Need

- **Python 3.11+** - [Download](https://python.org)
- **Node.js 18+** - [Download](https://nodejs.org)
- **MongoDB** - [Local](https://mongodb.com/download) or [Atlas (Cloud)](https://mongodb.com/cloud/atlas)
- **Yarn** - Run: `npm install -g yarn`

---

## ⚡ Super Quick Setup

### Automated Setup (Recommended)

**Windows:**
```bash
setup.bat
```

**macOS/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

### Manual Setup

**1. Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your MongoDB URL
```

**2. Frontend:**
```bash
cd frontend
yarn install
cp .env.example .env
```

**3. Seed Database:**
```bash
cd backend
source venv/bin/activate
python ../scripts/seed_data.py
```

---

## 🏃 Run the App

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
yarn start
```

**Browser opens automatically at:** `http://localhost:3000`

---

## 🔑 Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Super Admin | admin | admin123 |
| GM | gm_john | gm123 |
| Manager | manager_sarah | manager123 |
| Medical Rep | rep_mike | rep123 |

---

## 🌍 Languages

- **Default:** Arabic (with RTL layout and Tajawal font)
- **Switch:** Click language button (top right)
- **Available:** English (with LTR layout and Roboto font)

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Complete project documentation |
| `CURSOR_SETUP.md` | Cursor IDE specific guide |
| `CURSOR_CHECKLIST.md` | Step-by-step checklist for Cursor |
| `SETUP_GUIDE.md` | Detailed manual setup |
| `DOCKER_SETUP.md` | Docker deployment guide |
| `QUICKSTART.md` | This file! |

---

## 🛠️ Tech Stack

- **Frontend:** React 19, TailwindCSS, Shadcn UI
- **Backend:** FastAPI (Python), Motor (Async MongoDB)
- **Database:** MongoDB
- **Auth:** JWT with bcrypt
- **i18n:** Arabic/English with RTL/LTR support

---

## ✨ Key Features

- 🌐 Multi-language (AR/EN)
- 🏢 Multi-tenant
- 👥 4 user roles
- 📍 GPS tracking
- 🏥 Clinic management
- 📝 Visit logging
- 📦 Order management
- 💰 Expense tracking

---

## ❓ Having Issues?

### Quick Fixes

**MongoDB not connecting?**
```bash
# Check if running
mongosh --eval "db.adminCommand('ping')"
```

**Port already in use?**
```bash
# Windows
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:8001 | xargs kill -9
```

**Dependencies issues?**
```bash
# Backend
cd backend
rm -rf venv
python -m venv venv
pip install -r requirements.txt

# Frontend
cd frontend
rm -rf node_modules yarn.lock
yarn install
```

---

## 🎯 Next Steps

1. ✅ Run the app
2. ✅ Login with demo credentials
3. ✅ Explore different user roles
4. ✅ Test Arabic and English
5. ✅ Try GPS features
6. ✅ Create clinics and log visits
7. ✅ Review code structure
8. ✅ Start developing!

---

## 📞 Need More Help?

- **Detailed Setup:** `SETUP_GUIDE.md`
- **Cursor Users:** `CURSOR_SETUP.md`
- **Docker Users:** `DOCKER_SETUP.md`
- **API Docs:** http://localhost:8001/docs (when running)

---

**Built with ❤️ using FastAPI, React, and MongoDB**

🚀 **Happy Coding!**
