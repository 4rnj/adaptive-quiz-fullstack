"""
Quiz Lambda Handlers
Handles next question delivery and answer submission with adaptive learning integration
"""

import json
import logging
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

from src.utils.error_handler import (
    handle_lambda_errors, create_success_response, create_error_response,
    validate_session_id, validate_user_id, ValidationError, SessionError, QuizError
)
from src.utils.performance_monitor import track_lambda_performance
from src.services.adaptive_learning_service import (
    adaptive_learning_service, NextAction, QuestionResponse, AnswerResult
)
from src.services.session_state_service import session_state_service, SessionStatus
from src.utils.auth_helper import extract_user_from_token, require_authentication
from src.utils.dynamodb_client import dynamodb_client

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


@handle_lambda_errors
@track_lambda_performance("next_question")
@require_authentication
def next_question_handler(event, context):
    """
    Get next question for quiz session based on adaptive learning algorithm
    
    GET /sessions/{sessionId}/question
    """
    logger.info(f"Getting next question - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Verify session exists and user has access
        session_state = session_state_service.get_session(session_id, user_id)
        if not session_state:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        # Check session status
        if session_state.status not in [SessionStatus.ACTIVE, SessionStatus.CREATED]:
            return create_error_response(400, "SESSION_NOT_ACTIVE", 
                                       f"Session is {session_state.status.value}, cannot get questions")
        
        # Get next question using adaptive learning service
        question_response = adaptive_learning_service.get_next_question(session_id, user_id)
        
        if not question_response:
            # Session is complete
            # Update session status to completed
            session_state_service.update_session(session_id, user_id, {'status': SessionStatus.COMPLETED})
            
            return create_success_response({
                'sessionComplete': True,
                'message': 'Quiz session completed successfully',
                'progress': {
                    'totalQuestions': session_state.config.total_questions,
                    'correctAnswers': session_state.progress.correct_answers,
                    'accuracy': round((session_state.progress.correct_answers / 
                                    max(session_state.progress.current_question, 1)) * 100, 1),
                    'timeSpent': session_state.progress.time_spent
                }
            })
        
        # Calculate wrong pool statistics for progress display
        wrong_pool_stats = _get_wrong_pool_statistics(user_id)
        
        # Prepare response with question and progress
        response_data = {
            'question': {
                'questionId': question_response.question_id,
                'text': question_response.text,
                'answers': question_response.answers,
                'type': question_response.question_type,
                'language': question_response.language,
                'isFromWrongPool': question_response.is_from_wrong_pool,
                'remainingTries': question_response.remaining_tries,
                'shuffled': question_response.shuffled
            },
            'progress': {
                'currentQuestion': session_state.progress.current_question + 1,
                'totalQuestions': session_state.config.total_questions,
                'answeredQuestions': len(session_state.progress.answered_questions),
                'correctAnswers': session_state.progress.correct_answers,
                'wrongAnswers': session_state.progress.wrong_answers,
                'wrongAnswersPool': wrong_pool_stats['total_count'],
                'additionalQuestions': wrong_pool_stats['additional_questions'],
                'completionPercentage': session_state.progress.completion_percentage,
                'timeSpent': session_state.progress.time_spent,
                'estimatedTimeRemaining': _calculate_estimated_time_remaining(session_state, wrong_pool_stats)
            },
            'session': {
                'sessionId': session_state.session_id,
                'name': session_state.config.name,
                'status': session_state.status.value,
                'settings': session_state.config.settings
            }
        }
        
        # Add penalty text if applicable
        if question_response.is_from_wrong_pool and question_response.remaining_tries:
            response_data['progress']['penaltyText'] = f"(+1 Question @ {question_response.remaining_tries} Tries)"
        
        logger.info(f"Next question delivered for session {session_id}: {question_response.question_id}")
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in next_question: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Session error in next_question: {e.message}")
        raise e
    except QuizError as e:
        logger.error(f"Quiz error in next_question: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in next_question: {str(e)}")
        raise e


@handle_lambda_errors
@track_lambda_performance("submit_answer")
@require_authentication
def submit_answer_handler(event, context):
    """
    Submit answer for current question with immediate re-asking logic
    
    POST /sessions/{sessionId}/answer
    Body: {
        "questionId": "q123",
        "selectedAnswers": ["answer1", "answer2"],
        "timeSpent": 45
    }
    """
    logger.info(f"Submitting answer - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        request_body = json.loads(event['body'])
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Extract and validate request data
        question_id = request_body.get('questionId', '').strip()
        selected_answers = request_body.get('selectedAnswers', [])
        time_spent = int(request_body.get('timeSpent', 0))
        
        if not question_id:
            raise ValidationError("Question ID is required", "questionId")
        
        if not isinstance(selected_answers, list) or not selected_answers:
            raise ValidationError("Selected answers are required", "selectedAnswers")
        
        if time_spent < 0:
            raise ValidationError("Time spent cannot be negative", "timeSpent")
        
        # Verify session exists and is active
        session_state = session_state_service.get_session(session_id, user_id)
        if not session_state:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        if session_state.status not in [SessionStatus.ACTIVE, SessionStatus.CREATED]:
            return create_error_response(400, "SESSION_NOT_ACTIVE", 
                                       f"Session is {session_state.status.value}, cannot submit answers")
        
        # Process answer using adaptive learning service
        answer_result = adaptive_learning_service.process_answer(
            session_id, user_id, question_id, selected_answers, time_spent
        )
        
        # Update session time spent
        session_state_service.update_session_time(session_id, user_id, time_spent)
        
        # Prepare response based on answer result
        response_data = {
            'correct': answer_result.correct,
            'nextAction': answer_result.next_action.value,
            'progress': {
                'currentQuestion': answer_result.progress.current_question,
                'totalQuestions': answer_result.progress.total_questions,
                'additionalQuestions': answer_result.progress.additional_questions,
                'correctAnswers': answer_result.progress.correct_answers,
                'wrongPoolSize': answer_result.progress.wrong_pool_size,
                'completionPercentage': answer_result.progress.completion_percentage,
                'penaltyText': answer_result.progress.penalty_text
            }
        }
        
        # Add explanation if available
        if answer_result.explanation:
            response_data['explanation'] = answer_result.explanation
        
        # Add message if available
        if answer_result.message:
            response_data['message'] = answer_result.message
        
        # For immediate retry, include the retry question
        if answer_result.next_action == NextAction.RETRY_SAME_QUESTION and answer_result.question:
            response_data['retryQuestion'] = {
                'questionId': answer_result.question.question_id,
                'text': answer_result.question.text,
                'answers': answer_result.question.answers,
                'type': answer_result.question.question_type,
                'language': answer_result.question.language,
                'shuffled': answer_result.question.shuffled
            }
        
        # Log answer submission result
        result_text = "correct" if answer_result.correct else "incorrect"
        action_text = answer_result.next_action.value.lower().replace('_', ' ')
        logger.info(f"Answer {result_text} for question {question_id} in session {session_id}, next action: {action_text}")
        
        return create_success_response(response_data)
        
    except json.JSONDecodeError:
        raise ValidationError("Invalid JSON in request body", "body")
    except ValueError as e:
        if "invalid literal for int()" in str(e):
            raise ValidationError("Time spent must be a valid number", "timeSpent")
        raise ValidationError(f"Invalid value: {str(e)}", "request")
    except ValidationError as e:
        logger.warning(f"Validation error in submit_answer: {e.message}")
        raise e
    except SessionError as e:
        logger.error(f"Session error in submit_answer: {e.message}")
        raise e
    except QuizError as e:
        logger.error(f"Quiz error in submit_answer: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in submit_answer: {str(e)}")
        raise e


def _get_wrong_pool_statistics(user_id: str) -> Dict[str, int]:
    """Get statistics about user's wrong answer pool"""
    try:
        # Query wrong answers table
        wrong_answers_response = dynamodb_client.query(
            table_name=os.getenv('WRONG_ANSWERS_TABLE'),
            key_condition=dynamodb_client.dynamodb.conditions.Key('userId').eq(user_id),
            FilterExpression=dynamodb_client.dynamodb.conditions.Attr('remainingTries').gt(0)
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


def _calculate_estimated_time_remaining(session_state, wrong_pool_stats: Dict[str, int]) -> int:
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
        additional_time = int(avg_time_per_question * 0.8 * wrong_pool_stats['additional_questions'])
        estimated_remaining += additional_time
    
    return max(estimated_remaining, 0)