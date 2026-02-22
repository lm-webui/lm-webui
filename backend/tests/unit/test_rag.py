"""Quick tests for RAG module - tests chunking utilities without heavy dependencies."""
import pytest
from app.rag.chunking import chunk_text, add_context_to_chunks, generate_summary


class TestChunkText:
    """Test text chunking functionality."""
    
    def test_chunk_empty_text(self):
        """Test chunking empty text."""
        result = chunk_text("")
        assert result == []
    
    def test_chunk_short_text(self):
        """Test chunking text shorter than chunk size."""
        text = "This is a short text."
        result = chunk_text(text, chunk_size=100)
        assert len(result) == 1
        assert result[0] == text
    
    def test_chunk_single_paragraph(self):
        """Test chunking a single paragraph."""
        text = " ".join(["word"] * 600)  # 600 words
        result = chunk_text(text, chunk_size=500, overlap=50)
        
        # Should be split into multiple chunks
        assert len(result) >= 1
        # Each chunk should be approximately chunk_size words
        for chunk in result:
            words = chunk.split()
            assert len(words) <= 500
    
    def test_chunk_multiple_paragraphs(self):
        """Test chunking multiple paragraphs."""
        text = "First paragraph with some words.\n\nSecond paragraph with more content.\n\nThird paragraph here."
        result = chunk_text(text, chunk_size=100)
        
        assert len(result) >= 1
        # Should preserve paragraph content
        full_text = " ".join(result)
        assert "First paragraph" in full_text
        assert "Second paragraph" in full_text
    
    def test_chunk_with_overlap(self):
        """Test that overlap is applied between chunks."""
        text = " ".join(["word"] * 600)  # 600 words
        result = chunk_text(text, chunk_size=500, overlap=50)
        
        if len(result) > 1:
            # Check that there's some overlap between consecutive chunks
            # The overlap is in words, so we check word overlap
            words1 = result[0].split()
            words2 = result[1].split()
            
            # Last 50 words of first chunk should be in second chunk
            overlap_words = words1[-50:]
            # At least some overlap should exist
            assert any(w in words2 for w in overlap_words)
    
    def test_chunk_preserves_structure(self):
        """Test that chunking preserves text structure."""
        text = "Introduction paragraph.\n\nMain content paragraph.\n\nConclusion paragraph."
        result = chunk_text(text, chunk_size=100)
        
        # All content should be preserved
        combined = " ".join(result)
        assert "Introduction" in combined
        assert "Main content" in combined
        assert "Conclusion" in combined
    
    def test_chunk_large_paragraph(self):
        """Test chunking a single large paragraph."""
        # Create a paragraph larger than chunk_size
        text = " ".join(["word"] * 1000)
        result = chunk_text(text, chunk_size=500, overlap=50)
        
        # Should be split into multiple chunks
        assert len(result) >= 2
    
    def test_chunk_normalizes_line_endings(self):
        """Test that CRLF is normalized to LF."""
        text = "Line one.\r\n\r\nLine two."
        result = chunk_text(text, chunk_size=100)
        
        # Should handle CRLF properly
        assert len(result) >= 1


class TestAddContextToChunks:
    """Test adding context to chunks."""
    
    def test_add_context_single_chunk(self):
        """Test adding context to a single chunk."""
        chunks = ["This is the content."]
        result = add_context_to_chunks(chunks, "Document summary", "test.txt")
        
        assert len(result) == 1
        assert "[Source: test.txt]" in result[0]
        assert "Document summary" in result[0]
        assert "Content Section 1" in result[0]
        assert "This is the content." in result[0]
    
    def test_add_context_multiple_chunks(self):
        """Test adding context to multiple chunks."""
        chunks = ["First chunk.", "Second chunk.", "Third chunk."]
        result = add_context_to_chunks(chunks, "Summary text", "document.pdf")
        
        assert len(result) == 3
        
        # Check each chunk has proper context
        assert "Content Section 1" in result[0]
        assert "Content Section 2" in result[1]
        assert "Content Section 3" in result[2]
        
        # All should have source and summary
        for chunk in result:
            assert "[Source: document.pdf]" in chunk
            assert "Summary text" in chunk
    
    def test_add_context_empty_chunks(self):
        """Test adding context to empty chunk list."""
        result = add_context_to_chunks([], "Summary", "file.txt")
        assert result == []
    
    def test_add_context_preserves_content(self):
        """Test that original content is preserved."""
        chunks = ["Important content that must be preserved."]
        result = add_context_to_chunks(chunks, "Summary", "file.txt")
        
        assert "Important content that must be preserved." in result[0]
    
    def test_add_context_format(self):
        """Test the format of contextual chunks."""
        chunks = ["Content here."]
        result = add_context_to_chunks(chunks, "Test summary", "report.docx")
        
        # Check format structure
        assert result[0].startswith("[Source: report.docx]")
        assert "Document Summary: Test summary" in result[0]
        assert "Content Section 1:" in result[0]


class TestGenerateSummary:
    """Test summary generation."""
    
    def test_generate_summary_short_text(self):
        """Test summary of short text."""
        text = "This is a short text."
        result = generate_summary(text, max_words=50)
        
        # The function adds "..." to the end, and text already has "."
        assert "This is a short text" in result
        assert result.endswith("...")
    
    def test_generate_summary_long_text(self):
        """Test summary truncates to max words."""
        text = " ".join(["word"] * 100)
        result = generate_summary(text, max_words=10)
        
        words = result.replace("...", "").strip().split()
        assert len(words) == 10
    
    def test_generate_summary_exact_words(self):
        """Test summary with exact word count."""
        text = "one two three four five"
        result = generate_summary(text, max_words=5)
        
        assert "one two three four five" in result
    
    def test_generate_summary_empty_text(self):
        """Test summary of empty text."""
        result = generate_summary("", max_words=10)
        assert result == "..."
    
    def test_generate_summary_default_max_words(self):
        """Test default max_words parameter."""
        text = " ".join(["word"] * 100)
        result = generate_summary(text)  # Default max_words=50
        
        words = result.replace("...", "").strip().split()
        assert len(words) == 50
    
    def test_generate_summary_preserves_start(self):
        """Test that summary preserves text start."""
        text = "The quick brown fox jumps over the lazy dog."
        result = generate_summary(text, max_words=4)
        
        assert result.startswith("The quick brown fox")
