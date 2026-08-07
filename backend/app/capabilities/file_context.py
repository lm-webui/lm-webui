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
    cursor = db.cursor()
    parts = []
    for ref in ctx.chat_request.file_references:
        file_id = ref.get("media_id") or ref.get("id")
        if not file_id:
            continue
        cursor.execute(
            "SELECT filename, file_path, extracted_text FROM media_library WHERE id = ?",
            (file_id,),
        )
        row = cursor.fetchone()
        if not row:
            continue
        filename, file_path, extracted = row[0], row[1], row[2]
        if extracted:
            parts.append(f"--- {filename} ---\n{extracted}")
            continue
        # Fallback: raw-file preview while extraction is pending.
        try:
            import os
            if file_path and os.path.exists(file_path):
                with open(file_path, "rb") as fh:
                    raw = fh.read(20000)
                preview = raw.decode("utf-8", errors="ignore").strip()
                if preview:
                    parts.append(f"--- {filename} (raw preview) ---\n{preview[:6000]}")
        except Exception:
            pass
    return FileResult(text="\n\n".join(parts))
