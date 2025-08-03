"""
Session Management Lambda Handlers
Handles CRUD operations for quiz sessions with atomic updates and state management
"""

import json
import logging
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

from src.utils.error_handler import (
    handle_lambda_errors, create_success_response, create_error_response,
    validate_session_id, validate_user_id, ValidationError, SessionError
)
from src.utils.performance_monitor import track_lambda_performance
from src.services.session_state_service import (
    session_state_service, SessionConfig, SessionSource, SessionStatus
)
from src.utils.auth_helper import extract_user_from_token, require_authentication
from src.utils.dynamodb_client import dynamodb_client

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


@handle_lambda_errors
@track_lambda_performance("create_session")
@require_authentication
def create_session_handler(event, context):
    """
    Create new quiz session with multi-source configuration
    
    POST /sessions
    Body: {
        "name": "AWS Solutions Architect Practice",
        "sources": [
            {
                "category": "aws",
                "provider": "official",
                "certificate": "solutions-architect-associate",
                "language": "en",
                "questionCount": 50,
                "difficultyFilter": "intermediate"
            }
        ],
        "settings": {
            "adaptiveLearning": true,
            "immediateRetry": true,
            "wrongAnswerPoolEnabled": true,
            "timeLimit": 3600,
            "randomizeQuestions": true,
            "randomizeAnswers": true
        }
    }
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
            'settings': session_state.config.settings,
            'sources': [
                {
                    'category': source.category,
                    'provider': source.provider,
                    'certificate': source.certificate,
                    'language': source.language,
                    'questionCount': source.question_count,
                    'difficultyFilter': source.difficulty_filter
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
def get_session_handler(event, context):
    """
    Get session details and current state
    
    GET /sessions/{sessionId}
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
        
        # Get wrong pool statistics
        wrong_pool_stats = _get_wrong_pool_statistics(user_id)
        
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
            'wrongAnswersPool': wrong_pool_stats['total_count'],
            'additionalQuestions': wrong_pool_stats['additional_questions'],
            'status': session_state.status.value,
            'progress': {
                'percentage': session_state.progress.completion_percentage,
                'timeSpent': session_state.progress.time_spent,
                'estimatedTimeRemaining': _calculate_estimated_time_remaining(session_state),
                'velocity': _calculate_velocity(session_state)
            },
            'settings': session_state.config.settings,
            'createdAt': session_state.created_at,
            'updatedAt': session_state.updated_at,
            'expiresAt': session_state.expires_at,
            'sources': [
                {
                    'category': source.category,
                    'provider': source.provider,
                    'certificate': source.certificate,
                    'language': source.language,
                    'questionCount': source.question_count,
                    'difficultyFilter': source.difficulty_filter
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
@track_lambda_performance("update_session")
@require_authentication
def update_session_handler(event, context):
    """
    Update session configuration or status
    
    PUT /sessions/{sessionId}
    Body: {
        "name": "Updated Session Name",
        "settings": {
            "adaptiveLearning": false,
            "timeLimit": 7200
        },
        "status": "PAUSED"
    }
    """
    logger.info(f"Updating session - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        request_body = json.loads(event['body'])
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Get current session
        session_state = session_state_service.get_session(session_id, user_id)
        if not session_state:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        # Extract update fields
        updates = {}
        
        # Update name if provided
        if 'name' in request_body:
            new_name = request_body['name'].strip()
            if not new_name:
                raise ValidationError("Session name cannot be empty", "name")
            updates['name'] = new_name
        
        # Update settings if provided
        if 'settings' in request_body:
            if not isinstance(request_body['settings'], dict):
                raise ValidationError("Settings must be an object", "settings")
            updates['settings'] = {**session_state.config.settings, **request_body['settings']}
        
        # Update status if provided
        if 'status' in request_body:
            new_status = request_body['status']
            if new_status not in [s.value for s in SessionStatus]:
                raise ValidationError(f"Invalid status: {new_status}", "status")
            
            # Validate status transitions
            current_status = session_state.status
            valid_transitions = {
                SessionStatus.CREATED: [SessionStatus.ACTIVE, SessionStatus.CANCELLED],
                SessionStatus.ACTIVE: [SessionStatus.PAUSED, SessionStatus.COMPLETED, SessionStatus.CANCELLED],
                SessionStatus.PAUSED: [SessionStatus.ACTIVE, SessionStatus.CANCELLED],
                SessionStatus.COMPLETED: [],  # No transitions from completed
                SessionStatus.CANCELLED: []   # No transitions from cancelled
            }
            
            target_status = SessionStatus(new_status)
            if target_status not in valid_transitions.get(current_status, []):
                raise ValidationError(
                    f"Invalid status transition from {current_status.value} to {new_status}",
                    "status"
                )
            
            updates['status'] = target_status
        
        # Perform update
        updated_session = session_state_service.update_session(session_id, user_id, updates)
        
        # Prepare response
        response_data = {
            'sessionId': updated_session.session_id,
            'name': updated_session.config.name,
            'status': updated_session.status.value,
            'settings': updated_session.config.settings,
            'updatedAt': updated_session.updated_at
        }
        
        logger.info(f"Session {session_id} updated successfully")
        
        return create_success_response(response_data)
        
    except json.JSONDecodeError:
        raise ValidationError("Invalid JSON in request body", "body")
    except ValidationError as e:
        logger.warning(f"Validation error in update_session: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Session error in update_session: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in update_session: {str(e)}")
        raise e


@handle_lambda_errors
@track_lambda_performance("list_user_sessions")
@require_authentication
def list_user_sessions_handler(event, context):
    """
    Get all sessions for a user with pagination and filtering
    
    GET /users/{userId}/sessions?status=ACTIVE&limit=20&offset=0
    """
    logger.info(f"Listing user sessions - Request ID: {context.aws_request_id}")
    
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
        
        # Query sessions using DynamoDB GSI
        sessions_data = session_state_service.list_user_sessions(
            user_id=token_user_id,
            status_filter=status_filter,
            limit=limit,
            offset=offset
        )
        
        # Format sessions for response
        sessions = []
        for session in sessions_data['sessions']:
            session_summary = {
                'sessionId': session['sessionId'],
                'name': session.get('name', 'Unnamed Session'),
                'status': session['status'],
                'totalQuestions': session.get('totalQuestions', 0),
                'currentQuestion': session.get('progress', {}).get('currentQuestion', 0),
                'correctAnswers': session.get('progress', {}).get('correctAnswers', 0),
                'completionPercentage': session.get('progress', {}).get('completionPercentage', 0),
                'createdAt': session['createdAt'],
                'updatedAt': session.get('updatedAt'),
                'sources': session.get('sources', [])
            }
            sessions.append(session_summary)
        
        response_data = {
            'sessions': sessions,
            'pagination': {
                'total': sessions_data['total'],
                'limit': limit,
                'offset': offset,
                'hasMore': offset + limit < sessions_data['total']
            }
        }
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in list_user_sessions: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in list_user_sessions: {str(e)}")
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
    
    # Default settings
    default_settings = {
        'adaptiveLearning': True,
        'immediateRetry': True,
        'wrongAnswerPoolEnabled': True,
        'timeLimit': 3600,  # 1 hour default
        'randomizeQuestions': True,
        'randomizeAnswers': True,
        'showExplanations': True,
        'allowPause': True
    }
    
    # Merge with provided settings
    merged_settings = {**default_settings, **settings}
    
    # Parse sources
    sources = []
    total_questions = 0
    
    for i, source_data in enumerate(sources_data):
        try:
            # Validate required source fields
            required_fields = ['category', 'provider', 'certificate', 'language', 'questionCount']
            for field in required_fields:
                if field not in source_data:
                    raise KeyError(field)
            
            source = SessionSource(
                category=source_data['category'],
                provider=source_data['provider'],
                certificate=source_data['certificate'],
                language=source_data['language'],
                question_count=int(source_data['questionCount']),
                difficulty_filter=source_data.get('difficultyFilter')
            )
            
            # Validate question count
            if source.question_count <= 0:
                raise ValueError("Question count must be positive")
            if source.question_count > 200:
                raise ValueError("Question count cannot exceed 200 per source")
            
            sources.append(source)
            total_questions += source.question_count
            
        except KeyError as e:
            raise ValidationError(f"Missing field in source {i}: {e}", f"sources[{i}]")
        except ValueError as e:
            raise ValidationError(f"Invalid value in source {i}: {str(e)}", f"sources[{i}]")
        except Exception as e:
            raise ValidationError(f"Invalid source {i}: {str(e)}", f"sources[{i}]")
    
    # Validate total question count
    if total_questions > 500:
        raise ValidationError("Total questions cannot exceed 500", "sources")
    
    # Estimate duration based on question count and complexity
    base_time_per_question = 120  # 2 minutes base time
    estimated_duration = total_questions * base_time_per_question
    
    # Adjust for difficulty if specified
    avg_difficulty = len([s for s in sources if s.difficulty_filter in ['hard', 'expert']]) / len(sources)
    if avg_difficulty > 0.5:
        estimated_duration = int(estimated_duration * 1.5)  # 50% more time for hard questions
    
    return SessionConfig(
        name=name.strip(),
        sources=sources,
        settings=merged_settings,
        total_questions=total_questions,
        estimated_duration=estimated_duration
    )


def _get_wrong_pool_statistics(user_id: str) -> Dict[str, int]:
    """Get statistics about user's wrong answer pool"""
    try:
        # Query wrong answers table
        wrong_answers_response = dynamodb_client.query(
            table_name=os.getenv('WRONG_ANSWERS_TABLE'),
            key_condition=dynamodb_client.db.meta.client.conditions.Key('userId').eq(user_id),
            FilterExpression=dynamodb_client.db.meta.client.conditions.Attr('remainingTries').gt(0)
        )
        
        wrong_answers = wrong_answers_response.get('Items', [])
        total_count = len(wrong_answers)
        additional_questions = sum(item.get('remainingTries', 0) for item in wrong_answers)
        
        return {
            'total_count': total_count,
            'additional_questions': additional_questions
        }
        
    except Exception as e:
        logger.warning(f"Failed to get wrong pool statistics for user {user_id}: {e}")
        return {'total_count': 0, 'additional_questions': 0}


def _calculate_estimated_time_remaining(session_state) -> int:
    """Calculate estimated time remaining in seconds"""
    
    if session_state.progress.current_question == 0:
        return session_state.config.estimated_duration
    
    # Calculate average time per question
    avg_time_per_question = session_state.progress.time_spent / max(session_state.progress.current_question, 1)
    
    # Estimate remaining time for main questions
    remaining_questions = session_state.config.total_questions - session_state.progress.current_question
    estimated_remaining = int(avg_time_per_question * remaining_questions)
    
    # Add estimated time for wrong pool questions
    if session_state.config.settings.get('wrongAnswerPoolEnabled', True):
        # Assume wrong pool questions take 80% of average time (since they're retries)
        wrong_pool_stats = _get_wrong_pool_statistics(session_state.user_id)
        additional_time = int(avg_time_per_question * 0.8 * wrong_pool_stats['additional_questions'])
        estimated_remaining += additional_time
    
    return max(estimated_remaining, 0)


def _calculate_velocity(session_state) -> float:
    """Calculate questions per minute velocity"""
    if session_state.progress.time_spent <= 0:
        return 0.0
    
    questions_completed = session_state.progress.current_question
    time_in_minutes = session_state.progress.time_spent / 60.0
    
    return round(questions_completed / time_in_minutes, 2) if time_in_minutes > 0 else 0.0