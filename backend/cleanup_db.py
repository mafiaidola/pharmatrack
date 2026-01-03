"""
Production Database Cleanup Script
Clears invoices, payments, audit_logs, and GPS tracking data
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# MongoDB Atlas connection - same as production
MONGO_URL = "mongodb+srv://mafiaidola_db_user:NWVcxnuPpJBO9YPl@cluster0.9aaikpq.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DB_NAME = "medtrack"

async def cleanup_database():
    print("🔌 Connecting to MongoDB Atlas...")
    
    # Try direct connection if SRV fails
    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=30000)
        db = client[DB_NAME]
        # Test connection
        await db.command('ping')
        print("✅ Connected successfully!")
    except Exception as e:
        print(f"⚠️ SRV connection failed, trying direct connection...")
        # Direct seed list connection
        hosts = [
            "ac-vlmpx1i-shard-00-00.9aaikpq.mongodb.net:27017",
            "ac-vlmpx1i-shard-00-01.9aaikpq.mongodb.net:27017",
            "ac-vlmpx1i-shard-00-02.9aaikpq.mongodb.net:27017"
        ]
        direct_url = f"mongodb://mafiaidola_db_user:NWVcxnuPpJBO9YPl@{','.join(hosts)}/?ssl=true&authSource=admin&retryWrites=true&w=majority"
        client = AsyncIOMotorClient(direct_url, serverSelectionTimeoutMS=30000)
        db = client[DB_NAME]
        await db.command('ping')
        print("✅ Connected via direct connection!")
    
    print("\n" + "="*50)
    print("🗑️  PRODUCTION DATABASE CLEANUP")
    print("="*50 + "\n")
    
    # Collections to clear
    collections_to_clear = [
        # Invoices & Accounting
        ("invoices", "Invoices"),
        ("payments", "Payments"),
        ("audit_logs", "Audit Logs"),
        
        # GPS Tracking
        ("tracking_sessions", "Tracking Sessions"),
        ("gps_points", "GPS Points"),
        ("location_history", "Location History"),
    ]
    
    results = []
    
    for collection_name, display_name in collections_to_clear:
        try:
            # Get count before deletion
            count_before = await db[collection_name].count_documents({})
            
            # Delete all documents
            result = await db[collection_name].delete_many({})
            deleted_count = result.deleted_count
            
            print(f"✅ {display_name}: Deleted {deleted_count} documents")
            results.append((display_name, deleted_count, "SUCCESS"))
        except Exception as e:
            print(f"❌ {display_name}: Error - {str(e)}")
            results.append((display_name, 0, f"ERROR: {str(e)}"))
    
    # Also reset serial number counters for invoices and payments
    try:
        await db.counters.delete_one({"_id": "invoice_number"})
        await db.counters.delete_one({"_id": "payment_number"})
        print(f"✅ Serial Counters: Reset invoice and payment counters")
        results.append(("Serial Counters", 2, "SUCCESS"))
    except Exception as e:
        print(f"⚠️ Serial Counters: {str(e)}")
    
    print("\n" + "="*50)
    print("📊 CLEANUP SUMMARY")
    print("="*50)
    
    total_deleted = sum(r[1] for r in results if r[2] == "SUCCESS")
    print(f"\n🗑️  Total documents deleted: {total_deleted}")
    print("\n✅ Database cleanup completed successfully!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(cleanup_database())
