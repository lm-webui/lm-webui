"""
System Routes

This module provides routes for system information and health checks.
"""

from fastapi import APIRouter
import psutil
import platform
import os
from datetime import datetime

router = APIRouter(prefix="/api/system")

@router.get("/health")
async def health_check():
    """System health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "auth": "jwt",
        "encryption": "fernet"
    }

@router.get("/info")
async def system_info():
    """Get system information"""
    # Get memory usage
    memory = psutil.virtual_memory()
    
    # Get disk usage
    disk = psutil.disk_usage('/')
    
    # Get CPU info
    cpu_percent = psutil.cpu_percent(interval=1)
    
    from app.main import _APP_VERSION
    return {
        "app_version": _APP_VERSION,
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor()
        },
        "resources": {
            "cpu_usage_percent": cpu_percent,
            "memory_total_gb": round(memory.total / (1024**3), 2),
            "memory_used_gb": round(memory.used / (1024**3), 2),
            "memory_available_gb": round(memory.available / (1024**3), 2),
            "memory_usage_percent": memory.percent,
            "disk_total_gb": round(disk.total / (1024**3), 2),
            "disk_used_gb": round(disk.used / (1024**3), 2),
            "disk_free_gb": round(disk.free / (1024**3), 2),
            "disk_usage_percent": disk.percent
        },
        "process": {
            "pid": os.getpid(),
            "memory_mb": round(psutil.Process().memory_info().rss / 1024 / 1024, 2),
            "cpu_percent": psutil.Process().cpu_percent()
        }
    }

@router.get("/stats")
async def system_stats():
    """Get application statistics"""
    from database import get_db
    
    db = get_db()
    
    # Get user count
    user_count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    
    # Get conversation count
    conv_count = db.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
    
    # Get message count
    msg_count = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    
    # Get total tokens used
    total_tokens = db.execute("SELECT SUM(total_tokens) FROM conversations").fetchone()[0] or 0
    
    return {
        "users": user_count,
        "conversations": conv_count,
        "messages": msg_count,
        "total_tokens": total_tokens,
        "timestamp": datetime.utcnow().isoformat()
    }

