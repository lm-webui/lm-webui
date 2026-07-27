"""
File Processor
Extracts text content from uploaded files for LLM context injection.
No chunking, no embedding, no vector DB — just text extraction.
"""
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class FileProcessor:
    """Extracts text content from files."""

    def process_file(self, file_path: str, conversation_id: str, user_id: int = 1) -> Dict[str, Any]:
        """Extract text from a file and store reference."""
        path = Path(file_path).resolve()
        suffix = path.suffix.lower()

        try:
            text = self._extract_text(path, suffix)
            self._store_media_text(file_path, text)
            return {"status": "success", "file_name": path.name, "text_length": len(text)}
        except Exception as e:
            logger.error(f"File processing failed: {e}")
            return {"status": "error", "message": str(e)}

    def _extract_text(self, path: Path, suffix: str) -> str:
        """Extract text based on file type."""
        # Plain text
        if suffix in ('.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.json', '.csv', '.xml', '.yaml', '.yml'):
            return path.read_text(errors='ignore')

        # PDF
        if suffix == '.pdf':
            return self._extract_pdf(path)

        # Word
        if suffix == '.docx':
            return self._extract_docx(path)

        # Images — no text extraction; LLM reads them via vision
        if suffix in ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'):
            return "[Image file — processed via LLM vision when referenced in chat]"

        return "[Unsupported file format]"

    def _extract_pdf(self, path: Path) -> str:
        """Extract text from PDF."""
        try:
            import pdfplumber
            with pdfplumber.open(str(path)) as pdf:
                pages = [page.extract_text() for page in pdf.pages if page.extract_text()]
                return "\n\n".join(pages)
        except ImportError:
            logger.warning("pdfplumber not installed, trying pypdf")
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(path))
                return "\n\n".join(p.extract_text() for p in reader.pages if p.extract_text())
            except ImportError:
                return "[PDF — install pypdf or pdfplumber for text extraction]"

    def _extract_docx(self, path: Path) -> str:
        """Extract text from DOCX."""
        try:
            import docx
            doc = docx.Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            return "[DOCX — install python-docx for text extraction]"

    def _store_media_text(self, file_path: str, text: str) -> None:
        """Store extracted text in media_library."""
        from app.database import get_db
        db = get_db()
        db.execute(
            "UPDATE media_library SET extracted_text = ? WHERE file_path = ?",
            (text[:50000], file_path)  # cap at 50K chars
        )
        db.commit()
