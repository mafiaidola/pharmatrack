import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys
from pathlib import Path
from passlib.context import CryptContext
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(env_path)

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_database():
    # Connect to MongoDB from env
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medtrack')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Connected to database: {db_name}")
    print("Clearing existing data...")
    
    # Clear collections
    await db.lines.delete_many({})
    await db.areas.delete_many({})
    await db.users.delete_many({})
    await db.clinics.delete_many({})
    await db.visits.delete_many({})
    await db.orders.delete_many({})
    await db.expenses.delete_many({})
    await db.gps_logs.delete_many({})
    await db.products.delete_many({})
    
    print("✅ Cleared all collections")
    
    print("\nCreating lines...")
    
    # Create lines
    line1_id = str(uuid.uuid4())
    line2_id = str(uuid.uuid4())
    line3_id = str(uuid.uuid4())
    
    lines = [
        {
            "id": line1_id,
            "name": "Line 1 - North Region",
            "description": "Covers northern territories",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        },
        {
            "id": line2_id,
            "name": "Line 2 - South Region",
            "description": "Covers southern territories",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        },
        {
            "id": line3_id,
            "name": "Line 3 - Central Region",
            "description": "Covers central territories",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        }
    ]
    
    await db.lines.insert_many(lines)
    print(f"✅ Created {len(lines)} lines")
    
    print("\nCreating areas...")
    
    # Create areas
    area1_id = str(uuid.uuid4())
    area2_id = str(uuid.uuid4())
    area3_id = str(uuid.uuid4())
    area4_id = str(uuid.uuid4())
    
    areas = [
        {
            "id": area1_id,
            "line_id": line1_id,
            "name": "Alexandria",
            "description": "Alexandria metropolitan area",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        },
        {
            "id": area2_id,
            "line_id": line1_id,
            "name": "Port Said",
            "description": "Port Said region",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        },
        {
            "id": area3_id,
            "line_id": line2_id,
            "name": "Aswan",
            "description": "Aswan region",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        },
        {
            "id": area4_id,
            "line_id": line3_id,
            "name": "Cairo",
            "description": "Cairo metropolitan area",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        }
    ]
    
    await db.areas.insert_many(areas)
    print(f"✅ Created {len(areas)} areas")
    
    print("\nCreating users...")
    
    # Create users
    super_admin_id = str(uuid.uuid4())
    gm_id = str(uuid.uuid4())
    manager_id = str(uuid.uuid4())
    rep1_id = str(uuid.uuid4())
    rep2_id = str(uuid.uuid4())
    
    users = [
        {
            "id": super_admin_id,
            "username": "admin",
            "password_hash": pwd_context.hash("admin123"),
            "email": "admin@medtrack.com",
            "role": "super_admin",
            "line_id": None,
            "area_id": None,
            "full_name": "System Administrator",
            "phone": "+1-555-0001",
            "is_active": True,
            "gps_enabled": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": gm_id,
            "username": "gm",
            "password_hash": pwd_context.hash("gm123"),
            "email": "gm@medtrack.com",
            "role": "gm",
            "line_id": None,
            "area_id": None,
            "full_name": "John Smith - General Manager",
            "phone": "+1-555-0101",
            "is_active": True,
            "gps_enabled": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": manager_id,
            "username": "manager",
            "password_hash": pwd_context.hash("manager123"),
            "email": "manager@medtrack.com",
            "role": "manager",
            "line_id": line1_id,
            "area_id": None,
            "full_name": "Sarah Johnson - Line Manager",
            "phone": "+1-555-0102",
            "is_active": True,
            "gps_enabled": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": rep1_id,
            "username": "rep1",
            "password_hash": pwd_context.hash("rep123"),
            "email": "rep1@medtrack.com",
            "role": "medical_rep",
            "line_id": line1_id,
            "area_id": area1_id,
            "full_name": "Mike Davis - Med Rep",
            "phone": "+1-555-0103",
            "is_active": True,
            "gps_enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": rep2_id,
            "username": "rep2",
            "password_hash": pwd_context.hash("rep123"),
            "email": "rep2@medtrack.com",
            "role": "medical_rep",
            "line_id": line1_id,
            "area_id": area2_id,
            "full_name": "Emma Wilson - Med Rep",
            "phone": "+1-555-0104",
            "is_active": True,
            "gps_enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.users.insert_many(users)
    print(f"✅ Created {len(users)} users")
    
    print("\n" + "=" * 60)
    print("🔑 DEMO CREDENTIALS")
    print("=" * 60)
    print("Super Admin:")
    print("  👤 Username: admin | 🔐 Password: admin123")
    print("\nGeneral Manager:")
    print("  👤 Username: gm | 🔐 Password: gm123")
    print("\nLine Manager:")
    print("  👤 Username: manager | 🔐 Password: manager123")
    print("\nMedical Representatives:")
    print("  👤 Username: rep1 | 🔐 Password: rep123")
    print("  👤 Username: rep2 | 🔐 Password: rep123")
    print("=" * 60)
    
    print("\nCreating products...")
    
    # Create products
    product1_id = str(uuid.uuid4())
    product2_id = str(uuid.uuid4())
    product3_id = str(uuid.uuid4())
    
    products = [
        {
            "id": product1_id,
            "line_id": line1_id,
            "name": "Product A - 500mg",
            "sku": "PROD-A-500",
            "price": 50.00,
            "description": "Premium pharmaceutical product",
            "stock_quantity": 1000,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": product2_id,
            "line_id": line1_id,
            "name": "Product B - 250mg",
            "sku": "PROD-B-250",
            "price": 30.00,
            "description": "Standard pharmaceutical product",
            "stock_quantity": 500,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": product3_id,
            "line_id": line2_id,
            "name": "Product C - 100mg",
            "sku": "PROD-C-100",
            "price": 20.00,
            "description": "Basic pharmaceutical product",
            "stock_quantity": 750,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.products.insert_many(products)
    print(f"✅ Created {len(products)} products")
    
    print("\nCreating sample clinics...")
    
    # Create clinics
    clinics = [
        {
            "id": str(uuid.uuid4()),
            "line_id": line1_id,
            "area_id": area1_id,
            "name": "City General Hospital",
            "address": "789 Hospital Road, Alexandria, Egypt",
            "doctor_name": "Dr. Ahmed Hassan",
            "doctor_phone": "+20-3-555-1001",
            "specialty": "Cardiology",
            "phone": "+20-3-555-1000",
            "email": "info@citygeneralhospital.com",
            "latitude": 31.2001,
            "longitude": 29.9187,
            "classification": "A",
            "credit_classification": "Green",
            "classification_notes": "Excellent performance and compliance",
            "registration_notes": "Registered via field visit",
            "created_by": rep1_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        },
        {
            "id": str(uuid.uuid4()),
            "line_id": line1_id,
            "area_id": area1_id,
            "name": "Sunrise Medical Center",
            "address": "321 Sunrise Boulevard, Alexandria, Egypt",
            "doctor_name": "Dr. Fatima Mohamed",
            "doctor_phone": "+20-3-555-1002",
            "specialty": "Pediatrics",
            "phone": "+20-3-555-1005",
            "email": "contact@sunrisemedical.com",
            "latitude": 31.2156,
            "longitude": 29.9553,
            "classification": "B",
            "credit_classification": "Yellow",
            "classification_notes": "Good performance, needs minor improvements",
            "registration_notes": "Registered online",
            "created_by": rep1_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        },
        {
            "id": str(uuid.uuid4()),
            "line_id": line1_id,
            "area_id": area2_id,
            "name": "Green Valley Clinic",
            "address": "654 Valley Street, Port Said, Egypt",
            "doctor_name": "Dr. Mahmoud Ali",
            "doctor_phone": "+20-66-555-1003",
            "specialty": "General Practice",
            "phone": "+20-66-555-1000",
            "email": "info@greenvalleyclinic.com",
            "latitude": 31.2653,
            "longitude": 32.3019,
            "classification": "C",
            "credit_classification": "Red",
            "classification_notes": "Average performance, requires follow-up",
            "registration_notes": "New registration pending review",
            "created_by": rep2_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        }
    ]
    
    await db.clinics.insert_many(clinics)
    print(f"✅ Created {len(clinics)} clinics")
    
    print("\n" + "=" * 60)
    print("✅ DATABASE SEEDED SUCCESSFULLY!")
    print("=" * 60)
    print(f"\n📊 Summary:")
    print(f"   - Lines: {len(lines)}")
    print(f"   - Areas: {len(areas)}")
    print(f"   - Users: {len(users)}")
    print(f"   - Products: {len(products)}")
    print(f"   - Clinics: {len(clinics)}")
    print(f"\n🌐 Database: {db_name}")
    print(f"🔗 MongoDB URL: {mongo_url[:50]}...")
    print("\n💡 You can now login with the demo credentials above!")
    print("=" * 60)
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_database())
