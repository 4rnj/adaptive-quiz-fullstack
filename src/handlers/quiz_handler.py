"""
Quiz Handler - Core Lambda functions for quiz interactions
Handles question serving and answer processing with adaptive learning
"""

import json
import logging
from typing import Dict, Any, Optional

from src.utils.error_handler import (
    handle_lambda_errors, create_success_response, create_error_response,
    validate_session_id, validate_user_id, validate_question_id, validate_selected_answers,
    ValidationError, AdaptiveLearningError, SessionError
)
from src.utils.performance_monitor import track_lambda_performance
from src.services.adaptive_learning_service import adaptive_learning_service, NextAction
from src.services.session_state_service import session_state_service, SessionStatus
from src.utils.auth_helper import extract_user_from_token, require_authentication

logger = logging.getLogger(__name__)

@handle_lambda_errors
@track_lambda_performance("get_current_question")
@require_authentication
def get_current_question(event, context):
    """
    Get current question for session with adaptive learning logic
    
    Path: GET /sessions/{sessionId}/question
    """
    logger.info(f"Getting current question - Request ID: {context.aws_request_id}")
    
    try:
        # Extract parameters
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        # Validate inputs
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Get session and validate ownership
        session = session_state_service.get_session(session_id, user_id)
        if not session:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        # Check session status
        if session.status not in [SessionStatus.ACTIVE, SessionStatus.PAUSED]:
            return create_error_response(400, "INVALID_SESSION_STATUS", 
                                       f"Session is in {session.status.value} status")
        
        # Check if session is complete
        if session.progress.current_question >= len(session.question_pool):
            # Session completed
            session_state_service.complete_session(session_id, user_id)
            return create_success_response({
                'sessionComplete': True,
                'progress': {
                    'questionsAnswered': len(session.progress.answered_questions),
                    'totalQuestions': len(session.question_pool),
                    'correctAnswers': session.progress.correct_answers,
                    'completionPercentage': 100.0
                }
            })
        
        # Get next question using adaptive learning
        question_response = adaptive_learning_service.get_next_question(session_id, user_id)
        
        if not question_response:
            # No more questions available
            session_state_service.complete_session(session_id, user_id)
            return create_success_response({
                'sessionComplete': True,
                'progress': {
                    'questionsAnswered': len(session.progress.answered_questions),
                    'totalQuestions': len(session.question_pool),
                    'correctAnswers': session.progress.correct_answers,
                    'completionPercentage': 100.0
                }
            })
        
        # Calculate progress indicator
        progress_indicator = _calculate_progress_indicator(session, question_response)
        
        # Prepare response
        response_data = {
            'questionNumber': session.progress.current_question + 1,
            'totalQuestions': len(session.question_pool),
            'additionalQuestions': progress_indicator['additional_questions'],
            'penaltyIndicator': progress_indicator['penalty_text'],
            'question': {
                'questionId': question_response.question_id,
                'text': question_response.text,
                'type': question_response.question_type,
                'answers': question_response.answers,
                'isFromWrongPool': question_response.is_from_wrong_pool,
                'language': question_response.language,
                'shuffled': question_response.shuffled
            }
        }
        
        if question_response.remaining_tries is not None:
            response_data['question']['remainingTries'] = question_response.remaining_tries
        
        logger.info(f"Served question {question_response.question_id} for session {session_id}")
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in get_current_question: {e.message}")
        raise e
    except (SessionError, AdaptiveLearningError) as e:
        logger.error(f"Service error in get_current_question: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_current_question: {str(e)}")
        raise e

@handle_lambda_errors
@track_lambda_performance("submit_answer")
@require_authentication
def submit_answer(event, context):
    """
    Submit answer and process with adaptive learning logic
    
    Path: POST /sessions/{sessionId}/answer
    """
    logger.info(f"Submitting answer - Request ID: {context.aws_request_id}")
    
    try:
        # Extract parameters
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        # Parse request body
        request_body = json.loads(event['body'])
        question_id = request_body.get('questionId')
        selected_answers = request_body.get('selectedAnswers', [])
        time_spent = request_body.get('timeSpent', 0)
        
        # Validate inputs
        validate_session_id(session_id)
        validate_user_id(user_id)
        validate_question_id(question_id)
        validate_selected_answers(selected_answers)
        
        if not isinstance(time_spent, int) or time_spent < 0:
            raise ValidationError("Time spent must be a non-negative integer", "timeSpent")
        
        # Get session and validate
        session = session_state_service.get_session(session_id, user_id)
        if not session:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        if session.status != SessionStatus.ACTIVE:
            return create_error_response(400, "INVALID_SESSION_STATUS", 
                                       f"Session must be active to submit answers")
        
        # Process answer with adaptive learning
        answer_result = adaptive_learning_service.process_answer(
            session_id, user_id, question_id, selected_answers, time_spent
        )
        
        # Prepare response based on result
        response_data = {
            'correct': answer_result.correct,
            'nextAction': answer_result.next_action.value,
            'progress': {
                'questionsAnswered': answer_result.progress.current_question,
                'totalQuestions': answer_result.progress.total_questions,
                'correctAnswers': answer_result.progress.correct_answers,
                'wrongPoolSize': answer_result.progress.wrong_pool_size,
                'additionalQuestions': answer_result.progress.additional_questions,
                'completionPercentage': answer_result.progress.completion_percentage
            }
        }
        
        # Add penalty indicator if present
        if answer_result.progress.penalty_text:
            response_data['penaltyIndicator'] = answer_result.progress.penalty_text
        
        # Add explanation if available
        if answer_result.explanation:
            response_data['explanation'] = answer_result.explanation
        
        # Add message if present
        if answer_result.message:
            response_data['message'] = answer_result.message
        
        # For wrong answers, include the retry question with shuffled answers
        if answer_result.next_action == NextAction.RETRY_SAME_QUESTION and answer_result.question:
            response_data['question'] = {
                'questionId': answer_result.question.question_id,
                'text': answer_result.question.text,
                'type': answer_result.question.question_type,
                'answers': answer_result.question.answers,
                'shuffled': answer_result.question.shuffled,
                'language': answer_result.question.language
            }
        
        # Check if session is now complete
        if answer_result.next_action == NextAction.SESSION_COMPLETE:
            session_state_service.complete_session(session_id, user_id)
            response_data['sessionComplete'] = True
        
        logger.info(f"Processed answer for question {question_id} in session {session_id}: "
                   f"{'CORRECT' if answer_result.correct else 'INCORRECT'}")
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in submit_answer: {e.message}")
        raise e
    except (SessionError, AdaptiveLearningError) as e:
        logger.error(f"Service error in submit_answer: {e.message}")
        raise e
    except json.JSONDecodeError as e:
        logger.warning(f"Invalid JSON in request body: {e}")
        raise ValidationError("Invalid JSON in request body", "body")
    except KeyError as e:
        logger.warning(f"Missing required field in request: {e}")
        raise ValidationError(f"Missing required field: {e}", str(e))
    except Exception as e:
        logger.error(f"Unexpected error in submit_answer: {str(e)}")
        raise e

def _calculate_progress_indicator(session, question_response) -> Dict[str, Any]:
    """Calculate progress indicator with penalty information"""
    
    # This would query the wrong answers table to get accurate counts
    # For now, using simplified logic
    
    additional_questions = 0
    penalty_text = None
    
    if question_response.is_from_wrong_pool and question_response.remaining_tries:
        additional_questions = 1
        penalty_text = f"(+1 Question @ {question_response.remaining_tries} Tries)"
    
    return {
        'additional_questions': additional_questions,
        'penalty_text': penalty_text
    }

# Additional helper functions for quiz operations

@handle_lambda_errors
@track_lambda_performance("get_question_explanation")
@require_authentication
def get_question_explanation(event, context):
    """
    Get explanation for a specific question
    
    Path: GET /questions/{questionId}/explanation
    """
    logger.info(f"Getting question explanation - Request ID: {context.aws_request_id}")
    
    try:
        question_id = event['pathParameters']['questionId']
        user_id = extract_user_from_token(event)
        
        validate_question_id(question_id)
        validate_user_id(user_id)
        
        # Get question from adaptive learning service
        # This would typically check if user has access to this question
        
        # For now, return a placeholder response
        return create_success_response({
            'questionId': question_id,
            'explanation': 'Detailed explanation would be provided here.',
            'references': [],
            'difficulty': 'medium'
        })
        
    except ValidationError as e:
        logger.warning(f"Validation error in get_question_explanation: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_question_explanation: {str(e)}")
        raise e

@handle_lambda_errors
@track_lambda_performance("skip_question")
@require_authentication
def skip_question(event, context):
    """
    Skip current question (if allowed by session settings)
    
    Path: POST /sessions/{sessionId}/skip
    """
    logger.info(f"Skipping question - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Get session
        session = session_state_service.get_session(session_id, user_id)
        if not session:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        # Check if skipping is allowed
        skip_allowed = session.config.settings.get('allowSkip', False)
        if not skip_allowed:
            return create_error_response(400, "SKIP_NOT_ALLOWED", "Skipping questions is not allowed for this session")
        
        # Check skip limit
        max_skips = session.config.settings.get('maxSkips', 3)
        current_skips = session.progress.__dict__.get('skipped_questions', 0)
        
        if current_skips >= max_skips:
            return create_error_response(400, "SKIP_LIMIT_EXCEEDED", f"Maximum skips ({max_skips}) exceeded")
        
        # Process skip (similar to wrong answer but without penalty)
        # This would update session progress and move to next question
        
        return create_success_response({
            'skipped': True,
            'remainingSkips': max_skips - current_skips - 1,
            'nextAction': 'NEXT_QUESTION'
        })
        
    except ValidationError as e:
        logger.warning(f"Validation error in skip_question: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Service error in skip_question: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in skip_question: {str(e)}")
        raise e