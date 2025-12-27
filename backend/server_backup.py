from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Enums
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    GM = "gm"
    MANAGER = "manager"
    MEDICAL_REP = "medical_rep"

class VisitStatus(str, Enum):
    PLANNED = "planned"
    COMPLETED = "completed"
    VERIFIED = "verified"

class VisitReason(str, Enum):
    FOLLOW_UP = "follow_up"
    NEW_PRODUCT = "new_product"
    PRODUCT_DEMO = "product_demo"
    PLACE_ORDER = "place_order"
    ISSUE = "issue"
    OPENING_CLINIC = "opening_clinic"

class VisitResult(str, Enum):
    SUCCESSFUL = "successful"
    DOCTOR_INTERESTED = "doctor_interested"
    NEEDS_FOLLOW_UP = "needs_follow_up"
    RESPONSIBLE_ABSENT = "responsible_absent"

class OrderStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    DELIVERED = "delivered"

class OrderType(str, Enum):
    REGULAR = "regular"
    DEMO = "demo"

class DiscountType(str, Enum):
    PERCENTAGE = "percentage"
    FIXED = "fixed"

class ExpenseStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: Optional[str] = None
    role: UserRole
    line_id: Optional[str] = None
    area_id: Optional[str] = None
    manager_id: Optional[str] = None
    full_name: str
    phone: Optional[str] = None
    is_active: bool = True
    gps_enabled: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: UserRole
    line_id: Optional[str] = None
    area_id: Optional[str] = None
    manager_id: Optional[str] = None
    full_name: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    line_id: Optional[str] = None
    area_id: Optional[str] = None
    is_active: Optional[bool] = None
    gps_enabled: Optional[bool] = None

class Line(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class LineCreate(BaseModel):
    name: str
    description: Optional[str] = None

class Area(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    line_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class AreaCreate(BaseModel):
    line_id: str
    name: str
    description: Optional[str] = None

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    line_id: str
    name: str
    sku: Optional[str] = None
    price: float
    description: Optional[str] = None
    stock_quantity: Optional[int] = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    line_id: str
    name: str
    sku: Optional[str] = None
    price: float
    description: Optional[str] = None
    stock_quantity: Optional[int] = 0

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    stock_quantity: Optional[int] = None
    is_active: Optional[bool] = None

class Clinic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    line_id: str
    area_id: str
    name: str
    address: str
    doctor_name: Optional[str] = None
    doctor_phone: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    classification: Optional[str] = None  # A, B, C
    credit_classification: Optional[str] = None  # Green, Yellow, Red
    classification_notes: Optional[str] = None
    registration_notes: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class ClinicCreate(BaseModel):
    line_id: str
    area_id: str
    name: str
    address: str
    doctor_name: Optional[str] = None
    doctor_phone: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    classification: Optional[str] = None
    credit_classification: Optional[str] = None
    classification_notes: Optional[str] = None
    registration_notes: Optional[str] = None

class Visit(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    clinic_id: str
    medical_rep_id: str
    visit_date: datetime
    visit_reason: Optional[VisitReason] = None
    visit_result: Optional[VisitResult] = None
    notes: Optional[str] = None
    attendees: Optional[str] = None
    samples_provided: Optional[List[dict]] = None
    follow_up_date: Optional[datetime] = None
    visit_rating: Optional[int] = Field(None, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_verified: bool = False
    status: VisitStatus = VisitStatus.PLANNED
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    synced: bool = True

class VisitCreate(BaseModel):
    clinic_id: str
    visit_date: Optional[datetime] = None
    visit_reason: Optional[VisitReason] = None
    visit_result: Optional[VisitResult] = None
    notes: Optional[str] = None
    attendees: Optional[str] = None
    samples_provided: Optional[List[dict]] = None
    follow_up_date: Optional[datetime] = None
    visit_rating: Optional[int] = Field(None, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: VisitStatus = VisitStatus.COMPLETED

class VisitUpdate(BaseModel):
    clinic_id: Optional[str] = None
    visit_date: Optional[datetime] = None
    visit_reason: Optional[VisitReason] = None
    visit_result: Optional[VisitResult] = None
    notes: Optional[str] = None
    attendees: Optional[str] = None
    samples_provided: Optional[List[dict]] = None
    follow_up_date: Optional[datetime] = None
    visit_rating: Optional[int] = Field(None, ge=1, le=5)
    status: Optional[VisitStatus] = None

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    clinic_id: str
    medical_rep_id: str
    order_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    order_type: OrderType = OrderType.REGULAR
    products: List[dict]
    subtotal: Optional[float] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    discount_reason: Optional[str] = None
    total_amount: Optional[float] = None
    status: OrderStatus = OrderStatus.DRAFT
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    synced: bool = True

class OrderCreate(BaseModel):
    clinic_id: str
    order_type: OrderType = OrderType.REGULAR
    products: List[dict]
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    discount_reason: Optional[str] = None
    notes: Optional[str] = None

class OrderUpdate(BaseModel):
    clinic_id: Optional[str] = None
    products: Optional[List[dict]] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    discount_reason: Optional[str] = None
    status: Optional[OrderStatus] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    medical_rep_id: str
    expense_type: str
    amount: float
    expense_date: datetime
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    status: ExpenseStatus = ExpenseStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    synced: bool = True

class ExpenseCreate(BaseModel):
    expense_type: str
    amount: float
    expense_date: datetime
    description: Optional[str] = None
    receipt_url: Optional[str] = None

class ExpenseUpdate(BaseModel):
    expense_type: Optional[str] = None
    amount: Optional[float] = None
    expense_date: Optional[datetime] = None
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    status: Optional[ExpenseStatus] = None

class GPSLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    activity_type: Optional[str] = None
    battery_level: Optional[int] = None

class GPSLogCreate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    activity_type: Optional[str] = None
    battery_level: Optional[int] = None

class GPSSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    gps_enabled: bool = True
    gps_api_key: Optional[str] = None
    gps_api_provider: Optional[str] = "browser"
    tracking_interval: int = 300
    auto_track_during_work_hours: bool = True
    work_hours_start: str = "08:00"
    work_hours_end: str = "18:00"
    require_location_for_visits: bool = True
    location_verification_radius: float = 1.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GPSSettingsCreate(BaseModel):
    gps_enabled: bool = True
    gps_api_key: Optional[str] = None
    gps_api_provider: Optional[str] = "browser"
    tracking_interval: int = 300
    auto_track_during_work_hours: bool = True
    work_hours_start: str = "08:00"
    work_hours_end: str = "18:00"
    require_location_for_visits: bool = True
    location_verification_radius: float = 1.0

class GPSSettingsUpdate(BaseModel):
    gps_enabled: Optional[bool] = None
    gps_api_key: Optional[str] = None
    gps_api_provider: Optional[str] = None
    tracking_interval: Optional[int] = None
    auto_track_during_work_hours: Optional[bool] = None
    work_hours_start: Optional[str] = None
    work_hours_end: Optional[str] = None
    require_location_for_visits: Optional[bool] = None
    location_verification_radius: Optional[float] = None

# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_role(allowed_roles: List[UserRole]):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in [role.value for role in allowed_roles]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return role_checker

# Auth Routes
@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated")
    
    access_token = create_access_token({"sub": user["id"], "role": user["role"]})
    
    user_data = {k: v for k, v in user.items() if k != "password_hash"}
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_data
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user_data = {k: v for k, v in current_user.items() if k != "password_hash"}
    return user_data

# Organization Routes
# User Routes
@api_router.post("/users", response_model=User)
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.MANAGER]))
):
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    if current_user["role"] != UserRole.SUPER_ADMIN.value:
        user_data.organization_id = current_user["organization_id"]
    
    user_dict = user_data.model_dump()
    password = user_dict.pop("password")
    password_hash = get_password_hash(password)
    
    user_obj = User(**user_dict)
    doc = user_obj.model_dump()
    doc["password_hash"] = password_hash
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    return user_obj

@api_router.get("/users", response_model=List[User])
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    else:
        users = await db.users.find(
            {"organization_id": current_user["organization_id"]},
            {"_id": 0, "password_hash": 0}
        ).to_list(1000)
    
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    return users

@api_router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    update_data = {k: v for k, v in user_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

# Line Routes
@api_router.post("/lines", response_model=Line)
async def create_line(
    line: LineCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    line_obj = Line(
        **line.model_dump(),
        organization_id=current_user["organization_id"] if current_user["role"] != UserRole.SUPER_ADMIN.value else line.model_dump().get("organization_id")
    )
    doc = line_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.lines.insert_one(doc)
    return line_obj

@api_router.get("/lines", response_model=List[Line])
async def get_lines(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] != UserRole.SUPER_ADMIN.value:
        query["organization_id"] = current_user["organization_id"]
    
    lines = await db.lines.find(query, {"_id": 0}).to_list(1000)
    for line in lines:
        if isinstance(line.get('created_at'), str):
            line['created_at'] = datetime.fromisoformat(line['created_at'])
    return lines

@api_router.patch("/lines/{line_id}")
async def update_line(
    line_id: str,
    line_update: LineCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    update_data = line_update.model_dump()
    result = await db.lines.update_one({"id": line_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Line not found")
    return {"message": "Line updated successfully"}

@api_router.delete("/lines/{line_id}")
async def delete_line(
    line_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    result = await db.lines.delete_one({"id": line_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Line not found")
    return {"message": "Line deleted successfully"}

# Area Routes
@api_router.post("/areas", response_model=Area)
async def create_area(
    area: AreaCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    # Verify line exists
    line = await db.lines.find_one({"id": area.line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    area_obj = Area(
        **area.model_dump(),
        organization_id=line["organization_id"]
    )
    doc = area_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.areas.insert_one(doc)
    return area_obj

@api_router.get("/areas", response_model=List[Area])
async def get_areas(
    line_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] != UserRole.SUPER_ADMIN.value:
        query["organization_id"] = current_user["organization_id"]
    if line_id:
        query["line_id"] = line_id
    
    areas = await db.areas.find(query, {"_id": 0}).to_list(1000)
    for area in areas:
        if isinstance(area.get('created_at'), str):
            area['created_at'] = datetime.fromisoformat(area['created_at'])
    return areas

@api_router.patch("/areas/{area_id}")
async def update_area(
    area_id: str,
    area_update: AreaCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    update_data = area_update.model_dump()
    result = await db.areas.update_one({"id": area_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Area not found")
    return {"message": "Area updated successfully"}

@api_router.delete("/areas/{area_id}")
async def delete_area(
    area_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    result = await db.areas.delete_one({"id": area_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Area not found")
    return {"message": "Area deleted successfully"}

# Product Routes (Super Admin only)
@api_router.post("/products", response_model=Product)
async def create_product(
    product: ProductCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    line = await db.lines.find_one({"id": product.line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    product_obj = Product(
        **product.model_dump(),
        organization_id=line["organization_id"]
    )
    doc = product_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.products.insert_one(doc)
    return product_obj

@api_router.get("/products", response_model=List[Product])
async def get_products(
    line_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"is_active": True}
    
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        if line_id:
            query["line_id"] = line_id
    else:
        if current_user.get("line_id"):
            query["line_id"] = current_user["line_id"]
        else:
            return []
    
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    for product in products:
        if isinstance(product.get('created_at'), str):
            product['created_at'] = datetime.fromisoformat(product['created_at'])
    return products

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(
    product_id: str,
    current_user: dict = Depends(get_current_user)
):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if isinstance(product.get('created_at'), str):
        product['created_at'] = datetime.fromisoformat(product['created_at'])
    return product

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(
    product_id: str,
    product_update: ProductUpdate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    existing_product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not existing_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = {k: v for k, v in product_update.model_dump().items() if v is not None}
    
    if update_data:
        await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    updated_product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if isinstance(updated_product.get('created_at'), str):
        updated_product['created_at'] = datetime.fromisoformat(updated_product['created_at'])
    return updated_product

@api_router.delete("/products/{product_id}")
async def delete_product(
    product_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}

# Clinic Routes
@api_router.post("/clinics", response_model=Clinic)
async def create_clinic(
    clinic_data: ClinicCreate,
    current_user: dict = Depends(get_current_user)
):
    clinic_dict = clinic_data.model_dump()
    clinic_dict["organization_id"] = current_user["organization_id"]
    clinic_dict["created_by"] = current_user["id"]
    
    clinic_obj = Clinic(**clinic_dict)
    doc = clinic_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.clinics.insert_one(doc)
    return clinic_obj

@api_router.get("/clinics", response_model=List[Clinic])
async def get_clinics(
    line_id: Optional[str] = None,
    area_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    # Role-based filtering
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        pass  # No restriction
    elif current_user["role"] in [UserRole.GM.value, UserRole.MANAGER.value]:
        query["organization_id"] = current_user["organization_id"]
        if current_user.get("line_id"):
            query["line_id"] = current_user["line_id"]
    else:  # Medical Rep
        query["organization_id"] = current_user["organization_id"]
        if current_user.get("line_id"):
            query["line_id"] = current_user["line_id"]
        if current_user.get("area_id"):
            query["area_id"] = current_user["area_id"]
    
    # Additional filters
    if line_id:
        query["line_id"] = line_id
    if area_id:
        query["area_id"] = area_id
    
    clinics = await db.clinics.find(query, {"_id": 0}).to_list(1000)
    
    for clinic in clinics:
        if isinstance(clinic.get('created_at'), str):
            clinic['created_at'] = datetime.fromisoformat(clinic['created_at'])
    return clinics

@api_router.get("/clinics/{clinic_id}", response_model=Clinic)
async def get_clinic(clinic_id: str, current_user: dict = Depends(get_current_user)):
    clinic = await db.clinics.find_one({"id": clinic_id}, {"_id": 0})
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    if isinstance(clinic.get('created_at'), str):
        clinic['created_at'] = datetime.fromisoformat(clinic['created_at'])
    return clinic

@api_router.get("/clinics/{clinic_id}/details")
async def get_clinic_details(clinic_id: str, current_user: dict = Depends(get_current_user)):
    clinic = await db.clinics.find_one({"id": clinic_id}, {"_id": 0})
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    visits_count = await db.visits.count_documents({"clinic_id": clinic_id})
    orders_count = await db.orders.count_documents({"clinic_id": clinic_id})
    
    visits = await db.visits.find({"clinic_id": clinic_id}, {"_id": 0}).sort("visit_date", -1).limit(10).to_list(10)
    for visit in visits:
        if isinstance(visit.get('created_at'), str):
            visit['created_at'] = datetime.fromisoformat(visit['created_at'])
        if isinstance(visit.get('visit_date'), str):
            visit['visit_date'] = datetime.fromisoformat(visit['visit_date'])
        if isinstance(visit.get('follow_up_date'), str):
            visit['follow_up_date'] = datetime.fromisoformat(visit['follow_up_date'])
        
        rep = await db.users.find_one({"id": visit["medical_rep_id"]}, {"_id": 0, "full_name": 1})
        visit["medical_rep_name"] = rep["full_name"] if rep else "Unknown"
    
    orders = await db.orders.find({"clinic_id": clinic_id}, {"_id": 0}).sort("order_date", -1).limit(10).to_list(10)
    for order in orders:
        if isinstance(order.get('created_at'), str):
            order['created_at'] = datetime.fromisoformat(order['created_at'])
        if isinstance(order.get('order_date'), str):
            order['order_date'] = datetime.fromisoformat(order['order_date'])
        if isinstance(order.get('approved_at'), str):
            order['approved_at'] = datetime.fromisoformat(order['approved_at'])
    
    product_stats = []
    orders_with_products = await db.orders.find({"clinic_id": clinic_id, "status": {"$in": ["approved", "delivered"]}}, {"_id": 0, "products": 1}).to_list(1000)
    product_counts = {}
    for order in orders_with_products:
        for product in order.get("products", []):
            product_id = product.get("product_id") or product.get("id")
            if product_id:
                if product_id not in product_counts:
                    product_counts[product_id] = {
                        "product_id": product_id,
                        "product_name": product.get("name", "Unknown"),
                        "total_quantity": 0,
                        "order_count": 0
                    }
                product_counts[product_id]["total_quantity"] += product.get("quantity", 0)
                product_counts[product_id]["order_count"] += 1
    
    product_stats = sorted(product_counts.values(), key=lambda x: x["total_quantity"], reverse=True)[:5]
    
    authorized_reps = []
    if clinic.get("line_id"):
        reps = await db.users.find({
            "line_id": clinic["line_id"],
            "role": "medical_rep",
            "is_active": True
        }, {"_id": 0, "id": 1, "full_name": 1, "phone": 1, "email": 1}).to_list(100)
        authorized_reps = reps
    
    return {
        "clinic": clinic,
        "stats": {
            "total_visits": visits_count,
            "total_orders": orders_count,
            "total_invoices": 0
        },
        "recent_visits": visits,
        "recent_orders": orders,
        "top_products": product_stats,
        "authorized_reps": authorized_reps
    }

# Visit Routes
@api_router.post("/visits", response_model=Visit)
async def create_visit(
    visit_data: VisitCreate,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    visit_dict = visit_data.model_dump()
    visit_dict["organization_id"] = current_user["organization_id"]
    visit_dict["medical_rep_id"] = current_user["id"]
    
    if not visit_dict.get("visit_date"):
        visit_dict["visit_date"] = datetime.now(timezone.utc)
    
    # Verify location if GPS coordinates provided
    if visit_dict.get("latitude") and visit_dict.get("longitude"):
        clinic = await db.clinics.find_one({"id": visit_dict["clinic_id"]}, {"_id": 0})
        if clinic and clinic.get("latitude") and clinic.get("longitude"):
            # Calculate distance (simplified - in production use proper geospatial queries)
            from math import radians, sin, cos, sqrt, atan2
            
            lat1, lon1 = radians(visit_dict["latitude"]), radians(visit_dict["longitude"])
            lat2, lon2 = radians(clinic["latitude"]), radians(clinic["longitude"])
            
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            distance_km = 6371 * c
            
            # Verify within 1km radius
            if distance_km <= 1:
                visit_dict["is_verified"] = True
    
    visit_obj = Visit(**visit_dict)
    doc = visit_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['visit_date'] = doc['visit_date'].isoformat()
    if doc.get('follow_up_date'):
        doc['follow_up_date'] = doc['follow_up_date'].isoformat()
    
    await db.visits.insert_one(doc)
    return visit_obj

@api_router.get("/visits", response_model=List[Visit])
async def get_visits(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        visits = await db.visits.find({}, {"_id": 0}).to_list(1000)
    elif current_user["role"] == UserRole.MEDICAL_REP.value:
        visits = await db.visits.find(
            {"medical_rep_id": current_user["id"]},
            {"_id": 0}
        ).to_list(1000)
    else:
        visits = await db.visits.find(
            {"organization_id": current_user["organization_id"]},
            {"_id": 0}
        ).to_list(1000)
    
    for visit in visits:
        if isinstance(visit.get('created_at'), str):
            visit['created_at'] = datetime.fromisoformat(visit['created_at'])
        if isinstance(visit.get('visit_date'), str):
            visit['visit_date'] = datetime.fromisoformat(visit['visit_date'])
    return visits

@api_router.get("/visits/{visit_id}", response_model=Visit)
async def get_visit(visit_id: str, current_user: dict = Depends(get_current_user)):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    if isinstance(visit.get('created_at'), str):
        visit['created_at'] = datetime.fromisoformat(visit['created_at'])
    if isinstance(visit.get('visit_date'), str):
        visit['visit_date'] = datetime.fromisoformat(visit['visit_date'])
    return visit

@api_router.put("/visits/{visit_id}", response_model=Visit)
async def update_visit(
    visit_id: str,
    visit_data: VisitUpdate,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not existing_visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_visit["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only update your own visits")
    
    update_data = visit_data.model_dump(exclude_unset=True)
    if update_data.get("visit_date"):
        update_data["visit_date"] = update_data["visit_date"].isoformat()
    
    await db.visits.update_one({"id": visit_id}, {"$set": update_data})
    
    updated_visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if isinstance(updated_visit.get('created_at'), str):
        updated_visit['created_at'] = datetime.fromisoformat(updated_visit['created_at'])
    if isinstance(updated_visit.get('visit_date'), str):
        updated_visit['visit_date'] = datetime.fromisoformat(updated_visit['visit_date'])
    return updated_visit

@api_router.delete("/visits/{visit_id}")
async def delete_visit(
    visit_id: str,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not existing_visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_visit["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own visits")
    
    result = await db.visits.delete_one({"id": visit_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Visit not found")
    return {"message": "Visit deleted successfully"}

# Order Routes
@api_router.post("/orders", response_model=Order)
async def create_order(
    order_data: OrderCreate,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    order_dict = order_data.model_dump()
    order_dict["organization_id"] = current_user["organization_id"]
    order_dict["medical_rep_id"] = current_user["id"]
    
    subtotal = sum(item.get("quantity", 0) * item.get("price", 0) for item in order_dict.get("products", []))
    order_dict["subtotal"] = subtotal
    
    discount_amount = 0
    if order_dict.get("discount_type") and order_dict.get("discount_value"):
        if order_dict["discount_type"] == DiscountType.PERCENTAGE.value:
            discount_amount = subtotal * (order_dict["discount_value"] / 100)
        elif order_dict["discount_type"] == DiscountType.FIXED.value:
            discount_amount = order_dict["discount_value"]
    
    total_amount = subtotal - discount_amount
    order_dict["total_amount"] = max(0, total_amount)
    
    if order_dict.get("order_type") == OrderType.DEMO.value:
        total_amount = 0
        order_dict["total_amount"] = 0
        product_count = len(order_dict.get("products", []))
        if product_count > 6:
            raise HTTPException(status_code=400, detail="Demo orders cannot have more than 6 products")
        for product in order_dict.get("products", []):
            if product.get("quantity", 0) > 1:
                raise HTTPException(status_code=400, detail="Demo orders can only have 1 quantity per product")
    
    order_dict["status"] = OrderStatus.PENDING_APPROVAL.value
    
    order_obj = Order(**order_dict)
    doc = order_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['order_date'] = doc['order_date'].isoformat()
    
    await db.orders.insert_one(doc)
    return order_obj

@api_router.get("/orders", response_model=List[Order])
async def get_orders(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    elif current_user["role"] == UserRole.MEDICAL_REP.value:
        orders = await db.orders.find(
            {"medical_rep_id": current_user["id"]},
            {"_id": 0}
        ).to_list(1000)
    else:
        orders = await db.orders.find(
            {"organization_id": current_user["organization_id"]},
            {"_id": 0}
        ).to_list(1000)
    
    for order in orders:
        if isinstance(order.get('created_at'), str):
            order['created_at'] = datetime.fromisoformat(order['created_at'])
        if isinstance(order.get('order_date'), str):
            order['order_date'] = datetime.fromisoformat(order['order_date'])
    return orders

@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if isinstance(order.get('created_at'), str):
        order['created_at'] = datetime.fromisoformat(order['created_at'])
    if isinstance(order.get('order_date'), str):
        order['order_date'] = datetime.fromisoformat(order['order_date'])
    return order

@api_router.put("/orders/{order_id}", response_model=Order)
async def update_order(
    order_id: str,
    order_data: OrderUpdate,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_order["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only update your own orders")
    
    update_data = order_data.model_dump(exclude_unset=True)
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if isinstance(updated_order.get('created_at'), str):
        updated_order['created_at'] = datetime.fromisoformat(updated_order['created_at'])
    if isinstance(updated_order.get('order_date'), str):
        updated_order['order_date'] = datetime.fromisoformat(updated_order['order_date'])
    return updated_order

@api_router.delete("/orders/{order_id}")
async def delete_order(
    order_id: str,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_order["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own orders")
    
    result = await db.orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "Order deleted successfully"}

# Order Approval Routes (for Managers)
@api_router.get("/orders/pending-approval")
async def get_pending_orders(
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    query = {"status": OrderStatus.PENDING_APPROVAL.value}
    
    if current_user["role"] == UserRole.MANAGER.value:
        team_members = await db.users.find(
            {"manager_id": current_user["id"]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        team_ids = [member["id"] for member in team_members]
        query["medical_rep_id"] = {"$in": team_ids}
    elif current_user["role"] == UserRole.GM.value:
        query["organization_id"] = current_user["organization_id"]
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for order in orders:
        if isinstance(order.get('created_at'), str):
            order['created_at'] = datetime.fromisoformat(order['created_at'])
        if isinstance(order.get('order_date'), str):
            order['order_date'] = datetime.fromisoformat(order['order_date'])
        
        rep = await db.users.find_one({"id": order["medical_rep_id"]}, {"_id": 0, "full_name": 1})
        order["medical_rep_name"] = rep["full_name"] if rep else "Unknown"
        
        clinic = await db.clinics.find_one({"id": order["clinic_id"]}, {"_id": 0, "name": 1})
        order["clinic_name"] = clinic["name"] if clinic else "Unknown"
    
    return orders

@api_router.post("/orders/{order_id}/approve")
async def approve_order(
    order_id: str,
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if existing_order["status"] != OrderStatus.PENDING_APPROVAL.value:
        raise HTTPException(status_code=400, detail="Order is not pending approval")
    
    if current_user["role"] == UserRole.MANAGER.value:
        order_rep = await db.users.find_one({"id": existing_order["medical_rep_id"]}, {"_id": 0})
        if not order_rep or order_rep.get("manager_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only approve orders from your team")
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": OrderStatus.APPROVED.value,
                "approved_by": current_user["id"],
                "approved_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Order approved successfully"}

@api_router.post("/orders/{order_id}/reject")
async def reject_order(
    order_id: str,
    rejection_reason: str,
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if existing_order["status"] != OrderStatus.PENDING_APPROVAL.value:
        raise HTTPException(status_code=400, detail="Order is not pending approval")
    
    if current_user["role"] == UserRole.MANAGER.value:
        order_rep = await db.users.find_one({"id": existing_order["medical_rep_id"]}, {"_id": 0})
        if not order_rep or order_rep.get("manager_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only reject orders from your team")
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": OrderStatus.REJECTED.value,
                "approved_by": current_user["id"],
                "approved_at": datetime.now(timezone.utc).isoformat(),
                "rejection_reason": rejection_reason
            }
        }
    )
    
    return {"message": "Order rejected successfully"}

# Expense Routes
@api_router.post("/expenses", response_model=Expense)
async def create_expense(
    expense_data: ExpenseCreate,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    expense_dict = expense_data.model_dump()
    expense_dict["organization_id"] = current_user["organization_id"]
    expense_dict["medical_rep_id"] = current_user["id"]
    
    expense_obj = Expense(**expense_dict)
    doc = expense_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['expense_date'] = doc['expense_date'].isoformat()
    
    await db.expenses.insert_one(doc)
    return expense_obj

@api_router.get("/expenses", response_model=List[Expense])
async def get_expenses(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        expenses = await db.expenses.find({}, {"_id": 0}).to_list(1000)
    elif current_user["role"] == UserRole.MEDICAL_REP.value:
        expenses = await db.expenses.find(
            {"medical_rep_id": current_user["id"]},
            {"_id": 0}
        ).to_list(1000)
    else:
        expenses = await db.expenses.find(
            {"organization_id": current_user["organization_id"]},
            {"_id": 0}
        ).to_list(1000)
    
    for expense in expenses:
        if isinstance(expense.get('created_at'), str):
            expense['created_at'] = datetime.fromisoformat(expense['created_at'])
        if isinstance(expense.get('expense_date'), str):
            expense['expense_date'] = datetime.fromisoformat(expense['expense_date'])
    return expenses

@api_router.get("/expenses/{expense_id}", response_model=Expense)
async def get_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if isinstance(expense.get('created_at'), str):
        expense['created_at'] = datetime.fromisoformat(expense['created_at'])
    if isinstance(expense.get('expense_date'), str):
        expense['expense_date'] = datetime.fromisoformat(expense['expense_date'])
    return expense

@api_router.put("/expenses/{expense_id}", response_model=Expense)
async def update_expense(
    expense_id: str,
    expense_data: ExpenseUpdate,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not existing_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_expense["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only update your own expenses")
    
    update_data = expense_data.model_dump(exclude_unset=True)
    if update_data.get("expense_date"):
        update_data["expense_date"] = update_data["expense_date"].isoformat()
    
    await db.expenses.update_one({"id": expense_id}, {"$set": update_data})
    
    updated_expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if isinstance(updated_expense.get('created_at'), str):
        updated_expense['created_at'] = datetime.fromisoformat(updated_expense['created_at'])
    if isinstance(updated_expense.get('expense_date'), str):
        updated_expense['expense_date'] = datetime.fromisoformat(updated_expense['expense_date'])
    return updated_expense

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    existing_expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not existing_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_expense["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own expenses")
    
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}

# GPS Tracking Routes
@api_router.post("/gps-logs", response_model=GPSLog)
async def create_gps_log(
    gps_data: GPSLogCreate,
    current_user: dict = Depends(get_current_user)
):
    gps_dict = gps_data.model_dump()
    gps_dict["user_id"] = current_user["id"]
    gps_dict["organization_id"] = current_user["organization_id"]
    
    gps_obj = GPSLog(**gps_dict)
    doc = gps_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    await db.gps_logs.insert_one(doc)
    return gps_obj

@api_router.get("/gps-logs", response_model=List[GPSLog])
async def get_gps_logs(
    user_id: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    query = {}
    if user_id:
        query["user_id"] = user_id
    
    logs = await db.gps_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(1000).to_list(1000)
    
    for log in logs:
        if isinstance(log.get('timestamp'), str):
            log['timestamp'] = datetime.fromisoformat(log['timestamp'])
    return logs

# GPS Settings Routes (Super Admin Only)
@api_router.post("/gps-settings", response_model=GPSSettings)
async def create_gps_settings(
    settings_data: GPSSettingsCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    existing_settings = await db.gps_settings.find_one({"organization_id": current_user["organization_id"]})
    if existing_settings:
        raise HTTPException(status_code=400, detail="GPS settings already exist for this organization")
    
    settings_dict = settings_data.model_dump()
    settings_dict["organization_id"] = current_user["organization_id"]
    
    settings_obj = GPSSettings(**settings_dict)
    doc = settings_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.gps_settings.insert_one(doc)
    return settings_obj

@api_router.get("/gps-settings")
async def get_gps_settings(current_user: dict = Depends(get_current_user)):
    query = {"organization_id": current_user["organization_id"]}
    
    settings = await db.gps_settings.find_one(query, {"_id": 0})
    if not settings:
        default_settings = {
            "id": str(uuid.uuid4()),
            "organization_id": current_user["organization_id"],
            "gps_enabled": True,
            "gps_api_key": None,
            "gps_api_provider": "browser",
            "tracking_interval": 300,
            "auto_track_during_work_hours": True,
            "work_hours_start": "08:00",
            "work_hours_end": "18:00",
            "require_location_for_visits": True,
            "location_verification_radius": 1.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        return default_settings
    
    if isinstance(settings.get('created_at'), str):
        settings['created_at'] = datetime.fromisoformat(settings['created_at'])
    if isinstance(settings.get('updated_at'), str):
        settings['updated_at'] = datetime.fromisoformat(settings['updated_at'])
    
    return settings

@api_router.put("/gps-settings", response_model=GPSSettings)
async def update_gps_settings(
    settings_data: GPSSettingsUpdate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    query = {"organization_id": current_user["organization_id"]}
    existing_settings = await db.gps_settings.find_one(query, {"_id": 0})
    
    if not existing_settings:
        create_data = GPSSettingsCreate(**{k: v for k, v in settings_data.model_dump().items() if v is not None})
        return await create_gps_settings(create_data, current_user)
    
    update_data = {k: v for k, v in settings_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.gps_settings.update_one(query, {"$set": update_data})
    
    updated_settings = await db.gps_settings.find_one(query, {"_id": 0})
    if isinstance(updated_settings.get('created_at'), str):
        updated_settings['created_at'] = datetime.fromisoformat(updated_settings['created_at'])
    if isinstance(updated_settings.get('updated_at'), str):
        updated_settings['updated_at'] = datetime.fromisoformat(updated_settings['updated_at'])
    
    return updated_settings

# Dashboard Stats
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] != UserRole.SUPER_ADMIN.value:
        query["organization_id"] = current_user["organization_id"]
    
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        query["medical_rep_id"] = current_user["id"]
    
    clinics_count = await db.clinics.count_documents(
        {"organization_id": current_user["organization_id"]} if current_user["role"] != UserRole.SUPER_ADMIN.value else {}
    )
    visits_count = await db.visits.count_documents(query if "medical_rep_id" in query else (
        {"organization_id": current_user["organization_id"]} if current_user["role"] != UserRole.SUPER_ADMIN.value else {}
    ))
    orders_count = await db.orders.count_documents(query if "medical_rep_id" in query else (
        {"organization_id": current_user["organization_id"]} if current_user["role"] != UserRole.SUPER_ADMIN.value else {}
    ))
    expenses_count = await db.expenses.count_documents(query if "medical_rep_id" in query else (
        {"organization_id": current_user["organization_id"]} if current_user["role"] != UserRole.SUPER_ADMIN.value else {}
    ))
    
    users_query = {}
    if current_user["role"] != UserRole.SUPER_ADMIN.value:
        users_query["organization_id"] = current_user["organization_id"]
    users_count = await db.users.count_documents(users_query)
    
    return {
        "clinics": clinics_count,
        "visits": visits_count,
        "orders": orders_count,
        "expenses": expenses_count,
        "users": users_count
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()