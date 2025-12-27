"""
MongoDB Index Update Script for New Features
Run this once to add indexes for the new fields.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def update_indexes():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=30000)
    db = client[os.environ.get('DB_NAME', 'medtrack')]
    
    print("🚀 Updating MongoDB indexes for new features...")
    
    # Users collection - new indexes
    print("\n📋 Users indexes...")
    await db.users.create_index("last_login")
    await db.users.create_index("is_deleted")
    print("   ✅ users.last_login")
    print("   ✅ users.is_deleted")
    
    # User Audit Logs collection
    print("\n📝 User Audit Logs indexes...")
    await db.user_audit_logs.create_index("user_id")
    await db.user_audit_logs.create_index("timestamp")
    print("   ✅ user_audit_logs.user_id")
    print("   ✅ user_audit_logs.timestamp")
    
    # GPS Logs - additional indexes
    print("\n📍 GPS Logs indexes...")
    await db.gps_logs.create_index([("latitude", 1), ("longitude", 1)])
    print("   ✅ gps_logs.latitude, longitude (compound)")
    
    print("\n✅ All indexes updated successfully!")
    print("🚀 Database is optimized for new features!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_indexes())
