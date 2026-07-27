"""
SQLite Connection Pool with Retry Logic
Provides robust database connection management to prevent locking issues
"""

import sqlite3
import time
import logging
import threading
from contextlib import contextmanager
from typing import Optional, Generator
import os

logger = logging.getLogger(__name__)

class SQLiteConnectionPool:
    """Thread-safe SQLite connection pool with retry logic"""
    
    def __init__(self, db_path: str, pool_size: int = 50, timeout: float = 30.0):
        self.db_path = db_path
        self.max_pool_size = pool_size
        self.timeout = timeout
        self._pool = []
        self._lock = threading.Lock()
        self._active_connections = 0

        # Ensure database directory exists
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

    def _create_connection(self) -> sqlite3.Connection:
        """Create a new SQLite connection with optimized settings"""
        conn = sqlite3.connect(self.db_path, timeout=self.timeout, check_same_thread=False)
        conn.row_factory = sqlite3.Row

        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=10000")

        return conn

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Get a database connection from the pool."""
        conn = None
        try:
            with self._lock:
                if self._pool:
                    conn = self._pool.pop()
                elif self._active_connections < self.max_pool_size:
                    conn = self._create_connection()
                    self._active_connections += 1
                else:
                    raise sqlite3.OperationalError(
                        f"Connection pool exhausted ({self.max_pool_size} in use)"
                    )
            yield conn
        except Exception:
            if conn:
                self._return_connection(conn)
            raise
        if conn:
            self._return_connection(conn)
    
    def _return_connection(self, conn: sqlite3.Connection):
        """Return a connection to the pool"""
        try:
            # Rollback any uncommitted transactions
            conn.rollback()
            
            with self._lock:
                if len(self._pool) < self.max_pool_size:
                    self._pool.append(conn)
                else:
                    conn.close()
                    self._active_connections -= 1
        except Exception as e:
            logger.error(f"Error returning connection to pool: {e}")
            try:
                conn.close()
                with self._lock:
                    self._active_connections -= 1
            except:
                pass
    
    def close_all(self):
        """Close all connections in the pool"""
        with self._lock:
            for conn in self._pool:
                try:
                    conn.close()
                except:
                    pass
            self._pool.clear()
            self._active_connections = 0


class DatabaseManager:
    """High-level database manager with transaction support and retry logic"""
    
    def __init__(self, db_path: str):
        self.connection_pool = SQLiteConnectionPool(db_path)
    
    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager for database transactions with automatic commit/rollback"""
        with self.connection_pool.get_connection() as conn:
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
    
    def execute_with_retry(self, query: str, params: tuple = None, max_retries: int = 3) -> sqlite3.Cursor:
        """Execute a query with retry logic for database locks"""
        params = params or ()
        base_delay = 0.1
        
        for attempt in range(max_retries):
            try:
                with self.transaction() as conn:
                    cursor = conn.execute(query, params)
                    return cursor
            except sqlite3.OperationalError as e:
                if "locked" in str(e).lower() and attempt < max_retries - 1:
                    logger.warning(f"Query failed due to lock, retrying in {base_delay * (2 ** attempt)}s")
                    time.sleep(base_delay * (2 ** attempt))
                    continue
                raise
        
        raise sqlite3.OperationalError(f"Query failed after {max_retries} retries")
    
    def execute_many_with_retry(self, query: str, params_list: list, max_retries: int = 3):
        """Execute many queries with retry logic"""
        base_delay = 0.1
        
        for attempt in range(max_retries):
            try:
                with self.transaction() as conn:
                    conn.executemany(query, params_list)
                    return
            except sqlite3.OperationalError as e:
                if "locked" in str(e).lower() and attempt < max_retries - 1:
                    logger.warning(f"Bulk query failed due to lock, retrying in {base_delay * (2 ** attempt)}s")
                    time.sleep(base_delay * (2 ** attempt))
                    continue
                raise
        
        raise sqlite3.OperationalError(f"Bulk query failed after {max_retries} retries")


# Global database manager instance
# Use consistent path resolution from config
from app.core.config_manager import get_database_path
_db_path = get_database_path()
database_manager = DatabaseManager(_db_path)


# Backward compatibility functions
def db():
    """Get database connection (backward compatibility)"""
    return database_manager.connection_pool.get_connection()

def get_db():
    """Get database connection (backward compatibility).
    Creates a properly-configured connection (bypasses pool management
    to maintain the simple returned-connection API 71+ callers expect).
    """
    conn = database_manager.connection_pool._create_connection()
    return conn

def init_db():
    """Initialize database (backward compatibility)"""
    # Database is already initialized
    pass
