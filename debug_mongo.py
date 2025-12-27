import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure, ConfigurationError, ServerSelectionTimeoutError
from pathlib import Path
from dotenv import load_dotenv
import time
import dns.resolver

# Fix DNS
dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ['8.8.8.8']

# Load env manually
env_path = Path("backend/.env")
load_dotenv(env_path)

MONGO_URL = os.environ.get("MONGO_URL")

async def test_connection():
    print(f"Testing Connection to: {MONGO_URL.split('@')[-1] if '@' in MONGO_URL else 'HIDDEN'}")
    
    # Test 1: Simple Connect
    print("\n[Test 1] Initializing Motor Client...")
    try:
        start = time.time()
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        print("   Client initialized.")
        
        print("   Attempting to list database names...")
        dbs = await client.list_database_names()
        print(f"   SUCCESS! Databases: {dbs}")
        print(f"   Time taken: {time.time() - start:.2f}s")
        return True
    except ServerSelectionTimeoutError as e:
        print(f"   FAIL: Server Selection Timeout (5s).")
        print(f"   Error: {e}")
    except ConfigurationError as e:
        print(f"   FAIL: Configuration Error (DNS?).")
        print(f"   Error: {e}")
    except Exception as e:
        print(f"   FAIL: Unexpected Error.")
        print(f"   Error: {e}")
    return False

if __name__ == "__main__":
    if not MONGO_URL:
        print("ERROR: MONGO_URL not found in .env")
    else:
        asyncio.run(test_connection())
