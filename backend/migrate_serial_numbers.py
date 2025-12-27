"""
Migration script to add serial numbers to existing orders and visits.
Run this once to update old records with unique serial numbers.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "epeg_devo")

async def migrate_serial_numbers():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DATABASE_NAME]
    
    print("Starting migration...")
    
    # Migrate Orders (starting from 1001)
    print("\n--- Migrating Orders ---")
    orders = await db.orders.find(
        {"$or": [{"serial_number": None}, {"serial_number": {"$exists": False}}]},
        {"_id": 1, "id": 1}
    ).sort("created_at", 1).to_list(None)
    
    # Get the highest existing serial_number
    highest_order = await db.orders.find_one(
        {"serial_number": {"$exists": True, "$ne": None}},
        sort=[("serial_number", -1)]
    )
    next_order_serial = (highest_order.get("serial_number", 1000) if highest_order else 1000) + 1
    
    for order in orders:
        await db.orders.update_one(
            {"_id": order["_id"]},
            {"$set": {"serial_number": next_order_serial}}
        )
        print(f"  Order {order.get('id', 'unknown')[:8]}... -> #{next_order_serial}")
        next_order_serial += 1
    
    print(f"Updated {len(orders)} orders")
    
    # Migrate Visits (starting from 5005)
    print("\n--- Migrating Visits ---")
    visits = await db.visits.find(
        {"$or": [{"serial_number": None}, {"serial_number": {"$exists": False}}]},
        {"_id": 1, "id": 1}
    ).sort("created_at", 1).to_list(None)
    
    # Get the highest existing serial_number for visits
    highest_visit = await db.visits.find_one(
        {"serial_number": {"$exists": True, "$ne": None}},
        sort=[("serial_number", -1)]
    )
    next_visit_serial = (highest_visit.get("serial_number", 5004) if highest_visit else 5004) + 1
    
    for visit in visits:
        await db.visits.update_one(
            {"_id": visit["_id"]},
            {"$set": {"serial_number": next_visit_serial}}
        )
        print(f"  Visit {visit.get('id', 'unknown')[:8]}... -> #{next_visit_serial}")
        next_visit_serial += 1
    
    print(f"Updated {len(visits)} visits")
    
    print("\n✅ Migration complete!")
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_serial_numbers())
