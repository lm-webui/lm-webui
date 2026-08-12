"""
Standardized Error Handling Module

Provides the minimal error-response shape and the exception/handler surface the
codebase actually imports. Trimming dead wrappers to keep it ~140 lines.
"""

import logging
from typing import Any, Dict, Optional, Union
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


# Error Response Structure
class ErrorResponse:
    """Standardized error response structure"""

    @staticmethod
    def create(
        error_type: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    ) -> Dict[str, Any]:
        """Create a standardized error response"""
        return {
            "success": False,
            "error": {
                "type": error_type,
                "message": message,
                "details": details or {}
            }
        }


# Exception Classes
class BaseAPIException(HTTPException):
    """Base exception for all API errors"""

    def __init__(
        self,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail: Union[str, Dict[str, Any]] = "Internal server error",
        error_type: str = "INTERNAL_ERROR"
    ):
        if isinstance(detail, str):
            detail = ErrorResponse.create(
                error_type=error_type,
                message=detail,
                status_code=status_code
            )
        super().__init__(status_code=status_code, detail=detail)


class ValidationException(BaseAPIException):
    """Validation error exception"""

    def __init__(self, message: str = "Validation failed", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.create(
            error_type="VALIDATION_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_400_BAD_REQUEST
        )
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_type="VALIDATION_ERROR"
        )


class NotFoundException(BaseAPIException):
    """Not found error exception"""

    def __init__(self, message: str = "Resource not found", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.create(
            error_type="NOT_FOUND_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_404_NOT_FOUND
        )
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_type="NOT_FOUND_ERROR"
        )


class ProviderException(BaseAPIException):
    """Provider error exception (e.g., OpenAI, Google API errors)"""

    def __init__(self, message: str = "External provider error", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.create(
            error_type="PROVIDER_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_502_BAD_GATEWAY
        )
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
            error_type="PROVIDER_ERROR"
        )


class ProviderError(ProviderException):
    """Generic provider error with provider-specific context"""

    def __init__(self, provider: str, message: str, details: Optional[Dict[str, Any]] = None):
        full_message = f"{provider} error: {message}"
        if details is None:
            details = {"provider": provider}
        else:
            details["provider"] = provider
        super().__init__(message=full_message, details=details)


class ModelNotFoundError(ProviderException):
    """Model not found error"""

    def __init__(self, provider: str, message: str, details: Optional[Dict[str, Any]] = None):
        full_message = f"{provider} model not found: {message}"
        if details is None:
            details = {"provider": provider, "error_type": "MODEL_NOT_FOUND"}
        else:
            details.update({"provider": provider, "error_type": "MODEL_NOT_FOUND"})
        super().__init__(message=full_message, details=details)


# Error Handler Functions
def handle_file_processing_error(
    filename: str,
    error: Exception,
    operation: str = "processing"
) -> JSONResponse:
    """Handle file processing errors"""
    error_message = f"File {operation} failed for '{filename}': {str(error)}"

    logger.error(f"File processing error: {error_message}")

    response = ErrorResponse.create(
        error_type="INTERNAL_ERROR",
        message=error_message,
        details={
            "filename": filename,
            "operation": operation,
            "error_type": error.__class__.__name__
        },
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=response
    )


# Decorator for Error Handling
def with_error_handling(
    error_message: str = "Operation failed",
    error_type: str = "INTERNAL_ERROR",
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
):
    """Decorator to add standardized error handling to functions"""
    import functools
    import inspect

    def decorator(func):
        @functools.wraps(func)  # preserve the endpoint signature for FastAPI introspection
        async def wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                # Handle both sync and async endpoints.
                if inspect.isawaitable(result):
                    result = await result
                return result
            except (ValidationException, NotFoundException, ProviderException) as e:
                # Re-raise our custom exceptions
                raise e
            except HTTPException as e:
                # Re-raise HTTP exceptions
                raise e
            except Exception as e:
                # Handle generic exceptions (incl. async) so they don't surface as raw 500s
                logger.error(f"{error_message}: {e}", exc_info=True)
                raise BaseAPIException(
                    status_code=status_code,
                    detail=error_message,
                    error_type=error_type
                )
        return wrapper
    return decorator


# Utility Functions for Common Patterns
def validate_required_field(field_value: Any, field_name: str) -> None:
    """Validate that a required field is not empty"""
    if field_value is None or (isinstance(field_value, str) and not field_value.strip()):
        raise ValidationException(
            message=f"Field '{field_name}' is required",
            details={"field": field_name, "value": field_value}
        )


def validate_file_extension(filename: str, allowed_extensions: list) -> None:
    """Validate file extension"""
    if not filename:
        raise ValidationException(
            message="Filename is required",
            details={"field": "filename", "value": filename}
        )

    file_extension = filename.split('.')[-1].lower() if '.' in filename else ''
    if not file_extension or f".{file_extension}" not in allowed_extensions:
        raise ValidationException(
            message=f"File extension '{file_extension}' not allowed. Allowed: {', '.join(allowed_extensions)}",
            details={
                "filename": filename,
                "extension": file_extension,
                "allowed_extensions": allowed_extensions
            }
        )
