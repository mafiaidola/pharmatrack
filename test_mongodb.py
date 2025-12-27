import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).parent / 'backend' / '.env'
load_dotenv(env_path)

async def test_mongodb_connection():
    try:
        mongo_url = os.environ.get('MONGO_URL')
        db_name = os.environ.get('DB_NAME')
        
        print(f"Testing MongoDB Atlas connection...")
        print(f"Database: {db_name}")
        
        client = AsyncIOMotorClient(mongo_url)
        
        # Test connection
        result = await client.admin.command('ping')
        print(f"✓ MongoDB Atlas connection successful!")
        print(f"  Ping result: {result}")
        
        # Test database access
        db = client[db_name]
        collections = await db.list_collection_names()
        print(f"✓ Database '{db_name}' accessible")
        print(f"  Collections found: {len(collections)}")
        if collections:
            print(f"  Collections: {', '.join(collections[:5])}")
        
        client.close()
        return True
        
    except Exception as e:
        print(f"✗ MongoDB connection failed: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(test_mongodb_connection())
