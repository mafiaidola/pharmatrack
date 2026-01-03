"""
Upload local images to S3 and update database URLs
"""
import asyncio
import boto3
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
import mimetypes
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# AWS Configuration (from environment variables)
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "pharmatrack-uploads-prod")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# MongoDB Configuration (from environment variables)
MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "medtrack")

# Validate required environment variables
if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
    print("⚠️ Warning: AWS credentials not set. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.")

if not MONGO_URL:
    print("⚠️ Warning: MONGO_URL not set. Set MONGO_URL environment variable.")

# Initialize S3 client
s3_client = None
if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    s3_client = boto3.client(
        's3',
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )

def upload_file_to_s3(file_path: str, s3_key: str, content_type: str) -> str:
    """Upload a file to S3 and return the public URL"""
    if not s3_client:
        raise Exception("S3 client not initialized. Check AWS credentials.")
    with open(file_path, 'rb') as f:
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=f.read(),
            ContentType=content_type
        )
    return f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"

async def main():
    print("🚀 Starting image upload to S3...")
    
    if not MONGO_URL:
        print("❌ MONGO_URL not set. Please set the environment variable.")
        return
    
    # Connect to MongoDB
    print("🔌 Connecting to MongoDB...")
    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=30000)
        db = client[DB_NAME]
        await db.command('ping')
        print("✅ Connected to MongoDB!")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        return

    
    # Upload all images from uploads folder
    uploads_dir = Path("uploads")
    url_mapping = {}  # Old URL -> New S3 URL
    
    print("\n📤 Uploading images to S3...")
    
    if uploads_dir.exists():
        for file_path in uploads_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']:
                content_type, _ = mimetypes.guess_type(str(file_path))
                content_type = content_type or 'application/octet-stream'
                
                s3_key = f"uploads/{file_path.name}"
                old_url = f"/uploads/{file_path.name}"
                
                try:
                    new_url = upload_file_to_s3(str(file_path), s3_key, content_type)
                    url_mapping[old_url] = new_url
                    print(f"✅ Uploaded: {file_path.name} -> {new_url}")
                except Exception as e:
                    print(f"❌ Failed: {file_path.name} - {e}")
    
    # Also upload loginscreen.jpg and login.jpg from root
    root_images = [
        ("loginscreen.jpg", "uploads/loginscreen.jpg"),
        ("login.jpg", "uploads/login.jpg"),
    ]
    
    for local_name, s3_key in root_images:
        local_path = Path("..") / local_name
        if local_path.exists():
            content_type, _ = mimetypes.guess_type(str(local_path))
            content_type = content_type or 'image/jpeg'
            try:
                new_url = upload_file_to_s3(str(local_path), s3_key, content_type)
                url_mapping[f"/{s3_key}"] = new_url
                print(f"✅ Uploaded: {local_name} -> {new_url}")
            except Exception as e:
                print(f"❌ Failed: {local_name} - {e}")
    
    print(f"\n📦 Total uploaded: {len(url_mapping)} files")
    
    # Get current site_settings
    print("\n🔍 Checking site_settings in database...")
    site_settings = await db.site_settings.find_one({})
    
    if site_settings:
        print(f"📋 Current site_settings found")
        
        # Find the best logo and login_background from uploaded files
        logo_url = None
        login_bg_url = None
        
        # Look for existing settings and update them
        current_logo = site_settings.get('logo_url', '')
        current_login_bg = site_settings.get('login_background_url', '')
        
        print(f"   Current logo_url: {current_logo}")
        print(f"   Current login_background_url: {current_login_bg}")
        
        # Update URLs if they match old pattern
        updates = {}
        
        if current_logo and current_logo.startswith('/uploads/'):
            if current_logo in url_mapping:
                updates['logo_url'] = url_mapping[current_logo]
                print(f"✅ Will update logo_url to S3")
        
        if current_login_bg and current_login_bg.startswith('/uploads/'):
            if current_login_bg in url_mapping:
                updates['login_background_url'] = url_mapping[current_login_bg]
                print(f"✅ Will update login_background_url to S3")
        
        # If no matching URLs found, use the first appropriate image
        if 'logo_url' not in updates and not (current_logo and current_logo.startswith('http')):
            # Find a logo (PNG files are likely logos)
            for old_url, new_url in url_mapping.items():
                if '.png' in old_url.lower():
                    updates['logo_url'] = new_url
                    print(f"✅ Will set logo_url to: {new_url}")
                    break
        
        if 'login_background_url' not in updates and not (current_login_bg and current_login_bg.startswith('http')):
            # Find a background (JPG files are likely backgrounds)
            for old_url, new_url in url_mapping.items():
                if '.jpg' in old_url.lower() or 'login' in old_url.lower():
                    updates['login_background_url'] = new_url
                    print(f"✅ Will set login_background_url to: {new_url}")
                    break
        
        if updates:
            await db.site_settings.update_one({}, {"$set": updates})
            print(f"\n✅ Updated site_settings with {len(updates)} new S3 URLs")
        else:
            print("\n⚠️ No URL updates needed")
    else:
        print("⚠️ No site_settings found - creating new one...")
        # Create new site_settings with S3 URLs
        logo_url = None
        login_bg_url = None
        
        for old_url, new_url in url_mapping.items():
            if '.png' in old_url.lower() and not logo_url:
                logo_url = new_url
            elif ('.jpg' in old_url.lower() or 'login' in old_url.lower()) and not login_bg_url:
                login_bg_url = new_url
        
        if logo_url or login_bg_url:
            new_settings = {
                "system_name": "EP-EG",
                "system_name_ar": "ميدتراك",
                "system_description": "Medical Rep Tracking System",
                "system_description_ar": "نظام تتبع المندوبين الطبيين",
            }
            if logo_url:
                new_settings["logo_url"] = logo_url
            if login_bg_url:
                new_settings["login_background_url"] = login_bg_url
            
            await db.site_settings.insert_one(new_settings)
            print(f"✅ Created new site_settings with S3 URLs")
    
    client.close()
    print("\n✅ All done! Images are now on S3.")

if __name__ == "__main__":
    asyncio.run(main())
