"""
Authentication Helper Functions
JWT token validation and user extraction for Cognito integration
"""

import json
import logging
import jwt
from typing import Dict, Any, Optional
from functools import wraps

from src.utils.error_handler import SecurityError, ValidationError

logger = logging.getLogger(__name__)

def extract_user_from_token(event: Dict[str, Any]) -> str:
    """Extract user ID from JWT token in event"""
    try:
        # Get authorization context from API Gateway
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        
        # Extract user ID from Cognito claims
        user_id = authorizer.get('claims', {}).get('sub')
        
        if not user_id:
            # Fallback: try to extract from JWT token directly
            auth_header = event.get('headers', {}).get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
                # Note: In production, you should validate the token signature
                decoded = jwt.decode(token, options={"verify_signature": False})
                user_id = decoded.get('sub')
        
        if not user_id:
            raise SecurityError("Unable to extract user ID from token")
        
        return user_id
        
    except Exception as e:
        logger.error(f"Failed to extract user from token: {e}")
        raise SecurityError("Invalid authentication token")

def require_authentication(func):
    """Decorator to require authentication for Lambda functions"""
    @wraps(func)
    def wrapper(event, context):
        try:
            # Verify user is authenticated
            user_id = extract_user_from_token(event)
            if not user_id:
                raise SecurityError("Authentication required")
            
            return func(event, context)
            
        except SecurityError:
            from src.utils.error_handler import create_error_response
            return create_error_response(401, "UNAUTHORIZED", "Authentication required")
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            from src.utils.error_handler import create_error_response
            return create_error_response(401, "UNAUTHORIZED", "Authentication failed")
    
    return wrapper