# MedTrack - Medical Representative Tracking System

A comprehensive multi-tenant dashboard for tracking medical representatives with GPS location monitoring, visit verification, and complete CRUD operations for clinics, orders, and expenses.

## Features

- 🌍 **Multi-language Support** (Arabic/English with RTL support)
- 🏢 **Multi-tenant Architecture** with organization isolation
- 👥 **Role-based Access Control** (Super Admin, GM, Manager, Medical Rep)
- 📍 **GPS Tracking** with location verification
- 🏥 **Clinic Management** with GPS coordinates
- 📊 **Visit Logging** with proximity validation
- 📦 **Order Management** with product tracking
- 💰 **Expense Tracking** with receipt uploads
- 🔐 **JWT Authentication**
- 📱 **Mobile-friendly** responsive design

## Tech Stack

- **Frontend**: React 19, TailwindCSS, Shadcn UI, Lucide Icons
- **Backend**: FastAPI (Python), Motor (Async MongoDB)
- **Database**: MongoDB
- **Authentication**: JWT with bcrypt
- **Maps**: Browser Geolocation API

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Python** (v3.11 or higher) - [Download](https://www.python.org/)
- **MongoDB** (v6 or higher) - [Download](https://www.mongodb.com/try/download/community)
- **Yarn** (v1.22 or higher) - Install via `npm install -g yarn`

## Local Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd medtrack
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env file and configure:
# - MONGO_URL (your MongoDB connection string)
# - DB_NAME (database name)
# - JWT_SECRET (generate a secure random string)
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Create .env file
cp .env.example .env

# Edit .env file and set:
# REACT_APP_BACKEND_URL=http://localhost:8001
```

### 4. MongoDB Setup

**Option A: Local MongoDB Installation**

1. Start MongoDB service:
   ```bash
   # On Windows (as Administrator):
   net start MongoDB
   
   # On macOS:
   brew services start mongodb-community
   
   # On Linux:
   sudo systemctl start mongod
   ```

2. Your connection string will be: `mongodb://localhost:27017`

**Option B: MongoDB Atlas (Cloud)**

1. Create free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster
3. Get connection string and add to backend/.env
4. Whitelist your IP address

### 5. Seed Database with Demo Data

```bash
# From project root
cd backend
python -c "import sys; sys.path.insert(0, '..'); from scripts.seed_data import seed_database; import asyncio; asyncio.run(seed_database())"

# OR run the seed script directly
python ../scripts/seed_data.py
```

This creates:
- 2 organizations
- 5 users (admin, gm, manager, 2 medical reps)
- 3 sample clinics

### 6. Run the Application

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
yarn start
```

The application will open at: `http://localhost:3000`

## Demo Credentials

After seeding the database, you can login with:

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `admin` | `admin123` |
| General Manager | `gm_john` | `gm123` |
| Manager | `manager_sarah` | `manager123` |
| Medical Rep | `rep_mike` | `rep123` |
| Medical Rep | `rep_emma` | `rep123` |

## Environment Variables

### Backend (.env)

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=medtrack_database
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=your-secret-key-change-in-production
```

### Frontend (.env)

```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

## Project Structure

```
medtrack/
├── backend/
│   ├── server.py           # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Backend environment variables
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── contexts/      # React contexts (Language)
│   │   ├── i18n/          # Translations
│   │   ├── utils/         # Utility functions
│   │   ├── App.js         # Main app component
│   │   └── index.js       # Entry point
│   ├── public/            # Static assets
│   ├── package.json       # Node dependencies
│   └── .env              # Frontend environment variables
├── scripts/
│   └── seed_data.py       # Database seeding script
└── README.md             # This file
```

## Troubleshooting

### MongoDB Connection Issues

1. **Check if MongoDB is running:**
   ```bash
   # Check MongoDB status
   mongosh --eval "db.adminCommand('ping')"
   ```

2. **Verify connection string in backend/.env**

3. **Check firewall settings** if using MongoDB Atlas

### Backend Not Starting

1. **Verify Python version:**
   ```bash
   python --version  # Should be 3.11+
   ```

2. **Reinstall dependencies:**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Check for port conflicts** (port 8001)

### Frontend Not Starting

1. **Clear node_modules and reinstall:**
   ```bash
   rm -rf node_modules yarn.lock
   yarn install
   ```

2. **Check Node.js version:**
   ```bash
   node --version  # Should be 18+
   ```

3. **Verify REACT_APP_BACKEND_URL in .env**

### CORS Errors

Make sure backend/.env has:
```
CORS_ORIGINS=http://localhost:3000
```

## API Documentation

Once the backend is running, visit:
- Swagger UI: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`

## Language Support

- **Default**: Arabic (with RTL layout)
- **Available**: English (with LTR layout)
- **Fonts**: 
  - Arabic: Tajawal
  - English: Roboto

Click the language switcher button in the top right to switch between languages.

## GPS Features

The application uses browser's Geolocation API:
1. Browser will request location permission
2. Medical reps can enable GPS tracking
3. Visit locations are verified within 1km radius
4. Managers can monitor rep locations in real-time

## Development

### Adding New Translations

Edit `frontend/src/i18n/translations.js`:

```javascript
export const translations = {
  ar: {
    myKey: 'النص العربي',
  },
  en: {
    myKey: 'English text',
  }
};
```

Use in components:
```javascript
const { t } = useLanguage();
<div>{t('myKey')}</div>
```

### Database Schema

Main collections:
- `organizations` - Company/organization data
- `users` - User accounts with roles
- `clinics` - Medical clinics with GPS coordinates
- `visits` - Visit logs with verification
- `orders` - Product orders
- `expenses` - Expense claims
- `gps_logs` - Location tracking history

## Production Deployment

For production deployment:

1. **Update environment variables** with production values
2. **Generate secure JWT_SECRET**: `openssl rand -hex 32`
3. **Build frontend**: `yarn build`
4. **Use production WSGI server** for backend (Gunicorn with uvicorn workers)
5. **Set up reverse proxy** (Nginx)
6. **Enable HTTPS**
7. **Configure MongoDB security** (authentication, network access)

## License

MIT License - feel free to use for commercial projects.

## Support

For issues or questions:
1. Check Troubleshooting section
2. Review API documentation at `/docs`
3. Check MongoDB connection and logs

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

**Built with ❤️ using FastAPI, React, and MongoDB**