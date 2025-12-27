"""
MongoDB Connection Diagnostic Script
This script performs comprehensive testing of MongoDB connectivity.
"""
import os
import sys
import socket
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Load env
env_path = Path("backend/.env")
load_dotenv(env_path)

MONGO_URL = os.environ.get("MONGO_URL", "")

def test_dns_resolution():
    """Test DNS resolution for MongoDB hosts"""
    print("\n[1] Testing DNS Resolution...")
    hosts = [
        "cluster0.9aaikpq.mongodb.net",
        "ac-vlmpx1i-shard-00-00.9aaikpq.mongodb.net",
        "ac-vlmpx1i-shard-00-01.9aaikpq.mongodb.net",
        "ac-vlmpx1i-shard-00-02.9aaikpq.mongodb.net"
    ]
    
    for host in hosts:
        try:
            ip = socket.gethostbyname(host)
            print(f"   ✅ {host} -> {ip}")
        except socket.gaierror as e:
            print(f"   ❌ {host} -> DNS FAILED: {e}")
            return False
    return True

def test_tcp_connection():
    """Test TCP connection to MongoDB port 27017"""
    print("\n[2] Testing TCP Connection (port 27017)...")
    hosts = [
        ("ac-vlmpx1i-shard-00-00.9aaikpq.mongodb.net", 27017),
        ("ac-vlmpx1i-shard-00-01.9aaikpq.mongodb.net", 27017),
        ("ac-vlmpx1i-shard-00-02.9aaikpq.mongodb.net", 27017)
    ]
    
    for host, port in hosts:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        try:
            result = sock.connect_ex((host, port))
            if result == 0:
                print(f"   ✅ {host}:{port} -> OPEN")
            else:
                print(f"   ❌ {host}:{port} -> BLOCKED (code: {result})")
                return False
        except socket.timeout:
            print(f"   ❌ {host}:{port} -> TIMEOUT (10s)")
            return False
        except Exception as e:
            print(f"   ❌ {host}:{port} -> ERROR: {e}")
            return False
        finally:
            sock.close()
    return True

async def test_mongo_connection():
    """Test actual MongoDB connection"""
    print("\n[3] Testing MongoDB Connection...")
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        
        # Build direct URL
        if "cluster0.9aaikpq.mongodb.net" in MONGO_URL and MONGO_URL.startswith("mongodb+srv://"):
            creds_part = MONGO_URL.split("mongodb+srv://")[1].split("@")[0]
            hosts = [
                "ac-vlmpx1i-shard-00-00.9aaikpq.mongodb.net:27017",
                "ac-vlmpx1i-shard-00-01.9aaikpq.mongodb.net:27017",
                "ac-vlmpx1i-shard-00-02.9aaikpq.mongodb.net:27017"
            ]
            direct_url = f"mongodb://{creds_part}@{','.join(hosts)}/?ssl=true&authSource=admin&retryWrites=true&w=majority"
            print(f"   Using direct URL (bypassing SRV)")
        else:
            direct_url = MONGO_URL
        
        client = AsyncIOMotorClient(direct_url, serverSelectionTimeoutMS=30000)
        
        print("   Attempting to list database names...")
        dbs = await client.list_database_names()
        print(f"   ✅ SUCCESS! Databases: {dbs}")
        return True
        
    except Exception as e:
        print(f"   ❌ FAILED: {e}")
        return False

def main():
    print("=" * 60)
    print("MongoDB Connection Diagnostic")
    print("=" * 60)
    
    if not MONGO_URL:
        print("ERROR: MONGO_URL not found in backend/.env")
        return
    
    print(f"MongoDB URL: {MONGO_URL.split('@')[-1] if '@' in MONGO_URL else 'Not configured'}")
    
    # Test 1: DNS
    dns_ok = test_dns_resolution()
    
    # Test 2: TCP
    if dns_ok:
        tcp_ok = test_tcp_connection()
    else:
        print("\n[2] Skipping TCP test (DNS failed)")
        tcp_ok = False
    
    # Test 3: MongoDB connection
    if tcp_ok:
        asyncio.run(test_mongo_connection())
    else:
        print("\n[3] Skipping MongoDB test (TCP failed)")
    
    print("\n" + "=" * 60)
    print("DIAGNOSIS:")
    if not dns_ok:
        print("  ⚠️  DNS resolution failed. Check your DNS settings or use VPN.")
    elif not tcp_ok:
        print("  ⚠️  TCP connection blocked. Possible causes:")
        print("      - Firewall blocking port 27017")
        print("      - VPN required")
        print("      - MongoDB Atlas IP whitelist not configured")
    else:
        print("  ✅ Network connectivity is OK")
    print("=" * 60)

if __name__ == "__main__":
    main()
