"""
GGUF Download Manager with WebSocket Progress
Manages background downloads with real-time progress updates.
Includes security validation (SSRF protection) and async I/O.
"""
import asyncio
import aiohttp
import aiofiles
import os
import uuid
import logging
import socket
import ipaddress
from urllib.parse import urlparse
from typing import Dict, Optional
from pathlib import Path
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class GGUFDownloadManager:
    """Manages GGUF downloads with WebSocket progress tracking"""
    
    def __init__(self):
        self.download_tasks = {}
        self.websocket_connections = {}
        self.models_dir = Path(__file__).parent.parent.parent / "models" / "gguf"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.allowed_domains = ['huggingface.co', 'hf.co', 'github.com', 'raw.githubusercontent.com']
    
    def _validate_url(self, url: str) -> bool:
        """
        Validate URL to prevent SSRF (Server-Side Request Forgery)
        Checks allowlist and ensures target IP is public.
        """
        try:
            parsed = urlparse(url)
            if parsed.scheme not in ('http', 'https'):
                logger.warning(f"Blocked invalid scheme: {parsed.scheme}")
                return False
            
            hostname = parsed.hostname
            if not hostname:
                return False

            # 1. Allowlist Check
            if hostname in self.allowed_domains:
                return True
                
            # 2. DNS Resolution & IP Validation (for non-allowlisted domains)
            # Resolve hostname to IP
            try:
                ip = socket.gethostbyname(hostname)
            except socket.gaierror:
                logger.warning(f"Could not resolve hostname: {hostname}")
                return False
            
            ip_addr = ipaddress.ip_address(ip)
            
            # Block private, loopback, and link-local addresses
            if ip_addr.is_private or ip_addr.is_loopback or ip_addr.is_link_local:
                logger.warning(f"Blocked private/local IP access: {hostname} -> {ip}")
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"URL validation error: {e}")
            return False

    async def start_download(self, url: str, filename: str) -> str:
        """
        Start a GGUF download with progress tracking
        
        Args:
            url: Download URL
            filename: Target filename
            
        Returns:
            Task ID for progress tracking
        """
        # Validate URL before starting
        if not self._validate_url(url):
            raise ValueError("Invalid download URL. Domain not allowed or resolves to private IP.")

        task_id = str(uuid.uuid4())
        
        # Initialize task info
        self.download_tasks[task_id] = {
            "task_id": task_id,
            "url": url,
            "filename": filename,
            "status": "starting",
            "progress": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "error": None
        }
        
        # Start background download
        asyncio.create_task(self._download_with_progress(task_id, url, filename))
        
        return task_id
    
    async def _download_with_progress(self, task_id: str, url: str, filename: str):
        """
        Download file with progress tracking using async I/O
        
        Args:
            task_id: Download task ID
            url: Download URL
            filename: Target filename
        """
        try:
            file_path = self.models_dir / filename
            
            # Check if file already exists
            if file_path.exists():
                self.download_tasks[task_id].update({
                    "status": "exists",
                    "progress": 100,
                    "error": "File already exists"
                })
                await self._notify_websockets(task_id)
                return
            
            # Update status
            self.download_tasks[task_id].update({
                "status": "downloading",
                "progress": 0
            })
            await self._notify_websockets(task_id)
            
            # Download with progress
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        error_msg = f"Download failed with status {response.status}"
                        self.download_tasks[task_id].update({
                            "status": "failed",
                            "error": error_msg
                        })
                        await self._notify_websockets(task_id)
                        return
                    
                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    
                    self.download_tasks[task_id].update({
                        "total_bytes": total_size
                    })
                    await self._notify_websockets(task_id)
                    
                    # Download with progress tracking
                    logger.info(f"Download started: {filename} ({total_size // (1024*1024)} MB)")
                    
                    # Use aiofiles for non-blocking file write
                    async with aiofiles.open(file_path, 'wb') as f:
                        chunk_count = 0
                        last_notified_progress = 0
                        last_notified_bytes = 0
                        
                        async for chunk in response.content.iter_chunked(8192):
                            if chunk:
                                await f.write(chunk)
                                downloaded += len(chunk)
                                chunk_count += 1
                                
                                # Update progress
                                progress = (downloaded / total_size * 100) if total_size > 0 else 0
                                self.download_tasks[task_id].update({
                                    "downloaded_bytes": downloaded,
                                    "progress": round(progress, 2)
                                })
                                
                                # Send progress updates more frequently
                                progress_changed = abs(progress - last_notified_progress) >= 1.0
                                bytes_changed = (downloaded - last_notified_bytes) >= (1 * 1024 * 1024)  # 1MB
                                
                                if progress_changed or bytes_changed or chunk_count % 50 == 0:
                                    # Only log key milestones (25%, 50%, 75%, etc.)
                                    if progress >= 25 and last_notified_progress < 25:
                                        logger.info(f"Download progress: 25%")
                                    elif progress >= 50 and last_notified_progress < 50:
                                        logger.info(f"Download progress: 50%")
                                    elif progress >= 75 and last_notified_progress < 75:
                                        logger.info(f"Download progress: 75%")
                                    
                                    await self._notify_websockets(task_id)
                                    last_notified_progress = progress
                                    last_notified_bytes = downloaded
                    
                    logger.info(f"Download completed: {filename}")
            
            # Download completed
            file_size = file_path.stat().st_size
            self.download_tasks[task_id].update({
                "status": "completed",
                "progress": 100,
                "downloaded_bytes": file_size,
                "total_bytes": file_size
            })
            await self._notify_websockets(task_id)
            
        except Exception as e:
            error_msg = f"Download failed: {str(e)}"
            logger.error(f"Download error for {filename}: {e}")
            self.download_tasks[task_id].update({
                "status": "failed",
                "error": error_msg
            })
            await self._notify_websockets(task_id)
    
    async def _notify_websockets(self, task_id: str):
        """
        Notify all WebSocket connections about download progress
        
        Args:
            task_id: Download task ID
        """
        task_info = self.download_tasks.get(task_id)
        if not task_info:
            return
        
        # Get connections for this task
        connections = self.websocket_connections.get(task_id, [])
        
        # Remove disconnected clients
        active_connections = []
        for websocket in connections:
            try:
                await websocket.send_json(task_info)
                active_connections.append(websocket)
            except:
                # Client disconnected
                pass
        
        # Update connections list
        if active_connections:
            self.websocket_connections[task_id] = active_connections
        else:
            self.websocket_connections.pop(task_id, None)
    
    async def register_websocket(self, task_id: str, websocket: WebSocket):
        """
        Register a WebSocket connection for progress updates
        
        Args:
            task_id: Download task ID
            websocket: WebSocket connection
        """
        if task_id not in self.websocket_connections:
            self.websocket_connections[task_id] = []
        
        self.websocket_connections[task_id].append(websocket)
        
        # Send current status immediately
        task_info = self.download_tasks.get(task_id)
        if task_info:
            try:
                await websocket.send_json(task_info)
            except:
                pass
    
    def unregister_websocket(self, task_id: str, websocket: WebSocket):
        """
        Unregister a WebSocket connection
        
        Args:
            task_id: Download task ID
            websocket: WebSocket connection
        """
        if task_id in self.websocket_connections:
            connections = self.websocket_connections[task_id]
            if websocket in connections:
                connections.remove(websocket)
            
            # Clean up empty lists
            if not connections:
                self.websocket_connections.pop(task_id, None)
    
    def get_download_status(self, task_id: str) -> Optional[Dict]:
        """
        Get download task status
        
        Args:
            task_id: Download task ID
            
        Returns:
            Task status dictionary or None if not found
        """
        return self.download_tasks.get(task_id)
    
    def cancel_download(self, task_id: str) -> bool:
        """
        Cancel a download task
        
        Args:
            task_id: Download task ID
            
        Returns:
            True if task was found and cancelled, False otherwise
        """
        if task_id in self.download_tasks:
            self.download_tasks[task_id].update({
                "status": "cancelled",
                "error": "Download cancelled by user"
            })
            
            # Note: Actual download cancellation would require more complex
            # async task management. This just marks it as cancelled.
            return True
        
        return False
    
    def get_active_downloads(self) -> Dict[str, Dict]:
        """
        Get all active download tasks
        
        Returns:
            Dictionary of active download tasks
        """
        active_tasks = {}
        for task_id, task_info in self.download_tasks.items():
            if task_info.get('status') in ['starting', 'downloading']:
                active_tasks[task_id] = task_info
        
        return active_tasks
    
    def cleanup_completed_tasks(self, older_than_hours: int = 24):
        """
        Clean up completed download tasks older than specified hours
        
        Args:
            older_than_hours: Remove tasks older than this many hours
        """
        # This would implement cleanup logic for completed tasks
        # For now, it's a placeholder for future implementation
        pass


# Global instance
gguf_downloader = GGUFDownloadManager()
