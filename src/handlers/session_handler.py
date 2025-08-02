"""
Session Handler - Lambda functions for session management
Handles session CRUD operations with comprehensive error handling
"""

import json
import logging
from typing import Dict, Any, Optional

from src.utils.error_handler import (
    handle_lambda_errors, create_success_response, create_error_response,
    validate_session_id, validate_user_id, ValidationError, SessionError
)
from src.utils.performance_monitor import track_lambda_performance
from src.services.session_state_service import (
    session_state_service, SessionConfig, SessionSource, SessionStatus
)
from src.utils.auth_helper import extract_user_from_token, require_authentication

logger = logging.getLogger(__name__)

@handle_lambda_errors
@track_lambda_performance("create_session")
@require_authentication
def create_session(event, context):
    """
    Create new quiz session with multi-source configuration
    
    Path: POST /sessions
    """
    logger.info(f"Creating session - Request ID: {context.aws_request_id}")
    
    try:
        user_id = extract_user_from_token(event)
        request_body = json.loads(event['body'])
        
        # Validate user
        validate_user_id(user_id)
        
        # Parse and validate session configuration
        session_config = _parse_session_config(request_body)
        
        # Create session
        session_state = session_state_service.create_session(user_id, session_config)
        
        # Prepare response
        response_data = {
            'sessionId': session_state.session_id,
            'name': session_state.config.name,
            'totalQuestions': session_state.config.total_questions,
            'estimatedDuration': session_state.config.estimated_duration,
            'status': session_state.status.value,
            'createdAt': session_state.created_at,
            'expiresAt': session_state.expires_at,
            'sources': [
                {
                    'category': source.category,
                    'provider': source.provider,
                    'certificate': source.certificate,
                    'language': source.language,
                    'questionCount': source.question_count
                }
                for source in session_state.config.sources
            ]
        }
        
        logger.info(f"Session {session_state.session_id} created successfully for user {user_id}")
        
        return create_success_response(response_data, 201)
        
    except ValidationError as e:
        logger.warning(f"Validation error in create_session: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Session error in create_session: {e.message}")
        raise e
    except json.JSONDecodeError as e:
        logger.warning(f"Invalid JSON in request body: {e}")
        raise ValidationError("Invalid JSON in request body", "body")
    except Exception as e:
        logger.error(f"Unexpected error in create_session: {str(e)}")
        raise e

@handle_lambda_errors
@track_lambda_performance("get_session")
@require_authentication
def get_session(event, context):
    """
    Get session details and current state
    
    Path: GET /sessions/{sessionId}
    """
    logger.info(f"Getting session - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Get session
        session_state = session_state_service.get_session(session_id, user_id)
        
        if not session_state:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        # Calculate additional progress metrics
        wrong_pool_size = 0  # This would be calculated from wrong answers table
        additional_questions = 0  # Sum of remaining tries in wrong pool
        
        # Prepare response
        response_data = {
            'sessionId': session_state.session_id,
            'userId': session_state.user_id,
            'name': session_state.config.name,
            'totalQuestions': session_state.config.total_questions,
            'currentQuestion': session_state.progress.current_question,
            'answeredQuestions': len(session_state.progress.answered_questions),
            'correctAnswers': session_state.progress.correct_answers,
            'wrongAnswers': session_state.progress.wrong_answers,
            'wrongAnswersPool': wrong_pool_size,
            'additionalQuestions': additional_questions,
            'status': session_state.status.value,
            'progress': {
                'percentage': session_state.progress.completion_percentage,
                'timeSpent': session_state.progress.time_spent,
                'estimatedTimeRemaining': _calculate_estimated_time_remaining(session_state)
            },
            'createdAt': session_state.created_at,
            'updatedAt': session_state.updated_at,
            'expiresAt': session_state.expires_at,
            'sources': [
                {
                    'category': source.category,
                    'provider': source.provider,
                    'certificate': source.certificate,
                    'language': source.language,
                    'questionCount': source.question_count
                }
                for source in session_state.config.sources
            ]
        }
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in get_session: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Session error in get_session: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_session: {str(e)}")
        raise e

@handle_lambda_errors
@track_lambda_performance("start_session")
@require_authentication
def start_session(event, context):
    """
    Start or resume a quiz session
    
    Path: POST /sessions/{sessionId}/start
    """
    logger.info(f"Starting session - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Start session
        session_state = session_state_service.start_session(session_id, user_id)
        
        # Prepare response
        response_data = {
            'sessionId': session_state.session_id,
            'status': session_state.status.value,
            'nextQuestion': {
                'questionNumber': session_state.progress.current_question + 1,
                'totalQuestions': session_state.config.total_questions,
                'additionalQuestions': 0  # This would be calculated from wrong pool
            },
            'startedAt': session_state.updated_at
        }
        
        logger.info(f"Session {session_id} started successfully")
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in start_session: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Session error in start_session: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in start_session: {str(e)}")
        raise e

@handle_lambda_errors
@track_lambda_performance("pause_session")
@require_authentication
def pause_session(event, context):
    """
    Pause an active session
    
    Path: POST /sessions/{sessionId}/pause
    """
    logger.info(f"Pausing session - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Pause session
        session_state = session_state_service.pause_session(session_id, user_id)
        
        # Prepare response
        response_data = {
            'sessionId': session_state.session_id,
            'status': session_state.status.value,
            'pausedAt': session_state.updated_at,
            'progress': {
                'currentQuestion': session_state.progress.current_question,
                'totalQuestions': session_state.config.total_questions,
                'percentage': session_state.progress.completion_percentage
            }
        }
        
        logger.info(f"Session {session_id} paused successfully")
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in pause_session: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Session error in pause_session: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in pause_session: {str(e)}")
        raise e

@handle_lambda_errors
@track_lambda_performance("get_user_sessions")
@require_authentication
def get_user_sessions(event, context):
    """
    Get all sessions for a user
    
    Path: GET /users/{userId}/sessions
    """
    logger.info(f"Getting user sessions - Request ID: {context.aws_request_id}")
    
    try:
        path_user_id = event['pathParameters']['userId']
        token_user_id = extract_user_from_token(event)
        
        validate_user_id(path_user_id)
        validate_user_id(token_user_id)
        
        # Ensure user can only access their own sessions
        if path_user_id != token_user_id:
            return create_error_response(403, "FORBIDDEN", "Access denied")
        
        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        status_filter = query_params.get('status')
        limit = int(query_params.get('limit', 20))
        offset = int(query_params.get('offset', 0))
        
        # Validate parameters
        if limit > 100:
            limit = 100
        
        if status_filter and status_filter not in [s.value for s in SessionStatus]:
            raise ValidationError(f"Invalid status filter: {status_filter}", "status")
        
        # This would query the sessions table with GSI on userId
        # For now, return a placeholder response
        
        sessions = []  # This would be populated from database query
        total = 0      # Total count for pagination
        
        response_data = {
            'sessions': sessions,
            'pagination': {
                'total': total,
                'limit': limit,
                'offset': offset,
                'hasMore': offset + limit < total
            }
        }
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in get_user_sessions: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_user_sessions: {str(e)}")
        raise e

def _parse_session_config(request_data: Dict[str, Any]) -> SessionConfig:
    """Parse and validate session configuration from request"""
    
    # Validate required fields
    name = request_data.get('name')
    if not name or not isinstance(name, str):
        raise ValidationError("Session name is required", "name")
    
    sources_data = request_data.get('sources')
    if not sources_data or not isinstance(sources_data, list):
        raise ValidationError("Sources are required", "sources")
    
    settings = request_data.get('settings', {})
    if not isinstance(settings, dict):
        raise ValidationError("Settings must be an object", "settings")
    
    # Parse sources
    sources = []
    total_questions = 0
    
    for i, source_data in enumerate(sources_data):
        try:
            source = SessionSource(
                category=source_data['category'],
                provider=source_data['provider'],
                certificate=source_data['certificate'],
                language=source_data['language'],
                question_count=source_data['questionCount'],
                difficulty_filter=source_data.get('difficultyFilter')
            )
            sources.append(source)
            total_questions += source.question_count
            
        except KeyError as e:
            raise ValidationError(f"Missing field in source {i}: {e}", f"sources[{i}]")
        except Exception as e:
            raise ValidationError(f"Invalid source {i}: {str(e)}", f"sources[{i}]")
    
    # Estimate duration (2 minutes per question as baseline)
    estimated_duration = total_questions * 120  # 2 minutes per question in seconds
    
    return SessionConfig(
        name=name,
        sources=sources,
        settings=settings,
        total_questions=total_questions,
        estimated_duration=estimated_duration
    )

def _calculate_estimated_time_remaining(session_state) -> int:
    """Calculate estimated time remaining in seconds"""
    
    if session_state.progress.current_question == 0:
        return session_state.config.estimated_duration
    
    # Calculate average time per question
    avg_time_per_question = session_state.progress.time_spent / max(session_state.progress.current_question, 1)
    
    # Estimate remaining time
    remaining_questions = session_state.config.total_questions - session_state.progress.current_question
    estimated_remaining = int(avg_time_per_question * remaining_questions)
    
    return max(estimated_remaining, 0)