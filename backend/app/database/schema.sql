-- Fixed Database Schema with Foreign Keys Enabled
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    permissions TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    theme TEXT DEFAULT 'dark',
    language TEXT DEFAULT 'en',
    auto_refresh BOOLEAN DEFAULT 1,
    max_tokens INTEGER DEFAULT 8000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
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

-- Local, metadata-only AI usage events. Prompt and response content are never stored.
CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    execution_boundary TEXT DEFAULT 'unknown',
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    token_accuracy TEXT DEFAULT 'unknown',
    duration_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT 1,
    error_code TEXT,
    estimated_cost REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

-- Projects table (workspaces with custom system prompts)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    project_id TEXT,
    conversation_id TEXT,
    title TEXT NOT NULL,
    artifact_type TEXT NOT NULL DEFAULT 'document',
    content_json TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'html',
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_user_updated ON artifacts(user_id, updated_at DESC);

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
    extracted_text TEXT,
    generation_params TEXT,
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

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_model_time ON usage_events(provider, model, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_boundary_time ON usage_events(execution_boundary, created_at);

-- Organizations (multi-tenant)
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organization_members (
    org_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    permissions TEXT DEFAULT '[]',
    invited_by INTEGER,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id, user_id),
    FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- API tokens for programmatic access
CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    org_id TEXT,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    permissions TEXT DEFAULT '[]',
    last_used_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    org_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members (org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members (user_id);
