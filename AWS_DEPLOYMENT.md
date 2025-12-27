# AWS Deployment Guide

This guide explains how to deploy the MedTrack application to AWS.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   S3 + CloudFront    │────▶│   EC2 / ECS     │────▶│  MongoDB Atlas  │
│   (Frontend)    │     │   (Backend API) │     │   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │   S3 Bucket     │
                        │   (Uploads)     │
                        └─────────────────┘
```

## Prerequisites

1. AWS Account with appropriate permissions
2. MongoDB Atlas cluster (or AWS DocumentDB)
3. Domain name (optional but recommended)

---

## Backend Deployment (EC2)

### 1. Environment Variables

Create a `.env` file on your EC2 instance:

```bash
# MongoDB Atlas Connection
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=medtrack_production

# JWT Secret (MUST be at least 32 characters)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters

# Environment
ENV=production

# CORS (your frontend domain)
CORS_ORIGINS=https://your-domain.com

# Server
HOST=0.0.0.0
PORT=8000
```

### 2. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Run with Gunicorn (Production)

```bash
gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### 4. Set up as Systemd Service

Create `/etc/systemd/system/medtrack.service`:

```ini
[Unit]
Description=MedTrack API
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/medtrack/backend
Environment="PATH=/home/ubuntu/medtrack/venv/bin"
EnvironmentFile=/home/ubuntu/medtrack/backend/.env
ExecStart=/home/ubuntu/medtrack/venv/bin/gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable medtrack
sudo systemctl start medtrack
```

---

## Frontend Deployment (S3 + CloudFront)

### 1. Build Production Bundle

```bash
cd frontend

# Create production environment file
echo "REACT_APP_BACKEND_URL=https://api.your-domain.com" > .env.production

# Build
yarn build
```

### 2. Deploy to S3

```bash
aws s3 sync build/ s3://your-bucket-name --delete
```

### 3. CloudFront Configuration

- Origin: Your S3 bucket
- Default Root Object: `index.html`
- Error Pages: Redirect 403/404 to `/index.html` (for SPA routing)

---

## File Uploads (S3 Migration)

Currently, files are stored in `backend/uploads/`. For AWS deployment, migrate to S3:

### Backend Changes Needed

1. Add S3 configuration to `.env`:
```bash
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=medtrack-uploads
AWS_REGION=us-east-1
```

2. Update `server.py` upload endpoints to use S3 (boto3 is already in requirements.txt)

---

## Security Checklist

- [ ] Set strong `JWT_SECRET` (32+ characters)
- [ ] Enable HTTPS (SSL certificate)
- [ ] Configure proper CORS origins
- [ ] Set up AWS Security Groups
- [ ] Enable MongoDB Atlas IP whitelist
- [ ] Set up AWS CloudWatch for logging

---

## Quick Start Commands

```bash
# Backend
cd backend
pip install gunicorn
gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000

# Frontend
cd frontend
yarn build
# Upload build/ folder to S3
```
