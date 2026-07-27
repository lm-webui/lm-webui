"""
SQLite File Manager for Hybrid Database System
Handles file metadata and conversation linkage in SQLite
"""

import logging
import json
from typing import List, Dict, Optional, Any
from datetime import datetime
import sqlite3
import os

def get_db():
    """Get SQLite database connection"""
    # Use consistent path resolution from config
    from app.core.config_manager import get_database_path
    db_path = get_database_path()
    
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables (backward compatibility)"""
    # Database is already initialized by hybrid system
    # This function exists for backward compatibility
    pass

logger = logging.getLogger(__name__)

class SQLiteFileManager:
    """Manages file operations in SQLite database"""
    
    def __init__(self):
        # We do not hold a persistent connection anymore to avoid threading issues
        # and unclosed connection warnings. Each method creates its own connection.
        pass
    
    def create_file_record(
        self,
        conversation_id: str,
        user_id: int,
        filename: str,
        file_path: str,
        file_type: str,
        file_size: int,
        status: str = "processing",
        summary: str = None,
        chroma_collection_id: str = None
    ) -> int:
        """
        Create a new file record in the database
        
        Args:
            conversation_id: Conversation ID
            user_id: User ID
            filename: Original filename
            file_path: Path to stored file
            file_type: File MIME type
            file_size: File size in bytes
            status: Processing status
            summary: File summary
            chroma_collection_id: ChromaDB collection ID
            
        Returns:
            File ID
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO files 
                (conversation_id, user_id, filename, file_path, file_type, file_size, status, summary, chroma_collection_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """, (
                conversation_id,
                user_id,
                filename,
                file_path,
                file_type,
                file_size,
                status,
                summary,
                chroma_collection_id
            ))
            conn.commit()
            
            file_id = cursor.lastrowid
            logger.info(f"Created file record {file_id} for conversation {conversation_id}")
            return file_id
            
        except Exception as e:
            logger.error(f"Failed to create file record: {str(e)}")
            raise
        finally:
            conn.close()
    
    def get_file_by_id(self, file_id: int) -> Optional[Dict[str, Any]]:
        """
        Get file record by ID
        
        Args:
            file_id: File ID
            
        Returns:
            File record dictionary or None if not found
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, conversation_id, user_id, filename, file_path, file_type, file_size, 
                       status, summary, chroma_collection_id, created_at, updated_at
                FROM files 
                WHERE id = ?
            """, (file_id,))
            
            row = cursor.fetchone()
            if row:
                return {
                    "id": row[0],
                    "conversation_id": row[1],
                    "user_id": row[2],
                    "filename": row[3],
                    "file_path": row[4],
                    "file_type": row[5],
                    "file_size": row[6],
                    "status": row[7],
                    "summary": row[8],
                    "chroma_collection_id": row[9],
                    "created_at": row[10],
                    "updated_at": row[11]
                }
            return None
            
        except Exception as e:
            logger.error(f"Failed to get file {file_id}: {str(e)}")
            return None
        finally:
            conn.close()
    
    def get_files_by_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """
        Get all files for a conversation
        
        Args:
            conversation_id: Conversation ID
            
        Returns:
            List of file records
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, conversation_id, user_id, filename, file_path, file_type, file_size, 
                       status, summary, chroma_collection_id, created_at, updated_at
                FROM files 
                WHERE conversation_id = ?
                ORDER BY created_at DESC
            """, (conversation_id,))
            
            files = []
            for row in cursor.fetchall():
                files.append({
                    "id": row[0],
                    "conversation_id": row[1],
                    "user_id": row[2],
                    "filename": row[3],
                    "file_path": row[4],
                    "file_type": row[5],
                    "file_size": row[6],
                    "status": row[7],
                    "summary": row[8],
                    "chroma_collection_id": row[9],
                    "created_at": row[10],
                    "updated_at": row[11]
                })
            
            return files
            
        except Exception as e:
            logger.error(f"Failed to get files for conversation {conversation_id}: {str(e)}")
            return []
        finally:
            conn.close()
    
    def get_files_by_user(self, user_id: int, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Get all files for a user
        
        Args:
            user_id: User ID
            limit: Maximum number of files to return
            offset: Offset for pagination
            
        Returns:
            List of file records
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, conversation_id, user_id, filename, file_path, file_type, file_size, 
                       status, summary, chroma_collection_id, created_at, updated_at
                FROM files 
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (user_id, limit, offset))
            
            files = []
            for row in cursor.fetchall():
                files.append({
                    "id": row[0],
                    "conversation_id": row[1],
                    "user_id": row[2],
                    "filename": row[3],
                    "file_path": row[4],
                    "file_type": row[5],
                    "file_size": row[6],
                    "status": row[7],
                    "summary": row[8],
                    "chroma_collection_id": row[9],
                    "created_at": row[10],
                    "updated_at": row[11]
                })
            
            return files
            
        except Exception as e:
            logger.error(f"Failed to get files for user {user_id}: {str(e)}")
            return []
        finally:
            conn.close()
    
    def update_file_status(self, file_id: int, status: str, summary: str = None) -> bool:
        """
        Update file status and summary
        
        Args:
            file_id: File ID
            status: New status
            summary: Optional summary text
            
        Returns:
            True if successful, False otherwise
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            if summary:
                cursor.execute("""
                    UPDATE files 
                    SET status = ?, summary = ?, updated_at = datetime('now')
                    WHERE id = ?
                """, (status, summary, file_id))
            else:
                cursor.execute("""
                    UPDATE files 
                    SET status = ?, updated_at = datetime('now')
                    WHERE id = ?
                """, (status, file_id))
            
            conn.commit()
            logger.info(f"Updated file {file_id} status to '{status}'")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update file {file_id} status: {str(e)}")
            return False
        finally:
            conn.close()
    
    def update_chroma_collection_id(self, file_id: int, chroma_collection_id: str) -> bool:
        """
        Update ChromaDB collection ID for a file
        
        Args:
            file_id: File ID
            chroma_collection_id: ChromaDB collection ID
            
        Returns:
            True if successful, False otherwise
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE files 
                SET chroma_collection_id = ?, updated_at = datetime('now')
                WHERE id = ?
            """, (chroma_collection_id, file_id))
            
            conn.commit()
            logger.info(f"Updated file {file_id} ChromaDB collection to '{chroma_collection_id}'")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update file {file_id} ChromaDB collection: {str(e)}")
            return False
        finally:
            conn.close()
    
    def delete_file(self, file_id: int) -> bool:
        """
        Delete a file record
        
        Args:
            file_id: File ID
            
        Returns:
            True if successful, False otherwise
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM files WHERE id = ?", (file_id,))
            conn.commit()
            
            logger.info(f"Deleted file record {file_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete file {file_id}: {str(e)}")
            return False
        finally:
            conn.close()
    
    def get_file_statistics(self, user_id: int = None) -> Dict[str, Any]:
        """
        Get file statistics
        
        Args:
            user_id: Optional user ID to filter by
            
        Returns:
            Statistics dictionary
        """
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            if user_id:
                # User-specific statistics
                cursor.execute("SELECT COUNT(*) FROM files WHERE user_id = ?", (user_id,))
                total_files = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM files WHERE user_id = ? AND status = 'ready'", (user_id,))
                ready_files = cursor.fetchone()[0]
                
                cursor.execute("SELECT SUM(file_size) FROM files WHERE user_id = ?", (user_id,))
                total_size = cursor.fetchone()[0] or 0
                
                cursor.execute("SELECT COUNT(*) FROM files WHERE user_id = ? AND chroma_collection_id IS NOT NULL", (user_id,))
                indexed_files = cursor.fetchone()[0]
            else:
                # Global statistics
                cursor.execute("SELECT COUNT(*) FROM files")
                total_files = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM files WHERE status = 'ready'")
                ready_files = cursor.fetchone()[0]
                
                cursor.execute("SELECT SUM(file_size) FROM files")
                total_size = cursor.fetchone()[0] or 0
                
                cursor.execute("SELECT COUNT(*) FROM files WHERE chroma_collection_id IS NOT NULL")
                indexed_files = cursor.fetchone()[0]
            
            return {
                "total_files": total_files,
                "ready_files": ready_files,
                "failed_files": total_files - ready_files,
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "indexed_files": indexed_files,
                "user_id": user_id
            }
            
        except Exception as e:
            logger.error(f"Failed to get file statistics: {str(e)}")
            return {}
        finally:
            conn.close()
    
    def cleanup_orphaned_files(self, days_old: int = 30) -> Dict[str, Any]:
        """
        Clean up orphaned file records
        
        Args:
            days_old: Delete files older than this many days
            
        Returns:
            Cleanup statistics
        """
        # Note: This method calls delete_file which manages its own connection, 
        # but the select query needs one.
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Find orphaned files (no conversation or user)
            cursor.execute("""
                SELECT f.id, f.filename, f.file_path
                FROM files f
                LEFT JOIN conversations c ON f.conversation_id = c.id
                LEFT JOIN users u ON f.user_id = u.id
                WHERE c.id IS NULL OR u.id IS NULL
                OR f.created_at < datetime('now', ?)
            """, (f"-{days_old} days",))
            
            orphaned_files = cursor.fetchall()
            # Close connection before iterating since delete_file creates its own
            conn.close() 
            
            deleted_count = 0
            for file_id, filename, file_path in orphaned_files:
                if self.delete_file(file_id):
                    deleted_count += 1
            
            return {
                "deleted_files": deleted_count,
                "total_orphaned": len(orphaned_files),
                "days_old": days_old
            }
            
        except Exception as e:
            logger.error(f"Failed to cleanup orphaned files: {str(e)}")
            # Ensure conn is closed if error occurred before our manual close
            try: conn.close()
            except: pass
            return {"error": str(e)}

# Global instance for easy access
sqlite_file_manager = SQLiteFileManager()
