import os
from pathlib import Path
from dotenv import load_dotenv
out = []
env_path = Path(__file__).parent / '.env'
out.append(f".env exists: {env_path.exists()}")
if env_path.exists():
    load_dotenv(env_path)
for key in ['MONGO_URL', 'DB_NAME', 'CORS_ORIGINS', 'JWT_SECRET']:
    out.append(f"{key}={os.environ.get(key)}")
try:
    import fastapi  # type: ignore
    out.append(f"fastapi OK: {fastapi.__version__}")
except Exception as e:
    out.append(f"fastapi FAIL: {e}")
try:
    import uvicorn  # type: ignore
    out.append(f"uvicorn OK: {uvicorn.__version__}")
except Exception as e:
    out.append(f"uvicorn FAIL: {e}")
(Path(__file__).parent / 'check_setup_out.txt').write_text('\n'.join(out))
