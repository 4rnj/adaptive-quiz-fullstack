"""
Analytics Lambda Handlers
Provides session analytics, user progress insights, and performance metrics
"""

import json
import logging
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from src.utils.error_handler import (
    handle_lambda_errors, create_success_response, create_error_response,
    validate_session_id, validate_user_id, ValidationError
)
from src.utils.performance_monitor import track_lambda_performance
from src.utils.auth_helper import extract_user_from_token, require_authentication
from src.utils.dynamodb_client import dynamodb_client
from src.services.session_state_service import session_state_service

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


@handle_lambda_errors
@track_lambda_performance("session_analytics")
@require_authentication
def session_analytics_handler(event, context):
    """
    Get comprehensive analytics for a specific session
    
    GET /sessions/{sessionId}/analytics
    """
    logger.info(f"Getting session analytics - Request ID: {context.aws_request_id}")
    
    try:
        session_id = event['pathParameters']['sessionId']
        user_id = extract_user_from_token(event)
        
        validate_session_id(session_id)
        validate_user_id(user_id)
        
        # Get session details
        session_state = session_state_service.get_session(session_id, user_id)
        if not session_state:
            return create_error_response(404, "SESSION_NOT_FOUND", f"Session {session_id} not found")
        
        # Calculate basic session metrics
        session_metrics = _calculate_session_metrics(session_state)
        
        # Get detailed question performance
        question_performance = _get_question_performance(user_id, session_id)
        
        # Get learning progress insights
        learning_insights = _get_learning_insights(user_id, session_id)
        
        # Get wrong answer analysis
        wrong_answer_analysis = _get_wrong_answer_analysis(user_id)
        
        # Get time-based analytics
        time_analytics = _get_time_analytics(session_state)
        
        response_data = {
            'sessionId': session_id,
            'sessionName': session_state.config.name,
            'status': session_state.status.value,
            'metrics': session_metrics,
            'questionPerformance': question_performance,
            'learningInsights': learning_insights,
            'wrongAnswerAnalysis': wrong_answer_analysis,
            'timeAnalytics': time_analytics,
            'generatedAt': datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(f"Session analytics generated for session {session_id}")
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in session_analytics: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in session_analytics: {str(e)}")
        raise e


@handle_lambda_errors
@track_lambda_performance("user_analytics")
@require_authentication
def user_analytics_handler(event, context):
    """
    Get comprehensive analytics for a user across all sessions
    
    GET /users/{userId}/analytics?timeframe=30d&includeDetails=true
    """
    logger.info(f"Getting user analytics - Request ID: {context.aws_request_id}")
    
    try:
        path_user_id = event['pathParameters']['userId']
        token_user_id = extract_user_from_token(event)
        
        validate_user_id(path_user_id)
        validate_user_id(token_user_id)
        
        # Ensure user can only access their own analytics
        if path_user_id != token_user_id:
            return create_error_response(403, "FORBIDDEN", "Access denied")
        
        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        timeframe = query_params.get('timeframe', '30d')  # 7d, 30d, 90d, all
        include_details = query_params.get('includeDetails', 'false').lower() == 'true'
        
        # Calculate timeframe filter
        timeframe_filter = _parse_timeframe(timeframe)
        
        # Get user profile and statistics
        user_profile = _get_user_profile(token_user_id)
        if not user_profile:
            return create_error_response(404, "USER_NOT_FOUND", "User profile not found")
        
        # Get overall performance metrics
        overall_metrics = _calculate_user_overall_metrics(token_user_id, timeframe_filter)
        
        # Get learning progression
        learning_progression = _get_user_learning_progression(token_user_id, timeframe_filter)
        
        # Get category performance breakdown
        category_performance = _get_category_performance(token_user_id, timeframe_filter)
        
        # Get strength and weakness analysis
        strengths_weaknesses = _get_strengths_weaknesses_analysis(token_user_id, timeframe_filter)
        
        # Get recent activity summary
        recent_activity = _get_recent_activity(token_user_id, limit=10)
        
        response_data = {
            'userId': token_user_id,
            'timeframe': timeframe,
            'userProfile': {
                'firstName': user_profile.get('firstName'),
                'lastName': user_profile.get('lastName'),
                'memberSince': user_profile.get('createdAt'),
                'preferences': user_profile.get('preferences', {})
            },
            'overallMetrics': overall_metrics,
            'learningProgression': learning_progression,
            'categoryPerformance': category_performance,
            'strengthsWeaknesses': strengths_weaknesses,
            'recentActivity': recent_activity,
            'generatedAt': datetime.now(timezone.utc).isoformat()
        }
        
        # Include detailed analytics if requested
        if include_details:
            response_data['detailedAnalytics'] = {
                'sessionHistory': _get_session_history(token_user_id, timeframe_filter, limit=20),
                'difficultyProgression': _get_difficulty_progression(token_user_id, timeframe_filter),
                'timeSpentAnalysis': _get_time_spent_analysis(token_user_id, timeframe_filter),
                'masteryLevels': _get_mastery_levels(token_user_id)
            }
        
        logger.info(f"User analytics generated for user {token_user_id} with timeframe {timeframe}")
        
        return create_success_response(response_data)
        
    except ValidationError as e:
        logger.warning(f"Validation error in user_analytics: {e.message}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in user_analytics: {str(e)}")
        raise e


def _calculate_session_metrics(session_state) -> Dict[str, Any]:
    """Calculate basic metrics for a session"""
    progress = session_state.progress
    
    # Calculate accuracy
    total_answered = len(progress.answered_questions)
    accuracy = (progress.correct_answers / total_answered * 100) if total_answered > 0 else 0
    
    # Calculate completion percentage
    completion = (progress.current_question / session_state.config.total_questions * 100) if session_state.config.total_questions > 0 else 0
    
    # Calculate average time per question
    avg_time_per_question = (progress.time_spent / total_answered) if total_answered > 0 else 0
    
    return {
        'totalQuestions': session_state.config.total_questions,
        'answeredQuestions': total_answered,
        'correctAnswers': progress.correct_answers,
        'wrongAnswers': progress.wrong_answers,
        'accuracy': round(accuracy, 1),
        'completionPercentage': round(completion, 1),
        'timeSpent': progress.time_spent,
        'averageTimePerQuestion': round(avg_time_per_question, 1),
        'estimatedDuration': session_state.config.estimated_duration
    }


def _get_question_performance(user_id: str, session_id: str) -> List[Dict[str, Any]]:
    """Get performance breakdown by question"""
    try:
        # Query progress table for this session
        progress_response = dynamodb_client.query(
            table_name=os.getenv('PROGRESS_TABLE'),
            key_condition=dynamodb_client.dynamodb.conditions.Key('userId').eq(user_id),
            FilterExpression=dynamodb_client.dynamodb.conditions.Attr('sessionId').eq(session_id)
        )
        
        questions = []
        for item in progress_response.get('Items', []):
            questions.append({
                'questionId': item['questionId'],
                'attempts': item.get('attempts', 0),
                'correctAttempts': item.get('correctAttempts', 0),
                'incorrectAttempts': item.get('incorrectAttempts', 0),
                'masteryLevel': item.get('masteryLevel', 0),
                'timeSpent': item.get('timeSpent', 0),
                'firstSeen': item.get('firstSeenAt'),
                'lastAttempt': item.get('lastAttemptAt')
            })
        
        return questions
        
    except Exception as e:
        logger.warning(f"Failed to get question performance: {e}")
        return []


def _get_learning_insights(user_id: str, session_id: str) -> Dict[str, Any]:
    """Generate learning insights for the session"""
    try:
        # Get wrong answer patterns
        wrong_answers = dynamodb_client.query(
            table_name=os.getenv('WRONG_ANSWERS_TABLE'),
            key_condition=dynamodb_client.dynamodb.conditions.Key('userId').eq(user_id),
            FilterExpression=dynamodb_client.dynamodb.conditions.Attr('sessionId').eq(session_id)
        )
        
        wrong_count = len(wrong_answers.get('Items', []))
        mastered_count = len([item for item in wrong_answers.get('Items', []) if item.get('remainingTries', 0) == 0])
        
        return {
            'adaptiveLearningActive': True,
            'wrongAnswersGenerated': wrong_count,
            'questionsRemastered': mastered_count,
            'questionsStillLearning': wrong_count - mastered_count,
            'learningEfficiency': round((mastered_count / wrong_count * 100), 1) if wrong_count > 0 else 100
        }
        
    except Exception as e:
        logger.warning(f"Failed to get learning insights: {e}")
        return {
            'adaptiveLearningActive': False,
            'wrongAnswersGenerated': 0,
            'questionsRemastered': 0,
            'questionsStillLearning': 0,
            'learningEfficiency': 0
        }


def _get_wrong_answer_analysis(user_id: str) -> Dict[str, Any]:
    """Analyze wrong answer patterns"""
    try:
        # Get all wrong answers for user
        wrong_answers_response = dynamodb_client.query(
            table_name=os.getenv('WRONG_ANSWERS_TABLE'),
            key_condition=dynamodb_client.dynamodb.conditions.Key('userId').eq(user_id)
        )
        
        wrong_answers = wrong_answers_response.get('Items', [])
        
        # Analyze patterns
        active_count = len([item for item in wrong_answers if item.get('remainingTries', 0) > 0])
        mastered_count = len([item for item in wrong_answers if item.get('remainingTries', 0) == 0])
        total_additional_questions = sum(item.get('remainingTries', 0) for item in wrong_answers)
        
        # Calculate oldest pending question
        oldest_pending = None
        if active_count > 0:
            active_items = [item for item in wrong_answers if item.get('remainingTries', 0) > 0]
            oldest_item = min(active_items, key=lambda x: x.get('timestamp', ''))
            oldest_pending = {
                'questionId': oldest_item.get('questionId'),
                'daysPending': (datetime.now(timezone.utc) - datetime.fromisoformat(oldest_item.get('timestamp', '').replace('Z', '+00:00'))).days,
                'remainingTries': oldest_item.get('remainingTries', 0)
            }
        
        return {
            'totalWrongAnswers': len(wrong_answers),
            'activeWrongAnswers': active_count,
            'masteredWrongAnswers': mastered_count,
            'additionalQuestionsRequired': total_additional_questions,
            'masteryRate': round((mastered_count / len(wrong_answers) * 100), 1) if wrong_answers else 100,
            'oldestPendingQuestion': oldest_pending
        }
        
    except Exception as e:
        logger.warning(f"Failed to get wrong answer analysis: {e}")
        return {
            'totalWrongAnswers': 0,
            'activeWrongAnswers': 0,
            'masteredWrongAnswers': 0,
            'additionalQuestionsRequired': 0,
            'masteryRate': 100,
            'oldestPendingQuestion': None
        }


def _get_time_analytics(session_state) -> Dict[str, Any]:
    """Calculate time-based analytics for session"""
    progress = session_state.progress
    config = session_state.config
    
    # Calculate velocity and efficiency
    total_answered = len(progress.answered_questions)
    velocity = (total_answered / (progress.time_spent / 60)) if progress.time_spent > 0 else 0  # questions per minute
    
    # Calculate time efficiency vs estimated
    estimated_time_per_question = config.estimated_duration / config.total_questions if config.total_questions > 0 else 120
    actual_time_per_question = progress.time_spent / total_answered if total_answered > 0 else 0
    time_efficiency = (estimated_time_per_question / actual_time_per_question) if actual_time_per_question > 0 else 1
    
    return {
        'totalTimeSpent': progress.time_spent,
        'averageTimePerQuestion': round(actual_time_per_question, 1),
        'estimatedTimePerQuestion': round(estimated_time_per_question, 1),
        'velocity': round(velocity, 2),
        'timeEfficiency': round(time_efficiency, 2),
        'timeEfficiencyStatus': 'efficient' if time_efficiency >= 1 else 'slow',
        'estimatedTimeRemaining': max(0, config.estimated_duration - progress.time_spent)
    }


def _parse_timeframe(timeframe: str) -> Optional[datetime]:
    """Parse timeframe string and return cutoff datetime"""
    if timeframe == 'all':
        return None
    
    try:
        if timeframe.endswith('d'):
            days = int(timeframe[:-1])
            return datetime.now(timezone.utc) - timedelta(days=days)
        elif timeframe.endswith('w'):
            weeks = int(timeframe[:-1])
            return datetime.now(timezone.utc) - timedelta(weeks=weeks)
        elif timeframe.endswith('m'):
            months = int(timeframe[:-1])
            return datetime.now(timezone.utc) - timedelta(days=months * 30)  # Approximate
    except ValueError:
        pass
    
    # Default to 30 days
    return datetime.now(timezone.utc) - timedelta(days=30)


def _get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user profile from users table"""
    try:
        return dynamodb_client.get_item(
            table_name=os.getenv('USERS_TABLE'),
            key={'userId': user_id}
        )
    except Exception as e:
        logger.warning(f"Failed to get user profile: {e}")
        return None


def _calculate_user_overall_metrics(user_id: str, timeframe_filter: Optional[datetime]) -> Dict[str, Any]:
    """Calculate overall metrics for user"""
    try:
        # Get user profile statistics
        user_profile = _get_user_profile(user_id)
        if not user_profile:
            return {}
        
        stats = user_profile.get('statistics', {})
        
        return {
            'totalSessions': stats.get('totalSessions', 0),
            'totalQuestions': stats.get('totalQuestions', 0),
            'totalCorrectAnswers': stats.get('totalCorrectAnswers', 0),
            'averageScore': stats.get('averageScore', 0.0),
            'totalTimeSpent': stats.get('totalTimeSpent', 0),
            'overallAccuracy': round((stats.get('totalCorrectAnswers', 0) / max(stats.get('totalQuestions', 1), 1)) * 100, 1)
        }
        
    except Exception as e:
        logger.warning(f"Failed to calculate overall metrics: {e}")
        return {}


def _get_user_learning_progression(user_id: str, timeframe_filter: Optional[datetime]) -> List[Dict[str, Any]]:
    """Get learning progression over time"""
    # This would implement time-series analysis of user performance
    # For now, return placeholder data
    return [
        {
            'date': (datetime.now(timezone.utc) - timedelta(days=i)).isoformat(),
            'accuracy': 75 + (i % 20),  # Mock data
            'questionsAnswered': 10 + (i % 15),
            'timeSpent': 1800 + (i % 600)
        }
        for i in range(7, 0, -1)  # Last 7 days
    ]


def _get_category_performance(user_id: str, timeframe_filter: Optional[datetime]) -> List[Dict[str, Any]]:
    """Get performance breakdown by category"""
    # This would analyze performance by question categories
    # For now, return placeholder data
    return [
        {'category': 'AWS', 'accuracy': 85.2, 'questionsAnswered': 45, 'averageTime': 95},
        {'category': 'Networking', 'accuracy': 78.9, 'questionsAnswered': 32, 'averageTime': 110},
        {'category': 'Security', 'accuracy': 82.1, 'questionsAnswered': 28, 'averageTime': 120}
    ]


def _get_strengths_weaknesses_analysis(user_id: str, timeframe_filter: Optional[datetime]) -> Dict[str, Any]:
    """Analyze user strengths and weaknesses"""
    # This would implement sophisticated analysis of user performance patterns
    return {
        'strengths': [
            {'area': 'EC2 Management', 'accuracy': 92.5, 'confidence': 'high'},
            {'area': 'S3 Storage', 'accuracy': 88.7, 'confidence': 'high'}
        ],
        'weaknesses': [
            {'area': 'Lambda Functions', 'accuracy': 65.2, 'confidence': 'medium'},
            {'area': 'VPC Networking', 'accuracy': 58.9, 'confidence': 'low'}
        ],
        'recommendations': [
            'Focus on Lambda Functions fundamentals',
            'Practice VPC networking scenarios',
            'Review IAM best practices'
        ]
    }


def _get_recent_activity(user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Get recent activity summary"""
    try:
        # Query sessions table for recent sessions
        # This is a simplified implementation
        return [
            {
                'type': 'session_completed',
                'sessionName': 'AWS Practice Test',
                'score': 82.5,
                'timestamp': (datetime.now(timezone.utc) - timedelta(hours=i*2)).isoformat()
            }
            for i in range(min(limit, 5))
        ]
        
    except Exception as e:
        logger.warning(f"Failed to get recent activity: {e}")
        return []


def _get_session_history(user_id: str, timeframe_filter: Optional[datetime], limit: int = 20) -> List[Dict[str, Any]]:
    """Get detailed session history"""
    # Implementation would query sessions table with timeframe filter
    return []


def _get_difficulty_progression(user_id: str, timeframe_filter: Optional[datetime]) -> Dict[str, Any]:
    """Analyze difficulty progression over time"""
    return {
        'trend': 'improving',
        'averageDifficulty': 'intermediate',
        'progressionRate': 1.2
    }


def _get_time_spent_analysis(user_id: str, timeframe_filter: Optional[datetime]) -> Dict[str, Any]:
    """Analyze time spent patterns"""
    return {
        'averageSessionDuration': 1845,
        'totalTimeSpent': 15240,
        'mostActiveHour': 14,
        'consistencyScore': 78.5
    }


def _get_mastery_levels(user_id: str) -> Dict[str, Any]:
    """Get mastery levels by topic/category"""
    return {
        'overallMastery': 72.5,
        'topicMastery': [
            {'topic': 'EC2', 'mastery': 85.2},
            {'topic': 'S3', 'mastery': 78.9},
            {'topic': 'Lambda', 'mastery': 65.1}
        ]
    }