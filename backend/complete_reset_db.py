"""
Complete Production Database Reset - Fixed Connection
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

# MongoDB Configuration - Use SRV with longer timeout
MONGO_URL = "mongodb+srv://mafiaidola_db_user:NWVcxnuPpJBO9YPl@cluster0.9aaikpq.mongodb.net/medtrack?retryWrites=true&w=majority"
DB_NAME = "medtrack"

async def complete_reset():
    print("🔌 Connecting to MongoDB Atlas...")
    
    client = AsyncIOMotorClient(
        MONGO_URL, 
        serverSelectionTimeoutMS=60000,
        connectTimeoutMS=60000,
        socketTimeoutMS=60000,
        tlsCAFile=certifi.where()
    )
    db = client[DB_NAME]
    
    try:
        await db.command('ping')
        print("✅ Connected successfully!")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    print("\n" + "="*60)
    print("🗑️  COMPLETE PRODUCTION DATABASE RESET")
    print("="*60 + "\n")
    
    # Collections to CLEAR
    collections_to_clear = [
        ("orders", "Orders / الطلبات"),
        ("visits", "Visits / الزيارات"),
        ("clinics", "Clinics / العيادات"),
        ("invoices", "Invoices / الفواتير"),
        ("payments", "Payments / الدفعات"),
        ("expenses", "Expenses / المصروفات"),
        ("audit_logs", "Audit Logs"),
        ("returns", "Returns / المرتجعات"),
        ("tracking_sessions", "Tracking Sessions"),
        ("gps_points", "GPS Points"),
        ("location_history", "Location History"),
        ("notifications", "Notifications"),
        ("push_subscriptions", "Push Subscriptions"),
    ]
    
    total_deleted = 0
    
    for collection_name, display_name in collections_to_clear:
        try:
            result = await db[collection_name].delete_many({})
            deleted_count = result.deleted_count
            total_deleted += deleted_count
            status = f"Deleted {deleted_count}" if deleted_count > 0 else "Already empty"
            print(f"✅ {display_name}: {status}")
        except Exception as e:
            print(f"❌ {display_name}: {str(e)[:50]}")
    
    # Reset counters
    print("\n🔢 Resetting serial counters...")
    counters = ["invoice_number", "payment_number", "visit_number", "order_number", "expense_number"]
    for c in counters:
        try:
            await db.counters.delete_one({"_id": c})
        except:
            pass
    print("✅ Counters reset")
    
    # Show kept collections
    print("\n📊 Remaining kept data:")
    for col in ["users", "products", "areas", "lines", "site_settings"]:
        try:
            count = await db[col].count_documents({})
            print(f"   📁 {col}: {count}")
        except:
            pass
    
    print(f"\n🗑️  Total deleted: {total_deleted}")
    print("✅ Dashboard should now show zeros!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(complete_reset())
