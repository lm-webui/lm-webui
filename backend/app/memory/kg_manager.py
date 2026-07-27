"""Knowledge Graph for long-term memory - detached from RAG."""
import sqlite3
import os
import uuid
import datetime
import logging
import re
import json
import asyncio
from functools import partial
from typing import List, Dict, Optional, Any
from app.hardware.detection import get_llamacpp_settings
from app.services.model_registry import get_model_registry
from app.services.vector_store import add_chunks, search_chunks, delete_chunk

logger = logging.getLogger(__name__)

class KGManager:
    def __init__(self, db_path: str, qdrant_path: str = None):
        # Ensure directory exists
        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else '.', exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()
        self._migrate_schema()
    
    def _init_tables(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS triplets (
                id INTEGER PRIMARY KEY,
                conversation_id TEXT,
                user_id INTEGER,
                subject TEXT,
                predicate TEXT,
                object TEXT,
                confidence REAL DEFAULT 1.0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_updated DATETIME
            )
        """)
        self.conn.commit()
        
    def _migrate_schema(self):
        """Add missing columns if upgrading from old version."""
        try:
            columns = [info[1] for info in self.conn.execute("PRAGMA table_info(triplets)").fetchall()]
            
            if "user_id" not in columns:
                self.conn.execute("ALTER TABLE triplets ADD COLUMN user_id INTEGER")
            if "confidence" not in columns:
                self.conn.execute("ALTER TABLE triplets ADD COLUMN confidence REAL DEFAULT 1.0")
            if "last_updated" not in columns:
                self.conn.execute("ALTER TABLE triplets ADD COLUMN last_updated DATETIME")
            
            self.conn.commit()
        except Exception as e:
            logger.error(f"Schema migration failed: {e}")

    def store_triple(self, subject: str, predicate: str, obj: str, conversation_id: str, user_id: int, confidence: float = 1.0):
        """Store a single fact triplet."""
        now = datetime.datetime.now()
        
        # Simple deduplication check
        existing = self.conn.execute(
            "SELECT id, confidence FROM triplets WHERE user_id = ? AND subject = ? AND predicate = ? AND object = ?",
            (user_id, subject, predicate, obj)
        ).fetchone()
        
        if existing:
            # Update confidence/timestamp
            new_conf = min(1.0, existing['confidence'] + 0.1)
            self.conn.execute(
                "UPDATE triplets SET confidence = ?, last_updated = ? WHERE id = ?",
                (new_conf, now, existing['id'])
            )
        else:
            self.conn.execute(
                "INSERT INTO triplets (conversation_id, user_id, subject, predicate, object, confidence, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (conversation_id, user_id, subject, predicate, obj, confidence, now)
            )
        self.conn.commit()

        # Store in LanceDB (Semantic Memory)
        try:
            fact_text = f"{subject} {predicate} {obj}"
            chunk_id = str(uuid.uuid4())
            
            metadata = {
                "subject": subject,
                "predicate": predicate,
                "object": obj,
                "conversation_id": conversation_id,
                "user_id": user_id,
                "confidence": confidence,
                "type": "triplet"
            }
            
            add_chunks([{
                "id": chunk_id,
                "document_id": conversation_id, # Use conversation_id as document_id for grouping
                "chunk_text": fact_text,
                "metadata": json.dumps(metadata)
            }])
        except Exception as e:
            logger.error(f"Failed to store semantic triplet: {e}")

    def get_memories(self, conversation_id: str = None, user_id: int = None, limit: int = 10, query: str = None) -> str:
        """Retrieve relevant memories formatted as string."""
        try:
            sql = "SELECT subject, predicate, object FROM triplets WHERE 1=1"
            params = []
            
            if user_id:
                sql += " AND user_id = ?"
                params.append(user_id)
            
            if conversation_id:
                sql += " AND conversation_id = ?"
                params.append(conversation_id)
                
            if query:
                # Simple keyword search on subject/object
                sql += " AND (subject LIKE ? OR object LIKE ?)"
                params.append(f"%{query}%")
                params.append(f"%{query}%")
            
            sql += " ORDER BY last_updated DESC, confidence DESC LIMIT ?"
            params.append(limit)
            
            cursor = self.conn.execute(sql, tuple(params))
            facts = cursor.fetchall()
            
            if not facts:
                return ""
                
            return "\n".join([f"- {row['subject']} {row['predicate']} {row['object']}" for row in facts])
        except Exception as e:
            logger.error(f"Failed to get memories: {e}")
            return ""

    async def extract_and_store_knowledge(self, conversation_id: str, messages: List[Dict[str, Any]], user_id: int):
        """
        Extract knowledge triplets from conversation using local GGUF model.
        """
        if not messages:
            return

        try:
            # Prepare conversation text
            conversation_text = ""
            for msg in messages[-5:]: # Analyze last 5 messages
                role = msg.get("role", "unknown")
                content = msg.get("content", "")
                conversation_text += f"{role}: {content}\n"
            
            if len(conversation_text) < 20:
                return

            # Get existing knowledge for context (optional, but good for reducing dupes)
            existing_context = self.get_memories(conversation_id=conversation_id, limit=5)

            prompt = f"""Update the Knowledge Graph based on this conversation snippet by extracting semantic triplets.

Existing Knowledge:
{existing_context}

Instructions:
1. Identify NEW information not present in Existing Knowledge.
2. Extract information as Semantic Triplets: (Subject, Predicate, Object).
   - Subject: The entity (e.g. "User", "Project Alpha").
   - Predicate: The relationship (e.g. "LIKES", "USES").
   - Object: The value (e.g. "Python", "High Latency").

Conversation:
{conversation_text}

Output Format:
(Subject, Predicate, Object)
"""
            
            # Prepare messages for Chat API
            chat_messages = [
                {"role": "system", "content": "You are a Knowledge Graph builder. Extract structured knowledge."},
                {"role": "user", "content": prompt}
            ]

            llm_output = None
            try:
                registry = get_model_registry()
                # Get the auto-downloaded KG agent ID
                agent_id = registry.get_kg_extraction_agent()
                
                if agent_id:
                    strategy = registry.get_strategy("gguf")
                    if strategy:
                        model_name = agent_id.replace("gguf:", "")
                        # Use unified generation which handles threading and optimization
                        llm_output = await strategy.generate(
                            model=model_name,
                            messages=chat_messages,
                            api_key="",
                            session=None,
                            max_tokens=500,
                            temperature=0.1 # Low temp for factual extraction
                        )
                else:
                    logger.warning("KG Agent model not available via registry.")
            except Exception as e:
                logger.error(f"KG Agent inference failed: {e}")

            if llm_output:
                # Regex for Triplets: (Subject, Predicate, Object)
                pattern = re.compile(r"^\s*(?:[-*•]|\d+\.)?\s*\((.+?),\s*(.+?),\s*(.+?)\)")
                
                count = 0
                for line in llm_output.split('\n'):
                    line = line.strip()
                    match = pattern.match(line)
                    
                    if match:
                        subj = match.group(1).strip()
                        pred = match.group(2).strip().upper()
                        obj = match.group(3).strip()
                        
                        self.store_triple(subj, pred, obj, conversation_id, user_id, 0.8)
                        count += 1
                
                logger.info(f"KG: Extracted {count} triplets via LLM")
            else:
                # Fallback if LLM failed or model missing
                self._heuristic_extraction(messages, conversation_id, user_id)
            
        except Exception as e:
            logger.error(f"Knowledge extraction failed: {e}")
            # Ensure fallback runs even on error
            self._heuristic_extraction(messages, conversation_id, user_id)

    def _heuristic_extraction(self, messages: List[Dict[str, Any]], conversation_id: str, user_id: int):
        """Simple rule-based extraction as fallback."""
        count = 0
        for msg in messages:
            if msg.get("role") == "user":
                text = msg.get("content", "").lower()
                
                if "i like" in text or "i prefer" in text:
                    match = re.search(r"i (like|prefer) (.+?)(?:\.|,|$)", text)
                    if match:
                        obj = match.group(2).strip()
                        self.store_triple("User", "LIKES", obj, conversation_id, user_id, 0.7)
                        count += 1
                
                if "my name is" in text:
                     match = re.search(r"my name is (.+?)(?:\.|,|$)", text)
                     if match:
                         self.store_triple("User", "HAS_NAME", match.group(1).strip(), conversation_id, user_id, 0.9)
                         count += 1
        if count > 0:
            logger.info(f"KG: Extracted {count} triplets via heuristic")

    # --- Extended API for Compatibility ---
    
    def search_memories(self, query: str, user_id: int = None, limit: int = 5) -> List[Dict]:
        """Search memories (Hybrid: SQL + Semantic)."""
        results = []
        seen_content = set()

        # 1. Semantic Search (LanceDB)
        try:
            # We don't filter by user_id in search_chunks yet (it's not indexed/schema'd directly for filtering)
            # But we can filter post-query if we extract metadata
            semantic_results = search_chunks(query, limit=limit * 2) # Fetch more to filter
            
            for r in semantic_results:
                metadata = json.loads(r.get("metadata", "{}"))
                # Filter by user_id if provided
                if user_id and metadata.get("user_id") != user_id:
                    continue
                    
                content = r.get("chunk_text", "")
                if content:
                    results.append({
                        "id": r["id"],
                        "content": content,
                        "score": r.get("score", 0.0), # LanceDB might return distance? search_chunks returns list of dicts
                        "source": "semantic"
                    })
                    seen_content.add(content)
                    
            # Trim to limit after filtering
            results = results[:limit]
            
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")

        # 2. SQL Search (Keyword/Exact)
        try:
            sql = "SELECT id, subject, predicate, object, confidence FROM triplets WHERE (subject LIKE ? OR object LIKE ?)"
            params = [f"%{query}%", f"%{query}%"]
            
            if user_id:
                sql += " AND user_id = ?"
                params.append(user_id)
                
            sql += " ORDER BY confidence DESC LIMIT ?"
            params.append(limit)
            
            cursor = self.conn.execute(sql, tuple(params))
            rows = cursor.fetchall()
            
            for r in rows:
                content = f"{r['subject']} {r['predicate']} {r['object']}"
                if content not in seen_content:
                    results.append({
                        "id": r['id'],
                        "content": content,
                        "score": r['confidence'],
                        "source": "exact"
                    })
        except Exception as e:
             logger.error(f"SQL search failed: {e}")
            
        return results[:limit]

    def delete_memory(self, memory_id: int) -> bool:
        self.conn.execute("DELETE FROM triplets WHERE id = ?", (memory_id,))
        self.conn.commit()
        return True

    def get_all_memories(self, user_id: int, limit: int = 50) -> List[Dict]:
        """Compatibility method for legacy bridge."""
        sql = "SELECT id, subject, predicate, object, confidence, last_updated FROM triplets WHERE user_id = ? ORDER BY last_updated DESC LIMIT ?"
        rows = self.conn.execute(sql, (user_id, limit)).fetchall()
        
        return [
            {
                "id": r['id'],
                "content": f"{r['subject']} {r['predicate']} {r['object']}",
                "confidence": r['confidence'],
                "updated_at": r['last_updated']
            }
            for r in rows
        ]

    def add_memory(self, content: str, user_id: int = 1):
        """Compatibility method for legacy bridge."""
        # Try to parse triplet from content string "S P O" or "S -> P -> O"
        # If parsing fails, store as generic fact
        parts = re.split(r'\s+(?:->|is|has)\s+', content, maxsplit=2)
        if len(parts) >= 3:
            subj, pred, obj = parts[0], parts[1], parts[2]
        else:
            subj, pred, obj = "User", "NOTE", content
            
        self.store_triple(subj, "NOTE", obj, "manual", user_id, 1.0)
