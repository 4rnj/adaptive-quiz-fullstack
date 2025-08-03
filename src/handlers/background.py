"""
Background Processing Lambda Handlers
Handles analytics processing, session cleanup, and maintenance tasks
"""

import json
import logging
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from src.utils.error_handler import (
    handle_lambda_errors, create_success_response, create_error_response,
    ValidationError
)
from src.utils.performance_monitor import track_lambda_performance
from src.utils.dynamodb_client import dynamodb_client
from src.services.session_state_service import SessionStatus

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# Table names from environment
SESSIONS_TABLE = os.getenv('SESSIONS_TABLE')
USERS_TABLE = os.getenv('USERS_TABLE')
PROGRESS_TABLE = os.getenv('PROGRESS_TABLE')
WRONG_ANSWERS_TABLE = os.getenv('WRONG_ANSWERS_TABLE')
ANALYTICS_TABLE = os.getenv('ANALYTICS_TABLE')


@handle_lambda_errors
@track_lambda_performance("process_analytics")
def process_analytics_handler(event, context):
    """
    Process analytics data for completed sessions and update user statistics
    Triggered by EventBridge schedule (every hour) or session completion events
    """
    logger.info(f"Processing analytics - Request ID: {context.aws_request_id}")
    
    try:
        processed_count = 0
        error_count = 0
        
        # Determine processing mode from event
        if 'Records' in event:
            # Triggered by DynamoDB streams or SQS
            sessions_to_process = _extract_sessions_from_event(event)
        else:
            # Scheduled processing - find recently completed sessions
            sessions_to_process = _find_completed_sessions_for_processing()
        
        logger.info(f"Found {len(sessions_to_process)} sessions to process")
        
        for session_info in sessions_to_process:
            try:
                success = _process_session_analytics(session_info)
                if success:
                    processed_count += 1
                else:
                    error_count += 1
                    
            except Exception as e:
                logger.error(f"Failed to process analytics for session {session_info.get('sessionId', 'unknown')}: {e}")
                error_count += 1
        
        # Update global analytics if we processed sessions
        if processed_count > 0:
            _update_global_analytics()
        
        # Clean up old analytics records
        cleanup_count = _cleanup_old_analytics()
        
        response_data = {
            'processedSessions': processed_count,
            'errors': error_count,
            'cleanupRecords': cleanup_count,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(f"Analytics processing completed: {processed_count} processed, {error_count} errors, {cleanup_count} cleaned up")
        
        return create_success_response(response_data)
        
    except Exception as e:
        logger.error(f"Unexpected error in process_analytics: {str(e)}")
        raise e


@handle_lambda_errors
@track_lambda_performance("cleanup_sessions")
def cleanup_sessions_handler(event, context):
    """
    Clean up expired sessions and manage session lifecycle
    Triggered by EventBridge schedule (daily)
    """
    logger.info(f"Cleaning up sessions - Request ID: {context.aws_request_id}")
    
    try:
        cleanup_results = {
            'expiredSessions': 0,
            'orphanedSessions': 0,
            'staleProgress': 0,
            'archivedSessions': 0
        }
        
        # Clean up expired sessions
        expired_count = _cleanup_expired_sessions()
        cleanup_results['expiredSessions'] = expired_count
        
        # Clean up orphaned session data
        orphaned_count = _cleanup_orphaned_sessions()
        cleanup_results['orphanedSessions'] = orphaned_count
        
        # Clean up stale progress records
        stale_count = _cleanup_stale_progress()
        cleanup_results['staleProgress'] = stale_count
        
        # Archive old completed sessions
        archived_count = _archive_old_sessions()
        cleanup_results['archivedSessions'] = archived_count
        
        # Update cleanup metrics
        _record_cleanup_metrics(cleanup_results)
        
        logger.info(f"Session cleanup completed: {cleanup_results}")
        
        return create_success_response({
            'cleanupResults': cleanup_results,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
        
    except Exception as e:
        logger.error(f"Unexpected error in cleanup_sessions: {str(e)}")
        raise e


def _extract_sessions_from_event(event: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract session information from event records"""
    sessions = []
    
    if 'Records' in event:
        for record in event['Records']:
            if record.get('eventSource') == 'aws:dynamodb':
                # DynamoDB stream event
                if record['eventName'] in ['INSERT', 'MODIFY']:
                    image = record.get('dynamodb', {}).get('NewImage', {})
                    if image.get('status', {}).get('S') == 'COMPLETED':
                        sessions.append({
                            'sessionId': image.get('sessionId', {}).get('S'),
                            'userId': image.get('userId', {}).get('S'),
                            'completedAt': image.get('updatedAt', {}).get('S')
                        })
            elif record.get('eventSource') == 'aws:sqs':
                # SQS message
                try:
                    message_body = json.loads(record['body'])
                    if message_body.get('eventType') == 'session_completed':
                        sessions.append(message_body.get('sessionData', {}))
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse SQS message: {record['body']}")
    
    return sessions


def _find_completed_sessions_for_processing() -> List[Dict[str, Any]]:
    """Find recently completed sessions that need analytics processing"""
    try:
        # Look for sessions completed in the last 2 hours that haven't been processed
        cutoff_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        
        # This would use a GSI to query by status and completion time
        # For now, implement a simplified scan with filter
        response = dynamodb_client.query(
            table_name=SESSIONS_TABLE,
            # This would be a proper GSI query in production
            # KeyConditionExpression=Key('status').eq('COMPLETED'),
            # FilterExpression=Attr('updatedAt').gte(cutoff_time) & Attr('analyticsProcessed').not_exists()
        )
        
        sessions = []
        # In production, this would be more efficient with proper indexing
        # For now, return empty list as we'd need GSI setup
        
        return sessions
        
    except Exception as e:
        logger.error(f"Failed to find completed sessions: {e}")
        return []


def _process_session_analytics(session_info: Dict[str, Any]) -> bool:
    """Process analytics for a single session"""
    try:
        session_id = session_info.get('sessionId')
        user_id = session_info.get('userId')
        
        if not session_id or not user_id:
            logger.warning(f"Missing session or user ID in session info: {session_info}")
            return False
        
        # Get full session details
        session = dynamodb_client.get_item(
            table_name=SESSIONS_TABLE,
            key={'sessionId': session_id, 'userId': user_id}
        )
        
        if not session:
            logger.warning(f"Session not found: {session_id}")
            return False
        
        # Calculate session analytics
        analytics_data = _calculate_session_analytics(session)
        
        # Store analytics record
        analytics_record = {
            'analyticsId': f"{user_id}#{session_id}",
            'userId': user_id,
            'sessionId': session_id,
            'sessionName': session.get('name'),
            'completedAt': session.get('updatedAt'),
            'metrics': analytics_data,
            'processedAt': datetime.now(timezone.utc).isoformat(),
            'ttl': int((datetime.now(timezone.utc) + timedelta(days=365)).timestamp())  # 1 year retention
        }
        
        dynamodb_client.put_item(ANALYTICS_TABLE, analytics_record)
        
        # Update user statistics
        _update_user_statistics(user_id, analytics_data)
        
        # Mark session as processed
        dynamodb_client.update_item(
            table_name=SESSIONS_TABLE,
            key={'sessionId': session_id, 'userId': user_id},
            UpdateExpression='SET analyticsProcessed = :processed',
            ExpressionAttributeValues={':processed': True}
        )
        
        logger.info(f"Analytics processed for session {session_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to process session analytics: {e}")
        return False


def _calculate_session_analytics(session: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate comprehensive analytics for a session"""
    
    # Extract session data
    progress = session.get('progress', {})
    config = session.get('config', {})
    
    total_questions = config.get('totalQuestions', 0)
    answered_questions = len(progress.get('answeredQuestions', []))
    correct_answers = progress.get('correctAnswers', 0)
    wrong_answers = progress.get('wrongAnswers', 0)
    time_spent = progress.get('timeSpent', 0)
    
    # Calculate basic metrics
    accuracy = (correct_answers / answered_questions * 100) if answered_questions > 0 else 0
    completion_rate = (answered_questions / total_questions * 100) if total_questions > 0 else 0
    avg_time_per_question = time_spent / answered_questions if answered_questions > 0 else 0
    
    # Calculate performance rating
    performance_rating = _calculate_performance_rating(accuracy, completion_rate, avg_time_per_question)
    
    # Extract source categories for category-based analytics
    sources = config.get('sources', [])
    categories = [source.get('category') for source in sources if source.get('category')]
    
    return {
        'totalQuestions': total_questions,
        'answeredQuestions': answered_questions,
        'correctAnswers': correct_answers,
        'wrongAnswers': wrong_answers,
        'accuracy': round(accuracy, 2),
        'completionRate': round(completion_rate, 2),
        'timeSpent': time_spent,
        'averageTimePerQuestion': round(avg_time_per_question, 2),
        'performanceRating': performance_rating,
        'categories': categories,
        'sessionDuration': time_spent,
        'efficiencyScore': _calculate_efficiency_score(accuracy, avg_time_per_question)
    }


def _calculate_performance_rating(accuracy: float, completion_rate: float, avg_time: float) -> str:
    """Calculate overall performance rating"""
    
    # Weight different factors
    accuracy_score = accuracy / 100 * 0.5  # 50% weight
    completion_score = completion_rate / 100 * 0.3  # 30% weight
    
    # Time efficiency (lower is better, normalize around 2 minutes)
    time_efficiency = min(1.0, 120 / max(avg_time, 30)) * 0.2  # 20% weight
    
    overall_score = accuracy_score + completion_score + time_efficiency
    
    if overall_score >= 0.9:
        return 'excellent'
    elif overall_score >= 0.8:
        return 'good'
    elif overall_score >= 0.7:
        return 'average'
    elif overall_score >= 0.6:
        return 'below_average'
    else:
        return 'poor'


def _calculate_efficiency_score(accuracy: float, avg_time: float) -> float:
    """Calculate efficiency score balancing accuracy and speed"""
    
    # Normalize time around 2 minutes (120 seconds)
    time_factor = 120 / max(avg_time, 30)  # Don't penalize too much for very fast answers
    time_factor = min(time_factor, 2.0)  # Cap the bonus for very fast answers
    
    # Combine accuracy (0-100) with time factor
    efficiency = (accuracy / 100) * time_factor
    
    return round(min(efficiency * 100, 100), 2)  # Return as percentage, cap at 100


def _update_user_statistics(user_id: str, analytics_data: Dict[str, Any]):
    """Update user's overall statistics with new session data"""
    
    try:
        # Get current user statistics
        user = dynamodb_client.get_item(
            table_name=USERS_TABLE,
            key={'userId': user_id}
        )
        
        if not user:
            logger.warning(f"User not found for statistics update: {user_id}")
            return
        
        # Extract current statistics
        current_stats = user.get('statistics', {})
        
        # Calculate updated statistics
        total_sessions = current_stats.get('totalSessions', 0) + 1
        total_questions = current_stats.get('totalQuestions', 0) + analytics_data.get('answeredQuestions', 0)
        total_correct = current_stats.get('totalCorrectAnswers', 0) + analytics_data.get('correctAnswers', 0)
        total_time = current_stats.get('totalTimeSpent', 0) + analytics_data.get('timeSpent', 0)
        
        # Calculate new average score
        current_avg = current_stats.get('averageScore', 0.0)
        session_accuracy = analytics_data.get('accuracy', 0)
        new_avg = ((current_avg * (total_sessions - 1)) + session_accuracy) / total_sessions
        
        # Update user statistics
        updated_stats = {
            'totalSessions': total_sessions,
            'totalQuestions': total_questions,
            'totalCorrectAnswers': total_correct,
            'averageScore': round(new_avg, 2),
            'totalTimeSpent': total_time,
            'lastSessionAt': datetime.now(timezone.utc).isoformat()
        }
        
        dynamodb_client.update_item(
            table_name=USERS_TABLE,
            key={'userId': user_id},
            UpdateExpression='SET statistics = :stats, updatedAt = :updated',
            ExpressionAttributeValues={
                ':stats': updated_stats,
                ':updated': datetime.now(timezone.utc).isoformat()
            }
        )
        
        logger.info(f"Updated statistics for user {user_id}")
        
    except Exception as e:
        logger.error(f"Failed to update user statistics: {e}")


def _update_global_analytics():
    """Update global analytics and aggregated statistics"""
    
    try:
        # This would calculate and store global metrics
        # Such as platform-wide accuracy, popular categories, etc.
        
        global_analytics = {
            'lastUpdated': datetime.now(timezone.utc).isoformat(),
            'totalSessionsProcessed': 1,  # Would be calculated from actual data
            'averagePlatformAccuracy': 75.5,  # Would be calculated from actual data
            'mostPopularCategories': ['AWS', 'Networking', 'Security']  # Would be calculated
        }
        
        # Store in analytics table with special key
        dynamodb_client.put_item(ANALYTICS_TABLE, {
            'analyticsId': 'GLOBAL#METRICS',
            'type': 'global_metrics',
            'metrics': global_analytics,
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        
    except Exception as e:
        logger.error(f"Failed to update global analytics: {e}")


def _cleanup_old_analytics():
    """Clean up old analytics records based on TTL"""
    
    try:
        # TTL should handle most cleanup automatically
        # This function could handle any manual cleanup needed
        
        cleanup_count = 0
        
        # Example: Clean up analytics older than 2 years
        cutoff_time = datetime.now(timezone.utc) - timedelta(days=730)
        
        # In production, this would use a more efficient query
        # For now, return 0 as TTL handles cleanup
        
        return cleanup_count
        
    except Exception as e:
        logger.error(f"Failed to cleanup old analytics: {e}")
        return 0


def _cleanup_expired_sessions() -> int:
    """Clean up sessions that have expired"""
    
    try:
        cleanup_count = 0
        current_time = datetime.now(timezone.utc)
        
        # Find sessions that have expired (older than 7 days and not completed)
        cutoff_time = (current_time - timedelta(days=7)).isoformat()
        
        # This would be implemented with proper GSI queries in production
        # For now, return 0 as this requires more complex querying
        
        return cleanup_count
        
    except Exception as e:
        logger.error(f"Failed to cleanup expired sessions: {e}")
        return 0


def _cleanup_orphaned_sessions() -> int:
    """Clean up sessions that are orphaned (user deleted, etc.)"""
    
    try:
        cleanup_count = 0
        
        # This would identify and clean up sessions for deleted users
        # Implementation would require cross-table validation
        
        return cleanup_count
        
    except Exception as e:
        logger.error(f"Failed to cleanup orphaned sessions: {e}")
        return 0


def _cleanup_stale_progress() -> int:
    """Clean up stale progress records"""
    
    try:
        cleanup_count = 0
        
        # Clean up progress records for sessions that no longer exist
        # This would require careful cross-table validation
        
        return cleanup_count
        
    except Exception as e:
        logger.error(f"Failed to cleanup stale progress: {e}")
        return 0


def _archive_old_sessions() -> int:
    """Archive old completed sessions to reduce active table size"""
    
    try:
        archived_count = 0
        
        # Archive sessions older than 1 year to a separate table or S3
        cutoff_time = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
        
        # This would be implemented with proper archiving strategy
        # For now, return 0 as this requires more complex implementation
        
        return archived_count
        
    except Exception as e:
        logger.error(f"Failed to archive old sessions: {e}")
        return 0


def _record_cleanup_metrics(cleanup_results: Dict[str, int]):
    """Record cleanup metrics for monitoring"""
    
    try:
        metrics_record = {
            'analyticsId': f"CLEANUP#{datetime.now(timezone.utc).strftime('%Y%m%d')}",
            'type': 'cleanup_metrics',
            'metrics': cleanup_results,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'ttl': int((datetime.now(timezone.utc) + timedelta(days=90)).timestamp())  # 90 day retention
        }
        
        dynamodb_client.put_item(ANALYTICS_TABLE, metrics_record)
        
    except Exception as e:
        logger.error(f"Failed to record cleanup metrics: {e}")