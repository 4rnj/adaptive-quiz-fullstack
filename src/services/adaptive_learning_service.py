"""
Adaptive Learning Service - Core Implementation
Handles immediate re-asking logic, answer shuffling, and wrong answer pool management
"""

import random
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal
from dataclasses import dataclass, asdict
from enum import Enum

from src.utils.dynamodb_client import dynamodb_client, DynamoDBError, OptimisticLockError
from src.utils.error_handler import handle_service_errors, AdaptiveLearningError
from src.utils.performance_monitor import performance_monitor

logger = logging.getLogger(__name__)

class NextAction(Enum):
    """Enum for next action after answer submission"""
    RETRY_SAME_QUESTION = "RETRY_SAME_QUESTION"
    NEXT_QUESTION = "NEXT_QUESTION"
    SESSION_COMPLETE = "SESSION_COMPLETE"

@dataclass
class ProgressIndicator:
    """Progress indicator with penalty tracking"""
    current_question: int
    total_questions: int
    additional_questions: int
    correct_answers: int
    wrong_pool_size: int
    penalty_text: Optional[str] = None
    completion_percentage: float = 0.0

@dataclass
class QuestionResponse:
    """Response structure for question serving"""
    question_id: str
    text: str
    answers: List[Dict[str, Any]]
    question_type: str
    language: str
    is_from_wrong_pool: bool = False
    remaining_tries: Optional[int] = None
    shuffled: bool = False

@dataclass
class AnswerResult:
    """Result of answer processing"""
    correct: bool
    next_action: NextAction
    progress: ProgressIndicator
    question: Optional[QuestionResponse] = None
    explanation: Optional[str] = None
    message: Optional[str] = None

class AdaptiveLearningService:
    """
    Core adaptive learning service implementing:
    1. Immediate re-asking with answer shuffling
    2. Wrong answer pool management with timestamp sorting
    3. 20/80 question selection algorithm
    4. Progress tracking with penalty indicators
    """
    
    def __init__(self):
        self.db = dynamodb_client
        self.performance_monitor = performance_monitor
        
        # Table names
        self.questions_table = 'quiz-adaptive-learning-dev-questions'
        self.sessions_table = 'quiz-adaptive-learning-dev-sessions'
        self.progress_table = 'quiz-adaptive-learning-dev-progress'
        self.wrong_answers_table = 'quiz-adaptive-learning-dev-wrong-answers'
        
        # Algorithm configuration
        self.wrong_pool_selection_percentage = 0.20  # 20% from wrong pool
        self.mastery_required_correct = 2  # 2 correct answers needed after wrong
        
        # Advanced difficulty adjustment parameters
        self.difficulty_adjustment_factor = 0.15  # How much to adjust difficulty
        self.performance_window_size = 10  # Last N questions for performance calculation
        self.target_success_rate = 0.75  # Target 75% success rate
        self.min_difficulty = 0.1  # Minimum difficulty level
        self.max_difficulty = 1.0  # Maximum difficulty level
        
        # Spaced repetition intervals (in hours)
        self.spaced_repetition_intervals = [1, 4, 24, 72, 168]  # 1h, 4h, 1d, 3d, 1w
        
        # Knowledge state modeling
        self.mastery_threshold = 0.8  # 80% accuracy for mastery
        self.knowledge_decay_rate = 0.02  # Daily knowledge decay rate
    
    @handle_service_errors
    @performance_monitor.track_operation("adaptive_learning")
    def get_next_question(self, session_id: str, user_id: str) -> Optional[QuestionResponse]:
        """
        Get next question based on adaptive learning algorithm
        20% from oldest wrong answers, 80% from remaining pool
        """
        logger.info(f"Getting next question for session {session_id}, user {user_id}")
        
        # Get session details
        session = self._get_session(session_id, user_id)
        if not session:
            raise AdaptiveLearningError(f"Session {session_id} not found")
        
        # Check if session is complete
        if self._is_session_complete(session):
            return None
        
        # Get user's current performance metrics
        user_performance = self._calculate_user_performance(user_id, session_id)
        
        # Determine question selection strategy with adaptive logic
        if self._should_select_from_wrong_pool():
            wrong_question = self._get_optimal_wrong_answer(user_id, user_performance)
            if wrong_question:
                return self._prepare_wrong_pool_question(wrong_question)
        
        # Get next regular question with difficulty adjustment
        return self._get_next_adaptive_question(session, user_id, user_performance)
    
    @handle_service_errors
    @performance_monitor.track_operation("process_answer")
    def process_answer(self, session_id: str, user_id: str, question_id: str,
                      selected_answers: List[str], time_spent: int) -> AnswerResult:
        """
        Process answer submission with immediate re-asking logic
        """
        logger.info(f"Processing answer for question {question_id} in session {session_id}")
        
        # Get question details
        question = self._get_question(question_id)
        if not question:
            raise AdaptiveLearningError(f"Question {question_id} not found")
        
        # Validate answer
        is_correct = self._validate_answer(question, selected_answers)
        
        # Update progress tracking
        self._update_progress_tracking(user_id, question_id, session_id, is_correct, time_spent)
        
        if is_correct:
            return self._handle_correct_answer(session_id, user_id, question_id, question)
        else:
            return self._handle_wrong_answer(session_id, user_id, question_id, question)
    
    def _should_select_from_wrong_pool(self) -> bool:
        """Determine if next question should come from wrong answer pool (20% chance)"""
        return random.random() < self.wrong_pool_selection_percentage
    
    def _get_optimal_wrong_answer(self, user_id: str, performance: Dict) -> Optional[Dict]:
        """Get optimal wrong answer based on spaced repetition and performance"""
        try:
            # Get wrong answers sorted by priority (combines age and performance)
            wrong_answers = self.db.get_wrong_answers_sorted(user_id, limit=5)
            
            if not wrong_answers:
                return None
            
            # Apply spaced repetition algorithm to find optimal question
            optimal_question = self._apply_spaced_repetition(wrong_answers, performance)
            return optimal_question
            
        except Exception as e:
            logger.warning(f"Failed to get optimal wrong answer for user {user_id}: {e}")
            # Fallback to oldest
            return self._get_oldest_wrong_answer(user_id)
    
    def _get_oldest_wrong_answer(self, user_id: str) -> Optional[Dict]:
        """Fallback: Get oldest wrong answer that still needs correct responses"""
        try:
            wrong_answers = self.db.get_wrong_answers_sorted(user_id, limit=1)
            return wrong_answers[0] if wrong_answers else None
        except Exception as e:
            logger.warning(f"Failed to get wrong answers for user {user_id}: {e}")
            return None
    
    def _prepare_wrong_pool_question(self, wrong_answer: Dict) -> QuestionResponse:
        """Prepare question from wrong answer pool with shuffled answers"""
        question = self._get_question(wrong_answer['questionId'])
        
        # Get or create shuffled answer order
        if 'shuffledAnswers' in wrong_answer and wrong_answer['shuffledAnswers']:
            shuffled_answers = wrong_answer['shuffledAnswers']
        else:
            shuffled_answers = self._shuffle_answers(question['answers'])
            # Store shuffled order for consistency
            self._update_wrong_answer_shuffling(
                wrong_answer['userId'], 
                wrong_answer['timestamp'], 
                shuffled_answers
            )
        
        return QuestionResponse(
            question_id=question['questionId'],
            text=question['question'],
            answers=shuffled_answers,
            question_type=question['type'],
            language=question['language'],
            is_from_wrong_pool=True,
            remaining_tries=wrong_answer['remainingTries'],
            shuffled=True
        )
    
    def _get_next_adaptive_question(self, session: Dict, user_id: str, performance: Dict) -> Optional[QuestionResponse]:
        """Get next question with adaptive difficulty adjustment"""
        answered_questions = set(session.get('answeredQuestions', []))
        question_pool = session.get('questionPool', [])
        
        # Filter out answered questions
        available_questions = [q for q in question_pool if q not in answered_questions]
        
        if not available_questions:
            return None  # Session complete
        
        # Get questions with metadata for difficulty-based selection
        questions_with_difficulty = self._get_questions_with_difficulty(available_questions)
        
        # Select question based on adaptive algorithm
        selected_question_id = self._select_adaptive_question(
            questions_with_difficulty, performance, user_id
        )
        
        question = self._get_question(selected_question_id)
        
        return QuestionResponse(
            question_id=question['questionId'],
            text=question['question'],
            answers=question['answers'],
            question_type=question['type'],
            language=question['language'],
            is_from_wrong_pool=False
        )
    
    def _get_next_regular_question(self, session: Dict, user_id: str) -> Optional[QuestionResponse]:
        """Fallback: Get next question from regular pool (not from wrong answers)"""
        answered_questions = set(session.get('answeredQuestions', []))
        question_pool = session.get('questionPool', [])
        
        # Filter out answered questions
        available_questions = [q for q in question_pool if q not in answered_questions]
        
        if not available_questions:
            return None  # Session complete
        
        # Random selection from available questions
        question_id = random.choice(available_questions)
        question = self._get_question(question_id)
        
        return QuestionResponse(
            question_id=question['questionId'],
            text=question['question'],
            answers=question['answers'],
            question_type=question['type'],
            language=question['language'],
            is_from_wrong_pool=False
        )
    
    def _handle_correct_answer(self, session_id: str, user_id: str, 
                              question_id: str, question: Dict) -> AnswerResult:
        """Handle correct answer - check if from wrong pool and update accordingly"""
        
        # Check if this was from wrong answer pool
        wrong_answer = self._get_wrong_answer_record(user_id, question_id)
        penalty_text = None
        
        if wrong_answer:
            # This was from wrong pool - update remaining tries
            new_remaining = wrong_answer['remainingTries'] - 1
            
            if new_remaining > 0:
                # Still needs more correct answers
                self._update_wrong_answer_tries(user_id, wrong_answer['timestamp'], new_remaining)
                penalty_text = f"(+1 Question @ {new_remaining} Try{'s' if new_remaining > 1 else ''})"
            else:
                # Mastered! Remove from wrong pool
                self._remove_from_wrong_pool(user_id, wrong_answer['timestamp'])
                penalty_text = None
        
        # Update session progress
        self._update_session_progress(session_id, user_id, question_id, correct=True)
        
        # Get updated progress
        progress = self._calculate_progress(session_id, user_id, penalty_text)
        
        return AnswerResult(
            correct=True,
            next_action=NextAction.NEXT_QUESTION,
            progress=progress,
            explanation=question.get('explanation')
        )
    
    def _handle_wrong_answer(self, session_id: str, user_id: str,
                            question_id: str, question: Dict) -> AnswerResult:
        """Handle wrong answer - immediate re-asking with shuffled answers"""
        
        # Check if already in wrong pool
        wrong_answer = self._get_wrong_answer_record(user_id, question_id)
        
        if wrong_answer:
            # Reset to required tries (user got it wrong again)
            self._reset_wrong_answer_tries(user_id, wrong_answer['timestamp'])
        else:
            # Add to wrong pool for first time
            self._add_to_wrong_pool(user_id, question_id, session_id)
        
        # Shuffle answers for immediate retry
        shuffled_answers = self._shuffle_answers(question['answers'])
        
        # Create retry question
        retry_question = QuestionResponse(
            question_id=question_id,
            text=question['question'],
            answers=shuffled_answers,
            question_type=question['type'],
            language=question['language'],
            is_from_wrong_pool=False,  # Not from wrong pool, it's immediate retry
            shuffled=True
        )
        
        # Get current progress (don't advance question counter)
        progress = self._calculate_progress(session_id, user_id, f"(+1 Question @ {self.mastery_required_correct} Tries)")
        
        return AnswerResult(
            correct=False,
            next_action=NextAction.RETRY_SAME_QUESTION,
            progress=progress,
            question=retry_question,
            message="Incorrect. Try again with the shuffled answers."
        )
    
    def _shuffle_answers(self, answers: List[Dict]) -> List[Dict]:
        """Shuffle answer choices while preserving answer structure"""
        shuffled = answers.copy()
        random.shuffle(shuffled)
        return shuffled
    
    def _validate_answer(self, question: Dict, selected_answers: List[str]) -> bool:
        """Validate user's answer against correct answers"""
        correct_answers = set(question.get('correctAnswers', []))
        selected_set = set(selected_answers)
        return correct_answers == selected_set
    
    def _add_to_wrong_pool(self, user_id: str, question_id: str, session_id: str):
        """Add question to wrong answer pool"""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        item = {
            'userId': user_id,
            'timestamp': timestamp,
            'questionId': question_id,
            'sessionId': session_id,
            'remainingTries': self.mastery_required_correct,
            'lastAttemptAt': timestamp,
            'attempts': [
                {
                    'timestamp': timestamp,
                    'correct': False
                }
            ]
        }
        
        self.db.put_item(self.wrong_answers_table, item)
        logger.info(f"Added question {question_id} to wrong pool for user {user_id}")
    
    def _update_wrong_answer_tries(self, user_id: str, timestamp: str, remaining_tries: int):
        """Update remaining tries for wrong answer"""
        self.db.update_item(
            self.wrong_answers_table,
            key={'userId': user_id, 'timestamp': timestamp},
            UpdateExpression='SET remainingTries = :tries, lastAttemptAt = :now',
            ExpressionAttributeValues={
                ':tries': remaining_tries,
                ':now': datetime.now(timezone.utc).isoformat()
            }
        )
    
    def _reset_wrong_answer_tries(self, user_id: str, timestamp: str):
        """Reset wrong answer to full tries needed (answered wrong again)"""
        self._update_wrong_answer_tries(user_id, timestamp, self.mastery_required_correct)
    
    def _remove_from_wrong_pool(self, user_id: str, timestamp: str):
        """Remove mastered question from wrong pool"""
        self.db.get_table(self.wrong_answers_table).delete_item(
            Key={'userId': user_id, 'timestamp': timestamp}
        )
    
    def _update_wrong_answer_shuffling(self, user_id: str, timestamp: str, shuffled_answers: List[Dict]):
        """Store shuffled answer order for consistency"""
        self.db.update_item(
            self.wrong_answers_table,
            key={'userId': user_id, 'timestamp': timestamp},
            UpdateExpression='SET shuffledAnswers = :shuffled',
            ExpressionAttributeValues={':shuffled': shuffled_answers}
        )
    
    def _get_wrong_answer_record(self, user_id: str, question_id: str) -> Optional[Dict]:
        """Get wrong answer record for specific question"""
        try:
            # Query wrong answers for this user and question
            response = self.db.query(
                self.wrong_answers_table,
                self.db.get_table(self.wrong_answers_table).meta.client.meta.events.create_request_event
            )
            # Implementation would use a GSI to find by questionId
            # Simplified for this example
            return None
        except Exception as e:
            logger.warning(f"Failed to get wrong answer record: {e}")
            return None
    
    def _update_progress_tracking(self, user_id: str, question_id: str, session_id: str,
                                 is_correct: bool, time_spent: int):
        """Update comprehensive progress tracking"""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Try to get existing progress record
        existing = self.db.get_item(
            self.progress_table,
            key={'userId': user_id, 'questionId': question_id}
        )
        
        if existing:
            # Update existing record
            update_expr = 'SET attempts = attempts + :one, lastAttemptAt = :timestamp'
            expr_values = {
                ':one': 1,
                ':timestamp': timestamp
            }
            
            if is_correct:
                update_expr += ', correctAttempts = correctAttempts + :one'
            else:
                update_expr += ', incorrectAttempts = incorrectAttempts + :one'
            
            self.db.update_item(
                self.progress_table,
                key={'userId': user_id, 'questionId': question_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values
            )
        else:
            # Create new progress record
            item = {
                'userId': user_id,
                'questionId': question_id,
                'sessionId': session_id,
                'attempts': 1,
                'correctAttempts': 1 if is_correct else 0,
                'incorrectAttempts': 0 if is_correct else 1,
                'firstSeenAt': timestamp,
                'lastAttemptAt': timestamp,
                'masteryLevel': 1 if is_correct else 0,
                'timeSpent': time_spent
            }
            
            self.db.put_item(self.progress_table, item)
    
    def _update_session_progress(self, session_id: str, user_id: str, question_id: str, correct: bool):
        """Update session progress atomically"""
        try:
            # Get current session for version
            session = self._get_session(session_id, user_id)
            current_version = session.get('version', 0)
            
            # Update answered questions and current question number
            progress_update = {
                'answeredQuestions': session.get('answeredQuestions', []) + [question_id],
                'currentQuestion': session.get('currentQuestion', 0) + 1,
                'correctAnswers': session.get('correctAnswers', 0) + (1 if correct else 0)
            }
            
            success = self.db.update_session_progress_atomic(
                session_id, user_id, progress_update, current_version
            )
            
            if not success:
                logger.warning(f"Failed to update session progress atomically for {session_id}")
                # Could implement retry logic here
                
        except Exception as e:
            logger.error(f"Error updating session progress: {e}")
            # Don't fail the entire operation for progress update errors
    
    def _calculate_progress(self, session_id: str, user_id: str, penalty_text: Optional[str] = None) -> ProgressIndicator:
        """Calculate comprehensive progress including wrong pool penalties"""
        
        # Get session details
        session = self._get_session(session_id, user_id)
        
        # Get wrong pool size and additional questions
        wrong_pool_response = self.db.query(
            self.wrong_answers_table,
            Key('userId').eq(user_id)
        )
        
        wrong_answers = [item for item in wrong_pool_response.get('Items', []) 
                        if item.get('remainingTries', 0) > 0]
        
        wrong_pool_size = len(wrong_answers)
        additional_questions = sum(item.get('remainingTries', 0) for item in wrong_answers)
        
        # Calculate progress
        current = session.get('currentQuestion', 0)
        total = session.get('totalQuestions', 0)
        correct = session.get('correctAnswers', 0)
        
        completion_percentage = (current / total * 100) if total > 0 else 0
        
        return ProgressIndicator(
            current_question=current,
            total_questions=total,
            additional_questions=additional_questions,
            correct_answers=correct,
            wrong_pool_size=wrong_pool_size,
            penalty_text=penalty_text,
            completion_percentage=round(completion_percentage, 1)
        )
    
    def _get_session(self, session_id: str, user_id: str) -> Optional[Dict]:
        """Get session details"""
        return self.db.get_item(
            self.sessions_table,
            key={'sessionId': session_id, 'userId': user_id}
        )
    
    def _get_question(self, question_id: str) -> Optional[Dict]:
        """Get question details"""
        # Questions table uses questionId as partition key, category as sort key
        # For this operation, we need to query by questionId
        response = self.db.query(
            self.questions_table,
            Key('questionId').eq(question_id),
            Limit=1
        )
        
        items = response.get('Items', [])
        return items[0] if items else None
    
    def _is_session_complete(self, session: Dict) -> bool:
        """Check if session is complete"""
        current = session.get('currentQuestion', 0)
        total = session.get('totalQuestions', 0)
        
        # Session is complete when all original questions are answered
        # Wrong pool questions are additional and don't count toward completion
        return current >= total

    # ADVANCED ADAPTIVE LEARNING METHODS
    
    def _calculate_user_performance(self, user_id: str, session_id: str) -> Dict:
        """Calculate comprehensive user performance metrics"""
        try:
            # Get recent performance data
            recent_attempts = self._get_recent_attempts(user_id, self.performance_window_size)
            
            if not recent_attempts:
                return {
                    'success_rate': 0.5,  # Neutral starting point
                    'average_time': 30.0,  # 30 seconds average
                    'difficulty_level': 0.5,  # Medium difficulty
                    'knowledge_state': 0.5,  # Medium knowledge
                    'confidence_score': 0.5
                }
            
            # Calculate success rate
            correct_count = sum(1 for attempt in recent_attempts if attempt.get('correctAttempts', 0) > 0)
            success_rate = correct_count / len(recent_attempts)
            
            # Calculate average response time
            times = [attempt.get('timeSpent', 30) for attempt in recent_attempts]
            average_time = sum(times) / len(times)
            
            # Get current difficulty level
            difficulty_level = self._get_user_difficulty_level(user_id)
            
            # Calculate knowledge state using item response theory
            knowledge_state = self._calculate_knowledge_state(user_id, recent_attempts)
            
            # Calculate confidence score based on consistency
            confidence_score = self._calculate_confidence_score(recent_attempts)
            
            return {
                'success_rate': success_rate,
                'average_time': average_time,
                'difficulty_level': difficulty_level,
                'knowledge_state': knowledge_state,
                'confidence_score': confidence_score,
                'total_attempts': len(recent_attempts)
            }
            
        except Exception as e:
            logger.error(f"Error calculating user performance: {e}")
            return {'success_rate': 0.5, 'average_time': 30.0, 'difficulty_level': 0.5, 'knowledge_state': 0.5, 'confidence_score': 0.5}
    
    def _apply_spaced_repetition(self, wrong_answers: List[Dict], performance: Dict) -> Optional[Dict]:
        """Apply spaced repetition algorithm to select optimal question"""
        if not wrong_answers:
            return None
        
        current_time = datetime.now(timezone.utc)
        scored_questions = []
        
        for wrong_answer in wrong_answers:
            last_attempt = datetime.fromisoformat(wrong_answer['lastAttemptAt'].replace('Z', '+00:00'))
            time_since_last = (current_time - last_attempt).total_seconds() / 3600  # hours
            
            # Get expected interval based on previous attempts
            attempt_count = len(wrong_answer.get('attempts', []))
            expected_interval = self.spaced_repetition_intervals[min(attempt_count - 1, len(self.spaced_repetition_intervals) - 1)]
            
            # Calculate readiness score (higher = more ready for review)
            readiness_score = min(time_since_last / expected_interval, 2.0)  # Cap at 2x expected
            
            # Adjust for user performance (struggling users get easier questions sooner)
            performance_adjustment = (1.0 - performance['success_rate']) * 0.5
            final_score = readiness_score + performance_adjustment
            
            scored_questions.append((wrong_answer, final_score))
        
        # Sort by readiness score (highest first)
        scored_questions.sort(key=lambda x: x[1], reverse=True)
        
        # Return the most ready question
        return scored_questions[0][0] if scored_questions else None
    
    def _get_questions_with_difficulty(self, question_ids: List[str]) -> List[Dict]:
        """Get questions with their difficulty levels"""
        questions = []
        for question_id in question_ids:
            question = self._get_question(question_id)
            if question:
                # Calculate or retrieve question difficulty
                difficulty = question.get('difficulty', self._calculate_question_difficulty(question_id))
                questions.append({
                    'questionId': question_id,
                    'difficulty': difficulty,
                    'category': question.get('category', 'general'),
                    'avgResponseTime': question.get('avgResponseTime', 30)
                })
        return questions
    
    def _select_adaptive_question(self, questions: List[Dict], performance: Dict, user_id: str) -> str:
        """Select question using adaptive algorithm based on user performance"""
        if not questions:
            return None
        
        user_difficulty = performance['difficulty_level']
        target_difficulty = self._calculate_target_difficulty(performance)
        
        # Score each question based on how well it matches target difficulty
        scored_questions = []
        for question in questions:
            # Difficulty match score (higher = better match)
            difficulty_diff = abs(question['difficulty'] - target_difficulty)
            difficulty_score = 1.0 - min(difficulty_diff, 1.0)
            
            # Add some randomness to prevent predictability
            randomness = random.uniform(0.8, 1.2)
            
            final_score = difficulty_score * randomness
            scored_questions.append((question['questionId'], final_score))
        
        # Sort by score and select best match
        scored_questions.sort(key=lambda x: x[1], reverse=True)
        return scored_questions[0][0]
    
    def _calculate_target_difficulty(self, performance: Dict) -> float:
        """Calculate target difficulty based on user performance"""
        success_rate = performance['success_rate']
        current_difficulty = performance['difficulty_level']
        
        # If user is performing too well, increase difficulty
        if success_rate > self.target_success_rate + 0.1:
            target = min(current_difficulty + self.difficulty_adjustment_factor, self.max_difficulty)
        # If user is struggling, decrease difficulty
        elif success_rate < self.target_success_rate - 0.1:
            target = max(current_difficulty - self.difficulty_adjustment_factor, self.min_difficulty)
        else:
            # Performance is in target range, maintain current difficulty
            target = current_difficulty
        
        return target
    
    def _update_user_difficulty(self, user_id: str, session_id: str, decrease: bool = False):
        """Update user's difficulty level based on performance"""
        try:
            # Get current difficulty
            current_difficulty = self._get_user_difficulty_level(user_id)
            
            # Calculate adjustment
            adjustment = self.difficulty_adjustment_factor * (0.5 if decrease else 1.0)
            if decrease:
                new_difficulty = max(current_difficulty - adjustment, self.min_difficulty)
            else:
                new_difficulty = min(current_difficulty + adjustment, self.max_difficulty)
            
            # Store updated difficulty
            self._store_user_difficulty_level(user_id, new_difficulty)
            
            logger.info(f"Updated difficulty for user {user_id}: {current_difficulty:.3f} -> {new_difficulty:.3f}")
            
        except Exception as e:
            logger.error(f"Error updating user difficulty: {e}")
    
    def _get_user_difficulty_level(self, user_id: str) -> float:
        """Get user's current difficulty level"""
        try:
            # Try to get from user profile or calculate from recent performance
            user_stats = self.db.get_item(
                self.progress_table,
                key={'userId': user_id, 'questionId': 'USER_STATS'}
            )
            
            if user_stats:
                return float(user_stats.get('difficultyLevel', 0.5))
            else:
                return 0.5  # Default medium difficulty
                
        except Exception as e:
            logger.warning(f"Could not get difficulty level for user {user_id}: {e}")
            return 0.5
    
    def _store_user_difficulty_level(self, user_id: str, difficulty_level: float):
        """Store user's difficulty level"""
        try:
            item = {
                'userId': user_id,
                'questionId': 'USER_STATS',
                'difficultyLevel': Decimal(str(difficulty_level)),
                'statsType': 'difficulty',
                'updatedAt': datetime.now(timezone.utc).isoformat(),
                'lastAttemptAt': datetime.now(timezone.utc).isoformat()
            }
            
            self.db.put_item(self.progress_table, item)
            
        except Exception as e:
            logger.error(f"Error storing difficulty level: {e}")
    
    def _calculate_question_difficulty(self, question_id: str) -> float:
        """Calculate question difficulty based on historical performance"""
        try:
            # Get historical attempts for this question
            attempts = self._get_question_attempts(question_id)
            
            if not attempts or len(attempts) < 5:  # Need minimum data
                return 0.5  # Default medium difficulty
            
            # Calculate success rate
            correct_count = sum(1 for attempt in attempts if attempt.get('correctAttempts', 0) > 0)
            success_rate = correct_count / len(attempts)
            
            # Convert success rate to difficulty (inverse relationship)
            difficulty = 1.0 - success_rate
            
            # Normalize to 0.1-1.0 range
            return max(min(difficulty, self.max_difficulty), self.min_difficulty)
            
        except Exception as e:
            logger.error(f"Error calculating question difficulty: {e}")
            return 0.5
    
    def _calculate_knowledge_state(self, user_id: str, recent_attempts: List[Dict]) -> float:
        """Calculate user's knowledge state using item response theory principles"""
        if not recent_attempts:
            return 0.5
        
        # Simple knowledge state calculation based on recent performance
        # In production, this could use more sophisticated IRT models
        
        correct_count = sum(1 for attempt in recent_attempts if attempt.get('correctAttempts', 0) > 0)
        success_rate = correct_count / len(recent_attempts)
        
        # Apply time decay for older attempts
        weighted_score = 0
        total_weight = 0
        
        for i, attempt in enumerate(reversed(recent_attempts)):
            weight = 0.9 ** i  # Exponential decay
            score = 1.0 if attempt.get('correctAttempts', 0) > 0 else 0.0
            weighted_score += score * weight
            total_weight += weight
        
        knowledge_state = weighted_score / total_weight if total_weight > 0 else 0.5
        
        return max(min(knowledge_state, 1.0), 0.0)
    
    def _calculate_confidence_score(self, recent_attempts: List[Dict]) -> float:
        """Calculate user's confidence score based on consistency"""
        if len(recent_attempts) < 3:
            return 0.5
        
        # Calculate variance in response times (lower variance = higher confidence)
        times = [attempt.get('timeSpent', 30) for attempt in recent_attempts]
        mean_time = sum(times) / len(times)
        variance = sum((t - mean_time) ** 2 for t in times) / len(times)
        
        # Calculate consistency in correctness
        correct_answers = [attempt.get('correctAttempts', 0) > 0 for attempt in recent_attempts]
        consistency = 1.0 - (sum(1 for i in range(1, len(correct_answers)) 
                               if correct_answers[i] != correct_answers[i-1]) / (len(correct_answers) - 1))
        
        # Combine time variance and correctness consistency
        time_confidence = max(0, 1.0 - (variance / (mean_time ** 2))) if mean_time > 0 else 0.5
        
        confidence_score = (time_confidence * 0.3 + consistency * 0.7)
        
        return max(min(confidence_score, 1.0), 0.0)
    
    def _get_recent_attempts(self, user_id: str, limit: int) -> List[Dict]:
        """Get user's recent attempts for performance calculation"""
        try:
            # Query recent progress records
            response = self.db.query(
                self.progress_table,
                Key('userId').eq(user_id),
                ScanIndexForward=False,  # Most recent first
                Limit=limit,
                FilterExpression=Attr('lastAttemptAt').exists() & Attr('questionId').ne('USER_STATS')
            )
            
            return response.get('Items', [])
            
        except Exception as e:
            logger.error(f"Error getting recent attempts: {e}")
            return []
    
    def _get_question_attempts(self, question_id: str) -> List[Dict]:
        """Get all attempts for a specific question"""
        try:
            # Query by GSI on questionId
            response = self.db.query(
                self.progress_table,
                IndexName='questionId-lastAttemptAt-index',
                KeyConditionExpression=Key('questionId').eq(question_id)
            )
            
            return response.get('Items', [])
            
        except Exception as e:
            logger.error(f"Error getting question attempts: {e}")
            return []

# Service instance for dependency injection
adaptive_learning_service = AdaptiveLearningService()