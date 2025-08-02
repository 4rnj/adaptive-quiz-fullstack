"""
Session State Management Service
Handles session state with race condition prevention and atomic operations
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import boto3
from boto3.dynamodb.conditions import Key, Attr

from src.utils.dynamodb_client import dynamodb_client, OptimisticLockError, DynamoDBError
from src.utils.error_handler import handle_service_errors, SessionError, ValidationError
from src.utils.performance_monitor import performance_monitor

logger = logging.getLogger(__name__)

class SessionStatus(Enum):
    """Session status enumeration"""
    CREATED = "CREATED"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"

@dataclass
class SessionSource:
    """Session source configuration"""
    category: str
    provider: str
    certificate: str
    language: str
    question_count: int
    difficulty_filter: Optional[List[int]] = None

@dataclass
class SessionConfig:
    """Session configuration"""
    name: str
    sources: List[SessionSource]
    settings: Dict[str, Any]
    total_questions: int
    estimated_duration: int

@dataclass
class SessionProgress:
    """Session progress tracking"""
    current_question: int
    answered_questions: List[str]
    correct_answers: int
    wrong_answers: int
    time_spent: int
    completion_percentage: float

@dataclass
class SessionState:
    """Complete session state"""
    session_id: str
    user_id: str
    config: SessionConfig
    progress: SessionProgress
    status: SessionStatus
    question_pool: List[str]
    created_at: str
    updated_at: str
    expires_at: str
    version: int = 0

class SessionStateService:
    """
    Session state management with atomic operations and race condition handling
    """
    
    def __init__(self):
        self.db = dynamodb_client
        self.performance_monitor = performance_monitor
        
        # Table names
        self.sessions_table = 'quiz-adaptive-learning-dev-sessions'
        self.questions_table = 'quiz-adaptive-learning-dev-questions'
        
        # Session configuration
        self.default_session_duration = 3600  # 1 hour in seconds
        self.max_session_duration = 14400      # 4 hours in seconds
        self.session_cleanup_interval = 3600   # 1 hour
    
    @handle_service_errors
    @performance_monitor.track_operation("create_session")
    def create_session(self, user_id: str, config: SessionConfig) -> SessionState:
        """
        Create new session with atomic operation
        """
        logger.info(f"Creating session for user {user_id}")
        
        # Validate session configuration
        self._validate_session_config(config)
        
        # Generate session ID
        session_id = self._generate_session_id()
        
        # Build question pool from sources
        question_pool = self._build_question_pool(config.sources)
        
        if len(question_pool) < config.total_questions:
            raise SessionError(
                f"Insufficient questions available. Requested: {config.total_questions}, Available: {len(question_pool)}",
                session_id
            )
        
        # Create session state
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=self.default_session_duration)
        
        session_state = SessionState(
            session_id=session_id,
            user_id=user_id,
            config=config,
            progress=SessionProgress(
                current_question=0,
                answered_questions=[],
                correct_answers=0,
                wrong_answers=0,
                time_spent=0,
                completion_percentage=0.0
            ),
            status=SessionStatus.CREATED,
            question_pool=question_pool[:config.total_questions],  # Limit to requested count
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
            expires_at=expires_at.isoformat(),
            version=0
        )
        
        # Save to database
        session_item = self._session_to_dynamodb_item(session_state)
        
        try:
            self.db.put_item(self.sessions_table, session_item)
            logger.info(f"Session {session_id} created successfully")
            return session_state
            
        except Exception as e:
            raise SessionError(f"Failed to create session: {str(e)}", session_id)
    
    @handle_service_errors
    @performance_monitor.track_operation("get_session")
    def get_session(self, session_id: str, user_id: str) -> Optional[SessionState]:
        """
        Get session state with ownership validation
        """
        logger.debug(f"Retrieving session {session_id} for user {user_id}")
        
        try:
            session_item = self.db.get_item(
                self.sessions_table,
                key={'sessionId': session_id, 'userId': user_id}
            )
            
            if not session_item:
                return None
            
            session_state = self._dynamodb_item_to_session(session_item)
            
            # Check if session is expired
            if self._is_session_expired(session_state):
                logger.warning(f"Session {session_id} has expired")
                # Auto-update status to expired
                self._update_session_status(session_id, user_id, SessionStatus.EXPIRED)
                session_state.status = SessionStatus.EXPIRED
            
            return session_state
            
        except Exception as e:
            raise SessionError(f"Failed to retrieve session: {str(e)}", session_id)
    
    @handle_service_errors
    @performance_monitor.track_operation("update_session_progress")
    def update_session_progress_atomic(self, session_id: str, user_id: str,
                                     progress_update: Dict[str, Any]) -> bool:
        """
        Atomically update session progress with version control
        """
        logger.debug(f"Updating session progress for {session_id}")
        
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                # Get current session with version
                current_session = self.get_session(session_id, user_id)
                if not current_session:
                    raise SessionError(f"Session {session_id} not found", session_id)
                
                # Prepare update with version check
                update_expression = "SET "
                expression_values = {}
                expression_names = {}
                update_parts = []
                
                # Update progress fields
                for field, value in progress_update.items():
                    attr_name = f"#{field}"
                    attr_value = f":{field}"
                    expression_names[attr_name] = field
                    expression_values[attr_value] = value
                    update_parts.append(f"{attr_name} = {attr_value}")
                
                # Update version and timestamp
                update_parts.append("#version = #version + :inc")
                update_parts.append("#updated_at = :timestamp")
                
                expression_names["#version"] = "version"
                expression_names["#updated_at"] = "updatedAt"
                expression_values[":inc"] = 1
                expression_values[":timestamp"] = datetime.now(timezone.utc).isoformat()
                expression_values[":expected_version"] = current_session.version
                
                update_expression += ", ".join(update_parts)
                
                # Conditional update with version check
                condition_expression = Attr("version").eq(current_session.version)
                
                success = self.db.conditional_update(
                    self.sessions_table,
                    key={'sessionId': session_id, 'userId': user_id},
                    update_expression=update_expression,
                    condition_expression=condition_expression,
                    expression_attribute_names=expression_names,
                    expression_attribute_values=expression_values
                )
                
                if success:
                    logger.debug(f"Session progress updated successfully for {session_id}")
                    return True
                
            except OptimisticLockError:
                logger.warning(f"Optimistic lock conflict for session {session_id}, attempt {attempt + 1}")
                if attempt == max_retries - 1:
                    raise SessionError(
                        f"Failed to update session progress after {max_retries} attempts due to concurrent modifications",
                        session_id
                    )
                continue
            
            except Exception as e:
                raise SessionError(f"Failed to update session progress: {str(e)}", session_id)
        
        return False
    
    @handle_service_errors
    @performance_monitor.track_operation("start_session")
    def start_session(self, session_id: str, user_id: str) -> SessionState:
        """
        Start session and update status
        """
        logger.info(f"Starting session {session_id} for user {user_id}")
        
        session = self.get_session(session_id, user_id)
        if not session:
            raise SessionError(f"Session {session_id} not found", session_id)
        
        if session.status not in [SessionStatus.CREATED, SessionStatus.PAUSED]:
            raise SessionError(
                f"Cannot start session in {session.status.value} status",
                session_id
            )
        
        # Update status to active
        success = self._update_session_status(session_id, user_id, SessionStatus.ACTIVE)
        
        if not success:
            raise SessionError("Failed to start session", session_id)
        
        # Return updated session
        session.status = SessionStatus.ACTIVE
        session.updated_at = datetime.now(timezone.utc).isoformat()
        
        return session
    
    @handle_service_errors
    @performance_monitor.track_operation("pause_session")
    def pause_session(self, session_id: str, user_id: str) -> SessionState:
        """
        Pause active session
        """
        logger.info(f"Pausing session {session_id} for user {user_id}")
        
        session = self.get_session(session_id, user_id)
        if not session:
            raise SessionError(f"Session {session_id} not found", session_id)
        
        if session.status != SessionStatus.ACTIVE:
            raise SessionError(
                f"Cannot pause session in {session.status.value} status",
                session_id
            )
        
        # Update status to paused
        success = self._update_session_status(session_id, user_id, SessionStatus.PAUSED)
        
        if not success:
            raise SessionError("Failed to pause session", session_id)
        
        session.status = SessionStatus.PAUSED
        session.updated_at = datetime.now(timezone.utc).isoformat()
        
        return session
    
    @handle_service_errors
    @performance_monitor.track_operation("complete_session")
    def complete_session(self, session_id: str, user_id: str) -> SessionState:
        """
        Mark session as completed
        """
        logger.info(f"Completing session {session_id} for user {user_id}")
        
        session = self.get_session(session_id, user_id)
        if not session:
            raise SessionError(f"Session {session_id} not found", session_id)
        
        if session.status == SessionStatus.COMPLETED:
            return session  # Already completed
        
        # Calculate final completion percentage
        completion_percentage = (
            len(session.progress.answered_questions) / len(session.question_pool) * 100
            if session.question_pool else 100
        )
        
        # Update session with completion data
        completion_update = {
            'status': SessionStatus.COMPLETED.value,
            'progress.completion_percentage': completion_percentage,
            'completedAt': datetime.now(timezone.utc).isoformat()
        }
        
        success = self.update_session_progress_atomic(session_id, user_id, completion_update)
        
        if not success:
            raise SessionError("Failed to complete session", session_id)
        
        session.status = SessionStatus.COMPLETED
        session.progress.completion_percentage = completion_percentage
        
        return session
    
    @handle_service_errors
    @performance_monitor.track_operation("restore_session")
    def restore_session_state(self, session_id: str, user_id: str) -> SessionState:
        """
        Restore complete session state from database
        """
        logger.debug(f"Restoring session state for {session_id}")
        
        session = self.get_session(session_id, user_id)
        if not session:
            raise SessionError(f"Session {session_id} not found", session_id)
        
        # Validate session is restorable
        if session.status in [SessionStatus.EXPIRED]:
            raise SessionError(f"Cannot restore {session.status.value} session", session_id)
        
        # Get additional session data if needed (wrong answers, detailed progress)
        # This would involve querying other tables for complete state
        
        return session
    
    @handle_service_errors
    @performance_monitor.track_operation("cleanup_expired_sessions")
    def cleanup_expired_sessions(self) -> int:
        """
        Cleanup expired sessions (background task)
        """
        logger.info("Starting cleanup of expired sessions")
        
        # Query for expired sessions
        current_time = datetime.now(timezone.utc)
        
        # This is a simplified implementation
        # In production, you'd use a GSI to query by expiration time
        
        cleanup_count = 0
        
        try:
            # Implementation would scan for expired sessions and update/delete them
            # For now, just log the operation
            logger.info(f"Cleaned up {cleanup_count} expired sessions")
            
        except Exception as e:
            logger.error(f"Failed to cleanup expired sessions: {e}")
            raise SessionError(f"Cleanup operation failed: {str(e)}")
        
        return cleanup_count
    
    def _validate_session_config(self, config: SessionConfig):
        """Validate session configuration"""
        if not config.name or len(config.name) > 100:
            raise ValidationError("Session name must be 1-100 characters", "name")
        
        if not config.sources or len(config.sources) > 10:
            raise ValidationError("Must have 1-10 sources", "sources")
        
        if config.total_questions <= 0 or config.total_questions > 500:
            raise ValidationError("Total questions must be 1-500", "total_questions")
        
        total_source_questions = sum(source.question_count for source in config.sources)
        if total_source_questions != config.total_questions:
            raise ValidationError(
                f"Source questions ({total_source_questions}) don't match total ({config.total_questions})",
                "total_questions"
            )
    
    def _generate_session_id(self) -> str:
        """Generate unique session ID"""
        import uuid
        return f"sess-{uuid.uuid4()}"
    
    def _build_question_pool(self, sources: List[SessionSource]) -> List[str]:
        """Build question pool from sources"""
        question_pool = []
        
        for source in sources:
            # Query questions table for this source
            try:
                category_key = f"{source.category}#{source.provider}#{source.certificate}"
                language_difficulty = f"{source.language}#"
                
                response = self.db.query(
                    self.questions_table,
                    Key('category').eq(category_key),
                    FilterExpression=Attr('language').eq(source.language),
                    IndexName='category-language-index'
                )
                
                source_questions = response.get('Items', [])
                
                # Apply difficulty filter if specified
                if source.difficulty_filter:
                    source_questions = [
                        q for q in source_questions
                        if q.get('difficulty') in source.difficulty_filter
                    ]
                
                # Extract question IDs
                question_ids = [q['questionId'] for q in source_questions]
                
                # Add to pool (limiting to requested count)
                question_pool.extend(question_ids[:source.question_count])
                
            except Exception as e:
                logger.error(f"Failed to build question pool for source {source.category}: {e}")
                raise SessionError(f"Failed to load questions for {source.category}")
        
        return question_pool
    
    def _update_session_status(self, session_id: str, user_id: str, status: SessionStatus) -> bool:
        """Update session status atomically"""
        try:
            return self.update_session_progress_atomic(
                session_id,
                user_id,
                {
                    'status': status.value,
                    'updatedAt': datetime.now(timezone.utc).isoformat()
                }
            )
        except Exception as e:
            logger.error(f"Failed to update session status: {e}")
            return False
    
    def _is_session_expired(self, session: SessionState) -> bool:
        """Check if session has expired"""
        try:
            expires_at = datetime.fromisoformat(session.expires_at.replace('Z', '+00:00'))
            return datetime.now(timezone.utc) > expires_at
        except Exception:
            return False
    
    def _session_to_dynamodb_item(self, session: SessionState) -> Dict[str, Any]:
        """Convert session state to DynamoDB item"""
        return {
            'sessionId': session.session_id,
            'userId': session.user_id,
            'config': asdict(session.config),
            'progress': asdict(session.progress),
            'status': session.status.value,
            'questionPool': session.question_pool,
            'createdAt': session.created_at,
            'updatedAt': session.updated_at,
            'expiresAt': session.expires_at,
            'version': session.version,
            'ttl': int(datetime.fromisoformat(session.expires_at.replace('Z', '+00:00')).timestamp())
        }
    
    def _dynamodb_item_to_session(self, item: Dict[str, Any]) -> SessionState:
        """Convert DynamoDB item to session state"""
        config_data = item['config']
        progress_data = item['progress']
        
        # Reconstruct sources
        sources = [
            SessionSource(**source_data) for source_data in config_data['sources']
        ]
        
        config = SessionConfig(
            name=config_data['name'],
            sources=sources,
            settings=config_data['settings'],
            total_questions=config_data['total_questions'],
            estimated_duration=config_data['estimated_duration']
        )
        
        progress = SessionProgress(**progress_data)
        
        return SessionState(
            session_id=item['sessionId'],
            user_id=item['userId'],
            config=config,
            progress=progress,
            status=SessionStatus(item['status']),
            question_pool=item['questionPool'],
            created_at=item['createdAt'],
            updated_at=item['updatedAt'],
            expires_at=item['expiresAt'],
            version=item.get('version', 0)
        )

# Service instance for dependency injection
session_state_service = SessionStateService()