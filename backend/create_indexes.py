"""
MongoDB Index Creation Script for MedTrack
Run this script once to create necessary indexes for optimal performance.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def create_indexes():
    """Create all necessary MongoDB indexes for optimal performance."""
    
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'medtrack')]
    
    print("🚀 Creating MongoDB indexes for MedTrack...")
    
    # Users collection
    print("\n📋 Users indexes...")
    await db.users.create_index("username", unique=True)
    await db.users.create_index("role")
    await db.users.create_index("manager_id")
    await db.users.create_index("is_active")
    print("   ✅ users.username (unique)")
    print("   ✅ users.role")
    print("   ✅ users.manager_id")
    print("   ✅ users.is_active")
    
    # Clinics collection
    print("\n🏥 Clinics indexes...")
    await db.clinics.create_index("name")
    await db.clinics.create_index([("name", "text")])  # Text search
    await db.clinics.create_index("area_id")
    print("   ✅ clinics.name")
    print("   ✅ clinics.name (text search)")
    print("   ✅ clinics.area_id")
    
    # Visits collection
    print("\n📍 Visits indexes...")
    await db.visits.create_index([("medical_rep_id", 1), ("created_at", -1)])
    await db.visits.create_index("clinic_id")
    await db.visits.create_index("status")
    await db.visits.create_index("created_at")
    print("   ✅ visits.medical_rep_id + created_at (compound)")
    print("   ✅ visits.clinic_id")
    print("   ✅ visits.status")
    print("   ✅ visits.created_at")
    
    # Orders collection
    print("\n📦 Orders indexes...")
    await db.orders.create_index([("status", 1), ("created_at", -1)])
    await db.orders.create_index("medical_rep_id")
    await db.orders.create_index("clinic_id")
    await db.orders.create_index("created_at")
    print("   ✅ orders.status + created_at (compound)")
    print("   ✅ orders.medical_rep_id")
    print("   ✅ orders.clinic_id")
    print("   ✅ orders.created_at")
    
    # GPS Logs collection
    print("\n📡 GPS Logs indexes...")
    await db.gps_logs.create_index([("user_id", 1), ("timestamp", -1)])
    await db.gps_logs.create_index("activity_type")
    await db.gps_logs.create_index("timestamp")
    print("   ✅ gps_logs.user_id + timestamp (compound)")
    print("   ✅ gps_logs.activity_type")
    print("   ✅ gps_logs.timestamp")
    
    # Notifications collection
    print("\n🔔 Notifications indexes...")
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    print("   ✅ notifications.user_id + is_read (compound)")
    print("   ✅ notifications.user_id + created_at (compound)")
    
    # Products collection
    print("\n📦 Products indexes...")
    await db.products.create_index("line_id")
    await db.products.create_index("name")
    await db.products.create_index([("name", "text")])  # Text search
    print("   ✅ products.line_id")
    print("   ✅ products.name")
    print("   ✅ products.name (text search)")
    
    # Expenses collection
    print("\n💰 Expenses indexes...")
    await db.expenses.create_index("medical_rep_id")
    await db.expenses.create_index("status")
    await db.expenses.create_index("created_at")
    print("   ✅ expenses.medical_rep_id")
    print("   ✅ expenses.status")
    print("   ✅ expenses.created_at")
    
    # Invoices collection (Accounting)
    print("\n🧾 Invoices indexes...")
    await db.invoices.create_index([("status", 1), ("created_at", -1)])
    await db.invoices.create_index("clinic_id")
    await db.invoices.create_index("invoice_date")
    await db.invoices.create_index([("remaining_amount", 1), ("invoice_date", 1)])
    print("   ✅ invoices.status + created_at (compound)")
    print("   ✅ invoices.clinic_id")
    print("   ✅ invoices.invoice_date")
    print("   ✅ invoices.remaining_amount + invoice_date (for overdue queries)")
    
    # Payments collection
    print("\n💵 Payments indexes...")
    await db.payments.create_index("invoice_id")
    await db.payments.create_index("created_at")
    await db.payments.create_index([("collected_by", 1), ("created_at", -1)])
    print("   ✅ payments.invoice_id")
    print("   ✅ payments.created_at")
    print("   ✅ payments.collected_by + created_at (compound)")
    
    # Audit Logs collection
    print("\n📝 Audit Logs indexes...")
    await db.audit_logs.create_index([("user_id", 1), ("created_at", -1)])
    await db.audit_logs.create_index("action_type")
    await db.audit_logs.create_index("created_at")
    print("   ✅ audit_logs.user_id + created_at (compound)")
    print("   ✅ audit_logs.action_type")
    print("   ✅ audit_logs.created_at")
    
    # Sessions collection
    print("\n🔐 Sessions indexes...")
    await db.sessions.create_index("user_id")
    await db.sessions.create_index("is_active")
    await db.sessions.create_index([("user_id", 1), ("is_active", 1)])
    print("   ✅ sessions.user_id")
    print("   ✅ sessions.is_active")
    print("   ✅ sessions.user_id + is_active (compound)")
    
    print("\n✅ All indexes created successfully!")
    print("🚀 Database performance is now optimized!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_indexes())
