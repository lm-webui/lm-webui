"""
Simplified Database Migration System
Handles database creation and schema adjustments without recreating existing data
"""

import sqlite3
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class DatabaseMigration:
    """Handles database creation and schema adjustments"""

    def __init__(self, db_path: str = None):
        if db_path:
            self.db_path = db_path
        else:
            # Use consistent path resolution from config
            from app.core.config import get_database_path
            self.db_path = get_database_path()
            
        self.schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")

    def check_missing_tables(self) -> list:
        """Check for missing tables in the database"""
        required_tables = [
            'users', 'api_keys', 'user_settings', 'model_cache',
            'conversations', 'messages', 'files', 'file_references',
            'media_library', 'conversation_summaries', 'knowledge_graph', 'rag_chunks'
        ]

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            existing_tables = [row[0] for row in cursor.fetchall()]
            conn.close()

            missing_tables = [table for table in required_tables if table not in existing_tables]
            return missing_tables

        except Exception as e:
            logger.error(f"Failed to check missing tables: {str(e)}")
            return required_tables

    def check_missing_columns(self) -> dict:
        """Check for missing columns in existing tables"""
        missing_columns = {}

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Check messages table for metadata column (replaces file_references)
            cursor.execute("PRAGMA table_info(messages);")
            message_columns = [col[1] for col in cursor.fetchall()]
            
            # Check for metadata column (new schema)
            if "metadata" not in message_columns:
                if "messages" not in missing_columns:
                    missing_columns["messages"] = []
                missing_columns["messages"].append("metadata")
            
            # Check for provider and model columns (required for title generation)
            if "provider" not in message_columns:
                if "messages" not in missing_columns:
                    missing_columns["messages"] = []
                missing_columns["messages"].append("provider")
            
            if "model" not in message_columns:
                if "messages" not in missing_columns:
                    missing_columns["messages"] = []
                missing_columns["messages"].append("model")
            
            # Check for role constraint (new schema)
            # Note: SQLite doesn't support checking CHECK constraints easily, so we'll rely on schema recreation if needed

            # Check conversations table for message_count and state columns
            cursor.execute("PRAGMA table_info(conversations);")
            conversation_columns = [col[1] for col in cursor.fetchall()]
            
            if "message_count" not in conversation_columns:
                if "conversations" not in missing_columns:
                    missing_columns["conversations"] = []
                missing_columns["conversations"].append("message_count")
            
            if "state" not in conversation_columns:
                if "conversations" not in missing_columns:
                    missing_columns["conversations"] = []
                missing_columns["conversations"].append("state")

            conn.close()
            return missing_columns

        except Exception as e:
            logger.error(f"Failed to check missing columns: {str(e)}")
            return {}

    def apply_initial_schema(self, conn: sqlite3.Connection) -> bool:
        """Apply initial schema from schema.sql file"""
        try:
            cursor = conn.cursor()

            # Read and execute schema
            with open(self.schema_path, 'r') as f:
                schema_sql = f.read()

            # Execute schema
            cursor.executescript(schema_sql)
            conn.commit()

            logger.info("✅ Applied initial schema")
            return True

        except Exception as e:
            logger.error(f"Failed to apply initial schema: {str(e)}")
            conn.rollback()
            return False

    def add_missing_columns(self, conn: sqlite3.Connection, missing_columns: dict) -> bool:
        """Add missing columns to existing tables"""
        try:
            cursor = conn.cursor()

            # Add metadata to messages table (replaces file_references)
            if "messages" in missing_columns and "metadata" in missing_columns["messages"]:
                cursor.execute("ALTER TABLE messages ADD COLUMN metadata TEXT;")
                logger.info("✅ Added metadata column to messages table")
                
                # Migrate existing file_references to metadata if file_references column exists
                cursor.execute("PRAGMA table_info(messages);")
                columns = [col[1] for col in cursor.fetchall()]
                if "file_references" in columns:
                    # Copy file_references to metadata as JSON
                    cursor.execute("""
                        UPDATE messages 
                        SET metadata = json_object('attachments', file_references) 
                        WHERE file_references IS NOT NULL AND file_references != ''
                    """)
                    logger.info("✅ Migrated file_references to metadata column")
            
            # Add provider column to messages table
            if "messages" in missing_columns and "provider" in missing_columns["messages"]:
                cursor.execute("ALTER TABLE messages ADD COLUMN provider TEXT DEFAULT 'openai';")
                logger.info("✅ Added provider column to messages table")
            
            # Add model column to messages table
            if "messages" in missing_columns and "model" in missing_columns["messages"]:
                cursor.execute("ALTER TABLE messages ADD COLUMN model TEXT DEFAULT 'gpt-3.5-turbo';")
                logger.info("✅ Added model column to messages table")

            # Add message_count to conversations table
            if "conversations" in missing_columns and "message_count" in missing_columns["conversations"]:
                cursor.execute("ALTER TABLE conversations ADD COLUMN message_count INTEGER DEFAULT 0;")
                logger.info("✅ Added message_count column to conversations table")
            
            # Add state to conversations table
            if "conversations" in missing_columns and "state" in missing_columns["conversations"]:
                cursor.execute("ALTER TABLE conversations ADD COLUMN state TEXT DEFAULT 'active';")
                logger.info("✅ Added state column to conversations table")

            conn.commit()
            return True

        except Exception as e:
            logger.error(f"Failed to add missing columns: {str(e)}")
            conn.rollback()
            return False

    def initialize_database(self) -> bool:
        """Initialize database - create if not exists, adjust schema if needed"""
        try:
            # Ensure data directory exists
            db_dir = os.path.dirname(self.db_path)
            if not os.path.exists(db_dir):
                logger.info(f"📁 Creating database directory: {db_dir}")
                os.makedirs(db_dir, exist_ok=True)

            # Check write permissions
            if not os.access(db_dir, os.W_OK):
                logger.error(f"❌ ERROR: Database directory is NOT writable: {db_dir}")
                return False

            # Check if database exists
            db_exists = os.path.exists(self.db_path)

            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Enable foreign keys
            cursor.execute("PRAGMA foreign_keys = ON;")

            if not db_exists:
                # First-time setup - apply full schema
                logger.info("🔄 First-time database setup - creating new database")
                if not self.apply_initial_schema(conn):
                    conn.close()
                    return False
            else:
                # Database exists - check for missing tables and columns
                logger.info("🔄 Existing database found - checking for schema updates")

                missing_tables = self.check_missing_tables()
                if missing_tables:
                    logger.warning(f"⚠️ Missing tables found: {missing_tables}")
                    logger.warning("⚠️ Full schema recreation required for missing tables")
                    # For missing tables, we need to recreate - this is rare
                    if not self.apply_initial_schema(conn):
                        conn.close()
                        return False
                else:
                    # Only check for missing columns
                    missing_columns = self.check_missing_columns()
                    if missing_columns:
                        logger.info(f"📋 Missing columns found: {missing_columns}")
                        if not self.add_missing_columns(conn, missing_columns):
                            conn.close()
                            return False
                        logger.info("✅ Added missing columns successfully")
                    else:
                        logger.info("✅ Database schema is up to date")

            # Verify foreign keys are enabled
            cursor.execute("PRAGMA foreign_keys;")
            foreign_keys_enabled = cursor.fetchone()[0]
            if not foreign_keys_enabled:
                logger.error("❌ Foreign keys are NOT enabled")
                conn.close()
                return False

            # Verify tables were created
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row[0] for row in cursor.fetchall()]
            logger.info(f"✅ Database ready with {len(tables)} tables")

            conn.close()
            return True

        except Exception as e:
            logger.error(f"❌ Failed to initialize database: {str(e)}")
            return False

    def reset_database(self) -> bool:
        """Reset database for testing - DANGEROUS: removes all data"""
        try:
            if os.path.exists(self.db_path):
                logger.warning(f"⚠️ Removing existing database: {self.db_path}")
                os.remove(self.db_path)

            # Reinitialize database
            return self.initialize_database()

        except Exception as e:
            logger.error(f"❌ Failed to reset database: {str(e)}")
            return False

    def get_database_info(self) -> dict:
        """Get database information"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Get table count
            cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
            table_count = cursor.fetchone()[0]

            # Get table names
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            tables = [row[0] for row in cursor.fetchall()]

            # Get foreign key status
            cursor.execute("PRAGMA foreign_keys;")
            foreign_keys_enabled = cursor.fetchone()[0]

            conn.close()

            return {
                "table_count": table_count,
                "tables": tables,
                "foreign_keys_enabled": bool(foreign_keys_enabled),
                "database_path": self.db_path,
                "database_exists": os.path.exists(self.db_path)
            }

        except Exception as e:
            logger.error(f"Failed to get database info: {str(e)}")
            return {}


# Global migration instance
database_migration = DatabaseMigration()


def init_db():
    """Initialize database - create new or adjust existing schema"""
    return database_migration.initialize_database()


def reset_db():
    """Reset database for testing (DANGEROUS - removes all data)"""
    return database_migration.reset_database()


def db_info():
    """Get database information"""
    return database_migration.get_database_info()


if __name__ == "__main__":
    # Initialize logging
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

    # Test migration system
    print("🧪 Testing simplified database migration system...")

    info = db_info()
    print(f"📊 Database Info:")
    print(f"   - Path: {info.get('database_path', 'Unknown')}")
    print(f"   - Exists: {info.get('database_exists', False)}")
    print(f"   - Tables: {info.get('table_count', 0)}")
    print(f"   - Foreign Keys: {info.get('foreign_keys_enabled', False)}")

    # Initialize database
    if init_db():
        print("✅ Database initialization completed successfully!")
    else:
        print("❌ Database initialization failed!")
