from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
import csv
import io
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import shutil
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta, date
import jwt
from passlib.context import CryptContext
from enum import Enum
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import boto3
from botocore.exceptions import ClientError
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Setup Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
# Force reload: 2025-12-26

# AWS S3 Configuration
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME', 'pharmatrack-uploads-prod')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize S3 client (if AWS credentials are available)
s3_client = None
try:
    if os.environ.get('AWS_ACCESS_KEY_ID') and os.environ.get('AWS_SECRET_ACCESS_KEY'):
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            region_name=AWS_REGION
        )
        logger.info(f"✅ S3 client initialized for bucket: {S3_BUCKET_NAME}")
    else:
        logger.warning("⚠️ AWS credentials not found - file uploads will use local storage")
except Exception as e:
    logger.error(f"Failed to initialize S3 client: {e}")

async def upload_file_to_s3(file_content: bytes, file_name: str, content_type: str = 'application/octet-stream') -> str:
    """
    Upload a file to S3 and return the public URL.
    Falls back to local storage if S3 is not configured.
    """
    if s3_client:
        try:
            # Generate unique file name
            unique_name = f"{uuid.uuid4().hex}_{file_name}"
            s3_key = f"uploads/{unique_name}"
            
            s3_client.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=s3_key,
                Body=file_content,
                ContentType=content_type
            )
            
            # Return public URL
            url = f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
            logger.info(f"File uploaded to S3: {url}")
            return url
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to upload file to S3")
    else:
        # Fallback to local storage (for development)
        uploads_dir = ROOT_DIR / 'uploads'
        uploads_dir.mkdir(exist_ok=True)
        unique_name = f"{uuid.uuid4().hex}_{file_name}"
        file_path = uploads_dir / unique_name
        with open(file_path, 'wb') as f:
            f.write(file_content)
        return f"/uploads/{unique_name}"

# MongoDB connection
def get_mongo_url():
    url = os.environ['MONGO_URL']
    # DNS SRV Lookup fails in some environments (Firewall/VPN)
    # If using the specific cluster known to fail, fallback to direct seed list
    if "cluster0.9aaikpq.mongodb.net" in url and url.startswith("mongodb+srv://"):
        try:
            # Extract credentials
            creds_part = url.split("mongodb+srv://")[1].split("@")[0]
            # Hosts resolved via nslookup
            hosts = [
                "ac-vlmpx1i-shard-00-00.9aaikpq.mongodb.net:27017",
                "ac-vlmpx1i-shard-00-01.9aaikpq.mongodb.net:27017",
                "ac-vlmpx1i-shard-00-02.9aaikpq.mongodb.net:27017"
            ]
            new_url = f"mongodb://{creds_part}@{','.join(hosts)}/?ssl=true&authSource=admin&retryWrites=true&w=majority"
            logger.info("Using Direct Connection String (Seed List) to bypass DNS SRV issues")
            return new_url
        except Exception as e:
            logger.error(f"Failed to construct direct URL: {e}")
            return url
    return url

mongo_url = get_mongo_url()
# Increased timeout for high-latency connections (especially on VPN/Firewall environments)
client = AsyncIOMotorClient(
    mongo_url, 
    serverSelectionTimeoutMS=30000,  # 30 seconds instead of 5
    connectTimeoutMS=20000,          # 20 seconds connection timeout
    socketTimeoutMS=20000,           # 20 seconds socket timeout
    maxPoolSize=10,
    minPoolSize=1
)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Health check endpoint for Railway/Docker deployment
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "pharmatrack-backend"}

# System Health endpoint for Settings page - comprehensive health check
@api_router.get("/system-health")
async def system_health():
    """
    Comprehensive system health check for the Settings page.
    Returns database status, collection counts, and environment info.
    """
    try:
        # Check database connectivity
        db_status = "connected"
        try:
            await db.command("ping")
        except Exception as e:
            db_status = f"error: {str(e)}"
        
        # Get collection counts
        counts = {}
        collections = ["users", "orders", "clinics", "products", "visits", "invoices", "payments"]
        for coll in collections:
            try:
                counts[coll] = await db[coll].count_documents({})
            except:
                counts[coll] = 0
        
        # Build health response
        return {
            "status": "healthy" if db_status == "connected" else "unhealthy",
            "database": {
                "status": db_status,
                "name": os.environ.get('DB_NAME', 'unknown')
            },
            "collections": counts,
            "environment": os.environ.get('ENV', 'development'),
            "version": "1.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"System health check failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

# Database Reset Endpoint (SUPER_ADMIN only) - for fresh production start
@app.post("/api/admin/reset-database")
async def reset_database(secret_key: str):
    """
    Complete database reset - clears all operational data.
    Requires secret key for security.
    """
    # Security check - require secret key
    if secret_key != "RESET_PHARMATRACK_2024_CONFIRM":
        raise HTTPException(status_code=403, detail="Invalid secret key")
    
    collections_to_clear = [
        "orders", "visits", "clinics", "invoices", "payments",
        "expenses", "audit_logs", "returns", "tracking_sessions",
        "gps_points", "location_history", "notifications", "push_subscriptions"
    ]
    
    results = {}
    total_deleted = 0
    
    for collection_name in collections_to_clear:
        try:
            result = await db[collection_name].delete_many({})
            deleted_count = result.deleted_count
            total_deleted += deleted_count
            results[collection_name] = {"deleted": deleted_count, "status": "success"}
        except Exception as e:
            results[collection_name] = {"error": str(e), "status": "failed"}
    
    # Reset serial counters
    counters = ["invoice_number", "payment_number", "visit_number", "order_number", "expense_number"]
    for counter_id in counters:
        try:
            await db.counters.delete_one({"_id": counter_id})
        except:
            pass
    
    results["counters"] = {"reset": len(counters), "status": "success"}
    
    logger.info(f"Database reset completed. Total deleted: {total_deleted}")
    
    return {
        "message": "Database reset completed",
        "total_deleted": total_deleted,
        "details": results
    }

# CORS Middleware - Allow specific origins for development and production
def get_cors_origins():
    """Get CORS origins from environment or use defaults for development."""
    # Production origins from environment variable (comma-separated)
    prod_origins = os.environ.get('ALLOWED_ORIGINS', '')
    origins = [o.strip() for o in prod_origins.split(',') if o.strip()]
    
    # Always include localhost for development
    dev_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    
    # Combine and deduplicate
    all_origins = list(set(origins + dev_origins))
    return all_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate Limiter Setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# JWT Configuration - SECURITY: Require explicit secret in production
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    if os.environ.get('ENV', 'development') == 'production':
        raise RuntimeError("JWT_SECRET environment variable is required in production!")
    JWT_SECRET = 'dev-only-secret-change-in-production'
    logger.warning("⚠️ Using development JWT secret. Set JWT_SECRET env var for production!")

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Enums
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    GM = "gm"
    MANAGER = "manager"
    ACCOUNTANT = "accountant"  # Can see all approved orders, manage invoices & returns
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
    PROCESSING = "processing"
    SHIPPED = "shipped"
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

class ExpenseCategory(str, Enum):
    TRAVEL = "travel"
    MEALS = "meals"
    ACCOMMODATION = "accommodation"
    TRANSPORTATION = "transportation"
    SUPPLIES = "supplies"
    COMMUNICATION = "communication"
    ENTERTAINMENT = "entertainment"
    MEDICAL = "medical"
    OTHER = "other"

class ReturnStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSED = "processed"

# Accounting Module Enums
class InvoiceStatus(str, Enum):
    APPROVED = "approved"              # معتمدة (تنتظر التحصيل)
    PARTIALLY_PAID = "partially_paid"  # مدفوعة جزئياً
    FULLY_PAID = "fully_paid"          # مدفوعة بالكامل
    CANCELLED = "cancelled"            # ملغاة

class PaymentMethod(str, Enum):
    CASH = "cash"                      # نقدي
    BANK_TRANSFER = "bank"             # تحويل بنكي
    CHECK = "check"                    # شيك
    CREDIT = "credit"                  # ائتمان
    E_WALLET = "e_wallet"              # محفظة إلكترونية
    INSTAPAY = "instapay"              # إنستا باي
    ELECTRONIC = "electronic"          # تحويل إلكتروني


class AuditLogType(str, Enum):
    INVOICE_CREATED = "invoice_created"
    PAYMENT_RECORDED = "payment_recorded"
    EXPENSE_APPROVED = "expense_approved"
    EXPENSE_REJECTED = "expense_rejected"
    INVOICE_CANCELLED = "invoice_cancelled"

class NotificationType(str, Enum):
    # Invoice & Payment notifications
    INVOICE_DUE_TODAY = "invoice_due_today"
    INVOICE_DUE_TOMORROW = "invoice_due_tomorrow"
    INVOICE_OVERDUE = "invoice_overdue"
    PAYMENT_RECEIVED = "payment_received"
    INSTALLMENT_DUE = "installment_due"
    
    # Order notifications
    ORDER_CREATED = "order_created"
    ORDER_PENDING_APPROVAL = "order_pending_approval"
    ORDER_APPROVED = "order_approved"
    ORDER_REJECTED = "order_rejected"
    
    # Report notifications
    DAILY_REPORT = "daily_report"
    WEEKLY_REPORT = "weekly_report"
    
    # System notifications
    SYSTEM_ALERT = "system_alert"

# Plan Module Enums
class PlanStatus(str, Enum):
    DRAFT = "draft"                          # مسودة - قيد الإنشاء
    PENDING_APPROVAL = "pending_approval"    # بانتظار موافقة المدير
    NEEDS_REVISION = "needs_revision"        # يحتاج تعديل
    APPROVED = "approved"                    # معتمد - لا يمكن التعديل
    ACTIVE = "active"                        # نشط - الشهر الحالي
    COMPLETED = "completed"                  # مكتمل - الشهر انتهى

class RecurrenceType(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"

class PlannedVisitType(str, Enum):
    REGULAR = "regular"           # زيارة عادية
    ORDER = "order"               # زيارة مع طلب
    DEMO = "demo"                 # زيارة مع عينات
    NEW_CLINIC = "new_clinic"     # افتتاح عيادة جديدة
    ISSUE = "issue"               # حل مشكلة

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
    whatsapp_number: Optional[str] = None  # WhatsApp number for notifications
    receive_whatsapp_notifications: bool = True  # Enable/disable WhatsApp notifications
    receive_push_notifications: bool = True  # Enable/disable Push notifications
    is_active: bool = True
    gps_enabled: bool = False
    last_login: Optional[datetime] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
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
    whatsapp_number: Optional[str] = None  # WhatsApp number for notifications

    @field_validator('username', 'full_name', mode='before')
    @classmethod
    def sanitize_string(cls, v):
        if isinstance(v, str):
            v = v.strip()[:100]  # Strip whitespace and limit length
            if not v:
                raise ValueError('Field cannot be empty')
        return v

    @field_validator('password', mode='before')
    @classmethod
    def validate_password(cls, v):
        if isinstance(v, str):
            if len(v) < 6:
                raise ValueError('Password must be at least 6 characters')
            if len(v) > 128:
                raise ValueError('Password too long')
        return v

class UserLogin(BaseModel):
    username: str
    password: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    external_ip: Optional[str] = None  # External IP from frontend
    device_info: Optional[str] = None  # Device info from frontend

    @field_validator('username', 'password', mode='before')
    @classmethod
    def sanitize_input(cls, v):
        if isinstance(v, str):
            v = v.strip()[:128]  # Strip whitespace and limit length
        return v

class UserUpdate(BaseModel):
    username: Optional[str] = None  # Allow username change
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    receive_whatsapp_notifications: Optional[bool] = None
    receive_push_notifications: Optional[bool] = None
    role: Optional[UserRole] = None
    line_id: Optional[str] = None
    area_id: Optional[str] = None
    manager_id: Optional[str] = None
    password: Optional[str] = None  # For password changes
    is_active: Optional[bool] = None
    gps_enabled: Optional[bool] = None

# Notification Model
class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str  # Target user
    type: NotificationType
    title: str
    message: str
    data: Optional[dict] = None  # Additional data (invoice_id, clinic_name, amount, etc.)
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NotificationCreate(BaseModel):
    user_id: str
    type: NotificationType
    title: str
    message: str
    data: Optional[dict] = None

# ============== Plan Module Models ==============

class PlannedVisitItem(BaseModel):
    """A single planned visit within a monthly plan"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    clinic_id: str
    scheduled_date: datetime
    visit_reason: str  # follow_up, product_demo, place_order, issue, opening_clinic
    visit_type: PlannedVisitType = PlannedVisitType.REGULAR
    notes: Optional[str] = None
    
    # Execution tracking
    is_completed: bool = False
    actual_visit_id: Optional[str] = None  # رابط الزيارة الفعلية
    embedded_order_id: Optional[str] = None  # رابط الطلب المضمن

class RecurringVisitItem(BaseModel):
    """A recurring visit template within a monthly plan"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    clinic_id: str
    recurrence_type: RecurrenceType = RecurrenceType.WEEKLY
    days_of_week: List[int] = []  # 0=Sunday, 1=Monday, ..., 6=Saturday
    day_of_month: Optional[int] = None  # For monthly recurrence
    preferred_time: Optional[str] = None  # e.g., "09:00"
    visit_reason: str = "follow_up"
    
    start_date: date
    end_date: Optional[date] = None  # None = indefinite
    
    # Notification settings
    reminder_before_minutes: int = 60  # 1 hour before
    notify_on_miss: bool = True
    is_active: bool = True

class NewClinicPlanItem(BaseModel):
    """A new clinic to be opened within a monthly plan"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: str
    doctor_name: Optional[str] = None
    specialty: Optional[str] = None
    planned_date: date
    notes: Optional[str] = None
    
    # Execution tracking
    is_completed: bool = False
    created_clinic_id: Optional[str] = None

class PlanComment(BaseModel):
    """Comment on a plan from manager/user"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Plan(BaseModel):
    """Monthly plan for a medical rep"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str           # المندوب
    manager_id: str        # المدير المباشر
    month: int             # الشهر (1-12)
    year: int              # السنة
    status: PlanStatus = PlanStatus.DRAFT
    
    # Plan items
    planned_visits: List[PlannedVisitItem] = []
    recurring_visits: List[RecurringVisitItem] = []
    new_clinics: List[NewClinicPlanItem] = []
    
    # Notes
    notes: Optional[str] = None
    manager_notes: Optional[str] = None
    comments: List[PlanComment] = []
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    rejection_reason: Optional[str] = None

class PlanCreate(BaseModel):
    """Create a new monthly plan"""
    month: int
    year: int
    planned_visits: List[dict] = []
    recurring_visits: List[dict] = []
    new_clinics: List[dict] = []
    notes: Optional[str] = None

class PlanUpdate(BaseModel):
    """Update an existing plan (only if status is DRAFT or NEEDS_REVISION)"""
    planned_visits: Optional[List[dict]] = None
    recurring_visits: Optional[List[dict]] = None
    new_clinics: Optional[List[dict]] = None
    notes: Optional[str] = None

class PlanApprovalAction(BaseModel):
    """Manager action on a plan"""
    action: str  # approve, reject, request_revision
    manager_notes: Optional[str] = None
    rejection_reason: Optional[str] = None

# ============== End Plan Module Models ==============

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
    serial_number: Optional[int] = None  # Human-readable serial (starts from 5005)
    clinic_id: str
    medical_rep_id: str
    visit_date: datetime
    visit_reason: Optional[VisitReason] = None
    visit_result: Optional[VisitResult] = None
    notes: Optional[str] = None
    attendees: Optional[List[dict]] = None  # Changed to list of {id, name}
    samples_provided: Optional[List[dict]] = None
    follow_up_date: Optional[datetime] = None
    visit_rating: Optional[int] = Field(None, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_verified: bool = False
    status: VisitStatus = VisitStatus.PLANNED
    # Embedded Order - created automatically when visit has order data
    embedded_order: Optional[dict] = None  # {enabled, order_type, products, total_amount, etc.}
    embedded_order_id: Optional[str] = None  # ID of auto-created order
    # Visit Chat - Comments from team members
    comments: List[dict] = Field(default_factory=list)  # [{id, user_id, user_name, content, created_at}]
    # Link to planned visit from Plans module
    planned_visit_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    synced: bool = True


class VisitCreate(BaseModel):
    clinic_id: str
    visit_date: Optional[datetime] = None
    visit_reason: Optional[VisitReason] = None
    visit_result: Optional[VisitResult] = None
    notes: Optional[str] = None
    attendees: Optional[List[dict]] = None  # Changed to list of {id, name}
    samples_provided: Optional[List[dict]] = None
    follow_up_date: Optional[datetime] = None
    visit_rating: Optional[int] = Field(None, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: VisitStatus = VisitStatus.COMPLETED
    # Embedded Order
    embedded_order: Optional[dict] = None  # {enabled, order_type, products, total_amount, payment_method, discount_type, discount_value}

class VisitUpdate(BaseModel):
    clinic_id: Optional[str] = None
    visit_date: Optional[datetime] = None
    visit_reason: Optional[VisitReason] = None
    visit_result: Optional[VisitResult] = None
    notes: Optional[str] = None
    attendees: Optional[List[dict]] = None  # Changed to list of {id, name}
    samples_provided: Optional[List[dict]] = None
    follow_up_date: Optional[datetime] = None
    visit_rating: Optional[int] = Field(None, ge=1, le=5)
    status: Optional[VisitStatus] = None
    embedded_order: Optional[dict] = None

# Order History Event for timeline tracking
class OrderHistoryEvent(BaseModel):
    action: str  # created, submitted, approved, rejected, status_changed, updated
    user_id: str
    user_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    details: Optional[str] = None
    old_status: Optional[str] = None
    new_status: Optional[str] = None

# Order Comment for internal notes
class OrderComment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    serial_number: Optional[int] = None  # Human-readable serial (starts from 1001)
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
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Payment fields
    payment_status: Optional[str] = "unpaid"  # 'full', 'partial', 'unpaid'
    payment_method: Optional[str] = None  # 'bank_transfer', 'e_wallet', 'instapay', 'cash'
    amount_paid: Optional[float] = None
    history: List[dict] = Field(default_factory=list)  # Timeline of changes
    comments: List[dict] = Field(default_factory=list)  # Internal notes
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
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Payment fields
    payment_status: Optional[str] = "unpaid"  # 'full', 'partial', 'unpaid'
    payment_method: Optional[str] = None
    amount_paid: Optional[float] = None
    # Installment scheduling fields
    schedule_type: Optional[str] = "monthly"  # 'monthly', 'weekly', 'regular', 'custom'
    installments_count: Optional[int] = 3
    interval_days: Optional[int] = 30
    first_due_date: Optional[str] = None  # ISO date string
    grace_period_days: Optional[int] = 3
    custom_installments: Optional[List[dict]] = None  # [{amount, due_date}]

class OrderUpdate(BaseModel):
    clinic_id: Optional[str] = None
    products: Optional[List[dict]] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    discount_reason: Optional[str] = None
    status: Optional[OrderStatus] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    # Payment fields
    payment_status: Optional[str] = None
    payment_method: Optional[str] = None
    amount_paid: Optional[float] = None

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    serial_number: Optional[int] = None  # Human-readable serial (starts from 3001)
    medical_rep_id: str
    expense_type: str
    category: ExpenseCategory = ExpenseCategory.OTHER
    custom_category: Optional[str] = None  # Custom category when 'other' is selected
    amount: float
    expense_date: datetime
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_files: List[str] = Field(default_factory=list)  # Multiple receipt files
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: ExpenseStatus = ExpenseStatus.PENDING
    submitted_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None  # Manager who reviewed
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    synced: bool = True
    # These are populated dynamically in API responses
    submitter_name: Optional[str] = None
    reviewer_name: Optional[str] = None

class ExpenseCreate(BaseModel):
    expense_type: str
    category: ExpenseCategory = ExpenseCategory.OTHER
    custom_category: Optional[str] = None
    amount: float
    expense_date: datetime
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_files: List[str] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ExpenseUpdate(BaseModel):
    expense_type: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    custom_category: Optional[str] = None
    amount: Optional[float] = None
    expense_date: Optional[datetime] = None
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_files: Optional[List[str]] = None
    status: Optional[ExpenseStatus] = None
    rejection_reason: Optional[str] = None

class Return(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_id: str
    clinic_id: str
    requested_by: str  # User ID who requested the return
    reason: str
    items: List[dict]  # Products being returned with quantities
    total_amount: float
    status: ReturnStatus = ReturnStatus.PENDING
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReturnCreate(BaseModel):
    order_id: str
    reason: str
    items: List[dict]
    notes: Optional[str] = None

class GPSLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    activity_type: Optional[str] = "unknown"  # LOGIN, LOGOUT, VISIT, etc.
    battery_level: Optional[int] = None
    ip_address: Optional[str] = None
    device_info: Optional[str] = None
    metadata: Optional[dict] = None

class GPSLogCreate(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    activity_type: Optional[str] = "unknown"
    battery_level: Optional[int] = None
    ip_address: Optional[str] = None
    device_info: Optional[str] = None
    metadata: Optional[dict] = None

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
    # Advanced tracking settings
    silent_tracking_enabled: bool = True
    location_cache_minutes: int = 5
    # Device info settings
    capture_device_info: bool = True
    capture_external_ip: bool = True
    ip_location_fallback: bool = True
    # Map settings
    map_provider: str = "openlayers"
    default_map_view: str = "markers"
    show_map_in_dialog: bool = True
    show_map_legend: bool = True
    # Metadata
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
    # Advanced tracking settings
    silent_tracking_enabled: bool = True
    location_cache_minutes: int = 5
    # Device info settings
    capture_device_info: bool = True
    capture_external_ip: bool = True
    ip_location_fallback: bool = True
    # Map settings
    map_provider: str = "openlayers"
    default_map_view: str = "markers"
    show_map_in_dialog: bool = True
    show_map_legend: bool = True

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
    # Advanced tracking settings
    silent_tracking_enabled: Optional[bool] = None
    location_cache_minutes: Optional[int] = None
    # Device info settings
    capture_device_info: Optional[bool] = None
    capture_external_ip: Optional[bool] = None
    ip_location_fallback: Optional[bool] = None
    # Map settings
    map_provider: Optional[str] = None
    default_map_view: Optional[str] = None
    show_map_in_dialog: Optional[bool] = None
    show_map_legend: Optional[bool] = None

class NotificationType(str, Enum):
    ORDER_PENDING = "order_pending"
    ORDER_APPROVED = "order_approved"
    ORDER_REJECTED = "order_rejected"
    VISIT_REMINDER = "visit_reminder"
    SYSTEM = "system"

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str  # Recipient
    type: NotificationType = NotificationType.SYSTEM
    title: str
    message: str
    data: Optional[dict] = None  # Extra data like order_id
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NotificationCreate(BaseModel):
    user_id: str
    type: NotificationType = NotificationType.SYSTEM
    title: str
    message: str
    data: Optional[dict] = None

# Push Subscription for Web Push Notifications
class PushSubscription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    endpoint: str
    keys: dict  # Contains p256dh and auth keys
    device_info: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict
    device_info: Optional[str] = None

# User Session for Session Management
class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    token_hash: str  # Hashed JWT token for security
    device_info: str
    ip_address: str
    location: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    expires_at: Optional[datetime] = None


class SiteSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    # General Settings
    site_title: str = "MedTrack"
    company_name: str = "MedTrack"
    tagline: Optional[str] = "Medical Representative Tracking System"
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    # Branding
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: str = "#14b8a6"
    # Login Page
    login_background_url: Optional[str] = None
    login_logo_url: Optional[str] = None
    login_title: str = "Welcome Back"
    login_subtitle: str = "Sign in to your account"
    # Login Page Particles Animation
    login_particle_type: str = "none"  # none, color, ball, lines, thick, circle, cobweb, polygon, square, tadpole, fountain, random, custom
    login_particle_color: str = "#6366f1"
    # Login Page Colors & Styling
    login_left_bg_color: str = "#f0fdfa"  # Image section background (teal-50)
    login_right_bg_color: str = "#ffffff"  # Form section background (white)
    login_left_gradient_from: str = "#f0fdfa"  # Gradient start
    login_left_gradient_to: str = "#ccfbf1"  # Gradient end (teal-100)
    login_form_bg_color: str = "#ffffff"  # Form card background
    login_text_color: str = "#0f172a"  # Main text color (slate-900)
    login_subtitle_color: str = "#64748b"  # Subtitle color (slate-500)
    login_button_color: str = "#14b8a6"  # Login button color (primary)
    login_button_text_color: str = "#ffffff"  # Button text color
    # Login Page Options
    login_show_decorations: bool = True  # Show decorative blur circles
    login_show_image_ring: bool = True  # Show white ring around image
    login_glassmorphism: bool = True  # Enable glass effect on form
    # Footer
    footer_text: Optional[str] = "© 2024 MedTrack. All rights reserved."
    # Print Templates / Invoice Settings
    invoice_logo_url: Optional[str] = None
    invoice_company_name: Optional[str] = None
    invoice_tagline: Optional[str] = None
    invoice_phone: Optional[str] = None
    invoice_email: Optional[str] = None
    invoice_website: Optional[str] = None
    invoice_address: Optional[str] = None
    invoice_footer: Optional[str] = "Thank you for your business!"
    invoice_primary_color: Optional[str] = "#ea580c"
    document_prefix: Optional[str] = "EP Group"
    invoice_template: str = "classic"  # classic, modern, minimal
    # System Settings
    timezone: str = "Africa/Cairo"
    session_timeout_minutes: int = 480  # 8 hours default
    # Notification Settings
    notification_email_enabled: bool = False
    notification_push_enabled: bool = True
    notification_order_alerts: bool = True
    notification_expense_alerts: bool = True
    # Localization Settings
    language: str = "ar"  # ar, en
    date_format: str = "DD/MM/YYYY"  # DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
    currency: str = "EGP"  # EGP, USD, SAR, AED
    currency_symbol: str = "ج.م"  # ج.م, $, ﷼, د.إ
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SiteSettingsUpdate(BaseModel):
    site_title: Optional[str] = None
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: Optional[str] = None
    login_background_url: Optional[str] = None
    login_logo_url: Optional[str] = None
    login_title: Optional[str] = None
    login_subtitle: Optional[str] = None
    # Login Page Particles Animation
    login_particle_type: Optional[str] = None
    login_particle_color: Optional[str] = None
    # Login Page Colors & Styling
    login_left_bg_color: Optional[str] = None
    login_right_bg_color: Optional[str] = None
    login_left_gradient_from: Optional[str] = None
    login_left_gradient_to: Optional[str] = None
    login_form_bg_color: Optional[str] = None
    login_text_color: Optional[str] = None
    login_subtitle_color: Optional[str] = None
    login_button_color: Optional[str] = None
    login_button_text_color: Optional[str] = None
    # Login Page Options
    login_show_decorations: Optional[bool] = None
    login_show_image_ring: Optional[bool] = None
    login_glassmorphism: Optional[bool] = None
    footer_text: Optional[str] = None
    # Print Templates / Invoice Settings
    invoice_logo_url: Optional[str] = None
    invoice_company_name: Optional[str] = None
    invoice_tagline: Optional[str] = None
    invoice_phone: Optional[str] = None
    invoice_email: Optional[str] = None
    invoice_website: Optional[str] = None
    invoice_address: Optional[str] = None
    invoice_footer: Optional[str] = None
    invoice_primary_color: Optional[str] = None
    document_prefix: Optional[str] = None
    invoice_template: Optional[str] = None
    # System Settings
    timezone: Optional[str] = None
    session_timeout_minutes: Optional[int] = None
    # Notification Settings
    notification_email_enabled: Optional[bool] = None
    notification_push_enabled: Optional[bool] = None
    notification_order_alerts: Optional[bool] = None
    notification_expense_alerts: Optional[bool] = None
    # Localization Settings
    language: Optional[str] = None
    date_format: Optional[str] = None
    currency: Optional[str] = None
    currency_symbol: Optional[str] = None

# Custom Fields Models
class CustomField(BaseModel):
    """Definition of a custom field that can be added to orders or visits"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Field display name
    name_ar: Optional[str] = None  # Arabic name
    field_type: str = "text"  # text, number, date, select, checkbox
    entity_type: str = "order"  # order, visit, both
    options: Optional[List[str]] = None  # For select type fields
    required: bool = False
    default_value: Optional[str] = None
    placeholder: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CustomFieldCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    field_type: str = "text"
    entity_type: str = "order"
    options: Optional[List[str]] = None
    required: bool = False
    default_value: Optional[str] = None
    placeholder: Optional[str] = None

class CustomFieldUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    field_type: Optional[str] = None
    entity_type: Optional[str] = None
    options: Optional[List[str]] = None
    required: Optional[bool] = None
    default_value: Optional[str] = None
    placeholder: Optional[str] = None
    is_active: Optional[bool] = None

# ═══════════════════════════════════════════════════════════════════════════
# ACCOUNTING MODULE MODELS
# ═══════════════════════════════════════════════════════════════════════════

class Invoice(BaseModel):
    """Invoice created automatically from approved orders"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: Optional[int] = None  # رقم الفاتورة (يبدأ من 10001)
    order_id: str                         # مرتبط بالأوردر الأصلي
    order_serial: int                     # نفس سيريال الأوردر
    clinic_id: str
    clinic_name: str                      # للعرض السريع
    created_by: str                       # المندوب الذي أنشأ الأوردر
    created_by_name: str
    approved_by: str                      # المدير الذي اعتمد
    approved_by_name: str
    manager_id: Optional[str] = None      # المدير المباشر
    manager_name: Optional[str] = None
    area_id: Optional[str] = None
    area_name: Optional[str] = None
    line_id: Optional[str] = None
    line_name: Optional[str] = None
    products: List[dict]                  # نفس منتجات الأوردر
    subtotal: float
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    discount_reason: Optional[str] = None
    total_amount: float
    paid_amount: float = 0                # المبلغ المدفوع
    remaining_amount: float               # المبلغ المتبقي
    status: str = "pending"               # pending, partial, paid
    payment_method: Optional[str] = None  # طريقة الدفع الأولية
    payments: List[dict] = Field(default_factory=list)  # قائمة الدفعات
    invoice_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_date: Optional[datetime] = None   # تاريخ استحقاق الدفع
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Payment(BaseModel):
    """Payment record for invoice collection"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payment_number: Optional[int] = None  # رقم الدفعة (يبدأ من 20001)
    invoice_id: str
    invoice_number: int
    clinic_id: str
    clinic_name: str
    amount: float                         # المبلغ المدفوع
    payment_method: PaymentMethod = PaymentMethod.CASH
    payment_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    collected_by: str                     # من قام بالتحصيل
    collected_by_name: str
    receipt_number: Optional[str] = None  # رقم الإيصال
    receipt_url: Optional[str] = None     # صورة الإيصال/الحوالة
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PaymentCreate(BaseModel):
    """Create payment request"""
    invoice_id: str
    amount: float
    payment_method: PaymentMethod = PaymentMethod.CASH
    payment_date: Optional[datetime] = None
    receipt_number: Optional[str] = None
    receipt_url: Optional[str] = None     # صورة الإيصال المرفقة
    notes: Optional[str] = None

class AuditLog(BaseModel):
    """Financial audit log for tracking all accounting operations"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    log_type: AuditLogType
    entity_type: str                      # invoice, payment, expense
    entity_id: str
    entity_serial: Optional[int] = None   # Serial number for reference
    user_id: str                          # من قام بالعملية
    user_name: str
    user_role: str
    action_details: str                   # تفاصيل العملية
    amount: Optional[float] = None
    old_values: Optional[dict] = None     # القيم القديمة (للتعديلات)
    new_values: Optional[dict] = None     # القيم الجديدة
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AccountingAlert(BaseModel):
    """Alert for overdue invoices"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    alert_type: str = "overdue_invoice"   # نوع التنبيه
    invoice_id: str
    invoice_number: int
    clinic_id: str
    clinic_name: str
    amount_due: float
    days_overdue: int
    is_read: bool = False
    created_for: List[str] = Field(default_factory=list)  # User IDs to notify
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ═══════════════════════════════════════════════════════════════════════════
# INSTALLMENT PAYMENT SYSTEM MODELS
# ═══════════════════════════════════════════════════════════════════════════

class InstallmentSchedule(BaseModel):
    """جدول الأقساط للفاتورة"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_id: str
    invoice_number: int
    clinic_id: str
    clinic_name: str
    schedule_type: str  # 'monthly', 'weekly', 'regular', 'custom'
    interval_days: Optional[int] = None  # للدفعات المنتظمة
    total_amount: float
    installments_count: int
    grace_period_days: int = 3
    first_due_date: datetime
    created_by: str
    created_by_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Installment(BaseModel):
    """قسط فردي"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    schedule_id: str
    invoice_id: str
    invoice_number: int
    clinic_id: str
    clinic_name: str
    installment_number: int
    amount: float
    paid_amount: float = 0
    remaining_amount: float
    due_date: datetime
    status: str = "upcoming"  # upcoming/due/grace/overdue/paid/partial
    paid_date: Optional[datetime] = None
    payment_ids: List[str] = Field(default_factory=list)
    reminder_sent: dict = Field(default_factory=dict)  # {'7_days': True, ...}
    rescheduled_from: Optional[datetime] = None
    reschedule_reason: Optional[str] = None
    rescheduled_by: Optional[str] = None
    rescheduled_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClinicCreditScore(BaseModel):
    """التقييم الائتماني للعيادة"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    clinic_id: str
    clinic_name: str
    score: int = 5  # 1-5 stars
    on_time_count: int = 0
    late_count: int = 0
    total_installments: int = 0
    avg_delay_days: float = 0
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WhatsAppSettings(BaseModel):
    """إعدادات إشعارات واتساب"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    enabled: bool = False
    api_provider: str = "ultramsg"  # ultramsg/twilio/custom
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    instance_id: Optional[str] = None
    default_country_code: str = "+20"
    reminder_7_days: bool = True
    reminder_3_days: bool = True
    reminder_due_day: bool = True
    reminder_overdue: bool = True
    message_template_reminder: str = "مرحباً {clinic_name}، تذكير بموعد قسط بقيمة {amount} ج.م مستحق في {due_date} للفاتورة رقم {invoice_number}"
    message_template_overdue: str = "تنبيه: قسط متأخر بقيمة {amount} ج.م للفاتورة رقم {invoice_number}. يرجى السداد في أقرب وقت."
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Helper functions

def get_client_ip(request: Request, external_ip: Optional[str] = None) -> str:
    """Get the best available client IP address with robust fallback chain."""
    # Priority 1: Frontend-provided external IP (most reliable)
    if external_ip and external_ip not in ['127.0.0.1', 'localhost', '::1', '', None]:
        return external_ip
    
    # Priority 2: X-Forwarded-For header (reverse proxy)
    forwarded = request.headers.get('x-forwarded-for', '')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
        if ip and ip not in ['127.0.0.1', 'localhost', '::1']:
            return ip
    
    # Priority 3: X-Real-IP header (nginx)
    real_ip = request.headers.get('x-real-ip', '')
    if real_ip and real_ip not in ['127.0.0.1', 'localhost', '::1']:
        return real_ip
    
    # Priority 4: CF-Connecting-IP (Cloudflare)
    cf_ip = request.headers.get('cf-connecting-ip', '')
    if cf_ip and cf_ip not in ['127.0.0.1', 'localhost', '::1']:
        return cf_ip
    
    # Priority 5: Request client host
    client_ip = request.client.host if request.client else None
    if client_ip and client_ip not in ['127.0.0.1', 'localhost', '::1']:
        return client_ip
    
    # Fallback: Mark as local development
    return "Local Development"

async def get_next_serial_number(entity_type: str, start_from: int = 1) -> int:
    """
    Get the next serial number for an entity type.
    Uses MongoDB counters collection to ensure unique auto-incrementing IDs.
    
    Args:
        entity_type: Type of entity (invoices, payments, orders, visits, expenses)
        start_from: Starting number if no counter exists
    
    Returns:
        Next serial number for the entity type
    """
    result = await db.counters.find_one_and_update(
        {"_id": entity_type},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    
    # If this is a new counter, set it to start_from
    if result and result.get("seq", 0) == 1:
        await db.counters.update_one(
            {"_id": entity_type},
            {"$set": {"seq": start_from}}
        )
        return start_from
    
    # If sequence is less than start_from, reset to start_from
    seq = result.get("seq", start_from)
    if seq < start_from:
        await db.counters.update_one(
            {"_id": entity_type},
            {"$set": {"seq": start_from}}
        )
        return start_from
    
    return seq

def parse_user_agent(user_agent: str) -> dict:
    """Parse user agent string into structured device info."""
    if not user_agent or user_agent == "Unknown":
        return {
            "browser": "Unknown Browser",
            "os": "Unknown OS", 
            "device": "Unknown Device",
            "full": "Unknown"
        }
    
    ua = user_agent.lower()
    
    # Detect browser
    browser = "Unknown Browser"
    if 'edg/' in ua or 'edge/' in ua:
        browser = "Microsoft Edge"
    elif 'chrome/' in ua and 'safari/' in ua:
        browser = "Chrome"
    elif 'firefox/' in ua:
        browser = "Firefox"
    elif 'safari/' in ua and 'chrome' not in ua:
        browser = "Safari"
    elif 'opera' in ua or 'opr/' in ua:
        browser = "Opera"
    elif 'msie' in ua or 'trident/' in ua:
        browser = "Internet Explorer"
    
    # Detect OS
    os_name = "Unknown OS"
    if 'windows nt 10' in ua:
        os_name = "Windows 10/11"
    elif 'windows' in ua:
        os_name = "Windows"
    elif 'mac os x' in ua:
        os_name = "macOS"
    elif 'android' in ua:
        os_name = "Android"
    elif 'iphone' in ua or 'ipad' in ua:
        os_name = "iOS"
    elif 'linux' in ua:
        os_name = "Linux"
    
    # Detect device type
    device = "Desktop"
    if 'mobile' in ua or 'android' in ua and 'mobile' in ua:
        device = "Mobile"
    elif 'tablet' in ua or 'ipad' in ua:
        device = "Tablet"
    
    return {
        "browser": browser,
        "os": os_name,
        "device": device,
        "full": f"{browser} | {os_name} | {device}"
    }

def get_device_info(request: Request, frontend_device_info: Optional[str] = None) -> str:
    """Get formatted device info with robust fallback."""
    # Priority 1: Frontend-provided device info (most detailed)
    if frontend_device_info and frontend_device_info not in ['Unknown', '', None]:
        return frontend_device_info
    
    # Priority 2: Parse user-agent header
    user_agent = request.headers.get("user-agent", "")
    if user_agent:
        parsed = parse_user_agent(user_agent)
        return parsed["full"]
    
    # Fallback
    return "Unknown Device"



# Get next serial number for orders or visits
async def get_next_serial_number(collection_name: str, default_start: int) -> int:
    """Get next auto-increment serial number for a collection."""
    collection = db[collection_name]
    # Find the document with the highest serial_number
    result = await collection.find_one(
        {"serial_number": {"$exists": True, "$ne": None}},
        sort=[("serial_number", -1)]
    )
    if result and result.get("serial_number"):
        return result["serial_number"] + 1
    return default_start

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
@limiter.limit("5/minute")
async def login(credentials: UserLogin, request: Request):
    user = await db.users.find_one({"username": credentials.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated")
    
    # Advanced Activity Logging
    try:
        # Use robust helper functions for IP and device info
        ip_address = get_client_ip(request, credentials.external_ip)
        device_info = get_device_info(request, credentials.device_info)
        
        # Log the Login Event
        log_entry = GPSLog(
            user_id=user["id"],
            latitude=credentials.latitude,
            longitude=credentials.longitude,
            activity_type="LOGIN",
            ip_address=ip_address,
            device_info=device_info,
            metadata={
                "action": "User logged in",
                "username": user.get("username", ""),
                "role": user.get("role", ""),
                "has_gps": bool(credentials.latitude and credentials.longitude)
            }
        )
        doc = log_entry.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        await db.gps_logs.insert_one(doc)
    except Exception as e:
        logger.error(f"Failed to log login activity: {e}")

    # Update last_login timestamp
    try:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
        )
    except Exception as e:
        logger.error(f"Failed to update last_login: {e}")

    access_token = create_access_token({"sub": user["id"], "role": user["role"]})
    
    # Create session entry for session management
    try:
        import hashlib
        token_hash = hashlib.sha256(access_token.encode()).hexdigest()[:32]
        device_info = get_device_info(request, credentials.device_info)
        ip_address = get_client_ip(request, credentials.external_ip)
        
        session_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "token_hash": token_hash,
            "device_info": device_info,
            "ip_address": ip_address,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_activity": datetime.now(timezone.utc).isoformat(),
            "is_active": True,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)).isoformat()
        }
        await db.sessions.insert_one(session_doc)
        logger.info(f"✅ Created session for user {user['username']}")
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
    
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

class LogoutRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None

@api_router.post("/auth/logout")
async def logout(
    logout_data: LogoutRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Log out and record LOGOUT activity with GPS/IP/Device info."""
    try:
        log_entry = GPSLog(
            user_id=current_user["id"],
            latitude=logout_data.latitude,
            longitude=logout_data.longitude,
            activity_type="LOGOUT",
            ip_address=get_client_ip(request),
            device_info=get_device_info(request),
            metadata={
                "action": "User logged out",
                "username": current_user.get("username", ""),
                "role": current_user.get("role", ""),
                "has_gps": bool(logout_data.latitude and logout_data.longitude)
            }
        )
        doc = log_entry.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        await db.gps_logs.insert_one(doc)
    except Exception as e:
        logger.error(f"Failed to log logout activity: {e}")
    
    return {"message": "Logged out successfully"}

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
async def get_users(
    include_deleted: bool = False,
    current_user: dict = Depends(get_current_user)
):
    query = {} if include_deleted else {"$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)
    
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        if isinstance(user.get('last_login'), str):
            user['last_login'] = datetime.fromisoformat(user['last_login'])
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
    
    # Check username uniqueness if being updated
    if "username" in update_data:
        existing = await db.users.find_one({
            "username": update_data["username"],
            "id": {"$ne": user_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="اسم المستخدم مستخدم بالفعل (Username already exists)")
    
    # Hash password if being updated
    if "password" in update_data:
        password = update_data.pop("password")
        if password and len(password) >= 6:
            update_data["password_hash"] = get_password_hash(password)
        else:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Handle empty string values for optional fields (convert to None)
    optional_fields = ["line_id", "area_id", "manager_id"]
    for field in optional_fields:
        if field in update_data and update_data[field] == "":
            update_data[field] = None
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Soft delete a user - sets is_deleted=True instead of removing from DB."""
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "is_active": False
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}

@api_router.post("/users/{user_id}/restore")
async def restore_user(
    user_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Restore a soft-deleted user."""
    result = await db.users.update_one(
        {"id": user_id, "is_deleted": True},
        {"$set": {
            "is_deleted": False,
            "deleted_at": None,
            "is_active": True
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found or not deleted")
    
    return {"message": "User restored successfully"}

@api_router.get("/users/export-csv")
async def export_users_csv(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Export all users to CSV file."""
    users = await db.users.find(
        {"$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]},
        {"_id": 0, "password_hash": 0}
    ).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    headers = ["username", "full_name", "email", "phone", "role", "line_id", "area_id", "manager_id", "is_active", "last_login", "created_at"]
    writer.writerow(headers)
    
    # Data rows
    for user in users:
        row = [
            user.get("username", ""),
            user.get("full_name", ""),
            user.get("email", ""),
            user.get("phone", ""),
            user.get("role", ""),
            user.get("line_id", ""),
            user.get("area_id", ""),
            user.get("manager_id", ""),
            user.get("is_active", True),
            user.get("last_login", ""),
            user.get("created_at", "")
        ]
        writer.writerow(row)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"}
    )

@api_router.post("/users/import-csv")
async def import_users_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Import users from CSV file. Expected columns: username, full_name, email, phone, role, password"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    imported = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            username = row.get('username', '').strip()
            if not username:
                errors.append(f"Row {row_num}: Username is required")
                continue
            
            # Check if user exists
            existing = await db.users.find_one({"username": username})
            if existing:
                errors.append(f"Row {row_num}: User '{username}' already exists")
                continue
            
            password = row.get('password', 'default123').strip() or 'default123'
            
            user_obj = User(
                username=username,
                full_name=row.get('full_name', username).strip() or username,
                email=row.get('email', '').strip() or None,
                phone=row.get('phone', '').strip() or None,
                role=row.get('role', 'medical_rep').strip() or 'medical_rep',
                line_id=row.get('line_id', '').strip() or None,
                area_id=row.get('area_id', '').strip() or None,
                manager_id=row.get('manager_id', '').strip() or None,
            )
            
            doc = user_obj.model_dump()
            doc["password_hash"] = get_password_hash(password)
            doc['created_at'] = doc['created_at'].isoformat()
            
            await db.users.insert_one(doc)
            imported += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return {
        "message": f"Imported {imported} users successfully",
        "imported": imported,
        "errors": errors[:10]  # Return first 10 errors only
    }

@api_router.get("/users/{user_id}/stats")
async def get_user_stats(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get performance stats for a user: visits, orders, expenses totals."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Count visits
    visits_count = await db.visits.count_documents({"medical_rep_id": user_id})
    
    # Count and sum orders
    orders_pipeline = [
        {"$match": {"medical_rep_id": user_id}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$total_amount"}}}
    ]
    orders_result = await db.orders.aggregate(orders_pipeline).to_list(1)
    orders_count = orders_result[0]["count"] if orders_result else 0
    orders_total = orders_result[0]["total"] if orders_result else 0
    
    # Count and sum expenses
    expenses_pipeline = [
        {"$match": {"medical_rep_id": user_id}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$amount"}}}
    ]
    expenses_result = await db.expenses.aggregate(expenses_pipeline).to_list(1)
    expenses_count = expenses_result[0]["count"] if expenses_result else 0
    expenses_total = expenses_result[0]["total"] if expenses_result else 0
    
    return {
        "user_id": user_id,
        "visits_count": visits_count,
        "orders_count": orders_count,
        "orders_total": orders_total,
        "expenses_count": expenses_count,
        "expenses_total": expenses_total
    }

@api_router.get("/users/{user_id}/audit-log")
async def get_user_audit_log(
    user_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    """Get audit log for a user - tracks all modifications."""
    logs = await db.user_audit_logs.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(50).to_list(50)
    
    return logs

# Line Routes
@api_router.post("/lines", response_model=Line)
async def create_line(
    line: LineCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    line_obj = Line(**line.model_dump())
    doc = line_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.lines.insert_one(doc)
    return line_obj

@api_router.get("/lines", response_model=List[Line])
async def get_lines(current_user: dict = Depends(get_current_user)):
    lines = await db.lines.find({}, {"_id": 0}).to_list(1000)
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
    
    area_obj = Area(**area.model_dump())
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
    
    product_obj = Product(**product.model_dump())
    doc = product_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.products.insert_one(doc)
    return product_obj

@api_router.get("/products")
async def get_products(
    line_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get products with pagination."""
    query = {"is_active": True}
    
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        if line_id:
            query["line_id"] = line_id
    else:
        if current_user.get("line_id"):
            query["line_id"] = current_user["line_id"]
        else:
            return {"items": [], "total": 0, "skip": skip, "limit": limit}
    
    total = await db.products.count_documents(query)
    limit = min(limit, 100)
    products = await db.products.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    for product in products:
        if isinstance(product.get('created_at'), str):
            product['created_at'] = datetime.fromisoformat(product['created_at'])
    return {"items": products, "total": total, "skip": skip, "limit": limit}

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
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    clinic_dict = clinic_data.model_dump()
    clinic_dict["created_by"] = current_user["id"]
    
    clinic_obj = Clinic(**clinic_dict)
    doc = clinic_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.clinics.insert_one(doc)
    
    # Log CLINIC Activity with GPS
    try:
        log_entry = GPSLog(
            user_id=current_user["id"],
            latitude=clinic_dict.get("latitude"),
            longitude=clinic_dict.get("longitude"),
            activity_type="CLINIC",
            ip_address=request.client.host,
            device_info=request.headers.get("user-agent", "Unknown"),
            metadata={
                "clinic_id": str(clinic_obj.id),
                "clinic_name": clinic_dict.get("name", ""),
                "doctor_name": clinic_dict.get("doctor_name", ""),
                "address": clinic_dict.get("address", ""),
                "specialty": clinic_dict.get("specialty", "")
            }
        )
        log_doc = log_entry.model_dump()
        log_doc['timestamp'] = log_doc['timestamp'].isoformat()
        await db.gps_logs.insert_one(log_doc)
    except Exception as e:
        logger.error(f"Failed to log clinic activity: {e}")
    
    return clinic_obj

@api_router.get("/clinics")
async def get_clinics(
    line_id: Optional[str] = None,
    area_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get clinics with pagination and role-based filtering."""
    query = {}
    
    # Role-based filtering
    if current_user["role"] in [UserRole.GM.value, UserRole.MANAGER.value]:
        if current_user.get("line_id"):
            query["line_id"] = current_user["line_id"]
    elif current_user["role"] == UserRole.MEDICAL_REP.value:
        if current_user.get("line_id"):
            query["line_id"] = current_user["line_id"]
        if current_user.get("area_id"):
            query["area_id"] = current_user["area_id"]
    
    # Additional filters
    if line_id:
        query["line_id"] = line_id
    if area_id:
        query["area_id"] = area_id
    
    total = await db.clinics.count_documents(query)
    limit = min(limit, 100)
    clinics = await db.clinics.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    for clinic in clinics:
        if isinstance(clinic.get('created_at'), str):
            clinic['created_at'] = datetime.fromisoformat(clinic['created_at'])
    return {"items": clinics, "total": total, "skip": skip, "limit": limit}

@api_router.get("/clinics/{clinic_id}", response_model=Clinic)
async def get_clinic(clinic_id: str, current_user: dict = Depends(get_current_user)):
    clinic = await db.clinics.find_one({"id": clinic_id}, {"_id": 0})
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    if isinstance(clinic.get('created_at'), str):
        clinic['created_at'] = datetime.fromisoformat(clinic['created_at'])
    return clinic

@api_router.put("/clinics/{clinic_id}")
async def update_clinic(
    clinic_id: str,
    clinic_update: ClinicCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing clinic (Super Admin only)"""
    if current_user.get("role") not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لتعديل العيادات")
    
    # Check clinic exists
    existing = await db.clinics.find_one({"id": clinic_id})
    if not existing:
        raise HTTPException(status_code=404, detail="العيادة غير موجودة")
    
    # Update clinic
    update_data = clinic_update.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.clinics.update_one({"id": clinic_id}, {"$set": update_data})
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "clinic_updated",
        "entity_type": "clinic",
        "entity_id": clinic_id,
        "performed_by": current_user.get("id"),
        "performed_by_name": current_user.get("full_name", current_user.get("username")),
        "details": {"clinic_name": update_data.get("name", existing.get("name"))},
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "تم تحديث العيادة بنجاح"}

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
    request: Request,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    visit_dict = visit_data.model_dump()
    visit_dict["medical_rep_id"] = current_user["id"]
    
    # Assign serial number
    visit_dict["serial_number"] = await get_next_serial_number("visits", 5005)
    
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
    
    # Auto-create Order if embedded_order is provided and has products
    embedded_order_id = None
    if visit_dict.get("embedded_order") and visit_dict["embedded_order"].get("products"):
        embedded = visit_dict["embedded_order"]
        products = embedded.get("products", [])
        
        if products:
            # Calculate total
            total_amount = sum(p.get("price", 0) * p.get("quantity", 1) for p in products)
            
            # Apply discount
            discount_value = embedded.get("discount_value", 0)
            discount_type = embedded.get("discount_type", "percentage")
            if discount_type == "percentage":
                total_amount = total_amount - (total_amount * discount_value / 100)
            else:
                total_amount = total_amount - discount_value
            total_amount = max(0, total_amount)
            
            # Determine order type based on visit reason
            order_type = "demo" if visit_dict.get("visit_reason") == "product_demo" else "regular"
            
            # Create Order
            order_id = str(uuid.uuid4())
            order_serial = await get_next_serial_number("orders", 1001)
            
            order_doc = {
                "id": order_id,
                "serial_number": order_serial,
                "clinic_id": visit_dict["clinic_id"],
                "medical_rep_id": current_user["id"],
                "order_type": order_type,
                "products": products,
                "discount_type": discount_type if discount_value > 0 else None,
                "discount_value": discount_value if discount_value > 0 else None,
                "discount_reason": f"Created from visit #{visit_obj.serial_number}",
                "total_amount": total_amount,
                "payment_method": embedded.get("payment_method", "cash"),
                "payment_status": "pending",
                "status": "pending_approval",
                "notes": f"تم إنشاء هذا الطلب تلقائياً من الزيارة #{visit_obj.serial_number}",
                "visit_id": visit_obj.id,  # Link to visit
                "history": [{
                    "action": "created",
                    "user_id": current_user["id"],
                    "user_name": current_user.get("full_name", ""),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "details": f"Auto-created from visit"
                }],
                "comments": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "synced": True
            }
            
            await db.orders.insert_one(order_doc)
            embedded_order_id = order_id
            
            # Update visit with the order ID
            await db.visits.update_one(
                {"id": visit_obj.id},
                {"$set": {"embedded_order_id": order_id}}
            )
            
            logger.info(f"Auto-created order {order_id} from visit {visit_obj.id}")


    # Log Activity with enhanced metadata
    try:
        # Get clinic name for metadata
        clinic_info = await db.clinics.find_one({"id": visit_dict["clinic_id"]}, {"_id": 0, "name": 1, "doctor_name": 1})
        clinic_name = clinic_info.get("name", "Unknown") if clinic_info else "Unknown"
        doctor_name = clinic_info.get("doctor_name", "") if clinic_info else ""
        
        log_entry = GPSLog(
            user_id=current_user["id"],
            latitude=visit_dict.get("latitude"),
            longitude=visit_dict.get("longitude"),
            activity_type="VISIT",
            ip_address=get_client_ip(request),
            device_info=get_device_info(request),
            metadata={
                "action": "Created visit",
                "visit_id": str(visit_obj.id),
                "clinic_id": visit_dict["clinic_id"],
                "clinic_name": clinic_name,
                "doctor_name": doctor_name,
                "visit_reason": visit_dict.get("visit_reason", ""),
                "visit_result": visit_dict.get("visit_result", ""),
                "notes": visit_dict.get("notes", "")[:100] if visit_dict.get("notes") else "",
                "has_gps": bool(visit_dict.get("latitude") and visit_dict.get("longitude")),
                "rep_name": current_user.get("full_name", "")
            }
        )
        log_doc = log_entry.model_dump()
        log_doc['timestamp'] = log_doc['timestamp'].isoformat()
        await db.gps_logs.insert_one(log_doc)
    except Exception as e:
        logger.error(f"Failed to log visit activity: {e}")

    return visit_obj

@api_router.get("/visits", response_model=List[Visit])
async def get_visits(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get visits with pagination. Default limit=50, max=200."""
    limit = min(limit, 200)  # Cap at 200
    
    if current_user["role"] == UserRole.SUPER_ADMIN.value:
        visits = await db.visits.find({}, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    elif current_user["role"] == UserRole.MEDICAL_REP.value:
        visits = await db.visits.find(
            {"medical_rep_id": current_user["id"]},
            {"_id": 0}
        ).skip(skip).limit(limit).to_list(limit)
    else:
        visits = await db.visits.find(
            {},
            {"_id": 0}
        ).skip(skip).limit(limit).to_list(limit)
    
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

# ============== Visit Chat Endpoints ==============

class VisitCommentCreate(BaseModel):
    content: str

@api_router.post("/visits/{visit_id}/comments")
async def add_visit_comment(
    visit_id: str,
    comment_data: VisitCommentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a comment to a visit (Visit Chat)."""
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("full_name", "Unknown"),
        "content": comment_data.content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.visits.update_one(
        {"id": visit_id},
        {"$push": {"comments": comment}}
    )
    
    return comment

@api_router.delete("/visits/{visit_id}/comments/{comment_id}")
async def delete_visit_comment(
    visit_id: str,
    comment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a comment from a visit."""
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    
    # Check if user owns the comment or is admin
    comments = visit.get("comments", [])
    comment = next((c for c in comments if c.get("id") == comment_id), None)
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment["user_id"] != current_user["id"] and current_user["role"] not in ["super_admin", "gm"]:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    
    await db.visits.update_one(
        {"id": visit_id},
        {"$pull": {"comments": {"id": comment_id}}}
    )
    
    return {"message": "Comment deleted successfully"}

# ============== Smart Reminders Endpoints ==============

@api_router.get("/reminders/smart")
async def get_smart_reminders(
    current_user: dict = Depends(get_current_user)
):
    """Get smart reminders for the current user based on their role."""
    reminders = []
    today = datetime.now(timezone.utc).date()
    
    # For Medical Reps: Follow-up visits due today or overdue
    if current_user["role"] in ["medical_rep", "super_admin", "gm"]:
        user_filter = {}
        if current_user["role"] == "medical_rep":
            user_filter = {"medical_rep_id": current_user["id"]}
        
        # Follow-up reminders
        follow_ups = await db.visits.find({
            **user_filter,
            "follow_up_date": {"$lte": datetime.now(timezone.utc).isoformat()}
        }).to_list(100)
        
        for visit in follow_ups:
            clinic = await db.clinics.find_one({"id": visit.get("clinic_id")}, {"_id": 0, "name": 1})
            reminders.append({
                "id": str(uuid.uuid4()),
                "type": "follow_up",
                "priority": "high",
                "title": "متابعة مطلوبة",
                "message": f"موعد المتابعة مع {clinic.get('name', 'عيادة')} اليوم أو فات موعده",
                "entity_type": "visit",
                "entity_id": visit.get("id"),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # For Managers: Pending approvals (plans, orders, expenses)
    if current_user["role"] in ["manager", "gm", "super_admin"]:
        # Pending plans
        pending_plans = await db.plans.count_documents({"status": "pending_approval"})
        if pending_plans > 0:
            reminders.append({
                "id": str(uuid.uuid4()),
                "type": "pending_approval",
                "priority": "medium",
                "title": "خطط بانتظار الموافقة",
                "message": f"يوجد {pending_plans} خطة بانتظار موافقتك",
                "entity_type": "plan",
                "entity_id": None,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Pending orders
        pending_orders = await db.orders.count_documents({"status": "pending_approval"})
        if pending_orders > 0:
            reminders.append({
                "id": str(uuid.uuid4()),
                "type": "pending_approval",
                "priority": "high",
                "title": "طلبات بانتظار الموافقة",
                "message": f"يوجد {pending_orders} طلب بانتظار موافقتك",
                "entity_type": "order",
                "entity_id": None,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Pending expenses
        pending_expenses = await db.expenses.count_documents({"status": "pending"})
        if pending_expenses > 0:
            reminders.append({
                "id": str(uuid.uuid4()),
                "type": "pending_approval",
                "priority": "medium",
                "title": "مصروفات بانتظار الموافقة",
                "message": f"يوجد {pending_expenses} مصروف بانتظار موافقتك",
                "entity_type": "expense",
                "entity_id": None,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # Today's planned visits from Plans module
    if current_user["role"] == "medical_rep":
        current_month = today.month
        current_year = today.year
        
        plans = await db.plans.find({
            "user_id": current_user["id"],
            "month": current_month,
            "year": current_year,
            "status": {"$in": ["approved", "active"]}
        }).to_list(10)
        
        for plan in plans:
            for pv in plan.get("planned_visits", []):
                scheduled_date = pv.get("scheduled_date", "")
                if isinstance(scheduled_date, str) and scheduled_date.startswith(str(today)):
                    clinic = await db.clinics.find_one({"id": pv.get("clinic_id")}, {"_id": 0, "name": 1})
                    if not pv.get("is_completed"):
                        reminders.append({
                            "id": str(uuid.uuid4()),
                            "type": "planned_visit",
                            "priority": "high",
                            "title": "زيارة مخططة اليوم",
                            "message": f"لديك زيارة مخططة لـ {clinic.get('name', 'عيادة')} اليوم",
                            "entity_type": "planned_visit",
                            "entity_id": pv.get("id"),
                            "created_at": datetime.now(timezone.utc).isoformat()
                        })
    
    return {"reminders": reminders, "count": len(reminders)}

# Order Routes

@api_router.post("/orders", response_model=Order)
async def create_order(
    order_data: OrderCreate,
    request: Request,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    order_dict = order_data.model_dump()
    order_dict["medical_rep_id"] = current_user["id"]
    
    # Assign serial number
    order_dict["serial_number"] = await get_next_serial_number("orders", 1001)
    
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
    
    # Log Activity with enhanced metadata
    try:
        # Get clinic info for metadata
        clinic_info = await db.clinics.find_one({"id": order_dict["clinic_id"]}, {"_id": 0, "name": 1, "latitude": 1, "longitude": 1})
        clinic_name = clinic_info.get("name", "Unknown") if clinic_info else "Unknown"
        clinic_lat = clinic_info.get("latitude") if clinic_info else None
        clinic_lng = clinic_info.get("longitude") if clinic_info else None
        
        items_count = len(order_dict.get("products", []))
        
        log_entry = GPSLog(
            user_id=current_user["id"],
            latitude=clinic_lat,  # Use clinic location as order location
            longitude=clinic_lng,
            activity_type="ORDER",
            ip_address=get_client_ip(request),
            device_info=get_device_info(request),
            metadata={
                "action": "Created order",
                "order_id": str(order_obj.id),
                "serial_number": order_dict.get("serial_number"),
                "clinic_id": order_dict["clinic_id"],
                "clinic_name": clinic_name,
                "total_amount": order_dict.get("total_amount", 0),
                "items_count": items_count,
                "status": order_dict.get("status", "pending"),
                "has_gps": bool(clinic_lat and clinic_lng),
                "rep_name": current_user.get("full_name", "")
            }
        )
        log_doc = log_entry.model_dump()
        log_doc['timestamp'] = log_doc['timestamp'].isoformat()
        await db.gps_logs.insert_one(log_doc)
    except Exception as e:
        logger.error(f"Failed to log order activity: {e}")

    # Notify managers/GM about pending order
    try:
        clinic = await db.clinics.find_one({"id": order_dict["clinic_id"]}, {"_id": 0, "name": 1})
        clinic_name = clinic.get("name", "Unknown Clinic") if clinic else "Unknown Clinic"
        
        # Find managers and GMs to notify
        managers = await db.users.find({
            "role": {"$in": ["manager", "gm", "super_admin"]},
            "is_active": True
        }, {"_id": 0, "id": 1}).to_list(100)
        
        for manager in managers:
            await create_notification(
                user_id=manager["id"],
                type=NotificationType.ORDER_PENDING,
                title="طلب جديد بانتظار الموافقة",
                message=f"طلب جديد من {current_user.get('full_name', 'مندوب')} للعيادة {clinic_name}",
                data={"order_id": order_obj.id}
            )
    except Exception as e:
        logger.error(f"Failed to send order notifications: {e}")

    return order_obj

@api_router.get("/orders")
async def get_orders(
    status: Optional[str] = None,
    clinic_id: Optional[str] = None,
    rep_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get orders with role-based access, advanced filtering, and pagination."""
    query = {}
    
    # Role-based visibility
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        # Medical rep sees only their own orders
        query["medical_rep_id"] = current_user["id"]
    elif current_user["role"] == UserRole.MANAGER.value:
        # Manager sees their team's orders
        team_members = await db.users.find(
            {"manager_id": current_user["id"]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        team_ids = [member["id"] for member in team_members]
        team_ids.append(current_user["id"])  # Include manager's own orders
        query["medical_rep_id"] = {"$in": team_ids}
    elif current_user["role"] == UserRole.ACCOUNTANT.value:
        # Accountant sees all APPROVED orders only (for invoicing)
        query["status"] = {"$in": ["approved", "processing", "shipped", "delivered"]}
    # GM and Super Admin see all orders (no filter needed)
    
    # Apply filters
    if status:
        query["status"] = status
    
    if clinic_id:
        query["clinic_id"] = clinic_id
    
    if rep_id and current_user["role"] in [UserRole.SUPER_ADMIN.value, UserRole.GM.value, UserRole.MANAGER.value]:
        query["medical_rep_id"] = rep_id
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query["order_date"] = query.get("order_date", {})
            query["order_date"]["$gte"] = start_dt
        except:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if "order_date" not in query:
                query["order_date"] = {}
            query["order_date"]["$lte"] = end_dt
        except:
            pass
    
    # Get total count for pagination
    total = await db.orders.count_documents(query)
    
    # Limit max to 100 for performance
    limit = min(limit, 100)
    
    orders = await db.orders.find(query, {"_id": 0}).sort("order_date", -1).skip(skip).limit(limit).to_list(limit)
    
    # Search filter (apply in Python for flexibility)
    if search:
        search_lower = search.lower()
        filtered_orders = []
        for order in orders:
            # Search in products
            products_match = any(
                search_lower in str(p.get("name", "")).lower() 
                for p in order.get("products", [])
            )
            # Search in order ID
            id_match = search_lower in order.get("id", "").lower()
            if products_match or id_match:
                filtered_orders.append(order)
        orders = filtered_orders
    
    # Parse dates
    for order in orders:
        if isinstance(order.get('created_at'), str):
            order['created_at'] = datetime.fromisoformat(order['created_at'])
        if isinstance(order.get('order_date'), str):
            order['order_date'] = datetime.fromisoformat(order['order_date'])
        # Ensure history and comments exist
        if 'history' not in order:
            order['history'] = []
        if 'comments' not in order:
            order['comments'] = []
    
    return {"items": orders, "total": total, "skip": skip, "limit": limit}

@api_router.get("/orders/analytics")
async def get_order_analytics(
    current_user: dict = Depends(get_current_user)
):
    """Get order analytics for dashboard."""
    from datetime import timedelta
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)
    
    # Build base query based on role
    base_query = {}
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        base_query["medical_rep_id"] = current_user["id"]
    elif current_user["role"] == UserRole.MANAGER.value:
        team_members = await db.users.find(
            {"manager_id": current_user["id"]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        team_ids = [m["id"] for m in team_members] + [current_user["id"]]
        base_query["medical_rep_id"] = {"$in": team_ids}
    
    # Get all orders for the user's scope
    all_orders = await db.orders.find(base_query, {"_id": 0, "order_date": 1, "total_amount": 1, "status": 1}).to_list(10000)
    
    # Calculate stats
    today_orders = 0
    week_orders = 0
    month_orders = 0
    today_amount = 0
    week_amount = 0
    month_amount = 0
    status_counts = {}
    
    for order in all_orders:
        order_date = order.get("order_date")
        if isinstance(order_date, str):
            order_date = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
        
        amount = order.get("total_amount", 0) or 0
        status = order.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        
        if order_date and order_date >= today_start:
            today_orders += 1
            today_amount += amount
        if order_date and order_date >= week_start:
            week_orders += 1
            week_amount += amount
        if order_date and order_date >= month_start:
            month_orders += 1
            month_amount += amount
    
    return {
        "total_orders": len(all_orders),
        "total_revenue": sum(o.get("total_amount", 0) or 0 for o in all_orders),
        "today": {"count": today_orders, "revenue": today_amount},
        "this_week": {"count": week_orders, "revenue": week_amount},
        "this_month": {"count": month_orders, "revenue": month_amount},
        "by_status": status_counts
    }

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
        pass  # GM can see all orders
    
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



@api_router.post("/orders/{order_id}/approve")
async def approve_order(
    order_id: str,
    request: Request,
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
    
    # ═══════════════════════════════════════════════════════════════════════════
    # AUTO-CREATE INVOICE IN ACCOUNTING SYSTEM
    # ═══════════════════════════════════════════════════════════════════════════
    try:
        # Get the updated order with approval info
        updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        await create_invoice_from_order(updated_order, current_user, request)
        logger.info(f"✅ Created invoice for approved order {order_id}")
    except Exception as e:
        logger.error(f"❌ Failed to create invoice for order {order_id}: {e}")
        # Don't fail the approval if invoice creation fails - it can be retried
    
    # Notify the rep that their order was approved
    try:
        await create_notification(
            user_id=existing_order["medical_rep_id"],
            type=NotificationType.ORDER_APPROVED,
            title="تم قبول طلبك ✅",
            message=f"تمت الموافقة على طلبك بواسطة {current_user.get('full_name', 'المدير')}",
            data={"order_id": order_id}
        )
        # Send push notification
        await send_push_notification(
            user_id=existing_order["medical_rep_id"],
            title="✅ تم قبول طلبك",
            body=f"تمت الموافقة على طلب #{existing_order.get('serial_number', '')}",
            data={"order_id": order_id, "type": "order_approved", "url": f"/orders/{order_id}"}
        )
    except Exception as e:
        logger.error(f"Failed to notify rep about approval: {e}")

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
    
    # Notify the rep that their order was rejected
    try:
        await create_notification(
            user_id=existing_order["medical_rep_id"],
            type=NotificationType.ORDER_REJECTED,
            title="تم رفض طلبك ❌",
            message=f"تم رفض طلبك. السبب: {rejection_reason}",
            data={"order_id": order_id}
        )
        # Send push notification
        await send_push_notification(
            user_id=existing_order["medical_rep_id"],
            title="❌ تم رفض طلبك",
            body=f"طلب #{existing_order.get('serial_number', '')} - السبب: {rejection_reason[:50]}",
            data={"order_id": order_id, "type": "order_rejected", "url": f"/orders/{order_id}"}
        )
    except Exception as e:
        logger.error(f"Failed to notify rep about rejection: {e}")

    return {"message": "Order rejected successfully"}

# ========== Enhanced Order Features ==========

# Duplicate Order - Create a copy of an existing order
@api_router.post("/orders/{order_id}/duplicate")
async def duplicate_order(
    order_id: str,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    """Create a new order as a copy of an existing one with updated prices."""
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check access
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_order["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only duplicate your own orders")
    
    # Get current product prices
    updated_products = []
    for product in existing_order.get("products", []):
        current_product = await db.products.find_one({"id": product.get("product_id")}, {"_id": 0})
        if current_product:
            updated_products.append({
                "product_id": product.get("product_id"),
                "name": current_product.get("name", product.get("name")),
                "quantity": product.get("quantity", 1),
                "price": current_product.get("price", product.get("price", 0))
            })
    
    # Calculate new totals
    subtotal = sum(p.get("quantity", 1) * p.get("price", 0) for p in updated_products)
    discount = 0
    if existing_order.get("discount_type") and existing_order.get("discount_value"):
        if existing_order["discount_type"] == "percentage":
            discount = subtotal * (existing_order["discount_value"] / 100)
        else:
            discount = existing_order["discount_value"]
    total = max(0, subtotal - discount)
    
    # Create new order
    new_order = Order(
        clinic_id=existing_order["clinic_id"],
        medical_rep_id=current_user["id"],
        order_type=existing_order.get("order_type", "regular"),
        products=updated_products,
        subtotal=subtotal,
        discount_type=existing_order.get("discount_type"),
        discount_value=existing_order.get("discount_value"),
        discount_reason=existing_order.get("discount_reason"),
        total_amount=total if existing_order.get("order_type") != "demo" else 0,
        status=OrderStatus.DRAFT,
        notes=f"Duplicated from order {order_id}",
        history=[{
            "action": "duplicated",
            "user_id": current_user["id"],
            "user_name": current_user.get("full_name", "Unknown"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": f"Duplicated from order {order_id}"
        }]
    )
    
    doc = new_order.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['order_date'] = doc['order_date'].isoformat()
    await db.orders.insert_one(doc)
    
    return {"message": "Order duplicated successfully", "new_order_id": new_order.id}

# Reorder - Create a new order from a delivered order
@api_router.post("/orders/{order_id}/reorder")
async def reorder(
    order_id: str,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    """Create a new order from a previously delivered order."""
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check access
    if current_user["role"] == UserRole.MEDICAL_REP.value and existing_order["medical_rep_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only reorder your own orders")
    
    # Get current product prices
    updated_products = []
    for product in existing_order.get("products", []):
        current_product = await db.products.find_one({"id": product.get("product_id")}, {"_id": 0})
        if current_product:
            updated_products.append({
                "product_id": product.get("product_id"),
                "name": current_product.get("name", product.get("name")),
                "quantity": product.get("quantity", 1),
                "price": current_product.get("price", product.get("price", 0))
            })
    
    # Calculate new totals
    subtotal = sum(p.get("quantity", 1) * p.get("price", 0) for p in updated_products)
    total = subtotal if existing_order.get("order_type") != "demo" else 0
    
    # Create new order
    new_order = Order(
        clinic_id=existing_order["clinic_id"],
        medical_rep_id=current_user["id"],
        order_type=existing_order.get("order_type", "regular"),
        products=updated_products,
        subtotal=subtotal,
        total_amount=total,
        status=OrderStatus.DRAFT,
        notes=f"Reordered from order {order_id}",
        history=[{
            "action": "reordered",
            "user_id": current_user["id"],
            "user_name": current_user.get("full_name", "Unknown"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": f"Reordered from order {order_id}"
        }]
    )
    
    doc = new_order.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['order_date'] = doc['order_date'].isoformat()
    await db.orders.insert_one(doc)
    
    return {"message": "Order created successfully", "new_order_id": new_order.id}

# Add Comment to Order
class CommentCreate(BaseModel):
    content: str

@api_router.post("/orders/{order_id}/comments")
async def add_order_comment(
    order_id: str,
    comment_data: CommentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add an internal comment to an order."""
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check access - rep can only comment on own orders, managers on team orders
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        if existing_order["medical_rep_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only comment on your own orders")
    elif current_user["role"] == UserRole.MANAGER.value:
        order_rep = await db.users.find_one({"id": existing_order["medical_rep_id"]}, {"_id": 0})
        if order_rep and order_rep.get("manager_id") != current_user["id"]:
            if existing_order["medical_rep_id"] != current_user["id"]:
                raise HTTPException(status_code=403, detail="You can only comment on your team's orders")
    
    new_comment = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("full_name", "Unknown"),
        "content": comment_data.content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {"comments": new_comment}}
    )
    
    return {"message": "Comment added successfully", "comment": new_comment}

# Update Order Status (for managers - processing, shipped, delivered)
class StatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

@api_router.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: str,
    status_data: StatusUpdate,
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    """Update order status with history tracking."""
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Validate status transition
    valid_statuses = [s.value for s in OrderStatus]
    if status_data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Valid statuses: {valid_statuses}")
    
    old_status = existing_order.get("status", "unknown")
    
    # Add history entry
    history_entry = {
        "action": "status_changed",
        "user_id": current_user["id"],
        "user_name": current_user.get("full_name", "Unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "old_status": old_status,
        "new_status": status_data.status,
        "details": status_data.notes
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {"status": status_data.status},
            "$push": {"history": history_entry}
        }
    )
    
    return {"message": f"Order status updated to {status_data.status}"}

# Order Analytics
@api_router.get("/orders/analytics")
async def get_order_analytics(
    current_user: dict = Depends(get_current_user)
):
    """Get order analytics and statistics."""
    query = {}
    
    # Role-based visibility
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        query["medical_rep_id"] = current_user["id"]
    elif current_user["role"] == UserRole.MANAGER.value:
        team_members = await db.users.find(
            {"manager_id": current_user["id"]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        team_ids = [member["id"] for member in team_members]
        team_ids.append(current_user["id"])
        query["medical_rep_id"] = {"$in": team_ids}
    
    # Get all orders for analytics
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    # Calculate time periods
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)
    
    # Initialize counters
    stats = {
        "total_orders": len(orders),
        "total_revenue": 0,
        "today": {"count": 0, "revenue": 0},
        "this_week": {"count": 0, "revenue": 0},
        "this_month": {"count": 0, "revenue": 0},
        "by_status": {},
        "top_products": {},
        "top_clinics": {}
    }
    
    for order in orders:
        amount = order.get("total_amount", 0) or 0
        stats["total_revenue"] += amount
        
        # Count by status
        status = order.get("status", "unknown")
        stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
        
        # Parse order date
        order_date = order.get("order_date")
        if isinstance(order_date, str):
            try:
                order_date = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
            except:
                order_date = None
        
        if order_date:
            if order_date >= today_start:
                stats["today"]["count"] += 1
                stats["today"]["revenue"] += amount
            if order_date >= week_start:
                stats["this_week"]["count"] += 1
                stats["this_week"]["revenue"] += amount
            if order_date >= month_start:
                stats["this_month"]["count"] += 1
                stats["this_month"]["revenue"] += amount
        
        # Count products
        for product in order.get("products", []):
            product_name = product.get("name", "Unknown")
            qty = product.get("quantity", 1)
            stats["top_products"][product_name] = stats["top_products"].get(product_name, 0) + qty
        
        # Count by clinic
        clinic_id = order.get("clinic_id")
        if clinic_id:
            stats["top_clinics"][clinic_id] = stats["top_clinics"].get(clinic_id, 0) + 1
    
    # Sort and limit top products/clinics
    stats["top_products"] = dict(sorted(stats["top_products"].items(), key=lambda x: x[1], reverse=True)[:10])
    
    # Get clinic names
    top_clinic_ids = list(stats["top_clinics"].keys())[:10]
    clinics = await db.clinics.find({"id": {"$in": top_clinic_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(10)
    clinic_map = {c["id"]: c["name"] for c in clinics}
    
    stats["top_clinics"] = [
        {"clinic_id": cid, "clinic_name": clinic_map.get(cid, "Unknown"), "count": count}
        for cid, count in sorted(stats["top_clinics"].items(), key=lambda x: x[1], reverse=True)[:10]
    ]
    
    return stats

# Migration endpoint to add serial numbers to old orders/visits
@api_router.post("/admin/migrate-serial-numbers")
async def migrate_serial_numbers(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """One-time migration to add serial numbers to old orders and visits."""
    result = {"orders_updated": 0, "visits_updated": 0}
    
    # Migrate Orders (starting from 1001)
    orders = await db.orders.find(
        {"$or": [{"serial_number": None}, {"serial_number": {"$exists": False}}]},
        {"_id": 1, "id": 1}
    ).sort("created_at", 1).to_list(None)
    
    highest_order = await db.orders.find_one(
        {"serial_number": {"$exists": True, "$ne": None}},
        sort=[("serial_number", -1)]
    )
    next_serial = (highest_order.get("serial_number", 1000) if highest_order else 1000) + 1
    
    for order in orders:
        await db.orders.update_one(
            {"_id": order["_id"]},
            {"$set": {"serial_number": next_serial}}
        )
        next_serial += 1
        result["orders_updated"] += 1
    
    # Migrate Visits (starting from 5005)
    visits = await db.visits.find(
        {"$or": [{"serial_number": None}, {"serial_number": {"$exists": False}}]},
        {"_id": 1, "id": 1}
    ).sort("created_at", 1).to_list(None)
    
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
        next_visit_serial += 1
        result["visits_updated"] += 1
    
    return {"message": "Migration complete", **result}

# Expense Routes
@api_router.post("/expenses", response_model=Expense)
async def create_expense(
    expense_data: ExpenseCreate,
    request: Request,
    current_user: dict = Depends(require_role([UserRole.MEDICAL_REP, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    expense_dict = expense_data.model_dump()
    expense_dict["medical_rep_id"] = current_user["id"]
    
    # Generate serial number (starts from 3001)
    serial_number = await get_next_serial_number("expenses", 3001)
    expense_dict["serial_number"] = serial_number
    expense_dict["submitted_at"] = datetime.now(timezone.utc)
    
    expense_obj = Expense(**expense_dict)
    doc = expense_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['expense_date'] = doc['expense_date'].isoformat()
    doc['submitted_at'] = doc['submitted_at'].isoformat() if doc.get('submitted_at') else None
    
    await db.expenses.insert_one(doc)
    
    # Log Activity with enhanced metadata
    try:
        log_entry = GPSLog(
            user_id=current_user["id"],
            latitude=None,
            longitude=None,
            activity_type="EXPENSE",
            ip_address=get_client_ip(request),
            device_info=get_device_info(request),
            metadata={
                "action": "Created expense",
                "expense_id": str(expense_obj.id),
                "serial_number": serial_number,
                "amount": expense_dict["amount"],
                "category": expense_dict.get("category", ""),
                "expense_type": expense_dict.get("expense_type", ""),
                "description": expense_dict.get("description", "")[:100] if expense_dict.get("description") else "",
                "status": expense_dict.get("status", "pending"),
                "rep_name": current_user.get("full_name", "")
            }
        )
        log_doc = log_entry.model_dump()
        log_doc['timestamp'] = log_doc['timestamp'].isoformat()
        await db.gps_logs.insert_one(log_doc)
    except Exception as e:
        logger.error(f"Failed to log expense activity: {e}")

    return expense_obj

@api_router.get("/expenses")
async def get_expenses(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get expenses based on user role with pagination and enriched data."""
    query = {}
    
    if current_user["role"] == UserRole.SUPER_ADMIN.value or current_user["role"] == UserRole.GM.value:
        # Admin/GM sees all expenses
        pass  # No filter
    elif current_user["role"] == UserRole.MANAGER.value:
        # Manager sees only their team's expenses
        team_members = await db.users.find(
            {"manager_id": current_user["id"], "$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        team_ids = [m["id"] for m in team_members]
        team_ids.append(current_user["id"])
        query["medical_rep_id"] = {"$in": team_ids}
    else:
        # Medical rep sees only their own expenses
        query["medical_rep_id"] = current_user["id"]
    
    total = await db.expenses.count_documents(query)
    limit = min(limit, 100)
    expenses = await db.expenses.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with submitter and reviewer info
    for expense in expenses:
        # Add submitter name
        submitter = await db.users.find_one({"id": expense.get("medical_rep_id")}, {"_id": 0, "full_name": 1})
        expense["submitter_name"] = submitter.get("full_name", "Unknown") if submitter else "Unknown"
        
        # Add reviewer name if reviewed
        if expense.get("reviewed_by"):
            reviewer = await db.users.find_one({"id": expense.get("reviewed_by")}, {"_id": 0, "full_name": 1})
            expense["reviewer_name"] = reviewer.get("full_name", "Unknown") if reviewer else "Unknown"
        
        # Handle datetime conversions
        if isinstance(expense.get('created_at'), str):
            expense['created_at'] = datetime.fromisoformat(expense['created_at'])
        if isinstance(expense.get('expense_date'), str):
            expense['expense_date'] = datetime.fromisoformat(expense['expense_date'])
        if isinstance(expense.get('reviewed_at'), str):
            expense['reviewed_at'] = datetime.fromisoformat(expense['reviewed_at'])
    return {"items": expenses, "total": total, "skip": skip, "limit": limit}

# Manager Expense Approval Routes - MUST come before /{expense_id} routes
@api_router.get("/expenses/pending-approval")
async def get_pending_expenses(
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    """Get pending expenses for manager approval."""
    if current_user["role"] == UserRole.MANAGER.value:
        # Get team members
        team_members = await db.users.find(
            {"manager_id": current_user["id"], "$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        team_ids = [m["id"] for m in team_members]
        
        expenses = await db.expenses.find(
            {"medical_rep_id": {"$in": team_ids}, "status": "pending"},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    else:
        # Super admin/GM sees all pending
        expenses = await db.expenses.find(
            {"status": "pending"},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    
    # Enrich with user info
    for expense in expenses:
        user = await db.users.find_one({"id": expense.get("medical_rep_id")}, {"_id": 0, "full_name": 1})
        expense["submitter_name"] = user.get("full_name", "Unknown") if user else "Unknown"
        # Handle datetime conversions
        if isinstance(expense.get('created_at'), str):
            expense['created_at'] = datetime.fromisoformat(expense['created_at'])
        if isinstance(expense.get('expense_date'), str):
            expense['expense_date'] = datetime.fromisoformat(expense['expense_date'])
        if isinstance(expense.get('submitted_at'), str):
            expense['submitted_at'] = datetime.fromisoformat(expense['submitted_at'])
    
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
    """Update an expense. Only pending expenses can be edited by the submitter."""
    existing_expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not existing_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Medical reps can only update their own pending expenses
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        if existing_expense["medical_rep_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only update your own expenses")
        if existing_expense.get("status") != "pending":
            raise HTTPException(status_code=403, detail="Cannot edit expense after it has been reviewed")
    
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
    """Delete an expense. Only pending expenses can be deleted by the submitter."""
    existing_expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not existing_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Medical reps can only delete their own pending expenses
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        if existing_expense["medical_rep_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only delete your own expenses")
        if existing_expense.get("status") != "pending":
            raise HTTPException(status_code=403, detail="Cannot delete expense after it has been reviewed")
    
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}

# Expense Receipt Upload
@api_router.post("/expenses/upload-receipt")
async def upload_expense_receipt(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload receipt image for expense claim - uploads to S3 in production"""
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only images and PDF allowed.")
    
    # Read file content
    file_content = await file.read()
    
    # Upload to S3 (or local fallback)
    file_url = await upload_file_to_s3(file_content, f"receipt_{file.filename}", file.content_type)
    
    return {"url": file_url, "filename": file.filename}

class ExpenseApprovalRequest(BaseModel):
    rejection_reason: Optional[str] = None

@api_router.post("/expenses/{expense_id}/approve")
async def approve_expense(
    expense_id: str,
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    """Approve an expense claim."""
    expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Expense is not pending approval")
    
    # Update expense
    update_data = {
        "status": "approved",
        "reviewed_by": current_user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat()
    }
    await db.expenses.update_one({"id": expense_id}, {"$set": update_data})
    
    # Create notification for the submitter
    try:
        notification = Notification(
            user_id=expense["medical_rep_id"],
            type=NotificationType.SYSTEM,
            title="Expense Approved",
            message=f"Your expense #{expense.get('serial_number', 'N/A')} ({expense.get('expense_type')}) for {expense.get('amount')} has been approved.",
            data={"expense_id": expense_id}
        )
        notif_doc = notification.model_dump()
        notif_doc['created_at'] = notif_doc['created_at'].isoformat()
        await db.notifications.insert_one(notif_doc)
    except Exception as e:
        logger.error(f"Failed to create expense approval notification: {e}")
    
    return {"message": "Expense approved successfully", "expense_id": expense_id}

@api_router.post("/expenses/{expense_id}/reject")
async def reject_expense(
    expense_id: str,
    approval_data: ExpenseApprovalRequest,
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    """Reject an expense claim with reason."""
    expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Expense is not pending approval")
    
    # Update expense
    update_data = {
        "status": "rejected",
        "reviewed_by": current_user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": approval_data.rejection_reason or "No reason provided"
    }
    await db.expenses.update_one({"id": expense_id}, {"$set": update_data})
    
    # Create notification for the submitter
    try:
        notification = Notification(
            user_id=expense["medical_rep_id"],
            type=NotificationType.SYSTEM,
            title="Expense Rejected",
            message=f"Your expense #{expense.get('serial_number', 'N/A')} ({expense.get('expense_type')}) has been rejected. Reason: {approval_data.rejection_reason or 'No reason provided'}",
            data={"expense_id": expense_id}
        )
        notif_doc = notification.model_dump()
        notif_doc['created_at'] = notif_doc['created_at'].isoformat()
        await db.notifications.insert_one(notif_doc)
    except Exception as e:
        logger.error(f"Failed to create expense rejection notification: {e}")
    
    return {"message": "Expense rejected", "expense_id": expense_id}

# GPS Tracking Routes
@api_router.post("/gps-logs", response_model=GPSLog)
async def create_gps_log(
    gps_data: GPSLogCreate,
    current_user: dict = Depends(get_current_user)
):
    gps_dict = gps_data.model_dump()
    gps_dict["user_id"] = current_user["id"]
    
    gps_obj = GPSLog(**gps_dict)
    doc = gps_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    await db.gps_logs.insert_one(doc)
    return gps_obj

@api_router.get("/gps-logs", response_model=List[GPSLog])
async def get_gps_logs(
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Get GPS/Activity logs with optional date range filter."""
    limit = min(limit, 500)  # Cap at 500
    query = {}
    if user_id:
        query["user_id"] = user_id
    
    # Date range filter
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date
    
    logs = await db.gps_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    for log in logs:
        if isinstance(log.get('timestamp'), str):
            log['timestamp'] = datetime.fromisoformat(log['timestamp'])
    return logs

@api_router.get("/gps-logs/export-csv")
async def export_gps_logs_csv(
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Export GPS activity logs to CSV file."""
    query = {}
    if user_id:
        query["user_id"] = user_id
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date
    
    logs = await db.gps_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(10000)
    
    # Get user names for lookup
    users = await db.users.find({}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
    user_names = {u["id"]: u.get("full_name", "Unknown") for u in users}
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    headers = ["timestamp", "user_name", "activity_type", "latitude", "longitude", "ip_address", "device_info", "metadata"]
    writer.writerow(headers)
    
    for log in logs:
        row = [
            log.get("timestamp", ""),
            user_names.get(log.get("user_id"), "Unknown"),
            log.get("activity_type", ""),
            log.get("latitude", ""),
            log.get("longitude", ""),
            log.get("ip_address", ""),
            log.get("device_info", "")[:50] if log.get("device_info") else "",
            str(log.get("metadata", ""))[:100]
        ]
        writer.writerow(row)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gps_activity_logs.csv"}
    )

@api_router.get("/gps-logs/heatmap")
async def get_gps_heatmap_data(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    """Get GPS coordinates for heatmap visualization."""
    query = {"latitude": {"$ne": None}, "longitude": {"$ne": None}}
    
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date
    
    logs = await db.gps_logs.find(
        query,
        {"_id": 0, "latitude": 1, "longitude": 1, "activity_type": 1}
    ).to_list(5000)
    
    # Format for heatmap: [[lat, lng, intensity], ...]
    heatmap_data = []
    for log in logs:
        if log.get("latitude") and log.get("longitude"):
            heatmap_data.append([
                log["latitude"],
                log["longitude"],
                1.0  # Intensity (can adjust based on activity_type)
            ])
    
    return {
        "points": heatmap_data,
        "count": len(heatmap_data)
    }

@api_router.get("/gps-logs/inactivity")
async def get_inactive_users(
    hours_threshold: int = 8,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    """Get users who have been inactive for more than X hours."""
    hours_threshold = min(hours_threshold, 72)  # Cap at 72 hours
    threshold_time = datetime.now(timezone.utc) - timedelta(hours=hours_threshold)
    threshold_iso = threshold_time.isoformat()
    
    # Get all active medical reps
    active_reps = await db.users.find(
        {"role": "medical_rep", "is_active": True, "$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]},
        {"_id": 0, "id": 1, "full_name": 1, "last_login": 1}
    ).to_list(1000)
    
    inactive_users = []
    
    for rep in active_reps:
        # Get last activity
        last_activity = await db.gps_logs.find_one(
            {"user_id": rep["id"]},
            {"_id": 0, "timestamp": 1, "activity_type": 1},
            sort=[("timestamp", -1)]
        )
        
        is_inactive = True
        last_activity_time = None
        last_activity_type = None
        
        if last_activity:
            ts = last_activity.get("timestamp")
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if ts and ts > threshold_time:
                is_inactive = False
            last_activity_time = ts.isoformat() if ts else None
            last_activity_type = last_activity.get("activity_type")
        
        if is_inactive:
            inactive_users.append({
                "user_id": rep["id"],
                "full_name": rep.get("full_name", "Unknown"),
                "last_activity_time": last_activity_time,
                "last_activity_type": last_activity_type,
                "hours_inactive": round((datetime.now(timezone.utc) - (ts if ts else threshold_time)).total_seconds() / 3600, 1) if last_activity else None
            })
    
    return {
        "threshold_hours": hours_threshold,
        "inactive_count": len(inactive_users),
        "inactive_users": inactive_users
    }

# ===================== ANALYTICS API =====================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS points in kilometers using Haversine formula."""
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371  # Earth's radius in kilometers
    
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c

@api_router.get("/analytics/distance-report")
async def get_distance_report(
    user_id: Optional[str] = None,
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.MANAGER]))
):
    """Get distance traveled and time at locations report for a rep."""
    # Build query
    query = {"latitude": {"$ne": None}, "longitude": {"$ne": None}}
    
    if user_id:
        query["user_id"] = user_id
    elif current_user["role"] == UserRole.MANAGER.value:
        # Get team members
        team = await db.users.find({"manager_id": current_user["id"]}, {"id": 1}).to_list(100)
        query["user_id"] = {"$in": [t["id"] for t in team]}
    
    # Date filtering
    if date:
        query["timestamp"] = {"$gte": f"{date}T00:00:00", "$lte": f"{date}T23:59:59"}
    elif start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date
    
    # Get logs sorted by timestamp
    logs = await db.gps_logs.find(
        query,
        {"_id": 0, "user_id": 1, "latitude": 1, "longitude": 1, "timestamp": 1, "activity_type": 1}
    ).sort([("user_id", 1), ("timestamp", 1)]).to_list(5000)
    
    # Group by user
    user_logs = {}
    for log in logs:
        uid = log["user_id"]
        if uid not in user_logs:
            user_logs[uid] = []
        user_logs[uid].append(log)
    
    # Calculate metrics per user
    results = []
    user_names = {u["id"]: u.get("full_name", "Unknown") for u in await db.users.find({}, {"id": 1, "full_name": 1}).to_list(1000)}
    
    for uid, ulogs in user_logs.items():
        total_distance = 0
        visit_count = 0
        locations = []
        
        # Calculate distance between consecutive points
        for i in range(1, len(ulogs)):
            prev = ulogs[i-1]
            curr = ulogs[i]
            
            if prev.get("latitude") and prev.get("longitude") and curr.get("latitude") and curr.get("longitude"):
                dist = haversine_distance(
                    prev["latitude"], prev["longitude"],
                    curr["latitude"], curr["longitude"]
                )
                # Only count reasonable distances (< 100km between points)
                if dist < 100:
                    total_distance += dist
            
            if curr.get("activity_type") == "VISIT":
                visit_count += 1
        
        # Get unique locations visited
        for log in ulogs:
            if log.get("activity_type") == "VISIT":
                locations.append({
                    "lat": log["latitude"],
                    "lng": log["longitude"],
                    "time": log["timestamp"]
                })
        
        results.append({
            "user_id": uid,
            "user_name": user_names.get(uid, "Unknown"),
            "total_distance_km": round(total_distance, 2),
            "visit_count": visit_count,
            "total_activities": len(ulogs),
            "locations": locations[:20]  # Limit to 20
        })
    
    return {
        "date": date or f"{start_date} to {end_date}",
        "reports": results,
        "total_users": len(results)
    }

@api_router.get("/analytics/rep-performance")
async def get_rep_performance(
    user_id: Optional[str] = None,
    period: str = "week",  # day, week, month
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.MANAGER]))
):
    """Get rep performance KPIs: visits/day, orders value, coverage rate, approval rate."""
    # Calculate date range based on period
    now = datetime.now(timezone.utc)
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        days = 1
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        days = 30
    else:  # week
        start = now - timedelta(days=7)
        days = 7
    
    start_iso = start.isoformat()
    
    # Get user filter
    user_filter = {}
    if user_id:
        user_filter["user_id"] = user_id
    elif current_user["role"] == UserRole.MANAGER.value:
        team = await db.users.find({"manager_id": current_user["id"]}, {"id": 1}).to_list(100)
        user_filter["user_id"] = {"$in": [t["id"] for t in team]}
    elif current_user["role"] == UserRole.MEDICAL_REP.value:
        user_filter["user_id"] = current_user["id"]
    
    # Get all medical reps
    rep_query = {"role": "medical_rep", "is_active": True}
    if user_id:
        rep_query["id"] = user_id
    elif current_user["role"] == UserRole.MANAGER.value:
        rep_query["manager_id"] = current_user["id"]
    
    reps = await db.users.find(rep_query, {"_id": 0, "id": 1, "full_name": 1}).to_list(100)
    
    # Get total clinics for coverage calculation
    total_clinics = await db.clinics.count_documents({})
    
    results = []
    
    for rep in reps:
        rep_id = rep["id"]
        
        # Visits count
        visits = await db.visits.count_documents({
            "created_by": rep_id,
            "created_at": {"$gte": start_iso}
        })
        
        # Orders stats
        orders = await db.orders.find({
            "medical_rep_id": rep_id,
            "created_at": {"$gte": start_iso}
        }, {"_id": 0, "status": 1, "total_amount": 1}).to_list(1000)
        
        total_orders = len(orders)
        approved_orders = sum(1 for o in orders if o.get("status") in ["approved", "delivered", "shipped"])
        total_order_value = sum(o.get("total_amount", 0) for o in orders)
        approval_rate = (approved_orders / total_orders * 100) if total_orders > 0 else 0
        
        # Clinics visited (unique)
        visited_clinics = await db.visits.distinct("clinic_id", {
            "created_by": rep_id,
            "created_at": {"$gte": start_iso}
        })
        coverage_rate = (len(visited_clinics) / total_clinics * 100) if total_clinics > 0 else 0
        
        # Active hours (from GPS logs)
        gps_logs = await db.gps_logs.find({
            "user_id": rep_id,
            "timestamp": {"$gte": start_iso}
        }, {"timestamp": 1}).to_list(5000)
        
        # Estimate active hours from log timestamps
        active_hours = 0
        if len(gps_logs) > 1:
            first_log = gps_logs[0].get("timestamp")
            last_log = gps_logs[-1].get("timestamp")
            if first_log and last_log:
                if isinstance(first_log, str):
                    first_log = datetime.fromisoformat(first_log.replace("Z", "+00:00"))
                if isinstance(last_log, str):
                    last_log = datetime.fromisoformat(last_log.replace("Z", "+00:00"))
                active_hours = (last_log - first_log).total_seconds() / 3600
        
        results.append({
            "user_id": rep_id,
            "user_name": rep.get("full_name", "Unknown"),
            "period": period,
            "kpis": {
                "visits_total": visits,
                "visits_per_day": round(visits / days, 1),
                "orders_total": total_orders,
                "orders_value": round(total_order_value, 2),
                "approval_rate": round(approval_rate, 1),
                "clinics_visited": len(visited_clinics),
                "coverage_rate": round(coverage_rate, 1),
                "active_hours": round(active_hours, 1)
            }
        })
    
    # Sort by visits
    results.sort(key=lambda x: x["kpis"]["visits_total"], reverse=True)
    
    return {
        "period": period,
        "start_date": start_iso,
        "total_clinics": total_clinics,
        "reps": results
    }

@api_router.get("/analytics/dashboard-summary")
async def get_dashboard_summary(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.MANAGER]))
):
    """Get overall dashboard summary with key metrics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    # Today's metrics
    visits_today = await db.visits.count_documents({"created_at": {"$gte": today_start}})
    orders_today = await db.orders.count_documents({"created_at": {"$gte": today_start}})
    
    # Week metrics
    visits_week = await db.visits.count_documents({"created_at": {"$gte": week_start}})
    orders_week = await db.orders.count_documents({"created_at": {"$gte": week_start}})
    
    # Month metrics
    orders_month = await db.orders.find(
        {"created_at": {"$gte": month_start}},
        {"total_amount": 1}
    ).to_list(10000)
    total_revenue_month = sum(o.get("total_amount", 0) for o in orders_month)
    
    # Active reps today
    active_reps = await db.gps_logs.distinct("user_id", {"timestamp": {"$gte": today_start}})
    
    # Pending approvals
    pending_orders = await db.orders.count_documents({"status": "pending_approval"})
    pending_expenses = await db.expenses.count_documents({"status": "pending"})
    
    return {
        "today": {
            "visits": visits_today,
            "orders": orders_today,
            "active_reps": len(active_reps)
        },
        "week": {
            "visits": visits_week,
            "orders": orders_week
        },
        "month": {
            "orders": len(orders_month),
            "revenue": round(total_revenue_month, 2)
        },
        "pending": {
            "orders": pending_orders,
            "expenses": pending_expenses
        },
        "timestamp": now.isoformat()
    }

# ===================== LIVE TRACKING API =====================

# In-memory store for live locations (for demo - in production use Redis)
live_locations_cache = {}

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None

@api_router.post("/live-locations/update")
async def update_live_location(
    location: LocationUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Update current user's live location (called by mobile app)."""
    user_id = current_user["id"]
    
    # Store in cache
    live_locations_cache[user_id] = {
        "user_id": user_id,
        "user_name": current_user.get("full_name", "Unknown"),
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "speed": location.speed,
        "heading": location.heading,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "is_online": True
    }
    
    # Also log to GPS logs for history
    try:
        log_entry = GPSLog(
            user_id=user_id,
            latitude=location.latitude,
            longitude=location.longitude,
            activity_type="TRACKING",
            ip_address=get_client_ip(request),
            device_info=get_device_info(request),
            metadata={"accuracy": location.accuracy, "speed": location.speed}
        )
        doc = log_entry.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        await db.gps_logs.insert_one(doc)
    except Exception as e:
        logger.error(f"Failed to log tracking update: {e}")
    
    return {"message": "Location updated", "timestamp": live_locations_cache[user_id]["timestamp"]}

@api_router.get("/live-locations")
async def get_live_locations(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.MANAGER]))
):
    """Get all live rep locations for the tracking map."""
    now = datetime.now(timezone.utc)
    stale_threshold = now - timedelta(minutes=10)  # Consider offline after 10 min
    
    # Get from cache first
    locations = []
    for user_id, loc in live_locations_cache.items():
        loc_time = datetime.fromisoformat(loc["timestamp"].replace("Z", "+00:00"))
        loc["is_online"] = loc_time > stale_threshold
        locations.append(loc)
    
    # If cache is empty, get recent GPS logs
    if not locations:
        recent_logs = await db.gps_logs.aggregate([
            {"$match": {"latitude": {"$ne": None}, "longitude": {"$ne": None}}},
            {"$sort": {"timestamp": -1}},
            {"$group": {
                "_id": "$user_id",
                "latitude": {"$first": "$latitude"},
                "longitude": {"$first": "$longitude"},
                "timestamp": {"$first": "$timestamp"},
                "activity_type": {"$first": "$activity_type"}
            }},
            {"$limit": 100}
        ]).to_list(100)
        
        # Get user names
        user_ids = [log["_id"] for log in recent_logs]
        users = await db.users.find(
            {"id": {"$in": user_ids}, "role": "medical_rep"},
            {"_id": 0, "id": 1, "full_name": 1}
        ).to_list(100)
        user_map = {u["id"]: u.get("full_name", "Unknown") for u in users}
        
        for log in recent_logs:
            if log["_id"] in user_map:  # Only include medical reps
                loc_time = log["timestamp"]
                if isinstance(loc_time, str):
                    loc_time = datetime.fromisoformat(loc_time.replace("Z", "+00:00"))
                
                locations.append({
                    "user_id": log["_id"],
                    "user_name": user_map.get(log["_id"], "Unknown"),
                    "latitude": log["latitude"],
                    "longitude": log["longitude"],
                    "timestamp": log["timestamp"] if isinstance(log["timestamp"], str) else log["timestamp"].isoformat(),
                    "is_online": loc_time > stale_threshold,
                    "last_activity": log.get("activity_type", "UNKNOWN")
                })
    
    # Filter by manager's team if manager
    if current_user["role"] == UserRole.MANAGER.value:
        team = await db.users.find({"manager_id": current_user["id"]}, {"id": 1}).to_list(100)
        team_ids = [t["id"] for t in team]
        locations = [loc for loc in locations if loc["user_id"] in team_ids]
    
    return {
        "locations": locations,
        "count": len(locations),
        "online_count": sum(1 for loc in locations if loc.get("is_online")),
        "timestamp": now.isoformat()
    }

@api_router.get("/live-locations/{user_id}")
async def get_user_live_location(
    user_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.MANAGER]))
):
    """Get specific user's live location."""
    # Check from cache first
    if user_id in live_locations_cache:
        return live_locations_cache[user_id]
    
    # Fallback to last GPS log
    last_log = await db.gps_logs.find_one(
        {"user_id": user_id, "latitude": {"$ne": None}},
        {"_id": 0},
        sort=[("timestamp", -1)]
    )
    
    if not last_log:
        raise HTTPException(status_code=404, detail="No location data for this user")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "full_name": 1})
    
    return {
        "user_id": user_id,
        "user_name": user.get("full_name", "Unknown") if user else "Unknown",
        "latitude": last_log["latitude"],
        "longitude": last_log["longitude"],
        "timestamp": last_log["timestamp"],
        "is_online": False,
        "last_activity": last_log.get("activity_type")
    }

@api_router.post("/gps-settings", response_model=GPSSettings)
async def create_gps_settings(
    settings_data: GPSSettingsCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    existing_settings = await db.gps_settings.find_one({})
    if existing_settings:
        raise HTTPException(status_code=400, detail="GPS settings already exist")
    
    settings_dict = settings_data.model_dump()
    
    settings_obj = GPSSettings(**settings_dict)
    doc = settings_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.gps_settings.insert_one(doc)
    return settings_obj

@api_router.get("/gps-settings")
async def get_gps_settings(current_user: dict = Depends(get_current_user)):
    settings = await db.gps_settings.find_one({}, {"_id": 0})
    if not settings:
        default_settings = {
            "id": str(uuid.uuid4()),
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
    existing_settings = await db.gps_settings.find_one({}, {"_id": 0})
    
    if not existing_settings:
        create_data = GPSSettingsCreate(**{k: v for k, v in settings_data.model_dump().items() if v is not None})
        return await create_gps_settings(create_data, current_user)
    
    # Build update data from provided settings
    update_data = {k: v for k, v in settings_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.gps_settings.update_one({}, {"$set": update_data})
    
    updated_settings = await db.gps_settings.find_one({}, {"_id": 0})
    if isinstance(updated_settings.get('created_at'), str):
        updated_settings['created_at'] = datetime.fromisoformat(updated_settings['created_at'])
    if isinstance(updated_settings.get('updated_at'), str):
        updated_settings['updated_at'] = datetime.fromisoformat(updated_settings['updated_at'])
    
    return updated_settings

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get role-specific dashboard statistics."""
    role = current_user["role"]
    user_id = current_user["id"]
    
    # Medical Rep - Personal stats only
    if role == UserRole.MEDICAL_REP.value:
        # Get clinics in user's area
        user_data = await db.users.find_one({"id": user_id}, {"_id": 0, "area_id": 1, "line_id": 1})
        clinic_query = {}
        if user_data and user_data.get("area_id"):
            clinic_query["area_id"] = user_data["area_id"]
        
        clinics_count = await db.clinics.count_documents(clinic_query)
        visits_count = await db.visits.count_documents({"medical_rep_id": user_id})
        orders_count = await db.orders.count_documents({"medical_rep_id": user_id, "status": "approved"})
        pending_orders = await db.orders.count_documents({"medical_rep_id": user_id, "status": "pending_approval"})
        expenses_count = await db.expenses.count_documents({"medical_rep_id": user_id})
        
        # Today's stats
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_iso = today.isoformat()
        visits_today = await db.visits.count_documents({"medical_rep_id": user_id, "created_at": {"$gte": today_iso}})
        
        return {
            "role": "medical_rep",
            "clinics_available": clinics_count,
            "total_visits": visits_count,
            "visits_today": visits_today,
            "orders_completed": orders_count,
            "orders_pending": pending_orders,
            "expenses_submitted": expenses_count
        }
    
    # Manager - Team stats
    elif role == UserRole.MANAGER.value:
        # Get team members
        team_members = await db.users.find(
            {"manager_id": user_id, "role": "medical_rep", "$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        team_ids = [m["id"] for m in team_members]
        
        team_size = len(team_ids)
        team_visits = await db.visits.count_documents({"medical_rep_id": {"$in": team_ids}})
        team_orders = await db.orders.count_documents({"medical_rep_id": {"$in": team_ids}})
        pending_approvals = await db.orders.count_documents({"medical_rep_id": {"$in": team_ids}, "status": "pending_approval"})
        
        # Today's team performance
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_iso = today.isoformat()
        team_visits_today = await db.visits.count_documents({"medical_rep_id": {"$in": team_ids}, "created_at": {"$gte": today_iso}})
        
        return {
            "role": "manager",
            "team_size": team_size,
            "team_visits": team_visits,
            "team_visits_today": team_visits_today,
            "team_orders": team_orders,
            "pending_approvals": pending_approvals
        }
    
    # Super Admin / GM - Full system stats
    else:
        total_users = await db.users.count_documents({"$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]})
        active_reps = await db.users.count_documents({"role": "medical_rep", "is_active": True, "$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]})
        total_clinics = await db.clinics.count_documents({})
        total_visits = await db.visits.count_documents({})
        total_orders = await db.orders.count_documents({})
        pending_orders = await db.orders.count_documents({"status": "pending_approval"})
        pending_expenses = await db.expenses.count_documents({"status": "pending"})
        
        # Today's stats
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_iso = today.isoformat()
        visits_today = await db.visits.count_documents({"created_at": {"$gte": today_iso}})
        orders_today = await db.orders.count_documents({"created_at": {"$gte": today_iso}})
        
        # This week stats
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        week_iso = week_ago.isoformat()
        visits_week = await db.visits.count_documents({"created_at": {"$gte": week_iso}})
        orders_week = await db.orders.count_documents({"created_at": {"$gte": week_iso}})
        
        # Revenue calculation
        revenue_pipeline = [
            {"$match": {"status": "approved"}},
            {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
        ]
        revenue_result = await db.orders.aggregate(revenue_pipeline).to_list(1)
        total_revenue = revenue_result[0]["total"] if revenue_result else 0
        
        return {
            "role": "super_admin",
            "total_users": total_users,
            "active_reps": active_reps,
            "total_clinics": total_clinics,
            "total_visits": total_visits,
            "visits_today": visits_today,
            "visits_week": visits_week,
            "total_orders": total_orders,
            "orders_today": orders_today,
            "orders_week": orders_week,
            "pending_orders": pending_orders,
            "pending_expenses": pending_expenses,
            "total_revenue": total_revenue
        }

@api_router.get("/dashboard/analytics")
async def get_dashboard_analytics(
    days: int = 7,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    """Get analytics data for dashboard charts - visits and orders per day."""
    days = min(days, 30)  # Cap at 30 days
    
    # Calculate date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)
    start_iso = start_date.isoformat()
    
    # Aggregate visits by day
    visits_pipeline = [
        {"$match": {"created_at": {"$gte": start_iso}}},
        {"$addFields": {
            "date_str": {"$substr": ["$created_at", 0, 10]}
        }},
        {"$group": {
            "_id": "$date_str",
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    # Aggregate orders by day
    orders_pipeline = [
        {"$match": {"created_at": {"$gte": start_iso}}},
        {"$addFields": {
            "date_str": {"$substr": ["$created_at", 0, 10]}
        }},
        {"$group": {
            "_id": "$date_str",
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    visits_data = await db.visits.aggregate(visits_pipeline).to_list(100)
    orders_data = await db.orders.aggregate(orders_pipeline).to_list(100)
    
    # Build combined daily data
    visits_by_date = {v["_id"]: v["count"] for v in visits_data}
    orders_by_date = {o["_id"]: o["count"] for o in orders_data}
    
    # Generate all dates in range
    daily_data = []
    current = start_date
    while current <= end_date:
        date_key = current.strftime("%Y-%m-%d")
        daily_data.append({
            "date": date_key,
            "visits": visits_by_date.get(date_key, 0),
            "orders": orders_by_date.get(date_key, 0)
        })
        current += timedelta(days=1)
    
    return {
        "period": f"{days} days",
        "daily": daily_data,
        "totals": {
            "visits": sum(v["count"] for v in visits_data),
            "orders": sum(o["count"] for o in orders_data)
        }
    }

@api_router.get("/dashboard/top-performers")
async def get_top_performers(
    limit: int = 5,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.MANAGER]))
):
    """Get top performing medical reps by visit count."""
    limit = min(limit, 10)
    
    # Get user IDs to filter (for manager, only their team)
    user_filter = {"role": "medical_rep", "$or": [{"is_deleted": {"$ne": True}}, {"is_deleted": {"$exists": False}}]}
    if current_user["role"] == UserRole.MANAGER.value:
        user_filter["manager_id"] = current_user["id"]
    
    # Aggregate visits per user
    pipeline = [
        {"$group": {"_id": "$medical_rep_id", "visit_count": {"$sum": 1}}},
        {"$sort": {"visit_count": -1}},
        {"$limit": limit}
    ]
    
    visit_counts = await db.visits.aggregate(pipeline).to_list(limit)
    
    # Get user details
    top_performers = []
    for vc in visit_counts:
        user = await db.users.find_one({"id": vc["_id"]}, {"_id": 0, "id": 1, "full_name": 1})
        if user:
            # Get order count too
            order_count = await db.orders.count_documents({"medical_rep_id": vc["_id"]})
            top_performers.append({
                "user_id": user["id"],
                "name": user.get("full_name", "Unknown"),
                "visits": vc["visit_count"],
                "orders": order_count
            })
    
    return {"performers": top_performers}

@api_router.get("/dashboard/recent-activities")
async def get_recent_activities(
    limit: int = 10,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    """Get recent system activities for admin dashboard with full details."""
    limit = min(limit, 20)
    
    activities = []
    
    # Recent visits with full details
    recent_visits = await db.visits.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for visit in recent_visits:
        user = await db.users.find_one({"id": visit.get("medical_rep_id")}, {"_id": 0, "full_name": 1, "phone": 1})
        clinic = await db.clinics.find_one({"id": visit.get("clinic_id")}, {"_id": 0, "name": 1, "address": 1, "doctor_name": 1})
        activities.append({
            "id": visit.get("id"),
            "type": "visit",
            "title": f"Visit to {clinic.get('name', 'Unknown Clinic') if clinic else 'Unknown Clinic'}",
            "description": f"{user.get('full_name', 'User') if user else 'User'} visited {clinic.get('name', 'clinic') if clinic else 'clinic'}",
            "timestamp": visit.get("created_at"),
            "icon": "MapPin",
            "details": {
                "visit_id": visit.get("id"),
                "user_name": user.get("full_name") if user else "Unknown",
                "user_phone": user.get("phone") if user else None,
                "clinic_name": clinic.get("name") if clinic else "Unknown",
                "clinic_address": clinic.get("address") if clinic else None,
                "doctor_name": clinic.get("doctor_name") if clinic else None,
                "visit_reason": visit.get("visit_reason"),
                "visit_result": visit.get("visit_result"),
                "notes": visit.get("notes"),
                "latitude": visit.get("latitude"),
                "longitude": visit.get("longitude"),
                "visit_date": visit.get("visit_date"),
                "created_at": visit.get("created_at")
            }
        })
    
    # Recent orders with full details
    recent_orders = await db.orders.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for order in recent_orders:
        user = await db.users.find_one({"id": order.get("medical_rep_id")}, {"_id": 0, "full_name": 1, "phone": 1})
        clinic = await db.clinics.find_one({"id": order.get("clinic_id")}, {"_id": 0, "name": 1, "address": 1})
        
        # Get product names
        products_details = []
        for product in order.get("products", []):
            prod_info = await db.products.find_one({"id": product.get("product_id")}, {"_id": 0, "name": 1})
            products_details.append({
                "name": prod_info.get("name") if prod_info else product.get("product_id"),
                "quantity": product.get("quantity"),
                "price": product.get("price")
            })
        
        activities.append({
            "id": order.get("id"),
            "type": "order",
            "title": f"Order for {clinic.get('name', 'Unknown') if clinic else 'Unknown'}",
            "description": f"{user.get('full_name', 'User') if user else 'User'} created order ({order.get('total_amount', 0):.2f} EGP)",
            "timestamp": order.get("created_at"),
            "status": order.get("status"),
            "icon": "ShoppingCart",
            "details": {
                "order_id": order.get("id"),
                "user_name": user.get("full_name") if user else "Unknown",
                "user_phone": user.get("phone") if user else None,
                "clinic_name": clinic.get("name") if clinic else "Unknown",
                "clinic_address": clinic.get("address") if clinic else None,
                "status": order.get("status"),
                "subtotal": order.get("subtotal"),
                "discount_type": order.get("discount_type"),
                "discount_value": order.get("discount_value"),
                "total_amount": order.get("total_amount"),
                "products": products_details,
                "notes": order.get("notes"),
                "approved_by": order.get("approved_by"),
                "approved_at": order.get("approved_at"),
                "rejection_reason": order.get("rejection_reason"),
                "created_at": order.get("created_at")
            }
        })
    
    # Recent expenses with full details
    recent_expenses = await db.expenses.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for expense in recent_expenses:
        user = await db.users.find_one({"id": expense.get("medical_rep_id")}, {"_id": 0, "full_name": 1})
        activities.append({
            "id": expense.get("id"),
            "type": "expense",
            "title": f"Expense: {expense.get('expense_type', 'General')}",
            "description": f"{user.get('full_name', 'User') if user else 'User'} submitted expense ({expense.get('amount', 0):.2f} EGP)",
            "timestamp": expense.get("created_at"),
            "status": expense.get("status"),
            "icon": "Receipt",
            "details": {
                "expense_id": expense.get("id"),
                "user_name": user.get("full_name") if user else "Unknown",
                "expense_type": expense.get("expense_type"),
                "amount": expense.get("amount"),
                "description": expense.get("description"),
                "receipt_url": expense.get("receipt_url"),
                "status": expense.get("status"),
                "expense_date": expense.get("expense_date"),
                "created_at": expense.get("created_at")
            }
        })
    
    # Sort all by timestamp
    activities.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    return {"activities": activities[:limit]}

# Site Settings Routes
@api_router.get("/site-settings", response_model=SiteSettings)
async def get_site_settings():
    """Get site settings - publicly accessible for branding"""
    settings = await db.site_settings.find_one({}, {"_id": 0})
    
    if not settings:
        # Create default settings
        default_settings = SiteSettings()
        doc = default_settings.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.site_settings.insert_one(doc)
        return default_settings
    
    # Convert datetime strings
    if isinstance(settings.get('created_at'), str):
        settings['created_at'] = datetime.fromisoformat(settings['created_at'])
    if isinstance(settings.get('updated_at'), str):
        settings['updated_at'] = datetime.fromisoformat(settings['updated_at'])
    
    return settings

@api_router.put("/site-settings", response_model=SiteSettings)
async def update_site_settings(
    settings_data: SiteSettingsUpdate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Update site settings - super admin only"""
    existing_settings = await db.site_settings.find_one({}, {"_id": 0})
    
    if not existing_settings:
        # Create first
        create_data = {k: v for k, v in settings_data.model_dump().items() if v is not None}
        new_settings = SiteSettings(**create_data)
        doc = new_settings.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.site_settings.insert_one(doc)
        return new_settings
    
    # Update existing
    update_data = {k: v for k, v in settings_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.site_settings.update_one({}, {"$set": update_data})
    
    updated_settings = await db.site_settings.find_one({}, {"_id": 0})
    if isinstance(updated_settings.get('created_at'), str):
        updated_settings['created_at'] = datetime.fromisoformat(updated_settings['created_at'])
    if isinstance(updated_settings.get('updated_at'), str):
        updated_settings['updated_at'] = datetime.fromisoformat(updated_settings['updated_at'])
    
    return updated_settings

# System Health Endpoint - Professional Real-Time Monitoring
@api_router.get("/system-health")
async def get_system_health(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Get comprehensive system health status with real-time metrics - super admin only"""
    logger.info("System health endpoint called")
    
    try:
        import platform
        import time
        logger.info("Platform and time imported successfully")
    except Exception as import_error:
        logger.error(f"Failed to import platform/time: {import_error}")
        return {"status": "error", "error": f"Import error: {str(import_error)}"}
    
    try:
        import psutil
        logger.info("Psutil imported successfully")
    except Exception as psutil_error:
        logger.error(f"Failed to import psutil: {psutil_error}")
        return {"status": "error", "error": f"Psutil import error: {str(psutil_error)}"}
    
    start_time = time.time()
    logger.info("Starting system health check")
    
    try:
        # Measure Database Ping/Latency
        db_start = time.time()
        db_status = "connected"
        db_latency_ms = 0
        try:
            await db.command("ping")
            db_latency_ms = round((time.time() - db_start) * 1000, 2)
        except Exception as db_error:
            db_status = "disconnected"
            db_latency_ms = -1
        
        # Get collection counts (with timing) - with error handling for missing collections
        count_start = time.time()
        try:
            users_count = await db.users.count_documents({})
        except:
            users_count = 0
        try:
            orders_count = await db.orders.count_documents({})
        except:
            orders_count = 0
        try:
            visits_count = await db.visits.count_documents({})
        except:
            visits_count = 0
        try:
            clinics_count = await db.clinics.count_documents({})
        except:
            clinics_count = 0
        try:
            expenses_count = await db.expenses.count_documents({})
        except:
            expenses_count = 0
        try:
            products_count = await db.products.count_documents({})
        except:
            products_count = 0
        try:
            gps_logs_count = await db.gps_logs.count_documents({})
        except:
            gps_logs_count = 0
        query_time_ms = round((time.time() - count_start) * 1000, 2)
        
        # Get system metrics
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        # Get disk usage - Windows compatible
        try:
            if platform.system() == 'Windows':
                disk = psutil.disk_usage('C:/')
            else:
                disk = psutil.disk_usage('/')
        except Exception:
            # Fallback disk metrics
            disk = type('obj', (object,), {'percent': 0, 'total': 0, 'free': 0})()
        
        # Get boot time for uptime calculation
        boot_time = psutil.boot_time()
        uptime_seconds = int(time.time() - boot_time)
        uptime_days = uptime_seconds // 86400
        uptime_hours = (uptime_seconds % 86400) // 3600
        uptime_minutes = (uptime_seconds % 3600) // 60
        
        # Calculate total API response time
        total_response_time_ms = round((time.time() - start_time) * 1000, 2)
        
        # Determine overall health status
        health_score = 100
        issues = []
        
        if db_status != "connected":
            health_score -= 50
            issues.append("قاعدة البيانات غير متصلة")
        elif db_latency_ms > 500:
            health_score -= 20
            issues.append("تأخر عالٍ في قاعدة البيانات")
        elif db_latency_ms > 200:
            health_score -= 10
            issues.append("تأخر متوسط في قاعدة البيانات")
            
        if memory.percent > 90:
            health_score -= 20
            issues.append("استخدام ذاكرة عالٍ جداً")
        elif memory.percent > 75:
            health_score -= 10
            issues.append("استخدام ذاكرة مرتفع")
            
        if cpu_percent > 90:
            health_score -= 15
            issues.append("استخدام معالج عالٍ جداً")
        elif cpu_percent > 70:
            health_score -= 5
            issues.append("استخدام معالج مرتفع")
            
        if disk.percent > 90:
            health_score -= 15
            issues.append("مساحة القرص منخفضة جداً")
        elif disk.percent > 80:
            health_score -= 5
            issues.append("مساحة القرص منخفضة")
        
        status = "healthy" if health_score >= 80 else "degraded" if health_score >= 50 else "critical"
        
        return {
            "status": status,
            "health_score": health_score,
            "issues": issues,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "latency": {
                "api_response_ms": total_response_time_ms,
                "database_ping_ms": db_latency_ms,
                "database_query_ms": query_time_ms
            },
            "database": {
                "status": db_status,
                "name": db.name,
                "ping_ms": db_latency_ms,
                "connection_quality": "excellent" if db_latency_ms < 50 else "good" if db_latency_ms < 150 else "fair" if db_latency_ms < 300 else "poor"
            },
            "collections": {
                "users": users_count,
                "orders": orders_count,
                "visits": visits_count,
                "clinics": clinics_count,
                "expenses": expenses_count,
                "products": products_count,
                "gps_logs": gps_logs_count
            },
            "system": {
                "platform": platform.system(),
                "python_version": platform.python_version(),
                "cpu_usage_percent": cpu_percent,
                "memory_used_percent": round(memory.percent, 1),
                "memory_total_gb": round(memory.total / (1024**3), 2),
                "memory_available_gb": round(memory.available / (1024**3), 2),
                "disk_used_percent": round(disk.percent, 1),
                "disk_total_gb": round(disk.total / (1024**3), 2),
                "disk_free_gb": round(disk.free / (1024**3), 2)
            },
            "uptime": {
                "days": uptime_days,
                "hours": uptime_hours,
                "minutes": uptime_minutes,
                "formatted": f"{uptime_days}d {uptime_hours}h {uptime_minutes}m"
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "health_score": 0,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

# Custom Fields Management Endpoints
@api_router.get("/custom-fields", response_model=List[CustomField])
async def get_custom_fields(
    entity_type: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Get all custom fields, optionally filtered by entity type"""
    query = {}
    if entity_type:
        query["$or"] = [{"entity_type": entity_type}, {"entity_type": "both"}]
    
    fields = []
    async for field in db.custom_fields.find(query):
        field["id"] = str(field.get("_id", field.get("id", "")))
        if "_id" in field:
            del field["_id"]
        fields.append(field)
    return fields

@api_router.post("/custom-fields", response_model=CustomField)
async def create_custom_field(
    field_data: CustomFieldCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Create a new custom field"""
    new_field = CustomField(
        **field_data.model_dump(),
        created_at=datetime.now(timezone.utc)
    )
    doc = new_field.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    
    result = await db.custom_fields.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return doc

@api_router.put("/custom-fields/{field_id}")
async def update_custom_field(
    field_id: str,
    field_data: CustomFieldUpdate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Update a custom field"""
    from bson import ObjectId
    
    update_data = {k: v for k, v in field_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    # Try both ObjectId and string id
    try:
        result = await db.custom_fields.update_one(
            {"_id": ObjectId(field_id)},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            result = await db.custom_fields.update_one(
                {"id": field_id},
                {"$set": update_data}
            )
    except:
        result = await db.custom_fields.update_one(
            {"id": field_id},
            {"$set": update_data}
        )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Custom field not found")
    
    return {"message": "Custom field updated successfully"}

@api_router.delete("/custom-fields/{field_id}")
async def delete_custom_field(
    field_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Delete a custom field"""
    from bson import ObjectId
    
    try:
        result = await db.custom_fields.delete_one({"_id": ObjectId(field_id)})
        if result.deleted_count == 0:
            result = await db.custom_fields.delete_one({"id": field_id})
    except:
        result = await db.custom_fields.delete_one({"id": field_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Custom field not found")
    
    return {"message": "Custom field deleted successfully"}

# Image Upload Route
@api_router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Upload image for site customization - uploads to S3 in production"""
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only images allowed.")
    
    # Validate file size (max 5MB)
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB.")
    
    # Read file content
    file_content = await file.read()
    
    # Upload to S3 (or local fallback)
    file_url = await upload_file_to_s3(file_content, file.filename, file.content_type)
    
    return {"url": file_url, "filename": file.filename}

# Payment Receipt Upload Route
@api_router.post("/upload-receipt")
async def upload_receipt(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload payment receipt image (deposit/transfer/check) - uploads to S3 in production"""
    # Validate file type - allow images and PDF
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="نوع الملف غير مسموح. يُسمح بالصور و PDF فقط.")
    
    # Validate file size (max 10MB for receipts)
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(status_code=400, detail="حجم الملف كبير جداً. الحد الأقصى 10MB.")
    
    # Read file content
    file_content = await file.read()
    
    # Generate a unique filename with prefix
    original_ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'jpg'
    unique_filename = f"receipt_{uuid.uuid4().hex[:12]}.{original_ext}"
    
    # Upload to S3 (or local fallback)
    file_url = await upload_file_to_s3(file_content, unique_filename, file.content_type)
    
    return {
        "url": file_url, 
        "filename": unique_filename,
        "original_name": file.filename,
        "size": file_size,
        "content_type": file.content_type
    }

# ===================== NOTIFICATIONS API =====================

async def create_notification(
    user_id: str,
    notification_type: NotificationType,
    title: str,
    message: str,
    data: dict = None
):
    """Helper function to create a notification for a user"""
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": notification_type.value,
        "title": title,
        "message": message,
        "data": data or {},
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification

async def send_notification_to_role(
    role: UserRole,
    notification_type: NotificationType,
    title: str,
    message: str,
    data: dict = None,
    manager_id: str = None  # Optional: send only to users under this manager
):
    """Send notification to all users with a specific role"""
    query = {"role": role.value, "is_active": True, "is_deleted": {"$ne": True}}
    if manager_id:
        query["manager_id"] = manager_id
    
    users = await db.users.find(query, {"id": 1}).to_list(100)
    notifications = []
    for user in users:
        notif = await create_notification(user["id"], notification_type, title, message, data)
        notifications.append(notif)
    return notifications

@api_router.get("/notifications")
async def get_notifications(
    limit: int = 20,
    offset: int = 0,
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for current user"""
    query = {"user_id": current_user["id"]}
    if unread_only:
        query["is_read"] = False
    
    total = await db.notifications.count_documents(query)
    notifications = await db.notifications.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(offset).limit(limit).to_list(limit)
    
    return {
        "items": notifications,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@api_router.get("/notifications/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({
        "user_id": current_user["id"],
        "is_read": False
    })
    return {"count": count}

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["id"]},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read for current user"""
    result = await db.notifications.update_many(
        {"user_id": current_user["id"], "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": f"Marked {result.modified_count} notifications as read"}

@api_router.post("/notifications")
async def create_notification_endpoint(
    notification: NotificationCreate,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM]))
):
    """Create a notification (Admin/GM only)"""
    notif = await create_notification(
        notification.user_id,
        notification.type,
        notification.title,
        notification.message,
        notification.data
    )
    return notif

@api_router.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a notification"""
    result = await db.notifications.delete_one({
        "id": notification_id,
        "user_id": current_user["id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}

# ===================== WHATSAPP INTEGRATION =====================

import httpx

async def get_whatsapp_settings():
    """Get WhatsApp settings from database"""
    default_settings = {
        "enabled": False,
        "provider": "baileys",
        "api_provider": "baileys",
        "instance_id": "",
        "token": "",
        "api_key": "",
        "phone_number": "",
        "api_url": "",
        "templates": {
            "invoice_due_today": "🔔 *فاتورة مستحقة اليوم*\n\n📋 العيادة: {clinic_name}\n💰 المبلغ: {amount} ج.م\n📅 الاستحقاق: {due_date}",
            "invoice_overdue": "⚠️ *فاتورة متأخرة*\n\n📋 العيادة: {clinic_name}\n💰 المبلغ: {amount} ج.م\n⏰ متأخرة: {days_overdue} يوم",
            "order_approved": "✅ *تمت الموافقة على طلبك*\n\n🏥 العيادة: {clinic_name}\n💰 المبلغ: {amount} ج.م",
            "order_rejected": "❌ *تم رفض طلبك*\n\n🏥 العيادة: {clinic_name}\n📝 السبب: {reason}",
            "daily_report": "📊 *التقرير اليومي*\n\n📦 الطلبات: {orders_count}\n💰 المبيعات: {total_sales} ج.م\n⏳ معلق: {pending_orders}"
        }
    }
    
    try:
        doc = await db.settings.find_one({"type": "whatsapp"})
        if not doc:
            return default_settings
        
        # Get settings from nested key or direct
        settings = doc.get("settings")
        if settings and isinstance(settings, dict):
            return {**default_settings, **settings}
        
        # If no nested settings, return defaults
        return default_settings
    except Exception as e:
        logger.error(f"Error getting WhatsApp settings: {e}")
        return default_settings

async def send_whatsapp_message(phone_number: str, message: str) -> bool:
    """Send WhatsApp message using configured provider"""
    try:
        settings = await get_whatsapp_settings()
        
        if not settings.get("enabled"):
            logger.info("WhatsApp notifications disabled")
            return False
        
        provider = settings.get("provider", "ultramsg")
        
        # Clean phone number (remove spaces, dashes)
        phone = phone_number.replace(" ", "").replace("-", "").replace("+", "")
        if not phone.startswith("2"):
            phone = "2" + phone  # Add Egypt country code
        
        async with httpx.AsyncClient() as client:
            if provider == "ultramsg":
                # UltraMsg API
                url = f"https://api.ultramsg.com/{settings.get('instance_id')}/messages/chat"
                response = await client.post(url, data={
                    "token": settings.get("token"),
                    "to": phone,
                    "body": message
                })
            elif provider == "callmebot":
                # CallMeBot (free, limited)
                url = f"https://api.callmebot.com/whatsapp.php"
                response = await client.get(url, params={
                    "phone": phone,
                    "text": message,
                    "apikey": settings.get("token")
                })
            elif provider == "custom":
                # Custom API endpoint
                url = settings.get("api_url")
                response = await client.post(url, json={
                    "phone": phone,
                    "message": message,
                    "token": settings.get("token")
                })
            elif provider == "baileys":
                # WhiskeySockets/Baileys Gateway (free, local)
                gateway_url = settings.get("api_url", "http://localhost:3001")
                response = await client.post(f"{gateway_url}/send", json={
                    "phone": phone,
                    "message": message
                }, timeout=30.0)
            else:
                logger.error(f"Unknown WhatsApp provider: {provider}")
                return False
            
            if response.status_code == 200:
                logger.info(f"✅ WhatsApp sent to {phone}")
                return True
            else:
                logger.error(f"❌ WhatsApp failed: {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"❌ WhatsApp error: {e}")
        return False

async def send_whatsapp_notification(user_id: str, notification_type: str, data: dict):
    """Send WhatsApp notification to user if enabled"""
    try:
        # Get user
        user = await db.users.find_one({"id": user_id})
        if not user:
            return
        
        # Check if user has WhatsApp notifications enabled
        if not user.get("receive_whatsapp_notifications", True):
            return
        
        # Get WhatsApp number (fallback to phone)
        whatsapp_number = user.get("whatsapp_number") or user.get("phone")
        if not whatsapp_number:
            return
        
        # Get settings and template
        settings = await get_whatsapp_settings()
        templates = settings.get("templates", {})
        template = templates.get(notification_type)
        
        if not template:
            return
        
        # Format message with data
        message = template.format(**data) if data else template
        
        # Send message
        await send_whatsapp_message(whatsapp_number, message)
        
    except Exception as e:
        logger.error(f"❌ Failed to send WhatsApp notification: {e}")

@api_router.get("/whatsapp-settings")
async def get_whatsapp_settings_endpoint(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Get WhatsApp settings"""
    settings = await get_whatsapp_settings()
    return settings

@api_router.put("/whatsapp-settings")
async def update_whatsapp_settings(
    settings: dict,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Update WhatsApp settings"""
    await db.settings.update_one(
        {"type": "whatsapp"},
        {"$set": {"type": "whatsapp", "settings": settings}},
        upsert=True
    )
    return {"message": "WhatsApp settings updated", "settings": settings}

@api_router.post("/whatsapp-settings/test")
async def test_whatsapp(
    test_data: dict,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Test WhatsApp message sending"""
    phone = test_data.get("phone")
    message = test_data.get("message", "🧪 رسالة اختبار من نظام EP-EG")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    success = await send_whatsapp_message(phone, message)
    
    return {"success": success, "message": "Test message sent" if success else "Failed to send"}

@api_router.get("/whatsapp-gateway/status")
async def get_gateway_status(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Get WhatsApp Gateway connection status"""
    try:
        settings = await get_whatsapp_settings()
        # Handle both field names from frontend
        gateway_url = settings.get("api_url") or settings.get("gateway_url") or "http://localhost:3001"
        
        if not gateway_url or gateway_url == "":
            return {"status": "not_configured", "error": "Gateway URL not configured"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{gateway_url}/status", timeout=5.0)
            return response.json()
    except Exception as e:
        return {"status": "offline", "error": str(e)}

@api_router.get("/whatsapp-gateway/qr")
async def get_gateway_qr(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Get WhatsApp Gateway QR code for scanning"""
    try:
        settings = await get_whatsapp_settings()
        gateway_url = settings.get("api_url") or settings.get("gateway_url") or "http://localhost:3001"
        
        if not gateway_url or gateway_url == "":
            return {"status": "not_configured", "error": "Gateway URL not configured"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{gateway_url}/qr", timeout=5.0)
            return response.json()
    except Exception as e:
        return {"status": "error", "error": str(e)}

@api_router.post("/whatsapp-gateway/reconnect")
async def reconnect_gateway(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Reconnect WhatsApp Gateway"""
    try:
        settings = await get_whatsapp_settings()
        gateway_url = settings.get("api_url") or settings.get("gateway_url") or "http://localhost:3001"
        
        if not gateway_url or gateway_url == "":
            return {"success": False, "error": "Gateway URL not configured"}
        
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{gateway_url}/reconnect", timeout=10.0)
            return response.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/uploads/{filename}") #
async def serve_upload(filename: str):
    """Serve uploaded images with CORS headers for cross-origin access"""
    file_path = Path("uploads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type from extension
    ext = file_path.suffix.lower()
    content_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml'
    }
    content_type = content_types.get(ext, 'application/octet-stream')
    
    # Return FileResponse with explicit CORS headers
    return FileResponse(
        file_path,
        media_type=content_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        }
    )

# Notification Routes
@api_router.get("/notifications", response_model=List[Notification])
async def get_notifications(
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for current user."""
    limit = min(limit, 100)
    notifications = await db.notifications.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    for n in notifications:
        if isinstance(n.get('created_at'), str):
            n['created_at'] = datetime.fromisoformat(n['created_at'])
    return notifications

@api_router.get("/notifications/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread notifications."""
    count = await db.notifications.count_documents({
        "user_id": current_user["id"],
        "is_read": False
    })
    return {"count": count}

@api_router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read."""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["id"]},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.patch("/notifications/mark-all-read")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read."""
    await db.notifications.update_many(
        {"user_id": current_user["id"], "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": "All notifications marked as read"}

# Helper function to create notification
async def create_notification(user_id: str, type: NotificationType, title: str, message: str, data: dict = None):
    """Create a notification for a user."""
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        data=data
    )
    doc = notif.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.notifications.insert_one(doc)
    return notif

# Global Search endpoint
@api_router.get("/search")
async def global_search(
    q: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Search across clinics, users, and orders."""
    if len(q) < 2:
        return {"clinics": [], "users": [], "orders": []}
    
    limit = min(limit, 20)
    search_regex = {"$regex": q, "$options": "i"}
    
    # Search clinics by name
    clinics = await db.clinics.find(
        {"name": search_regex},
        {"_id": 0, "id": 1, "name": 1, "address": 1}
    ).limit(limit).to_list(limit)
    
    # Search users by name or username (admin/manager only)
    users = []
    if current_user["role"] in ["super_admin", "gm", "manager"]:
        users = await db.users.find(
            {"$or": [
                {"full_name": search_regex},
                {"username": search_regex}
            ]},
            {"_id": 0, "id": 1, "full_name": 1, "username": 1, "role": 1}
        ).limit(limit).to_list(limit)
    
    # Search orders by clinic name via lookup
    orders = await db.orders.aggregate([
        {"$lookup": {
            "from": "clinics",
            "localField": "clinic_id",
            "foreignField": "id",
            "as": "clinic"
        }},
        {"$unwind": {"path": "$clinic", "preserveNullAndEmptyArrays": True}},
        {"$match": {"clinic.name": search_regex}},
        {"$project": {
            "_id": 0, "id": 1, "status": 1, "total_amount": 1,
            "clinic_name": "$clinic.name", "created_at": 1
        }},
        {"$limit": limit}
    ]).to_list(limit)
    
    return {
        "clinics": clinics,
        "users": users,
        "orders": orders
    }

# Password Reset / Change endpoint
class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@api_router.post("/auth/change-password")
async def change_password(
    data: PasswordChange,
    current_user: dict = Depends(get_current_user)
):
    """Change password for logged-in user."""
    # Verify current password
    user = await db.users.find_one({"id": current_user["id"]})
    if not user or not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة")
    
    # Validate new password
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل")
    
    # Update password
    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "تم تغيير كلمة المرور بنجاح"}

# Admin reset user password
class AdminPasswordReset(BaseModel):
    user_id: str
    new_password: str

@api_router.post("/auth/admin-reset-password")
async def admin_reset_password(
    data: AdminPasswordReset,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Admin endpoint to reset any user's password."""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": f"Password reset for {user['username']}"}

# ===================== RETURNS API =====================

@api_router.post("/returns")
async def create_return(
    return_data: ReturnCreate,
    current_user: dict = Depends(require_role([UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]))
):
    """Create a return request for an order. Only ACCOUNTANT and SUPER_ADMIN can create returns."""
    # Get the order
    order = await db.orders.find_one({"id": return_data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Validate order status (can only return delivered/approved orders)
    if order.get("status") not in ["approved", "delivered", "shipped"]:
        raise HTTPException(status_code=400, detail="Can only create returns for approved/shipped/delivered orders")
    
    # Calculate return amount
    total_amount = 0
    for item in return_data.items:
        for order_product in order.get("products", []):
            if order_product.get("product_id") == item.get("product_id"):
                total_amount += item.get("quantity", 0) * order_product.get("price", 0)
                break
    
    return_obj = Return(
        order_id=return_data.order_id,
        clinic_id=order.get("clinic_id"),
        requested_by=current_user["id"],
        reason=return_data.reason,
        items=return_data.items,
        total_amount=total_amount,
        notes=return_data.notes,
    )
    
    doc = return_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.returns.insert_one(doc)
    
    return {"message": "Return request created successfully", "return_id": return_obj.id}

@api_router.get("/returns")
async def get_returns(
    status: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN, UserRole.GM]))
):
    """Get all returns. Only ACCOUNTANT, GM, and SUPER_ADMIN can view returns."""
    query = {}
    if status:
        query["status"] = status
    
    returns = await db.returns.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Parse dates
    for r in returns:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
        if isinstance(r.get('approved_at'), str):
            r['approved_at'] = datetime.fromisoformat(r['approved_at'])
    
    return returns

@api_router.put("/returns/{return_id}/approve")
async def approve_return(
    return_id: str,
    current_user: dict = Depends(require_role([UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]))
):
    """Approve a return request."""
    return_doc = await db.returns.find_one({"id": return_id}, {"_id": 0})
    if not return_doc:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if return_doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Return is not pending")
    
    await db.returns.update_one(
        {"id": return_id},
        {"$set": {
            "status": "approved",
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Return approved successfully"}

@api_router.put("/returns/{return_id}/reject")
async def reject_return(
    return_id: str,
    rejection_reason: str = "",
    current_user: dict = Depends(require_role([UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]))
):
    """Reject a return request."""
    return_doc = await db.returns.find_one({"id": return_id}, {"_id": 0})
    if not return_doc:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if return_doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Return is not pending")
    
    await db.returns.update_one(
        {"id": return_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": rejection_reason,
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Return rejected"}

@api_router.put("/returns/{return_id}/process")
async def process_return(
    return_id: str,
    current_user: dict = Depends(require_role([UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]))
):
    """Mark an approved return as processed (items received back)."""
    return_doc = await db.returns.find_one({"id": return_id}, {"_id": 0})
    if not return_doc:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if return_doc.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Return must be approved before processing")
    
    await db.returns.update_one(
        {"id": return_id},
        {"$set": {"status": "processed"}}
    )
    
    return {"message": "Return processed successfully"}

# Include router
app.include_router(api_router)

# Serve uploaded receipt files
@app.get("/uploads/receipts/{filename}")
async def serve_receipt(filename: str):
    """Serve uploaded receipt images."""
    file_path = Path("uploads/receipts") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

# NOTE: CORS middleware is configured at the top of the file (line 70-82)
# Do not add duplicate CORS configuration here

# ===================== PUSH NOTIFICATIONS API =====================

@api_router.post("/push-subscriptions")
async def subscribe_to_push(
    subscription: PushSubscriptionCreate,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Subscribe to push notifications."""
    # Check if subscription already exists for this endpoint
    existing = await db.push_subscriptions.find_one({
        "endpoint": subscription.endpoint,
        "user_id": current_user["id"]
    })
    
    if existing:
        # Update existing subscription
        await db.push_subscriptions.update_one(
            {"id": existing["id"]},
            {"$set": {
                "keys": subscription.keys,
                "device_info": subscription.device_info or get_device_info(request),
                "is_active": True
            }}
        )
        return {"message": "Subscription updated", "id": existing["id"]}
    
    # Create new subscription
    push_sub = PushSubscription(
        user_id=current_user["id"],
        endpoint=subscription.endpoint,
        keys=subscription.keys,
        device_info=subscription.device_info or get_device_info(request)
    )
    
    doc = push_sub.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.push_subscriptions.insert_one(doc)
    
    return {"message": "Subscribed to push notifications", "id": push_sub.id}

@api_router.delete("/push-subscriptions/{endpoint_hash}")
async def unsubscribe_from_push(
    endpoint_hash: str,
    current_user: dict = Depends(get_current_user)
):
    """Unsubscribe from push notifications."""
    result = await db.push_subscriptions.update_one(
        {"user_id": current_user["id"], "endpoint": {"$regex": endpoint_hash}},
        {"$set": {"is_active": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    return {"message": "Unsubscribed from push notifications"}

@api_router.get("/push-subscriptions")
async def get_my_subscriptions(current_user: dict = Depends(get_current_user)):
    """Get all push subscriptions for current user."""
    subscriptions = await db.push_subscriptions.find(
        {"user_id": current_user["id"], "is_active": True},
        {"_id": 0}
    ).to_list(100)
    
    return subscriptions

# Helper function to send push notification
async def send_push_notification(user_id: str, title: str, body: str, data: dict = None):
    """Send push notification to all active subscriptions for a user."""
    try:
        subscriptions = await db.push_subscriptions.find(
            {"user_id": user_id, "is_active": True}
        ).to_list(100)
        
        # For now, just log - actual push requires pywebpush library
        logger.info(f"📲 Push notification for {user_id}: {title}")
        
        # Create in-app notification as fallback
        await create_notification(
            user_id=user_id,
            type=NotificationType.SYSTEM,
            title=title,
            message=body,
            data=data
        )
        
        return len(subscriptions)
    except Exception as e:
        logger.error(f"Failed to send push notification: {e}")
        return 0

# ===================== SESSION MANAGEMENT API =====================

@api_router.get("/sessions")
async def get_my_sessions(current_user: dict = Depends(get_current_user)):
    """Get all active sessions for current user."""
    sessions = await db.sessions.find(
        {"user_id": current_user["id"], "is_active": True},
        {"_id": 0, "token_hash": 0}  # Don't expose token hash
    ).sort("last_activity", -1).to_list(50)
    
    # Parse timestamps
    for session in sessions:
        if isinstance(session.get('created_at'), str):
            session['created_at'] = datetime.fromisoformat(session['created_at'])
        if isinstance(session.get('last_activity'), str):
            session['last_activity'] = datetime.fromisoformat(session['last_activity'])
    
    return sessions

@api_router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Revoke a specific session."""
    result = await db.sessions.update_one(
        {"id": session_id, "user_id": current_user["id"]},
        {"$set": {"is_active": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"message": "Session revoked successfully"}

@api_router.post("/sessions/logout-all")
async def logout_all_sessions(current_user: dict = Depends(get_current_user)):
    """Logout from all sessions except current."""
    # Get current token from header
    # Mark all other sessions as inactive
    result = await db.sessions.update_many(
        {"user_id": current_user["id"], "is_active": True},
        {"$set": {"is_active": False}}
    )
    
    return {"message": f"Logged out from {result.modified_count} sessions"}

# Helper function to create/update session on login
async def create_or_update_session(user_id: str, token: str, request: Request, device_info: str = None):
    """Create a new session entry on login."""
    import hashlib
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
    
    session = UserSession(
        user_id=user_id,
        token_hash=token_hash,
        device_info=device_info or get_device_info(request),
        ip_address=get_client_ip(request),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    )
    
    doc = session.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['last_activity'] = doc['last_activity'].isoformat()
    doc['expires_at'] = doc['expires_at'].isoformat() if doc.get('expires_at') else None
    
    await db.sessions.insert_one(doc)
    return session.id

# Admin endpoint to view all sessions
@api_router.get("/admin/sessions")
async def get_all_sessions(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Get all active sessions (admin only)."""
    sessions = await db.sessions.find(
        {"is_active": True},
        {"_id": 0, "token_hash": 0}
    ).sort("last_activity", -1).to_list(200)
    
    # Enrich with user names
    user_ids = list(set(s["user_id"] for s in sessions))
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "full_name": 1, "username": 1}
    ).to_list(len(user_ids))
    user_map = {u["id"]: u for u in users}
    
    for session in sessions:
        user = user_map.get(session["user_id"], {})
        session["user_name"] = user.get("full_name", "Unknown")
        session["username"] = user.get("username", "unknown")
    
    return sessions


# ═══════════════════════════════════════════════════════════════════════════
# ACCOUNTING MODULE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

# Helper function to create invoice from approved order
async def create_invoice_from_order(order: dict, approver: dict, request: Request = None):
    """Create an invoice automatically when an order is approved."""
    # Get clinic info
    clinic = await db.clinics.find_one({"id": order["clinic_id"]})
    clinic_name = clinic.get("name", "Unknown") if clinic else "Unknown"
    
    # Get medical rep info
    med_rep = await db.users.find_one({"id": order["medical_rep_id"]})
    med_rep_name = med_rep.get("full_name", "Unknown") if med_rep else "Unknown"
    
    # Get manager info
    manager_id = med_rep.get("manager_id") if med_rep else None
    manager_name = None
    if manager_id:
        manager = await db.users.find_one({"id": manager_id})
        manager_name = manager.get("full_name") if manager else None
    
    # Get area and line info
    area_id = clinic.get("area_id") if clinic else None
    line_id = clinic.get("line_id") if clinic else None
    area_name = None
    line_name = None
    if area_id:
        area = await db.areas.find_one({"id": area_id})
        area_name = area.get("name") if area else None
    if line_id:
        line = await db.lines.find_one({"id": line_id})
        line_name = line.get("name") if line else None
    
    # Get next invoice number
    invoice_number = await get_next_serial_number("invoices", 10001)
    
    total_amount = order.get("total_amount", 0)
    
    # Calculate payment amounts based on payment_status
    payment_status = order.get("payment_status", "unpaid")
    payment_method = order.get("payment_method")
    order_amount_paid = order.get("amount_paid", 0) or 0
    
    if payment_status == "full":
        paid_amount = total_amount
        remaining_amount = 0
        invoice_status = "paid"
    elif payment_status == "partial":
        paid_amount = min(order_amount_paid, total_amount)  # Can't pay more than total
        remaining_amount = total_amount - paid_amount
        invoice_status = "partial"
    else:  # unpaid
        paid_amount = 0
        remaining_amount = total_amount
        invoice_status = "pending"
    
    invoice = Invoice(
        invoice_number=invoice_number,
        order_id=order["id"],
        order_serial=order.get("serial_number", 0),
        clinic_id=order["clinic_id"],
        clinic_name=clinic_name,
        created_by=order["medical_rep_id"],
        created_by_name=med_rep_name,
        approved_by=approver["id"],
        approved_by_name=approver.get("full_name", "Unknown"),
        manager_id=manager_id,
        manager_name=manager_name,
        area_id=area_id,
        area_name=area_name,
        line_id=line_id,
        line_name=line_name,
        products=order.get("products", []),
        subtotal=order.get("subtotal", total_amount),
        discount_type=order.get("discount_type"),
        discount_value=order.get("discount_value"),
        discount_reason=order.get("discount_reason"),
        total_amount=total_amount,
        paid_amount=paid_amount,
        remaining_amount=remaining_amount,
        status=invoice_status,
        payment_method=payment_method,
        notes=order.get("notes")
    )
    
    doc = invoice.model_dump()
    doc["invoice_date"] = doc["invoice_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    if doc.get("due_date"):
        doc["due_date"] = doc["due_date"].isoformat()
    
    await db.invoices.insert_one(doc)
    
    # Create automatic Payment record if there's an upfront payment
    if paid_amount > 0 and payment_method:
        payment_number = await get_next_serial_number("payments", 20001)
        payment = Payment(
            payment_number=payment_number,
            invoice_id=invoice.id,
            invoice_number=invoice_number,
            clinic_id=order["clinic_id"],
            clinic_name=clinic_name,
            amount=paid_amount,
            payment_method=payment_method,
            collected_by=order["medical_rep_id"],
            collected_by_name=med_rep_name,
            notes=f"دفع مع الطلب رقم {order.get('serial_number', 0)}"
        )
        payment_doc = payment.model_dump()
        payment_doc["payment_date"] = payment_doc["payment_date"].isoformat()
        payment_doc["created_at"] = payment_doc["created_at"].isoformat()
        await db.payments.insert_one(payment_doc)
        
        # Log payment
        await create_audit_log(
            log_type=AuditLogType.PAYMENT_RECEIVED,
            entity_type="payment",
            entity_id=payment.id,
            entity_serial=payment_number,
            user=approver,
            action_details=f"تم تسجيل دفعة {paid_amount} ج.م من الطلب رقم {order.get('serial_number')} ({payment_method})",
            amount=paid_amount,
            request=request
        )
    
    # Create installment schedule if order has scheduling data
    if order.get("first_due_date") and remaining_amount > 0:
        schedule_type = order.get("schedule_type", "monthly")
        installments_count = order.get("installments_count", 3)
        interval_days = order.get("interval_days", 30)
        grace_period = order.get("grace_period_days", 3)
        first_due_date = datetime.fromisoformat(order.get("first_due_date"))
        
        # Create schedule record
        schedule = InstallmentSchedule(
            invoice_id=invoice.id,
            invoice_number=invoice_number,
            clinic_id=order["clinic_id"],
            clinic_name=clinic_name,
            schedule_type=schedule_type,
            interval_days=interval_days if schedule_type == "regular" else None,
            total_amount=remaining_amount,
            installments_count=installments_count,
            grace_period_days=grace_period,
            first_due_date=first_due_date,
            created_by=order["medical_rep_id"],
            created_by_name=med_rep_name
        )
        schedule_doc = schedule.model_dump()
        schedule_doc["first_due_date"] = schedule_doc["first_due_date"].isoformat()
        schedule_doc["created_at"] = schedule_doc["created_at"].isoformat()
        await db.installment_schedules.insert_one(schedule_doc)
        
        # Create individual installments
        amount_per_installment = remaining_amount / installments_count
        
        for i in range(installments_count):
            # Calculate due date based on schedule type
            due_date = first_due_date
            if schedule_type == "monthly":
                # Add months
                month = due_date.month + i
                year = due_date.year + (month - 1) // 12
                month = ((month - 1) % 12) + 1
                day = min(due_date.day, [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
                due_date = due_date.replace(year=year, month=month, day=day)
            elif schedule_type == "weekly":
                due_date = first_due_date + timedelta(days=i * 7)
            else:  # regular
                due_date = first_due_date + timedelta(days=i * interval_days)
            
            installment = Installment(
                schedule_id=schedule.id,
                invoice_id=invoice.id,
                invoice_number=invoice_number,
                clinic_id=order["clinic_id"],
                clinic_name=clinic_name,
                installment_number=i + 1,
                amount=amount_per_installment,
                remaining_amount=amount_per_installment,
                due_date=due_date,
                status="upcoming"
            )
            inst_doc = installment.model_dump()
            inst_doc["due_date"] = inst_doc["due_date"].isoformat()
            inst_doc["created_at"] = inst_doc["created_at"].isoformat()
            inst_doc["updated_at"] = inst_doc["updated_at"].isoformat()
            await db.installments.insert_one(inst_doc)
        
        logger.info(f"Created {installments_count} installments for invoice {invoice_number}")
    
    # Create audit log for invoice
    await create_audit_log(
        log_type=AuditLogType.INVOICE_CREATED,
        entity_type="invoice",
        entity_id=invoice.id,
        entity_serial=invoice_number,
        user=approver,
        action_details=f"تم إنشاء فاتورة رقم {invoice_number} من الأوردر رقم {order.get('serial_number')} - حالة الدفع: {payment_status}",
        amount=total_amount,
        request=request
    )
    
    return invoice

# Helper to create audit log
async def create_audit_log(log_type: AuditLogType, entity_type: str, entity_id: str, 
                           entity_serial: int, user: dict, action_details: str,
                           amount: float = None, old_values: dict = None, 
                           new_values: dict = None, request: Request = None):
    """Create a financial audit log entry."""
    ip_address = None
    if request:
        ip_address = get_client_ip(request)
    
    audit = AuditLog(
        log_type=log_type,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_serial=entity_serial,
        user_id=user["id"],
        user_name=user.get("full_name", "Unknown"),
        user_role=user.get("role", "unknown"),
        action_details=action_details,
        amount=amount,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address
    )
    
    doc = audit.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.audit_logs.insert_one(doc)
    return audit

# Get accounting dashboard stats
@api_router.get("/accounting/dashboard")
async def get_accounting_dashboard(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get accounting dashboard statistics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Total invoices
    total_invoices = await db.invoices.count_documents({})
    
    # Total revenue (all time)
    revenue_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    revenue_result = await db.invoices.aggregate(revenue_pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    # Total collected
    collected_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$paid_amount"}}}
    ]
    collected_result = await db.invoices.aggregate(collected_pipeline).to_list(1)
    total_collected = collected_result[0]["total"] if collected_result else 0
    
    # Total outstanding
    total_outstanding = total_revenue - total_collected
    
    # Today's collections
    today_payments = await db.payments.aggregate([
        {"$match": {"created_at": {"$gte": today_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    today_collected = today_payments[0]["total"] if today_payments else 0
    
    # This month's invoices
    month_invoices = await db.invoices.aggregate([
        {"$match": {"created_at": {"$gte": month_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    month_revenue = month_invoices[0]["total"] if month_invoices else 0
    month_invoice_count = month_invoices[0]["count"] if month_invoices else 0
    
    # Approved expenses this month
    month_expenses = await db.expenses.aggregate([
        {"$match": {"status": "approved", "created_at": {"$gte": month_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    month_expense_total = month_expenses[0]["total"] if month_expenses else 0
    month_expense_count = month_expenses[0]["count"] if month_expenses else 0
    
    # Overdue invoices (more than 30 days with remaining amount)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    overdue_count = await db.invoices.count_documents({
        "remaining_amount": {"$gt": 0},
        "invoice_date": {"$lt": thirty_days_ago}
    })
    
    # Invoice status breakdown
    status_breakdown = await db.invoices.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    # Latest Activities (for dashboard feed)
    latest_invoices = await db.invoices.find(
        {}, {"_id": 0, "invoice_number": 1, "clinic_name": 1, "total_amount": 1, "status": 1, "invoice_date": 1, "created_by_name": 1}
    ).sort("invoice_date", -1).limit(5).to_list(5)
    
    latest_payments = await db.payments.find(
        {}, {"_id": 0, "payment_number": 1, "invoice_number": 1, "clinic_name": 1, "amount": 1, "payment_date": 1, "collected_by_name": 1}
    ).sort("payment_date", -1).limit(5).to_list(5)
    
    latest_expenses = await db.expenses.find(
        {"status": "approved"}, {"_id": 0, "description": 1, "amount": 1, "category": 1, "created_at": 1, "created_by_name": 1}
    ).sort("created_at", -1).limit(5).to_list(5)
    
    # Latest debts (invoices with remaining amount > 0)
    latest_debts = await db.invoices.find(
        {"remaining_amount": {"$gt": 0}}, 
        {"_id": 0, "invoice_number": 1, "clinic_name": 1, "remaining_amount": 1, "invoice_date": 1}
    ).sort("remaining_amount", -1).limit(5).to_list(5)
    
    return {
        "total_invoices": total_invoices,
        "total_revenue": total_revenue,
        "total_collected": total_collected,
        "total_outstanding": total_outstanding,
        "today_collected": today_collected,
        "month_revenue": month_revenue,
        "month_invoice_count": month_invoice_count,
        "month_expense_total": month_expense_total,
        "month_expense_count": month_expense_count,
        "overdue_count": overdue_count,
        "status_breakdown": {item["_id"]: item["count"] for item in status_breakdown},
        # Latest Activities
        "latest_invoices": latest_invoices,
        "latest_payments": latest_payments,
        "latest_expenses": latest_expenses,
        "latest_debts": latest_debts
    }

# ═══════════════════════════════════════════════════════════════════════════
# INSTALLMENT MANAGEMENT API
# ═══════════════════════════════════════════════════════════════════════════

# Get all installments with filters
@api_router.get("/installments")
async def get_installments(
    status: Optional[str] = None,  # upcoming, due, grace, overdue, paid, partial
    clinic_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    due_within_days: Optional[int] = None,  # Filter by due within X days
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT, UserRole.MEDICAL_REP]))
):
    """Get installments with optional filters."""
    query = {}
    
    if status:
        query["status"] = status
    if clinic_id:
        query["clinic_id"] = clinic_id
    if invoice_id:
        query["invoice_id"] = invoice_id
    if due_within_days:
        future_date = (datetime.now(timezone.utc) + timedelta(days=due_within_days)).isoformat()
        query["due_date"] = {"$lte": future_date}
        query["status"] = {"$in": ["upcoming", "due", "grace"]}
    
    # Role-based filtering for medical reps
    if current_user["role"] == UserRole.MEDICAL_REP.value:
        # Get invoices created by this rep
        rep_invoices = await db.invoices.find({"created_by": current_user["id"]}).to_list(None)
        invoice_ids = [inv["id"] for inv in rep_invoices]
        query["invoice_id"] = {"$in": invoice_ids}
    
    installments = await db.installments.find(query).sort("due_date", 1).skip(skip).limit(limit).to_list(None)
    total = await db.installments.count_documents(query)
    
    return {"items": installments, "total": total}

# Get installment summary (dashboard stats)
@api_router.get("/installments/summary")
async def get_installments_summary(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get installment summary for dashboard."""
    now = datetime.now(timezone.utc).isoformat()
    
    overdue = await db.installments.count_documents({"status": "overdue"})
    due_today = await db.installments.count_documents({
        "status": {"$in": ["due", "grace"]},
        "due_date": {"$lte": now}
    })
    upcoming_week = await db.installments.count_documents({
        "status": "upcoming",
        "due_date": {"$lte": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()}
    })
    
    overdue_amount = 0
    overdue_docs = await db.installments.find({"status": "overdue"}).to_list(None)
    for inst in overdue_docs:
        overdue_amount += inst.get("remaining_amount", 0)
    
    return {
        "overdue_count": overdue,
        "overdue_amount": overdue_amount,
        "due_today_count": due_today,
        "upcoming_week_count": upcoming_week
    }

# Pay an installment (full or partial)
class InstallmentPaymentCreate(BaseModel):
    amount: float
    payment_method: str  # 'bank_transfer', 'e_wallet', 'instapay', 'cash'
    notes: Optional[str] = None

@api_router.post("/installments/{installment_id}/pay")
async def pay_installment(
    installment_id: str,
    payment_data: InstallmentPaymentCreate,
    request: Request,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT, UserRole.MEDICAL_REP]))
):
    """Pay an installment (full or partial)."""
    installment = await db.installments.find_one({"id": installment_id})
    if not installment:
        raise HTTPException(status_code=404, detail="Installment not found")
    
    if installment["status"] == "paid":
        raise HTTPException(status_code=400, detail="Installment already paid")
    
    amount = min(payment_data.amount, installment["remaining_amount"])
    
    # Get invoice for info
    invoice = await db.invoices.find_one({"id": installment["invoice_id"]})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Create payment record
    payment_number = await get_next_serial_number("payments", 20001)
    payment = Payment(
        payment_number=payment_number,
        invoice_id=installment["invoice_id"],
        invoice_number=installment["invoice_number"],
        clinic_id=installment["clinic_id"],
        clinic_name=installment["clinic_name"],
        amount=amount,
        payment_method=payment_data.payment_method,
        collected_by=current_user["id"],
        collected_by_name=current_user.get("full_name", "Unknown"),
        notes=payment_data.notes or f"دفع القسط {installment['installment_number']}"
    )
    payment_doc = payment.model_dump()
    payment_doc["payment_date"] = payment_doc["payment_date"].isoformat()
    payment_doc["created_at"] = payment_doc["created_at"].isoformat()
    await db.payments.insert_one(payment_doc)
    
    # Update installment
    new_paid = installment["paid_amount"] + amount
    new_remaining = installment["remaining_amount"] - amount
    new_status = "paid" if new_remaining <= 0 else "partial"
    
    await db.installments.update_one(
        {"id": installment_id},
        {"$set": {
            "paid_amount": new_paid,
            "remaining_amount": max(0, new_remaining),
            "status": new_status,
            "paid_date": datetime.now(timezone.utc).isoformat() if new_status == "paid" else None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        },
        "$push": {"payment_ids": payment.id}}
    )
    
    # Update invoice
    invoice_new_paid = invoice.get("paid_amount", 0) + amount
    invoice_new_remaining = invoice.get("remaining_amount", 0) - amount
    invoice_status = "paid" if invoice_new_remaining <= 0 else "partial"
    
    await db.invoices.update_one(
        {"id": installment["invoice_id"]},
        {"$set": {
            "paid_amount": invoice_new_paid,
            "remaining_amount": max(0, invoice_new_remaining),
            "status": invoice_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create audit log
    await create_audit_log(
        log_type=AuditLogType.PAYMENT_RECEIVED,
        entity_type="installment",
        entity_id=installment_id,
        entity_serial=installment["installment_number"],
        user=current_user,
        action_details=f"دفع قسط {installment['installment_number']} بمبلغ {amount} ج.م للفاتورة {installment['invoice_number']}",
        amount=amount,
        request=request
    )
    
    return {"message": "Payment recorded successfully", "payment_id": payment.id, "new_status": new_status}

# Reschedule an installment (Admin/Accountant only)
class InstallmentReschedule(BaseModel):
    new_due_date: str
    reason: str

@api_router.post("/installments/{installment_id}/reschedule")
async def reschedule_installment(
    installment_id: str,
    reschedule_data: InstallmentReschedule,
    request: Request,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]))
):
    """Reschedule an installment due date (Admin/Accountant only)."""
    installment = await db.installments.find_one({"id": installment_id})
    if not installment:
        raise HTTPException(status_code=404, detail="Installment not found")
    
    if installment["status"] == "paid":
        raise HTTPException(status_code=400, detail="Cannot reschedule paid installment")
    
    old_date = installment["due_date"]
    
    await db.installments.update_one(
        {"id": installment_id},
        {"$set": {
            "due_date": reschedule_data.new_due_date,
            "rescheduled_from": old_date,
            "reschedule_reason": reschedule_data.reason,
            "rescheduled_by": current_user["id"],
            "rescheduled_by_name": current_user.get("full_name", "Unknown"),
            "status": "upcoming",  # Reset status
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create audit log
    await create_audit_log(
        log_type=AuditLogType.INVOICE_MODIFIED,
        entity_type="installment",
        entity_id=installment_id,
        entity_serial=installment["installment_number"],
        user=current_user,
        action_details=f"إعادة جدولة قسط {installment['installment_number']} من {old_date} إلى {reschedule_data.new_due_date}: {reschedule_data.reason}",
        old_values={"due_date": old_date},
        new_values={"due_date": reschedule_data.new_due_date},
        request=request
    )
    
    return {"message": "Installment rescheduled successfully"}

# Update installment statuses (background job - can be called by cron)
@api_router.post("/installments/update-statuses")
async def update_installment_statuses(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Update installment statuses based on due dates (run daily)."""
    now = datetime.now(timezone.utc)
    today_str = now.isoformat()
    
    updated_count = 0
    
    # Get all schedules for grace period info
    schedules = {s["id"]: s for s in await db.installment_schedules.find().to_list(None)}
    
    # Update upcoming to due
    upcoming = await db.installments.find({"status": "upcoming"}).to_list(None)
    for inst in upcoming:
        due_date = datetime.fromisoformat(inst["due_date"].replace("Z", "+00:00")) if isinstance(inst["due_date"], str) else inst["due_date"]
        if due_date.date() <= now.date():
            await db.installments.update_one(
                {"id": inst["id"]},
                {"$set": {"status": "due", "updated_at": today_str}}
            )
            updated_count += 1
    
    # Update due to grace/overdue
    due = await db.installments.find({"status": {"$in": ["due", "grace"]}}).to_list(None)
    for inst in due:
        due_date = datetime.fromisoformat(inst["due_date"].replace("Z", "+00:00")) if isinstance(inst["due_date"], str) else inst["due_date"]
        schedule = schedules.get(inst.get("schedule_id", ""))
        grace_days = schedule.get("grace_period_days", 3) if schedule else 3
        
        grace_end = due_date + timedelta(days=grace_days)
        
        if now > grace_end:
            await db.installments.update_one(
                {"id": inst["id"]},
                {"$set": {"status": "overdue", "updated_at": today_str}}
            )
            updated_count += 1
        elif now > due_date and now <= grace_end:
            await db.installments.update_one(
                {"id": inst["id"]},
                {"$set": {"status": "grace", "updated_at": today_str}}
            )
            updated_count += 1
    
    return {"message": f"Updated {updated_count} installment statuses"}

# Get all invoices
@api_router.get("/accounting/invoices")
async def get_invoices(
    status: Optional[str] = None,
    clinic_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get all invoices with optional filters and pagination."""
    query = {}
    
    if status:
        query["status"] = status
    if clinic_id:
        query["clinic_id"] = clinic_id
    if start_date:
        query["invoice_date"] = {"$gte": start_date}
    if end_date:
        if "invoice_date" in query:
            query["invoice_date"]["$lte"] = end_date
        else:
            query["invoice_date"] = {"$lte": end_date}
    if search:
        query["$or"] = [
            {"clinic_name": {"$regex": search, "$options": "i"}},
            {"created_by_name": {"$regex": search, "$options": "i"}},
            {"invoice_number": {"$regex": search, "$options": "i"} if not search.isdigit() else int(search)}
        ]
    
    total = await db.invoices.count_documents(query)
    limit = min(limit, 100)
    invoices = await db.invoices.find(query, {"_id": 0}).sort("invoice_date", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": invoices, "total": total, "skip": skip, "limit": limit}

# Get single invoice
@api_router.get("/accounting/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get invoice details by ID."""
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice

# Get all payments
@api_router.get("/accounting/payments")
async def get_payments(
    invoice_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get all payment records with pagination."""
    query = {}
    
    if invoice_id:
        query["invoice_id"] = invoice_id
    if start_date:
        query["payment_date"] = {"$gte": start_date}
    if end_date:
        if "payment_date" in query:
            query["payment_date"]["$lte"] = end_date
        else:
            query["payment_date"] = {"$lte": end_date}
    
    total = await db.payments.count_documents(query)
    limit = min(limit, 100)
    payments = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": payments, "total": total, "skip": skip, "limit": limit}

# Record a payment
@api_router.post("/accounting/payments")
async def create_payment(
    payment: PaymentCreate,
    request: Request,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Record a new payment for an invoice."""
    # Get invoice
    invoice = await db.invoices.find_one({"id": payment.invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Validate payment amount
    remaining = invoice.get("remaining_amount", 0)
    if payment.amount > remaining:
        raise HTTPException(status_code=400, detail=f"Payment amount ({payment.amount}) exceeds remaining amount ({remaining})")
    
    if payment.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
    
    # Get payment number
    payment_number = await get_next_serial_number("payments", 20001)
    
    # Create payment record
    new_payment = Payment(
        payment_number=payment_number,
        invoice_id=payment.invoice_id,
        invoice_number=invoice.get("invoice_number", 0),
        clinic_id=invoice["clinic_id"],
        clinic_name=invoice.get("clinic_name", "Unknown"),
        amount=payment.amount,
        payment_method=payment.payment_method,
        payment_date=payment.payment_date or datetime.now(timezone.utc),
        collected_by=current_user["id"],
        collected_by_name=current_user.get("full_name", "Unknown"),
        receipt_number=payment.receipt_number,
        receipt_url=payment.receipt_url,
        notes=payment.notes
    )
    
    doc = new_payment.model_dump()
    doc["payment_date"] = doc["payment_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.payments.insert_one(doc)
    
    # Update invoice
    new_paid = invoice.get("paid_amount", 0) + payment.amount
    new_remaining = invoice.get("total_amount", 0) - new_paid
    new_status = InvoiceStatus.FULLY_PAID if new_remaining <= 0 else InvoiceStatus.PARTIALLY_PAID
    
    # Add payment to invoice payments list (timeline)
    payment_summary = {
        "id": new_payment.id,
        "payment_number": payment_number,
        "amount": payment.amount,
        "method": payment.payment_method.value,
        "date": doc["payment_date"],
        "collected_by_name": current_user.get("full_name", "Unknown"),
        "receipt_number": payment.receipt_number,
        "receipt_url": payment.receipt_url,
        "notes": payment.notes
    }
    
    await db.invoices.update_one(
        {"id": payment.invoice_id},
        {
            "$set": {
                "paid_amount": new_paid,
                "remaining_amount": max(0, new_remaining),
                "status": new_status.value,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"payments": payment_summary}
        }
    )
    
    # Create audit log
    await create_audit_log(
        log_type=AuditLogType.PAYMENT_RECORDED,
        entity_type="payment",
        entity_id=new_payment.id,
        entity_serial=payment_number,
        user=current_user,
        action_details=f"تم تسجيل دفعة {payment.amount} للفاتورة رقم {invoice.get('invoice_number')}",
        amount=payment.amount,
        new_values={"paid_amount": new_paid, "remaining_amount": max(0, new_remaining)},
        request=request
    )
    
    return {
        "message": "Payment recorded successfully",
        "payment": doc,
        "invoice_status": new_status.value,
        "remaining_amount": max(0, new_remaining)
    }

# Get debts (outstanding invoices)
@api_router.get("/accounting/debts")
async def get_debts(
    clinic_id: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get all outstanding debts (invoices with remaining amount > 0)."""
    query = {"remaining_amount": {"$gt": 0}}
    if clinic_id:
        query["clinic_id"] = clinic_id
    
    debts = await db.invoices.find(query, {"_id": 0}).sort("invoice_date", 1).to_list(500)
    
    # Calculate days overdue for each
    now = datetime.now(timezone.utc)
    for debt in debts:
        invoice_date = debt.get("invoice_date")
        if isinstance(invoice_date, str):
            try:
                invoice_date = datetime.fromisoformat(invoice_date.replace('Z', '+00:00'))
            except:
                invoice_date = now
        days_old = (now - invoice_date).days if invoice_date else 0
        debt["days_old"] = days_old
        debt["is_overdue"] = days_old > 30
    
    return debts

# Get debts grouped by clinic
@api_router.get("/accounting/debts/by-clinic")
async def get_debts_by_clinic(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get debts grouped by clinic."""
    pipeline = [
        {"$match": {"remaining_amount": {"$gt": 0}}},
        {"$group": {
            "_id": "$clinic_id",
            "clinic_name": {"$first": "$clinic_name"},
            "total_debt": {"$sum": "$remaining_amount"},
            "invoice_count": {"$sum": 1},
            "invoices": {"$push": {
                "id": "$id",
                "invoice_number": "$invoice_number",
                "remaining_amount": "$remaining_amount",
                "invoice_date": "$invoice_date"
            }}
        }},
        {"$sort": {"total_debt": -1}}
    ]
    
    result = await db.invoices.aggregate(pipeline).to_list(100)
    return result

# Get overdue debts
@api_router.get("/accounting/debts/overdue")
async def get_overdue_debts(
    days: int = 30,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get overdue debts (older than specified days)."""
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    debts = await db.invoices.find({
        "remaining_amount": {"$gt": 0},
        "invoice_date": {"$lt": cutoff_date}
    }, {"_id": 0}).sort("invoice_date", 1).to_list(200)
    
    return debts

# Get approved expenses for accounting
@api_router.get("/accounting/approved-expenses")
async def get_approved_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get all approved expenses for accounting view."""
    query = {"status": "approved"}
    
    if start_date:
        query["expense_date"] = {"$gte": start_date}
    if end_date:
        if "expense_date" in query:
            query["expense_date"]["$lte"] = end_date
        else:
            query["expense_date"] = {"$lte": end_date}
    if category:
        query["category"] = category
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("expense_date", -1).to_list(500)
    
    # Enrich with user names
    user_ids = list(set(e.get("medical_rep_id") for e in expenses if e.get("medical_rep_id")))
    reviewer_ids = list(set(e.get("reviewed_by") for e in expenses if e.get("reviewed_by")))
    all_user_ids = list(set(user_ids + reviewer_ids))
    
    users = await db.users.find({"id": {"$in": all_user_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(len(all_user_ids))
    user_map = {u["id"]: u["full_name"] for u in users}
    
    for expense in expenses:
        expense["submitter_name"] = user_map.get(expense.get("medical_rep_id"), "Unknown")
        expense["reviewer_name"] = user_map.get(expense.get("reviewed_by"), "Unknown")
    
    return expenses

# Get audit log
@api_router.get("/accounting/audit-log")
async def get_audit_log(
    entity_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]))
):
    """Get financial audit log."""
    query = {}
    
    if entity_type:
        query["entity_type"] = entity_type
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    if user_id:
        query["user_id"] = user_id
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return logs

# Get daily report
@api_router.get("/accounting/reports/daily")
async def get_daily_report(
    date: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get daily financial report."""
    if date:
        report_date = datetime.fromisoformat(date)
    else:
        report_date = datetime.now(timezone.utc)
    
    day_start = report_date.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    day_end = report_date.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
    
    # Invoices created today
    invoices = await db.invoices.find({
        "invoice_date": {"$gte": day_start, "$lte": day_end}
    }, {"_id": 0}).to_list(100)
    
    invoices_total = sum(inv.get("total_amount", 0) for inv in invoices)
    
    # Payments collected today
    payments = await db.payments.find({
        "payment_date": {"$gte": day_start, "$lte": day_end}
    }, {"_id": 0}).to_list(100)
    
    payments_total = sum(p.get("amount", 0) for p in payments)
    
    # Expenses approved today
    expenses = await db.expenses.find({
        "status": "approved",
        "reviewed_at": {"$gte": day_start, "$lte": day_end}
    }, {"_id": 0}).to_list(100)
    
    expenses_total = sum(e.get("amount", 0) for e in expenses)
    
    return {
        "date": date or report_date.date().isoformat(),
        "invoices": {
            "count": len(invoices),
            "total": invoices_total,
            "items": invoices
        },
        "payments": {
            "count": len(payments),
            "total": payments_total,
            "items": payments
        },
        "expenses": {
            "count": len(expenses),
            "total": expenses_total,
            "items": expenses
        },
        "net_cash_flow": payments_total - expenses_total
    }

# Get monthly report
@api_router.get("/accounting/reports/monthly")
async def get_monthly_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get monthly financial report."""
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    
    month_start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    if month == 12:
        month_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc).isoformat()
    else:
        month_end = datetime(year, month + 1, 1, tzinfo=timezone.utc).isoformat()
    
    # Invoices for the month
    invoices_pipeline = [
        {"$match": {"invoice_date": {"$gte": month_start, "$lt": month_end}}},
        {"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "total": {"$sum": "$total_amount"},
            "collected": {"$sum": "$paid_amount"}
        }}
    ]
    invoices_result = await db.invoices.aggregate(invoices_pipeline).to_list(1)
    invoices_summary = invoices_result[0] if invoices_result else {"count": 0, "total": 0, "collected": 0}
    
    # Payments for the month
    payments_pipeline = [
        {"$match": {"payment_date": {"$gte": month_start, "$lt": month_end}}},
        {"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "total": {"$sum": "$amount"}
        }}
    ]
    payments_result = await db.payments.aggregate(payments_pipeline).to_list(1)
    payments_summary = payments_result[0] if payments_result else {"count": 0, "total": 0}
    
    # Expenses for the month
    expenses_pipeline = [
        {"$match": {"status": "approved", "expense_date": {"$gte": month_start, "$lt": month_end}}},
        {"$group": {
            "_id": "$category",
            "count": {"$sum": 1},
            "total": {"$sum": "$amount"}
        }}
    ]
    expenses_result = await db.expenses.aggregate(expenses_pipeline).to_list(20)
    
    expenses_by_category = {item["_id"]: {"count": item["count"], "total": item["total"]} for item in expenses_result}
    expenses_total = sum(item["total"] for item in expenses_result)
    
    # Daily breakdown
    daily_pipeline = [
        {"$match": {"payment_date": {"$gte": month_start, "$lt": month_end}}},
        {"$addFields": {
            "day": {"$dayOfMonth": {"$dateFromString": {"dateString": "$payment_date"}}}
        }},
        {"$group": {
            "_id": "$day",
            "total": {"$sum": "$amount"}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_result = await db.payments.aggregate(daily_pipeline).to_list(31)
    daily_collections = {item["_id"]: item["total"] for item in daily_result}
    
    return {
        "year": year,
        "month": month,
        "invoices": {
            "count": invoices_summary.get("count", 0),
            "total": invoices_summary.get("total", 0),
            "collected_from_month_invoices": invoices_summary.get("collected", 0)
        },
        "payments": {
            "count": payments_summary.get("count", 0),
            "total": payments_summary.get("total", 0)
        },
        "expenses": {
            "total": expenses_total,
            "by_category": expenses_by_category
        },
        "net_income": payments_summary.get("total", 0) - expenses_total,
        "daily_collections": daily_collections
    }

# Get accounting alerts
@api_router.get("/accounting/alerts")
async def get_accounting_alerts(
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Get accounting alerts (overdue invoices, etc.)."""
    now = datetime.now(timezone.utc)
    alerts = []
    
    # Check for overdue invoices (more than 30 days)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    overdue = await db.invoices.find({
        "remaining_amount": {"$gt": 0},
        "invoice_date": {"$lt": thirty_days_ago}
    }, {"_id": 0}).to_list(50)
    
    for invoice in overdue:
        invoice_date = invoice.get("invoice_date")
        if isinstance(invoice_date, str):
            try:
                invoice_date = datetime.fromisoformat(invoice_date.replace('Z', '+00:00'))
            except:
                invoice_date = now - timedelta(days=31)
        
        days_overdue = (now - invoice_date).days
        
        alerts.append({
            "id": f"overdue_{invoice['id']}",
            "type": "overdue_invoice",
            "severity": "high" if days_overdue > 60 else "medium",
            "invoice_id": invoice["id"],
            "invoice_number": invoice.get("invoice_number"),
            "clinic_name": invoice.get("clinic_name"),
            "amount_due": invoice.get("remaining_amount"),
            "days_overdue": days_overdue,
            "message": f"فاتورة رقم {invoice.get('invoice_number')} متأخرة {days_overdue} يوم - المبلغ المتبقي: {invoice.get('remaining_amount')}"
        })
    
    # Sort by severity and days overdue
    alerts.sort(key=lambda x: (-1 if x["severity"] == "high" else 0, -x["days_overdue"]))
    
    return alerts

# Export to Excel
@api_router.get("/accounting/export-excel")
async def export_accounting_excel(
    export_type: str = "invoices",  # invoices, payments, debts, expenses
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.GM, UserRole.ACCOUNTANT]))
):
    """Export accounting data to Excel (CSV format)."""
    output = io.StringIO()
    
    if export_type == "invoices":
        query = {}
        if start_date:
            query["invoice_date"] = {"$gte": start_date}
        if end_date:
            if "invoice_date" in query:
                query["invoice_date"]["$lte"] = end_date
            else:
                query["invoice_date"] = {"$lte": end_date}
        
        data = await db.invoices.find(query, {"_id": 0}).sort("invoice_date", -1).to_list(1000)
        
        writer = csv.writer(output)
        writer.writerow(["رقم الفاتورة", "العيادة", "المندوب", "المنطقة", "الخط", "المبلغ الإجمالي", "المدفوع", "المتبقي", "الحالة", "التاريخ"])
        for row in data:
            writer.writerow([
                row.get("invoice_number"),
                row.get("clinic_name"),
                row.get("created_by_name"),
                row.get("area_name"),
                row.get("line_name"),
                row.get("total_amount"),
                row.get("paid_amount"),
                row.get("remaining_amount"),
                row.get("status"),
                row.get("invoice_date")
            ])
    
    elif export_type == "payments":
        query = {}
        if start_date:
            query["payment_date"] = {"$gte": start_date}
        if end_date:
            if "payment_date" in query:
                query["payment_date"]["$lte"] = end_date
            else:
                query["payment_date"] = {"$lte": end_date}
        
        data = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
        
        writer = csv.writer(output)
        writer.writerow(["رقم الدفعة", "رقم الفاتورة", "العيادة", "المبلغ", "طريقة الدفع", "المحصل", "رقم الإيصال", "التاريخ"])
        for row in data:
            writer.writerow([
                row.get("payment_number"),
                row.get("invoice_number"),
                row.get("clinic_name"),
                row.get("amount"),
                row.get("payment_method"),
                row.get("collected_by_name"),
                row.get("receipt_number"),
                row.get("payment_date")
            ])
    
    elif export_type == "debts":
        data = await db.invoices.find({"remaining_amount": {"$gt": 0}}, {"_id": 0}).sort("invoice_date", 1).to_list(1000)
        
        writer = csv.writer(output)
        writer.writerow(["رقم الفاتورة", "العيادة", "المندوب", "المبلغ الإجمالي", "المدفوع", "المتبقي", "تاريخ الفاتورة"])
        for row in data:
            writer.writerow([
                row.get("invoice_number"),
                row.get("clinic_name"),
                row.get("created_by_name"),
                row.get("total_amount"),
                row.get("paid_amount"),
                row.get("remaining_amount"),
                row.get("invoice_date")
            ])
    
    elif export_type == "expenses":
        query = {"status": "approved"}
        if start_date:
            query["expense_date"] = {"$gte": start_date}
        if end_date:
            if "expense_date" in query:
                query["expense_date"]["$lte"] = end_date
            else:
                query["expense_date"] = {"$lte": end_date}
        
        data = await db.expenses.find(query, {"_id": 0}).sort("expense_date", -1).to_list(1000)
        
        writer = csv.writer(output)
        writer.writerow(["الرقم التسلسلي", "النوع", "الفئة", "المبلغ", "الوصف", "التاريخ", "المعتمد"])
        for row in data:
            writer.writerow([
                row.get("serial_number"),
                row.get("expense_type"),
                row.get("category"),
                row.get("amount"),
                row.get("description"),
                row.get("expense_date"),
                row.get("reviewed_by")
            ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=accounting_{export_type}_{datetime.now().strftime('%Y%m%d')}.csv"
        }
    )


# ═══════════════════════════════════════════════════════════════════════════
# WHATSAPP SETTINGS API
# ═══════════════════════════════════════════════════════════════════════════

class WhatsAppSettingsModel(BaseModel):
    enabled: bool = False
    api_provider: str = "ultramsg"  # ultramsg, twilio, wati, etc.
    api_key: str = ""
    instance_id: str = ""
    default_country_code: str = "+20"
    reminder_7_days_enabled: bool = True
    reminder_3_days_enabled: bool = True
    reminder_due_day_enabled: bool = True
    reminder_overdue_enabled: bool = True
    template_reminder: str = "مرحباً {clinic_name}، نذكركم بموعد استحقاق القسط رقم {installment_number} بقيمة {amount} بتاريخ {due_date}. شكراً لتعاملكم معنا."
    template_overdue: str = "مرحباً {clinic_name}، القسط رقم {installment_number} بقيمة {amount} متأخر منذ {days_overdue} يوم. يرجى السداد في أقرب وقت."
    template_payment_confirmation: str = "شكراً {clinic_name}، تم استلام دفعة بقيمة {amount}. المتبقي: {remaining}."

@api_router.get("/whatsapp-settings")
async def get_whatsapp_settings(current_user: dict = Depends(get_current_user)):
    """Get WhatsApp settings (Super Admin / Accountant only)"""
    if current_user.get("role") not in ["super_admin", "accountant"]:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لعرض هذه الإعدادات")
    
    settings = await db.whatsapp_settings.find_one({}, {"_id": 0})
    if not settings:
        # Return default settings
        return WhatsAppSettingsModel().model_dump()
    return settings

@api_router.put("/whatsapp-settings")
async def update_whatsapp_settings(
    settings: WhatsAppSettingsModel,
    current_user: dict = Depends(get_current_user)
):
    """Update WhatsApp settings (Super Admin only)"""
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="فقط المسؤول يمكنه تعديل هذه الإعدادات")
    
    settings_dict = settings.model_dump()
    settings_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    settings_dict["updated_by"] = current_user.get("id")
    
    await db.whatsapp_settings.replace_one({}, settings_dict, upsert=True)
    
    return {"message": "تم تحديث إعدادات WhatsApp بنجاح", "settings": settings_dict}

@api_router.post("/whatsapp-settings/test")
async def test_whatsapp_connection(
    phone: str,
    current_user: dict = Depends(get_current_user)
):
    """Test WhatsApp connection by sending a test message"""
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="فقط المسؤول يمكنه اختبار الاتصال")
    
    settings = await db.whatsapp_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("enabled"):
        raise HTTPException(status_code=400, detail="إعدادات WhatsApp غير مفعلة")
    
    if not settings.get("api_key") or not settings.get("instance_id"):
        raise HTTPException(status_code=400, detail="يرجى إدخال مفتاح API ومعرف الحساب")
    
    # For now, just simulate success - actual implementation would call the API
    # This is a placeholder for actual WhatsApp API integration
    provider = settings.get("api_provider", "ultramsg")
    
    return {
        "success": True,
        "message": f"تم إرسال رسالة اختبار عبر {provider} إلى {phone}",
        "provider": provider
    }


# ═══════════════════════════════════════════════════════════════════════════
# INSTALLMENT RESCHEDULE API
# ═══════════════════════════════════════════════════════════════════════════

class InstallmentRescheduleRequest(BaseModel):
    new_due_date: str
    reason: str

@api_router.post("/installments/{installment_id}/reschedule")
async def reschedule_installment(
    installment_id: str,
    request: InstallmentRescheduleRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reschedule an installment's due date (Admin/Accountant only)"""
    if current_user.get("role") not in ["super_admin", "accountant"]:
        raise HTTPException(status_code=403, detail="فقط المسؤول أو المحاسب يمكنه إعادة جدولة الأقساط")
    
    # Find the installment
    installment = await db.installments.find_one({"id": installment_id})
    if not installment:
        raise HTTPException(status_code=404, detail="القسط غير موجود")
    
    # Can't reschedule paid installments
    if installment.get("status") == "paid":
        raise HTTPException(status_code=400, detail="لا يمكن إعادة جدولة قسط مدفوع بالكامل")
    
    old_due_date = installment.get("due_date")
    
    # Update installment
    await db.installments.update_one(
        {"id": installment_id},
        {
            "$set": {
                "due_date": request.new_due_date,
                "rescheduled_from": old_due_date,
                "reschedule_reason": request.reason,
                "rescheduled_by": current_user.get("id"),
                "rescheduled_at": datetime.now(timezone.utc).isoformat(),
                "status": "upcoming"  # Reset status since we changed the date
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "installment_rescheduled",
        "entity_type": "installment",
        "entity_id": installment_id,
        "performed_by": current_user.get("id"),
        "performed_by_name": current_user.get("full_name", current_user.get("username")),
        "details": {
            "old_due_date": old_due_date,
            "new_due_date": request.new_due_date,
            "reason": request.reason,
            "invoice_id": installment.get("invoice_id")
        },
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "تم إعادة جدولة القسط بنجاح",
        "old_due_date": old_due_date,
        "new_due_date": request.new_due_date
    }


# ═══════════════════════════════════════════════════════════════════════════
# INSTALLMENTS ANALYTICS & CREDIT SCORING API
# ═══════════════════════════════════════════════════════════════════════════

@api_router.get("/installments/analytics")
async def get_installments_analytics(current_user: dict = Depends(get_current_user)):
    """Get comprehensive installments analytics"""
    if current_user.get("role") not in ["super_admin", "accountant", "admin"]:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")
    
    # Get all installments
    all_installments = await db.installments.find({}).to_list(10000)
    
    # Status breakdown
    status_counts = {"upcoming": 0, "due": 0, "grace": 0, "overdue": 0, "paid": 0, "partial": 0}
    status_amounts = {"upcoming": 0, "due": 0, "grace": 0, "overdue": 0, "paid": 0, "partial": 0}
    total_amount = 0
    total_paid = 0
    total_remaining = 0
    
    # Clinic breakdown
    clinic_data = {}
    
    for inst in all_installments:
        status = inst.get("status", "upcoming")
        amount = inst.get("amount", 0)
        paid = inst.get("paid_amount", 0)
        remaining = inst.get("remaining_amount", amount)
        clinic_id = inst.get("clinic_id")
        clinic_name = inst.get("clinic_name", "Unknown")
        
        status_counts[status] = status_counts.get(status, 0) + 1
        status_amounts[status] = status_amounts.get(status, 0) + remaining
        total_amount += amount
        total_paid += paid
        total_remaining += remaining
        
        # Aggregate by clinic
        if clinic_id:
            if clinic_id not in clinic_data:
                clinic_data[clinic_id] = {
                    "clinic_name": clinic_name,
                    "total_installments": 0,
                    "total_amount": 0,
                    "paid_amount": 0,
                    "overdue_count": 0,
                    "overdue_amount": 0,
                    "paid_on_time_count": 0
                }
            clinic_data[clinic_id]["total_installments"] += 1
            clinic_data[clinic_id]["total_amount"] += amount
            clinic_data[clinic_id]["paid_amount"] += paid
            if status == "overdue":
                clinic_data[clinic_id]["overdue_count"] += 1
                clinic_data[clinic_id]["overdue_amount"] += remaining
            if status == "paid":
                clinic_data[clinic_id]["paid_on_time_count"] += 1
    
    # Calculate collection rate
    collection_rate = (total_paid / total_amount * 100) if total_amount > 0 else 0
    
    # Top overdue clinics
    top_overdue = sorted(
        [{"clinic_id": k, **v} for k, v in clinic_data.items()],
        key=lambda x: x["overdue_amount"],
        reverse=True
    )[:10]
    
    return {
        "summary": {
            "total_installments": len(all_installments),
            "total_amount": total_amount,
            "total_paid": total_paid,
            "total_remaining": total_remaining,
            "collection_rate": round(collection_rate, 2)
        },
        "status_breakdown": {
            "counts": status_counts,
            "amounts": status_amounts
        },
        "top_overdue_clinics": top_overdue,
        "clinic_count": len(clinic_data)
    }

@api_router.get("/clinics/{clinic_id}/credit-score")
async def get_clinic_credit_score(clinic_id: str, current_user: dict = Depends(get_current_user)):
    """Calculate and return credit score for a clinic based on payment history"""
    if current_user.get("role") not in ["super_admin", "accountant", "admin"]:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")
    
    # Get clinic's installments
    installments = await db.installments.find({"clinic_id": clinic_id}).to_list(1000)
    
    if not installments:
        return {
            "clinic_id": clinic_id,
            "credit_score": 100,  # Default score for new clinics
            "rating": "A",
            "details": {"message": "لا توجد أقساط سابقة لهذه العيادة"}
        }
    
    # Calculate score components
    total_installments = len(installments)
    paid_on_time = 0
    paid_late = 0
    overdue = 0
    total_overdue_days = 0
    
    for inst in installments:
        status = inst.get("status")
        if status == "paid":
            # Check if paid on time (no rescheduled_from means it was on time)
            if not inst.get("rescheduled_from"):
                paid_on_time += 1
            else:
                paid_late += 1
        elif status == "overdue":
            overdue += 1
            # Calculate days overdue
            due_date = inst.get("due_date")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                    days_late = (datetime.now(timezone.utc) - due_dt).days
                    total_overdue_days += max(0, days_late)
                except:
                    pass
    
    # Score calculation (max 100)
    # Base score: 100
    # -5 points per overdue installment
    # -1 point per 7 days of total overdue
    # -2 points per late payment
    # +2 points per on-time payment (up to 20 bonus)
    
    score = 100
    score -= overdue * 5
    score -= (total_overdue_days // 7)
    score -= paid_late * 2
    score += min(paid_on_time * 2, 20)  # Cap bonus at 20
    
    # Clamp score between 0 and 100
    score = max(0, min(100, score))
    
    # Determine rating
    if score >= 90:
        rating = "A"
        rating_label = "ممتاز"
    elif score >= 75:
        rating = "B"
        rating_label = "جيد جداً"
    elif score >= 60:
        rating = "C"
        rating_label = "جيد"
    elif score >= 40:
        rating = "D"
        rating_label = "مقبول"
    else:
        rating = "F"
        rating_label = "ضعيف"
    
    # Store/update credit score
    await db.clinic_credit_scores.update_one(
        {"clinic_id": clinic_id},
        {
            "$set": {
                "clinic_id": clinic_id,
                "credit_score": score,
                "rating": rating,
                "rating_label": rating_label,
                "total_installments": total_installments,
                "paid_on_time": paid_on_time,
                "paid_late": paid_late,
                "current_overdue": overdue,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    return {
        "clinic_id": clinic_id,
        "credit_score": score,
        "rating": rating,
        "rating_label": rating_label,
        "details": {
            "total_installments": total_installments,
            "paid_on_time": paid_on_time,
            "paid_late": paid_late,
            "current_overdue": overdue,
            "total_overdue_days": total_overdue_days
        }
    }

@api_router.get("/installments/export")
async def export_installments_report(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export installments report as CSV"""
    if current_user.get("role") not in ["super_admin", "accountant", "admin"]:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")
    
    query = {}
    if status and status != "all":
        query["status"] = status
    
    installments = await db.installments.find(query, {"_id": 0}).sort("due_date", 1).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "رقم القسط", "رقم الفاتورة", "العيادة", "المبلغ", 
        "المدفوع", "المتبقي", "تاريخ الاستحقاق", "الحالة"
    ])
    
    status_labels = {
        "upcoming": "قادم",
        "due": "مستحق",
        "grace": "فترة سماح",
        "overdue": "متأخر",
        "paid": "مدفوع",
        "partial": "مدفوع جزئياً"
    }
    
    for inst in installments:
        writer.writerow([
            inst.get("installment_number"),
            inst.get("invoice_number"),
            inst.get("clinic_name"),
            inst.get("amount"),
            inst.get("paid_amount", 0),
            inst.get("remaining_amount"),
            inst.get("due_date", "")[:10] if inst.get("due_date") else "",
            status_labels.get(inst.get("status"), inst.get("status"))
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=installments_report_{datetime.now().strftime('%Y%m%d')}.csv"
        }
    )

# ═══════════════════════════════════════════════════════════════════════════
# PLANS MODULE API
# ═══════════════════════════════════════════════════════════════════════════

@api_router.get("/users/autocomplete")
async def users_autocomplete(
    q: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Search users by name for autocomplete. Returns matching users."""
    query = {"is_deleted": {"$ne": True}}
    if q:
        query["full_name"] = {"$regex": q, "$options": "i"}
    
    users = await db.users.find(query).limit(20).to_list(20)
    return [
        {
            "id": u["id"],
            "full_name": u.get("full_name", ""),
            "role": u.get("role", ""),
            "username": u.get("username", "")
        }
        for u in users
    ]

@api_router.post("/plans")
async def create_plan(
    plan_data: PlanCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new monthly plan."""
    # Check if plan for this month already exists
    existing = await db.plans.find_one({
        "user_id": current_user["id"],
        "month": plan_data.month,
        "year": plan_data.year
    })
    if existing:
        raise HTTPException(status_code=400, detail="يوجد خطة لهذا الشهر بالفعل")
    
    # Get manager_id from current user
    manager_id = current_user.get("manager_id")
    if not manager_id and current_user.get("role") not in ["super_admin", "gm"]:
        raise HTTPException(status_code=400, detail="لا يوجد مدير مباشر لك")
    
    plan_id = str(uuid.uuid4())
    plan = {
        "id": plan_id,
        "user_id": current_user["id"],
        "manager_id": manager_id or current_user["id"],
        "month": plan_data.month,
        "year": plan_data.year,
        "status": "draft",
        "planned_visits": plan_data.planned_visits,
        "recurring_visits": plan_data.recurring_visits,
        "new_clinics": plan_data.new_clinics,
        "notes": plan_data.notes,
        "comments": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.plans.insert_one(plan)
    return plan

@api_router.get("/plans")
async def get_plans(
    month: Optional[int] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get plans based on user role. Reps see own, Managers see team, GM/Admin see all."""
    query = {}
    
    if current_user.get("role") == "medical_rep":
        query["user_id"] = current_user["id"]
    elif current_user.get("role") == "manager":
        team = await db.users.find({"manager_id": current_user["id"]}).to_list(100)
        team_ids = [u["id"] for u in team]
        team_ids.append(current_user["id"])
        query["user_id"] = {"$in": team_ids}
    
    if month:
        query["month"] = month
    if year:
        query["year"] = year
    if status:
        query["status"] = status
    
    plans = await db.plans.find(query).sort("created_at", -1).to_list(100)
    
    for plan in plans:
        user = await db.users.find_one({"id": plan.get("user_id")})
        plan["user_name"] = user.get("full_name", "Unknown") if user else "Unknown"
    
    return plans

@api_router.get("/plans/{plan_id}")
async def get_plan(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific plan by ID with clinic names."""
    plan = await db.plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    if current_user.get("role") == "medical_rep" and plan["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض هذه الخطة")
    
    # Get clinic names
    clinic_ids = [v.get("clinic_id") for v in plan.get("planned_visits", []) if v.get("clinic_id")]
    clinic_ids.extend([v.get("clinic_id") for v in plan.get("recurring_visits", []) if v.get("clinic_id")])
    clinics = await db.clinics.find({"id": {"$in": clinic_ids}}).to_list(100)
    clinic_map = {c["id"]: c.get("name", "Unknown") for c in clinics}
    
    for v in plan.get("planned_visits", []):
        v["clinic_name"] = clinic_map.get(v.get("clinic_id"), "Unknown")
    for v in plan.get("recurring_visits", []):
        v["clinic_name"] = clinic_map.get(v.get("clinic_id"), "Unknown")
    
    return plan

@api_router.put("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    plan_data: PlanUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a plan. Only allowed if status is draft or needs_revision."""
    plan = await db.plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    if plan["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل هذه الخطة")
    
    if plan.get("status") not in ["draft", "needs_revision"]:
        raise HTTPException(status_code=400, detail="لا يمكن تعديل الخطة بعد إرسالها للموافقة")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if plan_data.notes is not None:
        update_data["notes"] = plan_data.notes
    if plan_data.planned_visits is not None:
        update_data["planned_visits"] = plan_data.planned_visits
    if plan_data.recurring_visits is not None:
        update_data["recurring_visits"] = plan_data.recurring_visits
    if plan_data.new_clinics is not None:
        update_data["new_clinics"] = plan_data.new_clinics
    
    await db.plans.update_one({"id": plan_id}, {"$set": update_data})
    return {"message": "تم تحديث الخطة بنجاح"}

@api_router.post("/plans/{plan_id}/submit")
async def submit_plan(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Submit a plan for manager approval."""
    plan = await db.plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    if plan["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإرسال هذه الخطة")
    
    if plan.get("status") not in ["draft", "needs_revision"]:
        raise HTTPException(status_code=400, detail="لا يمكن إرسال هذه الخطة")
    
    await db.plans.update_one(
        {"id": plan_id},
        {"$set": {
            "status": "pending_approval",
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify manager
    manager = await db.users.find_one({"id": plan.get("manager_id")})
    if manager:
        await create_notification(
            user_id=manager["id"],
            type=NotificationType.ORDER_PENDING_APPROVAL,
            title="خطة جديدة للموافقة",
            message=f"تم إرسال خطة شهر {plan['month']}/{plan['year']} من {current_user.get('full_name')} للموافقة",
            data={"plan_id": plan_id}
        )
    
    return {"message": "تم إرسال الخطة للموافقة"}

@api_router.post("/plans/{plan_id}/approve")
async def approve_plan(
    plan_id: str,
    action_data: PlanApprovalAction,
    current_user: dict = Depends(require_role([UserRole.MANAGER, UserRole.GM, UserRole.SUPER_ADMIN]))
):
    """Approve, reject, or request revision for a plan."""
    plan = await db.plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    if current_user.get("role") == "manager" and plan.get("manager_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بالموافقة على هذه الخطة")
    
    if plan.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="الخطة ليست بانتظار الموافقة")
    
    update_data = {"manager_notes": action_data.manager_notes}
    
    if action_data.action == "approve":
        update_data["status"] = "approved"
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
        update_data["approved_by"] = current_user["id"]
        message = "تمت الموافقة على خطتك"
    elif action_data.action == "reject":
        update_data["status"] = "draft"
        update_data["rejection_reason"] = action_data.rejection_reason
        message = f"تم رفض خطتك: {action_data.rejection_reason or 'بدون سبب'}"
    elif action_data.action == "request_revision":
        update_data["status"] = "needs_revision"
        message = f"يرجى تعديل الخطة: {action_data.manager_notes or ''}"
    else:
        raise HTTPException(status_code=400, detail="إجراء غير صحيح")
    
    await db.plans.update_one({"id": plan_id}, {"$set": update_data})
    
    await create_notification(
        user_id=plan["user_id"],
        type=NotificationType.ORDER_APPROVED if action_data.action == "approve" else NotificationType.ORDER_REJECTED,
        title="تحديث حالة الخطة",
        message=message,
        data={"plan_id": plan_id}
    )
    
    return {"message": "تم تحديث حالة الخطة"}

@api_router.post("/plans/{plan_id}/comments")
async def add_plan_comment(
    plan_id: str,
    comment_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add a comment to a plan."""
    plan = await db.plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("full_name", "Unknown"),
        "content": comment_data.get("content", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.plans.update_one({"id": plan_id}, {"$push": {"comments": comment}})
    return {"message": "تم إضافة التعليق", "comment": comment}

@api_router.get("/plans/stats/summary")
async def get_plans_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get plan statistics summary."""
    query = {}
    
    if current_user.get("role") == "medical_rep":
        query["user_id"] = current_user["id"]
    elif current_user.get("role") == "manager":
        team = await db.users.find({"manager_id": current_user["id"]}).to_list(100)
        query["user_id"] = {"$in": [u["id"] for u in team] + [current_user["id"]]}
    
    if month:
        query["month"] = month
    if year:
        query["year"] = year
    
    plans = await db.plans.find(query).to_list(100)
    
    total_planned = sum(len(p.get("planned_visits", [])) for p in plans)
    total_completed = sum(
        len([v for v in p.get("planned_visits", []) if v.get("is_completed")])
        for p in plans
    )
    new_clinics = sum(len(p.get("new_clinics", [])) for p in plans)
    
    return {
        "total_plans": len(plans),
        "total_planned_visits": total_planned,
        "completed_visits": total_completed,
        "pending_visits": total_planned - total_completed,
        "completion_rate": round(total_completed / total_planned * 100, 1) if total_planned > 0 else 0,
        "new_clinics_planned": new_clinics
    }

# Include the API router in the app
app.include_router(api_router)



@app.on_event("startup")
async def startup_db_client():
    """Create default superadmin user if none exists."""
    try:
        # Check if any super_admin exists
        existing_admin = await db.users.find_one({"role": "super_admin"})
        if not existing_admin:
            # Create default superadmin user
            default_admin = User(
                username="admin",
                full_name="System Administrator",
                email="admin@system.local",
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            doc = default_admin.model_dump()
            doc["password_hash"] = get_password_hash("admin123")
            doc['created_at'] = doc['created_at'].isoformat()
            await db.users.insert_one(doc)
            logger.info("✅ Created default superadmin user (username: admin, password: admin123)")
        else:
            logger.info("✅ Superadmin user already exists")
    except Exception as e:
        logger.error(f"❌ Failed to create default superadmin: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ===================== SCHEDULED NOTIFICATION JOBS =====================

scheduler = AsyncIOScheduler(timezone="Africa/Cairo")

async def check_invoices_due_today():
    """Check for invoices due today and send notifications to accountants"""
    try:
        today = datetime.now(timezone.utc).date()
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        today_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc)
        
        # Find installments due today
        installments = await db.installments.find({
            "due_date": {"$gte": today_start.isoformat(), "$lte": today_end.isoformat()},
            "status": {"$in": ["pending", "overdue"]}
        }).to_list(100)
        
        for installment in installments:
            # Get order and clinic details
            order = await db.orders.find_one({"id": installment.get("order_id")})
            clinic = await db.clinics.find_one({"id": order.get("clinic_id") if order else None})
            
            # Notify accountants
            await send_notification_to_role(
                UserRole.ACCOUNTANT,
                NotificationType.INVOICE_DUE_TODAY,
                "فاتورة مستحقة اليوم",
                f"فاتورة مستحقة من {clinic.get('name', 'عيادة')} بمبلغ {installment.get('amount', 0)} ج.م",
                {
                    "installment_id": installment.get("id"),
                    "order_id": installment.get("order_id"),
                    "clinic_name": clinic.get("name") if clinic else "N/A",
                    "amount": installment.get("amount"),
                    "due_date": installment.get("due_date")
                }
            )
        
        logger.info(f"✅ Checked {len(installments)} invoices due today")
    except Exception as e:
        logger.error(f"❌ Failed to check invoices due today: {e}")

async def check_invoices_due_tomorrow():
    """Check for invoices due tomorrow and send reminder notifications"""
    try:
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        tomorrow_start = datetime.combine(tomorrow, datetime.min.time()).replace(tzinfo=timezone.utc)
        tomorrow_end = datetime.combine(tomorrow, datetime.max.time()).replace(tzinfo=timezone.utc)
        
        installments = await db.installments.find({
            "due_date": {"$gte": tomorrow_start.isoformat(), "$lte": tomorrow_end.isoformat()},
            "status": "pending"
        }).to_list(100)
        
        for installment in installments:
            order = await db.orders.find_one({"id": installment.get("order_id")})
            clinic = await db.clinics.find_one({"id": order.get("clinic_id") if order else None})
            
            await send_notification_to_role(
                UserRole.ACCOUNTANT,
                NotificationType.INVOICE_DUE_TOMORROW,
                "فاتورة مستحقة غداً",
                f"تذكير: فاتورة من {clinic.get('name', 'عيادة')} مستحقة غداً بمبلغ {installment.get('amount', 0)} ج.م",
                {
                    "installment_id": installment.get("id"),
                    "clinic_name": clinic.get("name") if clinic else "N/A",
                    "amount": installment.get("amount")
                }
            )
        
        logger.info(f"✅ Sent {len(installments)} due tomorrow reminders")
    except Exception as e:
        logger.error(f"❌ Failed to check invoices due tomorrow: {e}")

async def check_overdue_invoices():
    """Check for overdue invoices and send notifications (runs every 10 days)"""
    try:
        today = datetime.now(timezone.utc)
        
        # Find overdue installments
        overdue = await db.installments.find({
            "due_date": {"$lt": today.isoformat()},
            "status": {"$in": ["pending", "overdue"]}
        }).to_list(200)
        
        for installment in overdue:
            order = await db.orders.find_one({"id": installment.get("order_id")})
            clinic = await db.clinics.find_one({"id": order.get("clinic_id") if order else None})
            
            due_date = datetime.fromisoformat(installment.get("due_date", today.isoformat()).replace('Z', '+00:00'))
            days_overdue = (today - due_date).days
            
            # Notify accountants and managers
            for role in [UserRole.ACCOUNTANT, UserRole.GM]:
                await send_notification_to_role(
                    role,
                    NotificationType.INVOICE_OVERDUE,
                    "⚠️ فاتورة متأخرة",
                    f"فاتورة متأخرة {days_overdue} يوم من {clinic.get('name', 'عيادة')} بمبلغ {installment.get('amount', 0)} ج.م",
                    {
                        "installment_id": installment.get("id"),
                        "clinic_name": clinic.get("name") if clinic else "N/A",
                        "days_overdue": days_overdue,
                        "amount": installment.get("amount")
                    }
                )
        
        logger.info(f"✅ Sent {len(overdue)} overdue invoice notifications")
    except Exception as e:
        logger.error(f"❌ Failed to check overdue invoices: {e}")

async def send_daily_report_to_managers():
    """Send daily summary report to managers"""
    try:
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)
        yesterday_start = datetime.combine(yesterday, datetime.min.time()).replace(tzinfo=timezone.utc)
        yesterday_end = datetime.combine(yesterday, datetime.max.time()).replace(tzinfo=timezone.utc)
        
        # Get managers and GM
        managers = await db.users.find({
            "role": {"$in": ["manager", "gm", "super_admin"]},
            "is_active": True,
            "is_deleted": {"$ne": True}
        }).to_list(50)
        
        for manager in managers:
            # Get orders from yesterday for this manager's team (or all for GM/admin)
            query = {"created_at": {"$gte": yesterday_start.isoformat(), "$lte": yesterday_end.isoformat()}}
            if manager["role"] == "manager":
                # Get team members
                team = await db.users.find({"manager_id": manager["id"]}).to_list(50)
                team_ids = [t["id"] for t in team]
                query["created_by"] = {"$in": team_ids}
            
            orders = await db.orders.find(query).to_list(500)
            total_sales = sum(o.get("total", 0) for o in orders)
            pending_orders = await db.orders.count_documents({"status": "pending_approval"})
            
            # Create daily report notification
            await create_notification(
                manager["id"],
                NotificationType.DAILY_REPORT,
                "📊 التقرير اليومي",
                f"طلبات أمس: {len(orders)} | المبيعات: {total_sales:,.0f} ج.م | معلق: {pending_orders}",
                {
                    "date": yesterday.isoformat(),
                    "orders_count": len(orders),
                    "total_sales": total_sales,
                    "pending_orders": pending_orders
                }
            )
        
        logger.info(f"✅ Sent daily reports to {len(managers)} managers")
    except Exception as e:
        logger.error(f"❌ Failed to send daily reports: {e}")

# Start scheduler on app startup
@app.on_event("startup")
async def start_scheduler():
    try:
        # Daily checks at 8:00 AM Cairo time
        scheduler.add_job(check_invoices_due_today, CronTrigger(hour=8, minute=0))
        scheduler.add_job(check_invoices_due_tomorrow, CronTrigger(hour=8, minute=5))
        scheduler.add_job(send_daily_report_to_managers, CronTrigger(hour=8, minute=10))
        
        # Overdue check every 10 days at 9:00 AM
        scheduler.add_job(check_overdue_invoices, CronTrigger(day='1,11,21', hour=9, minute=0))
        
        scheduler.start()
        logger.info("✅ Notification scheduler started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to start scheduler: {e}")