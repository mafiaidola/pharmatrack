import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path("backend/.env"))
MONGO_URL = os.environ.get("MONGO_URL", "")

# Build direct URL to bypass DNS SRV
if "cluster0.9aaikpq.mongodb.net" in MONGO_URL and MONGO_URL.startswith("mongodb+srv://"):
    creds_part = MONGO_URL.split("mongodb+srv://")[1].split("@")[0]
    hosts = ",".join([
        "ac-vlmpx1i-shard-00-00.9aaikpq.mongodb.net:27017",
        "ac-vlmpx1i-shard-00-01.9aaikpq.mongodb.net:27017",
        "ac-vlmpx1i-shard-00-02.9aaikpq.mongodb.net:27017"
    ])
    direct_url = f"mongodb://{creds_part}@{hosts}/?ssl=true&authSource=admin"
    print("Using DIRECT connection string (bypassing SRV lookup)")
else:
    direct_url = MONGO_URL
    print("Using ORIGINAL connection string")

async def test():
    print("Connecting with 30s timeout...")
    client = AsyncIOMotorClient(direct_url, serverSelectionTimeoutMS=30000)
    try:
        dbs = await client.list_database_names()
        print(f"SUCCESS! Databases: {dbs}")
        return True
    except Exception as e:
        print(f"FAILED: {type(e).__name__}: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(test())
