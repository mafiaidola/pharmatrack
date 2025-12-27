# Docker Setup for MedTrack

## Prerequisites

- Docker Desktop installed ([Download](https://www.docker.com/products/docker-desktop/))
- Git installed

## Quick Start with Docker

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd medtrack
```

### 2. Configure Environment

Create environment files:

**backend/.env:**
```env
MONGO_URL=mongodb://mongodb:27017
DB_NAME=medtrack_database
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=your-secret-key-change-in-production
```

**frontend/.env:**
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 3. Start All Services

```bash
docker-compose up -d
```

This will start:
- MongoDB on port 27017
- Backend on port 8001
- Frontend on port 3000

### 4. Seed Database

```bash
# Wait for services to be ready (30 seconds)
sleep 30

# Seed the database
docker-compose exec backend python /app/../scripts/seed_data.py
```

### 5. Access Application

Open browser: http://localhost:3000

**Demo Credentials:**
- Super Admin: `admin` / `admin123`
- GM: `gm_john` / `gm123`
- Manager: `manager_sarah` / `manager123`
- Medical Rep: `rep_mike` / `rep123`

## Docker Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

### Stop Services

```bash
docker-compose down
```

### Restart Services

```bash
docker-compose restart
```

### Rebuild Containers

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Access Container Shell

```bash
# Backend
docker-compose exec backend bash

# MongoDB
docker-compose exec mongodb mongosh
```

### Clean Everything

```bash
# Stop and remove containers, networks, volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
# Windows:
netstat -ano | findstr :3000
netstat -ano | findstr :8001

# macOS/Linux:
lsof -ti:3000
lsof -ti:8001

# Kill the process or change ports in docker-compose.yml
```

### Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Rebuild
docker-compose build backend
docker-compose up -d backend
```

### Database Connection Issues

```bash
# Verify MongoDB is running
docker-compose ps

# Check MongoDB logs
docker-compose logs mongodb

# Test connection
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

## Production Deployment

For production, create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    restart: always
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=secure_password

  backend:
    build:
      context: ./backend
    restart: always
    environment:
      - MONGO_URL=mongodb://admin:secure_password@mongodb:27017
      - DB_NAME=medtrack_database
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGINS=${FRONTEND_URL}
    command: uvicorn server:app --host 0.0.0.0 --port 8001 --workers 4

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    restart: always
    environment:
      - REACT_APP_BACKEND_URL=${BACKEND_URL}

volumes:
  mongodb_data:
```

Run with:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Benefits of Docker Setup

1. **No Local Dependencies** - No need to install Python, Node, MongoDB locally
2. **Consistent Environment** - Works the same on all machines
3. **Easy Cleanup** - Remove everything with one command
4. **Isolated** - Doesn't interfere with other projects
5. **Production-Ready** - Same setup works in production

## Development Workflow with Docker

1. **Start containers**: `docker-compose up -d`
2. **Make code changes** - Files are synced via volumes
3. **Auto-reload** - Both backend and frontend auto-reload
4. **View logs**: `docker-compose logs -f`
5. **Stop when done**: `docker-compose down`

---

**Note:** For local development without Docker, see `SETUP_GUIDE.md`