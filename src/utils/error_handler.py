"""
Comprehensive Error Handling for Adaptive Quiz Backend
Circuit breaker pattern, graceful degradation, and structured error responses
"""

import logging
import traceback
import json
from functools import wraps
from typing import Dict, Any, Optional, Callable
from enum import Enum
import time

logger = logging.getLogger(__name__)

class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ErrorCategory(Enum):
    VALIDATION = "validation"
    BUSINESS_LOGIC = "business_logic"
    EXTERNAL_SERVICE = "external_service"
    INFRASTRUCTURE = "infrastructure"
    SECURITY = "security"

# Custom Exception Classes
class QuizApplicationError(Exception):
    """Base exception for quiz application"""
    def __init__(self, message: str, category: ErrorCategory = ErrorCategory.BUSINESS_LOGIC, 
                 severity: ErrorSeverity = ErrorSeverity.MEDIUM, details: Optional[Dict] = None):
        self.message = message
        self.category = category
        self.severity = severity
        self.details = details or {}
        super().__init__(self.message)

class ValidationError(QuizApplicationError):
    """Validation error for user input"""
    def __init__(self, message: str, field: Optional[str] = None, details: Optional[Dict] = None):
        super().__init__(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, details)
        self.field = field

class AdaptiveLearningError(QuizApplicationError):
    """Errors specific to adaptive learning algorithm"""
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(message, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, details)

class SessionError(QuizApplicationError):
    """Session management errors"""
    def __init__(self, message: str, session_id: Optional[str] = None, details: Optional[Dict] = None):
        super().__init__(message, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, details)
        self.session_id = session_id

class ExternalServiceError(QuizApplicationError):
    """External service integration errors"""
    def __init__(self, message: str, service: str, details: Optional[Dict] = None):
        super().__init__(message, ErrorCategory.EXTERNAL_SERVICE, ErrorSeverity.HIGH, details)
        self.service = service

class SecurityError(QuizApplicationError):
    """Security-related errors"""
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(message, ErrorCategory.SECURITY, ErrorSeverity.HIGH, details)

def handle_service_errors(func: Callable) -> Callable:
    """
    Decorator for comprehensive service error handling
    Provides structured error responses and logging
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
            
        except ValidationError as e:
            logger.warning(f"Validation error in {func.__name__}: {e.message}", 
                          extra={'field': e.field, 'details': e.details})
            raise e
            
        except AdaptiveLearningError as e:
            logger.error(f"Adaptive learning error in {func.__name__}: {e.message}",
                        extra={'details': e.details})
            raise e
            
        except SessionError as e:
            logger.error(f"Session error in {func.__name__}: {e.message}",
                        extra={'session_id': e.session_id, 'details': e.details})
            raise e
            
        except ExternalServiceError as e:
            logger.error(f"External service error in {func.__name__}: {e.message}",
                        extra={'service': e.service, 'details': e.details})
            raise e
            
        except SecurityError as e:
            logger.critical(f"Security error in {func.__name__}: {e.message}",
                           extra={'details': e.details})
            raise e
            
        except Exception as e:
            logger.critical(f"Unexpected error in {func.__name__}: {str(e)}",
                           extra={'traceback': traceback.format_exc()})
            raise QuizApplicationError(
                "An unexpected error occurred",
                ErrorCategory.INFRASTRUCTURE,
                ErrorSeverity.CRITICAL,
                {'original_error': str(e), 'function': func.__name__}
            )
    
    return wrapper

def handle_lambda_errors(func: Callable) -> Callable:
    """
    Decorator for Lambda function error handling
    Returns proper HTTP responses for API Gateway
    """
    @wraps(func)
    def wrapper(event, context):
        try:
            result = func(event, context)
            return result
            
        except ValidationError as e:
            return create_error_response(400, "VALIDATION_ERROR", e.message, {
                'field': e.field,
                'details': e.details
            })
            
        except AdaptiveLearningError as e:
            return create_error_response(422, "ADAPTIVE_LEARNING_ERROR", e.message, e.details)
            
        except SessionError as e:
            return create_error_response(404, "SESSION_ERROR", e.message, {
                'session_id': e.session_id,
                'details': e.details
            })
            
        except SecurityError as e:
            return create_error_response(403, "SECURITY_ERROR", 
                                       "Access denied", {})  # Don't expose security details
            
        except ExternalServiceError as e:
            return create_error_response(503, "EXTERNAL_SERVICE_ERROR", 
                                       "External service temporarily unavailable", {
                                           'service': e.service
                                       })
            
        except QuizApplicationError as e:
            status_code = 500
            if e.severity == ErrorSeverity.LOW:
                status_code = 400
            elif e.severity == ErrorSeverity.MEDIUM:
                status_code = 422
            
            return create_error_response(status_code, "APPLICATION_ERROR", e.message, e.details)
            
        except Exception as e:
            logger.critical(f"Unhandled error in Lambda {func.__name__}: {str(e)}",
                           extra={'event': event, 'traceback': traceback.format_exc()})
            
            return create_error_response(500, "INTERNAL_ERROR", 
                                       "An unexpected error occurred", {
                                           'request_id': context.aws_request_id if context else None
                                       })
    
    return wrapper

def create_error_response(status_code: int, error_code: str, message: str, 
                         details: Optional[Dict] = None) -> Dict[str, Any]:
    """Create standardized error response for API Gateway"""
    
    response_body = {
        'error': error_code,
        'message': message,
        'timestamp': int(time.time() * 1000)
    }
    
    if details:
        response_body['details'] = details
    
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST,PUT,DELETE'
        },
        'body': json.dumps(response_body)
    }

def create_success_response(data: Any, status_code: int = 200) -> Dict[str, Any]:
    """Create standardized success response for API Gateway"""
    
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST,PUT,DELETE'
        },
        'body': json.dumps(data, default=str)  # default=str handles datetime serialization
    }

class GracefulDegradation:
    """
    Handles graceful degradation when services are unavailable
    """
    
    @staticmethod
    def handle_timeout(remaining_time_ms: int, critical_operations: list = None) -> None:
        """Handle Lambda timeout gracefully"""
        if remaining_time_ms < 5000:  # Less than 5 seconds remaining
            logger.warning(f"Lambda timeout approaching: {remaining_time_ms}ms remaining")
            
            if critical_operations:
                for operation in critical_operations:
                    try:
                        operation()
                    except Exception as e:
                        logger.error(f"Failed to execute critical operation during timeout: {e}")
            
            raise QuizApplicationError(
                "Operation timeout - request processing time exceeded",
                ErrorCategory.INFRASTRUCTURE,
                ErrorSeverity.HIGH,
                {'remaining_time_ms': remaining_time_ms}
            )
    
    @staticmethod
    def handle_service_degradation(service_name: str, fallback_action: Callable = None) -> Any:
        """Handle service degradation with fallback"""
        logger.warning(f"Service degradation detected for {service_name}")
        
        if fallback_action:
            try:
                return fallback_action()
            except Exception as e:
                logger.error(f"Fallback action failed for {service_name}: {e}")
        
        raise ExternalServiceError(
            f"Service {service_name} is temporarily unavailable",
            service_name,
            {'fallback_attempted': fallback_action is not None}
        )

class RetryHandler:
    """
    Implements retry logic with exponential backoff
    """
    
    @staticmethod
    def exponential_backoff(operation: Callable, max_retries: int = 3, 
                           base_delay: float = 1.0) -> Any:
        """Execute operation with exponential backoff retry"""
        
        for attempt in range(max_retries + 1):
            try:
                return operation()
            except Exception as e:
                if attempt == max_retries:
                    logger.error(f"Operation failed after {max_retries} retries: {e}")
                    raise e
                
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Operation failed on attempt {attempt + 1}, retrying in {delay}s: {e}")
                time.sleep(delay)
        
        raise QuizApplicationError("Max retries exceeded", ErrorCategory.INFRASTRUCTURE, ErrorSeverity.HIGH)

class SecurityErrorHandler:
    """
    Specialized error handling for security-related issues
    """
    
    @staticmethod
    def handle_authentication_error(message: str = "Authentication failed") -> SecurityError:
        """Handle authentication errors with security logging"""
        logger.warning("Authentication attempt failed", extra={'security_event': True})
        return SecurityError(message)
    
    @staticmethod
    def handle_authorization_error(user_id: str, resource: str, action: str) -> SecurityError:
        """Handle authorization errors with detailed logging"""
        logger.warning(f"Authorization failed: user {user_id} attempted {action} on {resource}",
                      extra={'security_event': True, 'user_id': user_id, 'resource': resource, 'action': action})
        return SecurityError("Access denied")
    
    @staticmethod
    def handle_rate_limit_error(user_id: str, endpoint: str, limit: int) -> SecurityError:
        """Handle rate limiting with security context"""
        logger.warning(f"Rate limit exceeded: user {user_id} on {endpoint} (limit: {limit})",
                      extra={'security_event': True, 'user_id': user_id, 'endpoint': endpoint})
        return SecurityError("Rate limit exceeded")

# Input validation helpers
def validate_session_id(session_id: str) -> str:
    """Validate session ID format"""
    if not session_id or not isinstance(session_id, str):
        raise ValidationError("Session ID is required", "session_id")
    
    if len(session_id) < 10 or len(session_id) > 100:
        raise ValidationError("Invalid session ID format", "session_id")
    
    return session_id

def validate_user_id(user_id: str) -> str:
    """Validate user ID format"""
    if not user_id or not isinstance(user_id, str):
        raise ValidationError("User ID is required", "user_id")
    
    if len(user_id) < 10 or len(user_id) > 100:
        raise ValidationError("Invalid user ID format", "user_id")
    
    return user_id

def validate_question_id(question_id: str) -> str:
    """Validate question ID format"""
    if not question_id or not isinstance(question_id, str):
        raise ValidationError("Question ID is required", "question_id")
    
    if len(question_id) < 5 or len(question_id) > 100:
        raise ValidationError("Invalid question ID format", "question_id")
    
    return question_id

def validate_selected_answers(selected_answers: list) -> list:
    """Validate selected answers format"""
    if not isinstance(selected_answers, list):
        raise ValidationError("Selected answers must be a list", "selected_answers")
    
    if len(selected_answers) == 0:
        raise ValidationError("At least one answer must be selected", "selected_answers")
    
    if len(selected_answers) > 10:
        raise ValidationError("Too many answers selected", "selected_answers")
    
    return selected_answers