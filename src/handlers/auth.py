"""
Authentication Lambda Handlers
Handles user registration, login, and token refresh for the adaptive quiz application
"""

import json
import logging
import os
from typing import Dict, Any, Optional
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

from src.utils.error_handler import (
    handle_lambda_errors, create_success_response, create_error_response,
    ValidationError, AuthenticationError
)
from src.utils.performance_monitor import track_lambda_performance
from src.utils.auth_helper import (
    generate_jwt_token, validate_jwt_token, hash_password, verify_password,
    validate_email, validate_password_strength
)
from src.utils.dynamodb_client import dynamodb_client

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# AWS services
cognito_client = boto3.client('cognito-idp')
USER_POOL_ID = os.getenv('USER_POOL_ID')
USER_POOL_CLIENT_ID = os.getenv('USER_POOL_CLIENT_ID')


@handle_lambda_errors
@track_lambda_performance("auth_register")
def register(event, context):
    """
    Register a new user
    
    POST /auth/register
    Body: {
        "email": "user@example.com",
        "password": "securePassword123!",
        "firstName": "John",
        "lastName": "Doe",
        "preferredUsername": "john_doe"
    }
    """
    logger.info(f"User registration - Request ID: {context.aws_request_id}")
    
    try:
        request_body = json.loads(event['body'])
        
        # Extract and validate fields
        email = request_body.get('email', '').strip().lower()
        password = request_body.get('password', '')
        first_name = request_body.get('firstName', '').strip()
        last_name = request_body.get('lastName', '').strip()
        preferred_username = request_body.get('preferredUsername', '').strip()
        
        # Validation
        if not validate_email(email):
            raise ValidationError("Invalid email format", "email")
        
        if not validate_password_strength(password):
            raise ValidationError(
                "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
                "password"
            )
        
        if not first_name:
            raise ValidationError("First name is required", "firstName")
        
        if not last_name:
            raise ValidationError("Last name is required", "lastName")
        
        if not preferred_username:
            preferred_username = f"{first_name.lower()}_{last_name.lower()}"
        
        # Check if user already exists
        if _check_user_exists(email):
            raise ValidationError("User with this email already exists", "email")
        
        # Create user in Cognito
        try:
            cognito_response = cognito_client.admin_create_user(
                UserPoolId=USER_POOL_ID,
                Username=email,
                MessageAction='SUPPRESS',  # Don't send welcome email
                TemporaryPassword=password,
                UserAttributes=[
                    {'Name': 'email', 'Value': email},
                    {'Name': 'email_verified', 'Value': 'true'},
                    {'Name': 'given_name', 'Value': first_name},
                    {'Name': 'family_name', 'Value': last_name},
                    {'Name': 'preferred_username', 'Value': preferred_username}
                ]
            )
            
            user_sub = cognito_response['User']['Username']
            
            # Set permanent password
            cognito_client.admin_set_user_password(
                UserPoolId=USER_POOL_ID,
                Username=email,
                Password=password,
                Permanent=True
            )
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'UsernameExistsException':
                raise ValidationError("User with this email already exists", "email")
            elif error_code == 'InvalidPasswordException':
                raise ValidationError("Password does not meet requirements", "password")
            else:
                logger.error(f"Cognito error during registration: {e}")
                raise AuthenticationError("Registration failed")
        
        # Create user profile in DynamoDB
        user_profile = {
            'userId': user_sub,
            'email': email,
            'firstName': first_name,
            'lastName': last_name,
            'preferredUsername': preferred_username,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'updatedAt': datetime.now(timezone.utc).isoformat(),
            'emailVerified': True,
            'accountStatus': 'ACTIVE',
            'preferences': {
                'theme': 'light',
                'language': 'en',
                'notifications': {
                    'email': True,
                    'push': False
                }
            },
            'statistics': {
                'totalSessions': 0,
                'totalQuestions': 0,
                'totalCorrectAnswers': 0,
                'averageScore': 0.0,
                'totalTimeSpent': 0
            }
        }
        
        dynamodb_client.put_item(
            table_name=os.getenv('USERS_TABLE'),
            item=user_profile
        )
        
        # Generate JWT token
        jwt_token = generate_jwt_token({
            'userId': user_sub,
            'email': email,
            'firstName': first_name,
            'lastName': last_name
        })
        
        response_data = {
            'user': {
                'userId': user_sub,
                'email': email,
                'firstName': first_name,
                'lastName': last_name,
                'preferredUsername': preferred_username
            },
            'token': jwt_token,
            'expiresIn': 3600  # 1 hour
        }
        
        logger.info(f"User registered successfully: {email}")
        return create_success_response(response_data, 201)
        
    except json.JSONDecodeError:
        raise ValidationError("Invalid JSON in request body", "body")
    except ValidationError as e:
        logger.warning(f"Validation error in register: {e.message}")
        raise e
    except AuthenticationError as e:
        logger.error(f"Authentication error in register: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in register: {str(e)}")
        raise e


@handle_lambda_errors
@track_lambda_performance("auth_login")
def login(event, context):
    """
    Authenticate user and return JWT token
    
    POST /auth/login
    Body: {
        "email": "user@example.com",
        "password": "securePassword123!"
    }
    """
    logger.info(f"User login - Request ID: {context.aws_request_id}")
    
    try:
        request_body = json.loads(event['body'])
        
        email = request_body.get('email', '').strip().lower()
        password = request_body.get('password', '')
        
        if not email or not password:
            raise ValidationError("Email and password are required", "credentials")
        
        # Authenticate with Cognito
        try:
            auth_response = cognito_client.admin_initiate_auth(
                UserPoolId=USER_POOL_ID,
                ClientId=USER_POOL_CLIENT_ID,
                AuthFlow='ADMIN_NO_SRP_AUTH',
                AuthParameters={
                    'USERNAME': email,
                    'PASSWORD': password
                }
            )
            
            if 'ChallengeName' in auth_response:
                # Handle password challenges if needed
                if auth_response['ChallengeName'] == 'NEW_PASSWORD_REQUIRED':
                    raise AuthenticationError("New password required")
                else:
                    raise AuthenticationError("Authentication challenge required")
            
            # Extract tokens
            id_token = auth_response['AuthenticationResult']['IdToken']
            access_token = auth_response['AuthenticationResult']['AccessToken']
            refresh_token = auth_response['AuthenticationResult']['RefreshToken']
            
            # Decode user info from ID token
            user_info = validate_jwt_token(id_token)
            user_sub = user_info['sub']
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code in ['NotAuthorizedException', 'UserNotFoundException']:
                raise AuthenticationError("Invalid email or password")
            elif error_code == 'UserNotConfirmedException':
                raise AuthenticationError("User account not confirmed")
            elif error_code == 'TooManyRequestsException':
                raise AuthenticationError("Too many login attempts, please try again later")
            else:
                logger.error(f"Cognito error during login: {e}")
                raise AuthenticationError("Login failed")
        
        # Get user profile from DynamoDB
        user_profile = dynamodb_client.get_item(
            table_name=os.getenv('USERS_TABLE'),
            key={'userId': user_sub}
        )
        
        if not user_profile:
            logger.error(f"User profile not found for userId: {user_sub}")
            raise AuthenticationError("User profile not found")
        
        # Update last login time
        dynamodb_client.update_item(
            table_name=os.getenv('USERS_TABLE'),
            key={'userId': user_sub},
            UpdateExpression='SET lastLoginAt = :timestamp',
            ExpressionAttributeValues={
                ':timestamp': datetime.now(timezone.utc).isoformat()
            }
        )
        
        response_data = {
            'user': {
                'userId': user_profile['userId'],
                'email': user_profile['email'],
                'firstName': user_profile['firstName'],
                'lastName': user_profile['lastName'],
                'preferredUsername': user_profile.get('preferredUsername'),
                'preferences': user_profile.get('preferences', {}),
                'statistics': user_profile.get('statistics', {})
            },
            'tokens': {
                'accessToken': access_token,
                'idToken': id_token,
                'refreshToken': refresh_token
            },
            'expiresIn': 3600  # 1 hour
        }
        
        logger.info(f"User logged in successfully: {email}")
        return create_success_response(response_data)
        
    except json.JSONDecodeError:
        raise ValidationError("Invalid JSON in request body", "body")
    except ValidationError as e:
        logger.warning(f"Validation error in login: {e.message}")
        raise e
    except AuthenticationError as e:
        logger.warning(f"Authentication error in login: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in login: {str(e)}")
        raise e


@handle_lambda_errors
@track_lambda_performance("auth_refresh")
def refresh(event, context):
    """
    Refresh JWT token using refresh token
    
    POST /auth/refresh
    Body: {
        "refreshToken": "eyJ..."
    }
    """
    logger.info(f"Token refresh - Request ID: {context.aws_request_id}")
    
    try:
        request_body = json.loads(event['body'])
        refresh_token = request_body.get('refreshToken')
        
        if not refresh_token:
            raise ValidationError("Refresh token is required", "refreshToken")
        
        # Refresh token with Cognito
        try:
            auth_response = cognito_client.admin_initiate_auth(
                UserPoolId=USER_POOL_ID,
                ClientId=USER_POOL_CLIENT_ID,
                AuthFlow='REFRESH_TOKEN_AUTH',
                AuthParameters={
                    'REFRESH_TOKEN': refresh_token
                }
            )
            
            # Extract new tokens
            id_token = auth_response['AuthenticationResult']['IdToken']
            access_token = auth_response['AuthenticationResult']['AccessToken']
            # Note: Refresh token might not be returned for refresh operations
            new_refresh_token = auth_response['AuthenticationResult'].get('RefreshToken')
            
            # Decode user info
            user_info = validate_jwt_token(id_token)
            user_sub = user_info['sub']
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NotAuthorizedException':
                raise AuthenticationError("Invalid or expired refresh token")
            else:
                logger.error(f"Cognito error during token refresh: {e}")
                raise AuthenticationError("Token refresh failed")
        
        # Get current user profile
        user_profile = dynamodb_client.get_item(
            table_name=os.getenv('USERS_TABLE'),
            key={'userId': user_sub}
        )
        
        response_data = {
            'tokens': {
                'accessToken': access_token,
                'idToken': id_token
            },
            'expiresIn': 3600  # 1 hour
        }
        
        # Include new refresh token if provided
        if new_refresh_token:
            response_data['tokens']['refreshToken'] = new_refresh_token
        
        # Include user info if profile exists
        if user_profile:
            response_data['user'] = {
                'userId': user_profile['userId'],
                'email': user_profile['email'],
                'firstName': user_profile['firstName'],
                'lastName': user_profile['lastName']
            }
        
        logger.info(f"Token refreshed successfully for user: {user_sub}")
        return create_success_response(response_data)
        
    except json.JSONDecodeError:
        raise ValidationError("Invalid JSON in request body", "body")
    except ValidationError as e:
        logger.warning(f"Validation error in refresh: {e.message}")
        raise e
    except AuthenticationError as e:
        logger.warning(f"Authentication error in refresh: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in refresh: {str(e)}")
        raise e


def _check_user_exists(email: str) -> bool:
    """Check if user already exists in Cognito"""
    try:
        cognito_client.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=email
        )
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'UserNotFoundException':
            return False
        raise e