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

from fastapi import File, UploadFile
import shutil

# Image Upload Route
@api_router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Upload image for site customization"""
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
    
    # Create uploads directory if it doesn't exist
    from pathlib import Path
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(exist_ok=True)
    
    # Generate unique filename
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"{str(uuid.uuid4())}.{file_extension}"
    file_path = uploads_dir / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Return URL
    file_url = f"/uploads/{unique_filename}"
    return {"url": file_url, "filename": unique_filename}

# Serve uploaded files
from fastapi.responses import FileResponse

@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve uploaded images"""
    from pathlib import Path
    file_path = Path("uploads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

