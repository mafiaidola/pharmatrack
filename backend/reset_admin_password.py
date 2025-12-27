"""Script to reset the admin user's password."""
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_mongo_url():
    url = os.environ['MONGO_URL']
    if "cluster0.9aaikpq.mongodb.net" in url and url.startswith("mongodb+srv://"):
        try:
            creds_part = url.split("mongodb+srv://")[1].split("@")[0]
            hosts = [
                "ac-vlmpx1i-shard-00-00.9aaikpq.mongodb.net:27017",
                "ac-vlmpx1i-shard-00-01.9aaikpq.mongodb.net:27017",
                "ac-vlmpx1i-shard-00-02.9aaikpq.mongodb.net:27017"
            ]
            return f"mongodb://{creds_part}@{','.join(hosts)}/?ssl=true&authSource=admin&retryWrites=true&w=majority"
        except Exception:
            return url
    return url

async def reset_admin_password():
    mongo_url = get_mongo_url()
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=30000)
    db = client[os.environ['DB_NAME']]
    
    # Find admin user
    admin = await db.users.find_one({"username": "admin"})
    
    if admin:
        print(f"Found admin user: {admin.get('username')}, role: {admin.get('role')}")
        # Reset password to admin123
        new_hash = pwd_context.hash("admin123")
        result = await db.users.update_one(
            {"username": "admin"},
            {"$set": {"password_hash": new_hash, "is_active": True}}
        )
        print(f"Password reset successful! Modified count: {result.modified_count}")
        print("New credentials: username='admin', password='admin123'")
    else:
        print("No admin user found. Creating one...")
        import uuid
        from datetime import datetime, timezone
        
        new_admin = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "full_name": "System Administrator",
            "email": "admin@system.local",
            "role": "super_admin",
            "is_active": True,
            "password_hash": pwd_context.hash("admin123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(new_admin)
        print("Created admin user with username='admin', password='admin123'")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(reset_admin_password())
