"""
Standardized Error Handling Module

This module provides consistent error handling patterns across the LM WebUI backend.
It follows DRY principles and provides reusable error handlers for common scenarios.
"""

import logging
import functools
from typing import Any, Dict, Optional, Union
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

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
        response = {
            "success": False,
            "error": {
                "type": error_type,
                "message": message,
                "details": details or {}
            }
        }
        return response
    
    @staticmethod
    def validation_error(
        message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a validation error response"""
        return ErrorResponse.create(
            error_type="VALIDATION_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_400_BAD_REQUEST
        )
    
    @staticmethod
    def authentication_error(
        message: str = "Authentication failed",
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create an authentication error response"""
        return ErrorResponse.create(
            error_type="AUTHENTICATION_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_401_UNAUTHORIZED
        )
    
    @staticmethod
    def authorization_error(
        message: str = "Authorization failed",
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create an authorization error response"""
        return ErrorResponse.create(
            error_type="AUTHORIZATION_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_403_FORBIDDEN
        )
    
    @staticmethod
    def not_found_error(
        message: str = "Resource not found",
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a not found error response"""
        return ErrorResponse.create(
            error_type="NOT_FOUND_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_404_NOT_FOUND
        )
    
    @staticmethod
    def conflict_error(
        message: str = "Resource conflict",
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a conflict error response"""
        return ErrorResponse.create(
            error_type="CONFLICT_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_409_CONFLICT
        )
    
    @staticmethod
    def rate_limit_error(
        message: str = "Rate limit exceeded",
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a rate limit error response"""
        return ErrorResponse.create(
            error_type="RATE_LIMIT_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS
        )
    
    @staticmethod
    def provider_error(
        message: str = "External provider error",
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a provider error response (e.g., OpenAI, Google API errors)"""
        return ErrorResponse.create(
            error_type="PROVIDER_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_502_BAD_GATEWAY
        )
    
    @staticmethod
    def internal_error(
        message: str = "Internal server error",
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create an internal server error response"""
        return ErrorResponse.create(
            error_type="INTERNAL_ERROR",
            message=message,
            details=details,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

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
        detail = ErrorResponse.validation_error(message, details)
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_type="VALIDATION_ERROR"
        )

class AuthenticationException(BaseAPIException):
    """Authentication error exception"""
    
    def __init__(self, message: str = "Authentication failed", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.authentication_error(message, details)
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_type="AUTHENTICATION_ERROR"
        )

class AuthorizationException(BaseAPIException):
    """Authorization error exception"""
    
    def __init__(self, message: str = "Authorization failed", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.authorization_error(message, details)
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_type="AUTHORIZATION_ERROR"
        )

class NotFoundException(BaseAPIException):
    """Not found error exception"""
    
    def __init__(self, message: str = "Resource not found", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.not_found_error(message, details)
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_type="NOT_FOUND_ERROR"
        )

class ConflictException(BaseAPIException):
    """Conflict error exception"""
    
    def __init__(self, message: str = "Resource conflict", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.conflict_error(message, details)
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_type="CONFLICT_ERROR"
        )

class RateLimitException(BaseAPIException):
    """Rate limit error exception"""
    
    def __init__(self, message: str = "Rate limit exceeded", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.rate_limit_error(message, details)
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            error_type="RATE_LIMIT_ERROR"
        )

class ProviderException(BaseAPIException):
    """Provider error exception (e.g., OpenAI, Google API errors)"""
    
    def __init__(self, message: str = "External provider error", details: Optional[Dict[str, Any]] = None):
        detail = ErrorResponse.provider_error(message, details)
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

class APIKeyError(ProviderException):
    """API key error (invalid, missing, or decryption failed)"""
    
    def __init__(self, provider: str, message: str, details: Optional[Dict[str, Any]] = None):
        full_message = f"{provider} API key error: {message}"
        if details is None:
            details = {"provider": provider, "error_type": "API_KEY_ERROR"}
        else:
            details.update({"provider": provider, "error_type": "API_KEY_ERROR"})
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

class RateLimitError(ProviderException):
    """Rate limit error"""
    
    def __init__(self, provider: str, message: str, details: Optional[Dict[str, Any]] = None):
        full_message = f"{provider} rate limit: {message}"
        if details is None:
            details = {"provider": provider, "error_type": "RATE_LIMIT"}
        else:
            details.update({"provider": provider, "error_type": "RATE_LIMIT"})
        super().__init__(message=full_message, details=details)

class ServiceUnavailableError(ProviderException):
    """Service unavailable error"""
    
    def __init__(self, provider: str, message: str, details: Optional[Dict[str, Any]] = None):
        full_message = f"{provider} service unavailable: {message}"
        if details is None:
            details = {"provider": provider, "error_type": "SERVICE_UNAVAILABLE"}
        else:
            details.update({"provider": provider, "error_type": "SERVICE_UNAVAILABLE"})
        super().__init__(message=full_message, details=details)

# Error Handler Functions
def handle_validation_error(error: ValidationError) -> JSONResponse:
    """Handle Pydantic validation errors"""
    error_details = {}
    for err in error.errors():
        field = ".".join(str(loc) for loc in err["loc"])
        error_details[field] = err["msg"]
    
    response = ErrorResponse.validation_error(
        message="Request validation failed",
        details={"validation_errors": error_details}
    )
    
    logger.warning(f"Validation error: {error_details}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=response
    )

def handle_http_exception(error: HTTPException) -> JSONResponse:
    """Handle FastAPI HTTP exceptions"""
    # Check if error.detail is already in our standardized format
    if isinstance(error.detail, dict) and "error" in error.detail:
        # Already standardized, return as-is
        return JSONResponse(
            status_code=error.status_code,
            content=error.detail
        )
    
    # Convert to standardized format
    error_type = "HTTP_ERROR"
    if error.status_code == 400:
        error_type = "VALIDATION_ERROR"
    elif error.status_code == 401:
        error_type = "AUTHENTICATION_ERROR"
    elif error.status_code == 403:
        error_type = "AUTHORIZATION_ERROR"
    elif error.status_code == 404:
        error_type = "NOT_FOUND_ERROR"
    elif error.status_code == 409:
        error_type = "CONFLICT_ERROR"
    elif error.status_code == 429:
        error_type = "RATE_LIMIT_ERROR"
    elif error.status_code >= 500:
        error_type = "INTERNAL_ERROR"
    
    response = ErrorResponse.create(
        error_type=error_type,
        message=str(error.detail),
        status_code=error.status_code
    )
    
    logger.warning(f"HTTP error {error.status_code}: {error.detail}")
    return JSONResponse(
        status_code=error.status_code,
        content=response
    )

def handle_generic_exception(error: Exception) -> JSONResponse:
    """Handle generic exceptions"""
    # Log the full error with traceback for debugging
    logger.error(f"Unhandled exception: {error}", exc_info=True)
    
    # Don't expose internal error details in production
    error_message = "Internal server error"
    error_details = None
    
    # In development, include more details
    from .config_manager import is_development
    if is_development():
        error_message = str(error)
        error_details = {"exception_type": error.__class__.__name__}
    
    response = ErrorResponse.internal_error(
        message=error_message,
        details=error_details
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=response
    )

def handle_provider_error(
    provider: str,
    error: Exception,
    operation: str = "operation"
) -> JSONResponse:
    """Handle errors from external providers (OpenAI, Google, etc.)"""
    error_message = f"{provider} {operation} failed: {str(error)}"
    
    logger.error(f"Provider error ({provider}): {error}")
    
    response = ErrorResponse.provider_error(
        message=error_message,
        details={
            "provider": provider,
            "operation": operation,
            "error_type": error.__class__.__name__
        }
    )
    
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content=response
    )

def handle_file_processing_error(
    filename: str,
    error: Exception,
    operation: str = "processing"
) -> JSONResponse:
    """Handle file processing errors"""
    error_message = f"File {operation} failed for '{filename}': {str(error)}"
    
    logger.error(f"File processing error: {error_message}")
    
    response = ErrorResponse.internal_error(
        message=error_message,
        details={
            "filename": filename,
            "operation": operation,
            "error_type": error.__class__.__name__
        }
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=response
    )

def handle_database_error(
    error: Exception,
    operation: str = "database operation"
) -> JSONResponse:
    """Handle database errors"""
    error_message = f"Database {operation} failed: {str(error)}"
    
    logger.error(f"Database error: {error}")
    
    response = ErrorResponse.internal_error(
        message=error_message,
        details={
            "operation": operation,
            "error_type": error.__class__.__name__
        }
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=response
    )

# Context Manager for Error Handling
class ErrorHandlerContext:
    """Context manager for consistent error handling in functions"""
    
    def __init__(
        self,
        operation: str,
        log_level: str = "error",
        raise_exception: bool = False
    ):
        self.operation = operation
        self.log_level = log_level
        self.raise_exception = raise_exception
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_val is not None:
            # Log the error
            log_method = getattr(logger, self.log_level)
            log_method(f"Error during {self.operation}: {exc_val}", exc_info=True)
            
            # Re-raise if requested
            if self.raise_exception:
                return False  # Re-raise the exception
            
            # Otherwise, suppress the exception
            return True
        
        return False

# Decorator for Error Handling
def with_error_handling(
    error_message: str = "Operation failed",
    error_type: str = "INTERNAL_ERROR",
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
):
    """Decorator to add standardized error handling to functions"""
    def decorator(func):
        @functools.wraps(func)  # preserve the endpoint signature for FastAPI introspection
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except (ValidationException, AuthenticationException, 
                   AuthorizationException, NotFoundException,
                   ConflictException, RateLimitException, ProviderException) as e:
                # Re-raise our custom exceptions
                raise e
            except HTTPException as e:
                # Re-raise HTTP exceptions
                raise e
            except Exception as e:
                # Handle generic exceptions
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

def log_and_raise(
    error: Exception,
    message: str,
    error_type: str = "INTERNAL_ERROR",
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
) -> None:
    """Log an error and raise a standardized exception"""
    logger.error(f"{message}: {error}", exc_info=True)
    raise BaseAPIException(
        status_code=status_code,
        detail=message,
        error_type=error_type
    )