"""file_context capability — inject extracted text of attachments."""
from __future__ import annotations

from .base import CapabilityContext
from .results import FileResult


async def execute(ctx: CapabilityContext) -> FileResult:
    """Read attachment text from media_library and return a FileResult."""
    if not ctx.chat_request or not ctx.chat_request.file_references:
        return FileResult()
    from app.database import get_db
    db = get_db()
    try:
        cursor = db.cursor()
        parts = []
        for ref in ctx.chat_request.file_references:
            file_id = ref.get("media_id") or ref.get("id")
            if not file_id:
                continue
            cursor.execute(
                "SELECT filename, extracted_text FROM media_library WHERE id = ?",
                (file_id,),
            )
            row = cursor.fetchone()
            if not row:
                continue
            filename, extracted = row[0], row[1]
            if extracted:
                parts.append(f"--- {filename} ---\n{extracted}")
        return FileResult(text="\n\n".join(parts))
    finally:
        db.close()
