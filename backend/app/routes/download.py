"""
Download Routes

This module provides routes for file and model downloads.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from pathlib import Path
from urllib.parse import urlparse
import uuid
import aiohttp

from app.core.error_handlers import safe_path
from app.search.fetch import blocked_host
from app.security.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/download")

FILES_DIR = Path("app/files")

# Ceiling on a single download — without it an unbounded response is a disk-fill DoS.
MAX_DOWNLOAD_BYTES = 2 << 30  # 2 GiB

# Store download tasks
download_tasks = {}

class DownloadRequest(BaseModel):
    url: str
    filename: str

def _validate_url(url: str) -> None:
    """Reject anything we must not fetch on a caller's behalf.

    The URL comes straight from the request body, so without this the endpoint is a
    full SSRF primitive (cloud metadata, internal services, file:// reads).

    ponytail: same ceiling as the search guard — checked pre-DNS and not re-checked
    after redirects. See app/search/fetch.py:blocked_host.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, f"Unsupported URL scheme: {parsed.scheme or '(none)'}")
    if blocked_host(parsed.hostname or ""):
        raise HTTPException(400, "URL host is not allowed")

@router.post("/file")
async def download_file(
    request: DownloadRequest,
    background_tasks: BackgroundTasks,
    _: dict = Depends(get_current_user),
):
    """Start a file download in the background"""
    _validate_url(request.url)
    # Resolved up front so a bad name 400s here rather than failing in the worker.
    safe_path(FILES_DIR, request.filename)

    task_id = str(uuid.uuid4())

    download_tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "downloaded_bytes": 0,
        "total_bytes": 0,
        "filename": request.filename,
        "url": request.url
    }
    
    # Start background task
    background_tasks.add_task(
        download_file_worker,
        task_id,
        request.url,
        request.filename
    )
    
    return {"task_id": task_id, "status": "started"}

@router.get("/task/{task_id}")
async def get_download_status(task_id: str, _: dict = Depends(get_current_user)):
    """Get download task status"""
    if task_id not in download_tasks:
        raise HTTPException(404, "Task not found")

    return download_tasks[task_id]

@router.get("/files")
async def list_downloaded_files(_: dict = Depends(get_current_user)):
    """List downloaded files in the files directory"""
    files_dir = FILES_DIR
    files_dir.mkdir(exist_ok=True)

    files = []
    for file_path in files_dir.iterdir():
        if file_path.is_file():
            stat = file_path.stat()
            files.append({
                "name": file_path.name,
                "size": stat.st_size,
                "size_human": _format_size(stat.st_size),
                "modified": stat.st_mtime
            })
    
    return {"files": files}

@router.delete("/file/{filename}")
async def delete_downloaded_file(filename: str, _: dict = Depends(get_current_user)):
    """Delete a downloaded file"""
    file_path = safe_path(FILES_DIR, filename)

    if not file_path.is_file():
        raise HTTPException(404, "File not found")

    try:
        file_path.unlink()
        return {"message": f"File {filename} deleted successfully"}
    except Exception as e:
        raise HTTPException(500, f"Failed to delete file: {str(e)}")

async def download_file_worker(task_id: str, url: str, filename: str):
    """Background worker for file downloads"""
    try:
        download_tasks[task_id]["status"] = "downloading"

        # Re-checked here too: the worker is the last line of defence, and a bad name
        # must never reach open(). safe_path raises on anything escaping FILES_DIR.
        _validate_url(url)
        file_path = safe_path(FILES_DIR, filename)
        FILES_DIR.mkdir(exist_ok=True)

        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise HTTPException(400, f"Failed to download: {response.status}")

                total_size = int(response.headers.get('content-length', 0))
                if total_size > MAX_DOWNLOAD_BYTES:
                    raise HTTPException(400, "File exceeds download size limit")
                download_tasks[task_id]["total_bytes"] = total_size

                downloaded = 0
                with open(file_path, 'wb') as file:
                    async for chunk in response.content.iter_chunked(8192):
                        downloaded += len(chunk)
                        # Content-Length may be absent or lie, so cap the stream itself.
                        if downloaded > MAX_DOWNLOAD_BYTES:
                            file.close()
                            file_path.unlink(missing_ok=True)
                            raise HTTPException(400, "File exceeds download size limit")
                        file.write(chunk)

                        # Update progress
                        progress = (downloaded / total_size * 100) if total_size > 0 else 0
                        download_tasks[task_id].update({
                            "progress": round(progress, 2),
                            "downloaded_bytes": downloaded
                        })

        download_tasks[task_id]["status"] = "completed"
        download_tasks[task_id]["file_path"] = str(file_path)
        
    except Exception as e:
        download_tasks[task_id]["status"] = "failed"
        download_tasks[task_id]["error"] = str(e)

def _format_size(size_bytes):
    """Format file size in human readable format"""
    if size_bytes == 0:
        return "0B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    while size >= 1024 and i < len(size_names) - 1:
        size /= 1024
        i += 1
    return f"{size:.1f}{size_names[i]}"
