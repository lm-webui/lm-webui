"""Quick tests for chat module - tests pure functions without heavy dependencies."""
import pytest
from app.routes.chat import extract_file_issues_from_context, build_prompt


class TestExtractFileIssues:
    """Test file issue extraction from context strings."""
    
    def test_extract_file_processing_error(self):
        """Test detection of file processing error."""
        context = "Some text [File Processing Error: test.txt] more text"
        issues = extract_file_issues_from_context(context)
        assert "FILE_PROCESSING_ERROR" in issues
    
    def test_extract_file_processing_note(self):
        """Test detection of file processing note."""
        context = "Results [File Processing Note: skipped] done"
        issues = extract_file_issues_from_context(context)
        assert "FILE_PROCESSING_NOTE" in issues
    
    def test_extract_excel_processing_error(self):
        """Test detection of Excel processing error."""
        context = "Data [Excel Processing Error: corrupted] end"
        issues = extract_file_issues_from_context(context)
        assert "EXCEL_PROCESSING_ERROR" in issues
    
    def test_extract_pdf_processing_error(self):
        """Test detection of PDF processing error."""
        context = "Document [Error processing PDF: encrypted] done"
        issues = extract_file_issues_from_context(context)
        assert "PDF_PROCESSING_ERROR" in issues
    
    def test_extract_multiple_issues(self):
        """Test detection of multiple issues in one context."""
        context = """
        [File Processing Error: test.txt]
        [Excel Processing Note: empty rows]
        Files with errors: test.txt, data.xlsx
        """
        issues = extract_file_issues_from_context(context)
        assert "FILE_PROCESSING_ERROR" in issues
        assert "EXCEL_PROCESSING_NOTE" in issues
        assert "FILES_WITH_ERRORS" in issues
    
    def test_extract_empty_file_issue(self):
        """Test detection of empty file issue."""
        context = "Result: EMPTY FILE detected"
        issues = extract_file_issues_from_context(context)
        assert "EMPTY_FILE" in issues
    
    def test_extract_files_not_found(self):
        """Test detection of files not found."""
        context = "Files not found: missing.txt"
        issues = extract_file_issues_from_context(context)
        assert "FILES_NOT_FOUND" in issues
    
    def test_no_issues_found(self):
        """Test when no issues are present."""
        context = "This is normal text without any issues."
        issues = extract_file_issues_from_context(context)
        assert issues == []
    
    def test_error_reading_file(self):
        """Test detection of error reading file."""
        context = "ERROR READING FILE: permission denied"
        issues = extract_file_issues_from_context(context)
        assert "ERROR_READING_FILE" in issues
    
    def test_pptx_processing_error(self):
        """Test detection of PPTX processing error."""
        context = "[Error processing PPTX: corrupted]"
        issues = extract_file_issues_from_context(context)
        assert "PPTX_PROCESSING_ERROR" in issues


class TestBuildPrompt:
    """Test prompt building logic."""
    
    def test_build_prompt_basic(self):
        """Test basic prompt building."""
        messages = build_prompt(
            system_prompt="You are helpful.",
            conversation_summary=None,
            user_memory="",
            last_messages=[],
            current_message="Hello"
        )
        
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "You are helpful."
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Hello"
    
    def test_build_prompt_with_conversation_summary(self):
        """Test prompt with conversation summary."""
        messages = build_prompt(
            system_prompt="You are helpful.",
            conversation_summary="Previous discussion about AI",
            user_memory="",
            last_messages=[],
            current_message="Continue"
        )
        
        assert len(messages) == 3
        assert "Conversation summary" in messages[1]["content"]
        assert "Previous discussion about AI" in messages[1]["content"]
    
    def test_build_prompt_with_user_memory(self):
        """Test prompt with user memory (KG)."""
        messages = build_prompt(
            system_prompt="You are helpful.",
            conversation_summary=None,
            user_memory="User likes Python",
            last_messages=[],
            current_message="What language?"
        )
        
        assert len(messages) == 3
        assert "Relevant User Knowledge" in messages[1]["content"]
        assert "User likes Python" in messages[1]["content"]
    
    def test_build_prompt_with_rag_context(self):
        """Test prompt with RAG context."""
        messages = build_prompt(
            system_prompt="You are helpful.",
            conversation_summary=None,
            user_memory="",
            last_messages=[],
            current_message="Query",
            rag_context="Document content here"
        )
        
        # Find the RAG context message
        rag_msg = next((m for m in messages if "Background Context" in m["content"]), None)
        assert rag_msg is not None
        assert "Document content here" in rag_msg["content"]
    
    def test_build_prompt_with_attached_files(self):
        """Test prompt with attached files context."""
        messages = build_prompt(
            system_prompt="You are helpful.",
            conversation_summary=None,
            user_memory="",
            last_messages=[],
            current_message="Analyze",
            attached_files_context="File: data.csv\nContent: ..."
        )
        
        # Find the attached files message
        files_msg = next((m for m in messages if "USER ATTACHED FILES" in m["content"]), None)
        assert files_msg is not None
    
    def test_build_prompt_with_web_search(self):
        """Test prompt with web search context."""
        messages = build_prompt(
            system_prompt="You are helpful.",
            conversation_summary=None,
            user_memory="",
            last_messages=[],
            current_message="Search",
            web_search_context="Web results here"
        )
        
        # Find the web search message
        web_msg = next((m for m in messages if "CURRENT WEB SEARCH RESULTS" in m["content"]), None)
        assert web_msg is not None
    
    def test_build_prompt_with_last_messages(self):
        """Test prompt with conversation history."""
        messages = build_prompt(
            system_prompt="You are helpful.",
            conversation_summary=None,
            user_memory="",
            last_messages=[
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Hello!"}
            ],
            current_message="How are you?"
        )
        
        assert len(messages) == 4
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Hi"
        assert messages[2]["role"] == "assistant"
    
    def test_build_prompt_all_contexts(self):
        """Test prompt with all context types."""
        messages = build_prompt(
            system_prompt="System",
            conversation_summary="Summary",
            user_memory="Memory",
            last_messages=[{"role": "user", "content": "Past"}],
            current_message="Now",
            rag_context="RAG",
            attached_files_context="Files",
            web_search_context="Web"
        )
        
        # Should have: system, summary, memory, files, web, rag, past message, current
        assert len(messages) == 8
        
        # Check order: system -> summary -> memory -> files -> web -> rag -> history -> current
        assert messages[0]["role"] == "system"
        assert "System" in messages[0]["content"]
        assert "Summary" in messages[1]["content"]
        assert "Memory" in messages[2]["content"]
        assert "Files" in messages[3]["content"]
        assert "Web" in messages[4]["content"]
        assert "RAG" in messages[5]["content"]
