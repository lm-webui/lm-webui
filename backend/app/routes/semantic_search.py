"""
Semantic Search Routes - Unified with RAG System
Handles semantic and hybrid search using RAGProcessor
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Any
import logging

from app.security.auth.dependencies import get_current_user
# from app.rag.hybrid_manager import hybrid_rag_manager
from app.rag.processor import RAGProcessor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])

# Initialize RAG Processor (Singleton)
try:
    rag_processor = RAGProcessor()
except Exception as e:
    logger.error(f"Failed to init RAGProcessor in semantic search: {e}")
    rag_processor = None

@router.post("/semantic")
async def semantic_search(request: dict, current_user: dict = Depends(get_current_user)):
    """
    Perform semantic search on conversation documents
    """
    try:
        query = request.get("query", "")
        conversation_id = request.get("conversation_id")
        top_k = request.get("top_k", 10)
        similarity_threshold = request.get("similarity_threshold", 0.3)
        
        if not query:
            raise HTTPException(400, "Search query is required")
        
        if not conversation_id:
            raise HTTPException(400, "Conversation ID is required for semantic search")
        
        if not rag_processor:
             raise HTTPException(500, "RAG system not initialized")

        # Use new search method
        results = rag_processor.search(
            query=query, 
            conversation_id=conversation_id, 
            top_k=top_k
        )
        
        # Filter by threshold if needed (though processor might not return similarity in same scale)
        filtered_results = [r for r in results if r.get("similarity", 0) >= similarity_threshold]
        
        return {
            "success": True,
            "query": query,
            "results": filtered_results,
            "total_matches": len(filtered_results),
            "search_type": "semantic",
            "conversation_id": conversation_id,
            "parameters": {
                "top_k": top_k,
                "similarity_threshold": similarity_threshold
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic search error: {str(e)}")
        raise HTTPException(500, f"Semantic search error: {str(e)}")

@router.post("/hybrid")
async def hybrid_search(request: dict, current_user: dict = Depends(get_current_user)):
    """
    Perform hybrid search (Simulated with Dense + Keyword scoring)
    """
    try:
        query = request.get("query", "")
        conversation_id = request.get("conversation_id")
        semantic_weight = request.get("semantic_weight", 0.7)
        keyword_weight = request.get("keyword_weight", 0.3)
        top_k = request.get("top_k", 10)
        min_similarity = request.get("min_similarity", 0.3)
        
        if not query:
            raise HTTPException(400, "Search query is required")
        
        if not conversation_id:
            raise HTTPException(400, "Conversation ID is required")
            
        if not rag_processor:
             raise HTTPException(500, "RAG system not initialized")
        
        # Get semantic results
        results = rag_processor.search(
            query=query, 
            conversation_id=conversation_id, 
            top_k=top_k * 2 # Get more candidates
        )
        
        # Apply hybrid scoring
        for result in results:
            semantic_score = result.get("similarity", 0)
            
            # Simple keyword matching in content
            content = result.get("content", "").lower()
            query_terms = query.lower().split()
            matched_terms = sum(1 for term in query_terms if term in content)
            keyword_score = min(1.0, matched_terms / len(query_terms)) if query_terms else 0
            
            # Combined score
            combined_score = (semantic_score * semantic_weight) + (keyword_score * keyword_weight)
            result["semantic_score"] = semantic_score
            result["keyword_score"] = keyword_score
            result["combined_score"] = combined_score
        
        # Sort by combined score
        results.sort(key=lambda x: x.get("combined_score", 0), reverse=True)
        
        return {
            "success": True,
            "query": query,
            "results": results[:top_k],
            "search_type": "hybrid",
            "conversation_id": conversation_id,
            "weights": {
                "semantic": semantic_weight,
                "keyword": keyword_weight
            },
            "total_matches": len(results)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Hybrid search error: {str(e)}")
        raise HTTPException(500, f"Hybrid search error: {str(e)}")

@router.get("/collections")
async def get_search_collections(current_user: dict = Depends(get_current_user)):
    """
    Get available search collections
    """
    # Simplified status
    return {
        "success": True,
        "collections": ["documents"],
        "total_collections": 1,
        "status": "active"
    }

@router.post("/retrieve")
async def retrieve_context(request: dict, current_user: dict = Depends(get_current_user)):
    """
    Retrieve context string
    """
    try:
        query = request.get("query", "")
        # top_k = request.get("top_k", 5)
        conversation_id = request.get("conversation_id", "global")
        
        if not query:
            raise HTTPException(400, "Search query is required")
            
        if not rag_processor:
             raise HTTPException(500, "RAG system not initialized")
        
        context_str = rag_processor.retrieve_context(query, conversation_id)
        
        return {
            "success": True,
            "query": query,
            "results": [{"content": context_str}],
            "total_results": 1 if context_str else 0,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Context retrieval error: {str(e)}")
        raise HTTPException(500, f"Context retrieval error: {str(e)}")

@router.get("/status")
async def search_status():
    """
    Get semantic search service status
    """
    return {
        "status": "ready" if rag_processor else "not_initialized",
        "search_types": ["semantic", "hybrid"],
        "vector_database": "lancedb",
        "rag_system": {
            "processor": "RAGProcessor",
            "models": ["EasyOCR", "BGE-Small-FastEmbed"]
        }
    }

@router.get("/health")
async def health_check():
    """Health check for semantic search services"""
    return {
        "status": "healthy" if rag_processor else "unhealthy",
        "services": {
            "semantic_search": "ready",
            "vector_database": "ready"
        }
    }
