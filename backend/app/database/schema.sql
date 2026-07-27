-- Fixed Database Schema with Foreign Keys Enabled
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    theme TEXT DEFAULT 'dark',
    language TEXT DEFAULT 'en',
    auto_refresh BOOLEAN DEFAULT 1,
    max_tokens INTEGER DEFAULT 8000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    base_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- User Settings table
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    settings_json TEXT NOT NULL DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Model Cache table
CREATE TABLE IF NOT EXISTS model_cache (
    user_id INTEGER PRIMARY KEY,
    models TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT,
    model_id TEXT,
    total_tokens INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    state TEXT DEFAULT 'active',
    metadata TEXT DEFAULT '{}', -- Store as JSON: {"title_source": "auto|manual", "title_generated_at": "timestamp"}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Messages table (uses UUID for message IDs)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT CHECK (
        role IN ('user', 'assistant', 'system')
    ),
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    provider TEXT DEFAULT 'openai',
    model TEXT DEFAULT 'gpt-3.5-turbo',
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    summary TEXT,
    chroma_collection_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- File References table
CREATE TABLE IF NOT EXISTS file_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    user_id INTEGER NOT NULL,
    message_id TEXT,
    file_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
);

-- Media Library table
CREATE TABLE IF NOT EXISTS media_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    conversation_id TEXT,
    media_type TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE SET NULL
);

-- Conversation Summaries table (LLM context)
CREATE TABLE IF NOT EXISTS conversation_summaries (
    conversation_id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);

-- Knowledge Graph table (long-term memory)
CREATE TABLE IF NOT EXISTS knowledge_graph (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT,
    content TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- RAG Chunks table (optional local metadata)
CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    file_id TEXT,
    conversation_id TEXT,
    content TEXT,
    FOREIGN KEY (file_id) REFERENCES files (id),
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);

-- Reasoning Sessions table
CREATE TABLE IF NOT EXISTS reasoning_sessions (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);

-- Reasoning Steps table
CREATE TABLE IF NOT EXISTS reasoning_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    step_type TEXT,
    title TEXT,
    content TEXT NOT NULL,
    metadata JSON,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES reasoning_sessions (id) ON DELETE CASCADE
);

-- Global Knowledge Base Documents (Admin Uploads)
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT,
    chunk_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Vector Chunks Bridge Table
CREATE TABLE IF NOT EXISTS vector_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_state ON conversations (state);

CREATE INDEX IF NOT EXISTS idx_file_refs_conv ON file_references (conversation_id);

CREATE INDEX IF NOT EXISTS idx_file_refs_user ON file_references (user_id);

CREATE INDEX IF NOT EXISTS idx_files_conv ON files (conversation_id);

CREATE INDEX IF NOT EXISTS idx_files_user ON files (user_id);

CREATE INDEX IF NOT EXISTS idx_files_status ON files (status);

CREATE INDEX IF NOT EXISTS idx_media_library_user ON media_library (user_id);

CREATE INDEX IF NOT EXISTS idx_media_library_conv ON media_library (conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conv ON conversation_summaries (conversation_id);

CREATE INDEX IF NOT EXISTS idx_kg_user ON knowledge_graph (user_id);

CREATE INDEX IF NOT EXISTS idx_kg_type ON knowledge_graph(type);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_file ON rag_chunks (file_id);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_conv ON rag_chunks (conversation_id);

CREATE INDEX IF NOT EXISTS idx_reasoning_sessions_conv ON reasoning_sessions (conversation_id);

CREATE INDEX IF NOT EXISTS idx_reasoning_steps_session ON reasoning_steps (session_id);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents (user_id);

CREATE INDEX IF NOT EXISTS idx_vector_chunks_doc ON vector_chunks (document_id);