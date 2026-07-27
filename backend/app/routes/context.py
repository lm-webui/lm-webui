from fastapi import APIRouter, HTTPException, Depends
import logging
import os
from pathlib import Path
from app.memory.context_assembler import context_assembler
from app.memory.kg_manager import KGManager
from app.security.auth.dependencies import get_current_user
from app.services.vector_store import delete_chunk, get_base_dir

logger = logging.getLogger(__name__)

# Initialize KGManager with consistent path calculation
try:
    data_dir = os.getenv("DATA_DIR")
    base_dir = get_base_dir()
    
    if data_dir:
        if os.path.isabs(data_dir):
            mem_path = os.path.join(data_dir, "memory", "memory.db")
        else:
            mem_path = str(base_dir / data_dir / "memory" / "memory.db")
    else:
        mem_path = str(base_dir / "data" / "memory" / "memory.db")
    
    # Ensure directories exist
    os.makedirs(os.path.dirname(mem_path), exist_ok=True)
    
    kg_manager = KGManager(mem_path)
except Exception as e:
    logger.error(f"Failed to init KGManager in context route: {e}")
    kg_manager = None

router = APIRouter(prefix="/api/context")

@router.get("/{conversation_id}")
async def get_context(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """Get active context for a conversation (authenticated users only)"""
    try:
        # Use context_assembler to gather context
        context = await context_assembler.assemble_context(user_id["id"], conversation_id, "", use_rag=True)

        return {
            "conversation_id": conversation_id,
            "summaries": [context.get("summary")] if context.get("summary") else [],
            "recent_messages": context.get("recent_messages", []),
            "file_chunks": context.get("rag_chunks", []),
            "knowledge": context.get("relevant_knowledge", []),
            "total_items": len(context.get("recent_messages", [])) + len(context.get("rag_chunks", [])),
            "has_context": True
        }

    except Exception as e:
        raise HTTPException(500, f"Context retrieval error: {str(e)}")

@router.delete("/{conversation_id}/memory/{memory_id}")
async def forget_memory(conversation_id: str, memory_id: str, user_id: dict = Depends(get_current_user)):
    """Remove a specific memory item from context (authenticated users only)"""
    try:
        # Delete from memory_items table (KG) using KGManager
        memory_deleted = False
        if kg_manager:
            # KGManager expects int ID usually, but check if memory_id is int or uuid
            try:
                # Try to parse as int for SQL deletion
                mem_id_int = int(memory_id)
                memory_deleted = kg_manager.delete_memory(mem_id_int)
            except ValueError:
                # Might be a vector ID?
                memory_deleted = False
        
        # Also attempt to delete from LanceDB if it's a chunk reference
        try:
            delete_chunk(memory_id)
            logger.info(f"Deleted memory {memory_id} from LanceDB")
        except Exception as e:
            logger.warning(f"Could not delete memory {memory_id} from LanceDB: {str(e)}")
            # Continue anyway - memory was deleted from database

        return {
            "success": True,
            "message": f"Memory {memory_id} successfully removed",
            "conversation_id": conversation_id,
            "memory_id": memory_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Memory deletion error: {str(e)}")
        raise HTTPException(500, f"Memory deletion error: {str(e)}")
