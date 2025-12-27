#!/usr/bin/env python
"""
Start script for Railway deployment.
Uses the PORT environment variable provided by Railway.
"""
import os
import sys
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"[start.py] Starting server on port {port}", flush=True)
    print(f"[start.py] PORT env = {os.environ.get('PORT', 'NOT SET')}", flush=True)
    sys.stdout.flush()
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False, log_level="info")
