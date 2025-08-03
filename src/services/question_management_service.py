"""
Question Management Service
Handles question CRUD operations, difficulty calculation, and performance optimization
"""

import logging
import json
import statistics
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

from src.utils.dynamodb_client import dynamodb_client, DynamoDBError, BatchWriteError
from src.utils.error_handler import handle_service_errors, QuizError, ValidationError, ErrorCategory
from src.utils.performance_monitor import performance_monitor

logger = logging.getLogger(__name__)

class QuestionType(Enum):
    """Question type enumeration"""
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    FILL_IN_BLANK = "fill_in_blank"

class QuestionStatus(Enum):
    """Question status enumeration"""
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    DEPRECATED = "DEPRECATED"
    FLAGGED = "FLAGGED"

@dataclass
class Answer:
    """Answer option for a question"""
    id: str
    text: str
    correct: bool
    explanation: Optional[str] = None

@dataclass
class QuestionMetadata:
    """Question metadata and statistics"""
    question_id: str
    times_asked: int
    times_correct: int
    average_response_time: float
    difficulty_score: float  # 0.0-1.0, higher = more difficult
    last_updated: str
    flagged_count: int
    performance_trend: str  # "improving", "stable", "declining"

@dataclass
class Question:
    """Complete question with all data"""
    question_id: str
    category: str
    provider: str
    certificate: str
    language: str
    question: str
    answers: List[Answer]
    correct_answers: List[str]
    explanation: Optional[str]
    question_type: QuestionType
    difficulty: int  # 1-5 scale
    status: QuestionStatus
    tags: List[str]
    created_at: str
    updated_at: str
    created_by: str
    metadata: Optional[QuestionMetadata] = None

@dataclass
class QuestionSearchCriteria:
    """Search criteria for questions"""
    category: Optional[str] = None
    provider: Optional[str] = None
    certificate: Optional[str] = None
    language: Optional[str] = None
    difficulty_range: Optional[Tuple[int, int]] = None
    question_type: Optional[QuestionType] = None
    status: Optional[QuestionStatus] = None
    tags: Optional[List[str]] = None
    exclude_question_ids: Optional[List[str]] = None

class QuestionManagementService:
    """
    Comprehensive question management with performance optimization
    """
    
    def __init__(self):
        self.db = dynamodb_client
        self.performance_monitor = performance_monitor
        
        # Table names
        self.questions_table = 'quiz-adaptive-learning-dev-questions'
        self.progress_table = 'quiz-adaptive-learning-dev-progress'
        
        # Configuration
        self.min_attempts_for_difficulty = 10
        self.difficulty_calculation_window_days = 30
        self.batch_size = 25  # DynamoDB batch write limit
    
    @handle_service_errors
    @performance_monitor.track_operation("create_question")
    def create_question(self, question_data: Dict[str, Any], created_by: str) -> Question:
        """
        Create new question with validation
        """
        logger.info(f"Creating question for category {question_data.get('category')}")
        
        # Validate question data
        self._validate_question_data(question_data)
        
        # Generate question ID
        question_id = self._generate_question_id()
        
        # Parse answers
        answers = [Answer(**answer) for answer in question_data['answers']]
        
        # Extract correct answer IDs
        correct_answers = [answer.id for answer in answers if answer.correct]
        
        if not correct_answers:
            raise ValidationError("Question must have at least one correct answer", "answers")
        
        # Create question object
        now = datetime.now(timezone.utc).isoformat()
        
        question = Question(
            question_id=question_id,
            category=question_data['category'],
            provider=question_data.get('provider', ''),
            certificate=question_data.get('certificate', ''),
            language=question_data.get('language', 'en'),
            question=question_data['question'],
            answers=answers,
            correct_answers=correct_answers,
            explanation=question_data.get('explanation'),
            question_type=QuestionType(question_data.get('type', 'single_choice')),
            difficulty=question_data.get('difficulty', 3),
            status=QuestionStatus.DRAFT,
            tags=question_data.get('tags', []),
            created_at=now,
            updated_at=now,
            created_by=created_by
        )
        
        # Store in database
        try:
            question_item = self._question_to_dynamodb_item(question)
            self.db.put_item(self.questions_table, question_item)
            
            logger.info(f"Question created successfully: {question_id}")
            return question
            
        except Exception as e:
            raise QuizError(f"Failed to create question: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("get_question")
    def get_question(self, question_id: str) -> Optional[Question]:
        """
        Get question by ID with metadata
        """
        logger.debug(f"Retrieving question: {question_id}")
        
        try:
            # Get question data
            question_item = self.db.get_item(
                self.questions_table,
                key={'questionId': question_id}
            )
            
            if not question_item:
                return None
            
            question = self._dynamodb_item_to_question(question_item)
            
            # Add metadata if available
            metadata = self._get_question_metadata(question_id)
            question.metadata = metadata
            
            return question
            
        except Exception as e:
            raise QuizError(f"Failed to retrieve question: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("search_questions")
    def search_questions(self, criteria: QuestionSearchCriteria, limit: int = 50) -> List[Question]:
        """
        Search questions with complex criteria
        """
        logger.debug(f"Searching questions with criteria: {criteria}")
        
        try:
            # Build query based on criteria
            if criteria.category and criteria.provider and criteria.certificate:
                # Use primary key for efficient query
                category_key = f"{criteria.category}#{criteria.provider}#{criteria.certificate}"
                
                response = self.db.query(
                    self.questions_table,
                    Key('category').eq(category_key),
                    Limit=limit * 2  # Get extra to account for filtering
                )
            
            elif criteria.category:
                # Use GSI for category-only search
                response = self.db.query(
                    self.questions_table,
                    IndexName='category-language-index',
                    KeyConditionExpression=Key('category').begins_with(criteria.category),
                    Limit=limit * 2
                )
            
            else:
                # Scan operation for complex criteria
                response = self.db.scan(
                    self.questions_table,
                    Limit=limit * 2
                )
            
            questions = []
            items = response.get('Items', [])
            
            for item in items:
                question = self._dynamodb_item_to_question(item)
                
                # Apply additional filters
                if self._matches_criteria(question, criteria):
                    questions.append(question)
                    
                    if len(questions) >= limit:
                        break
            
            logger.debug(f"Found {len(questions)} questions matching criteria")
            return questions
            
        except Exception as e:
            raise QuizError(f"Failed to search questions: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("get_random_questions")
    def get_random_questions(self, criteria: QuestionSearchCriteria, count: int) -> List[Question]:
        """
        Get random questions matching criteria with performance optimization
        """
        logger.debug(f"Getting {count} random questions")
        
        # Get larger pool and randomly select
        pool_size = min(count * 5, 250)  # Get 5x more for good randomness
        questions = self.search_questions(criteria, limit=pool_size)
        
        if len(questions) <= count:
            return questions
        
        # Randomly select from pool
        import random
        return random.sample(questions, count)
    
    @handle_service_errors
    @performance_monitor.track_operation("update_question")
    def update_question(self, question_id: str, updates: Dict[str, Any], updated_by: str) -> bool:
        """
        Update question with atomic operation
        """
        logger.info(f"Updating question: {question_id}")
        
        # Validate updates
        if 'answers' in updates:
            self._validate_answers(updates['answers'])
        
        try:
            # Prepare update expression
            update_expression = "SET "
            expression_values = {}
            expression_names = {}
            update_parts = []
            
            # Add update fields
            for field, value in updates.items():
                if field in ['question', 'explanation', 'difficulty', 'tags', 'status']:
                    attr_name = f"#{field}"
                    attr_value = f":{field}"
                    expression_names[attr_name] = field
                    expression_values[attr_value] = value
                    update_parts.append(f"{attr_name} = {attr_value}")
                elif field == 'answers':
                    # Special handling for answers array
                    answers = [asdict(Answer(**answer)) for answer in value]
                    expression_names["#answers"] = "answers"
                    expression_values[":answers"] = answers
                    update_parts.append("#answers = :answers")
                    
                    # Update correct answers
                    correct_answers = [answer['id'] for answer in value if answer['correct']]
                    expression_names["#correct_answers"] = "correctAnswers"
                    expression_values[":correct_answers"] = correct_answers
                    update_parts.append("#correct_answers = :correct_answers")
            
            # Add metadata updates
            update_parts.append("#updated_at = :timestamp")
            update_parts.append("#updated_by = :updated_by")
            
            expression_names["#updated_at"] = "updatedAt"
            expression_names["#updated_by"] = "updatedBy"
            expression_values[":timestamp"] = datetime.now(timezone.utc).isoformat()
            expression_values[":updated_by"] = updated_by
            
            update_expression += ", ".join(update_parts)
            
            success = self.db.update_item(
                self.questions_table,
                key={'questionId': question_id},
                update_expression=update_expression,
                expression_attribute_names=expression_names,
                expression_attribute_values=expression_values
            )
            
            if success:
                logger.info(f"Question updated successfully: {question_id}")
            
            return success
            
        except Exception as e:
            raise QuizError(f"Failed to update question: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("batch_import_questions")
    def batch_import_questions(self, questions_data: List[Dict], created_by: str) -> Dict[str, Any]:
        """
        Import multiple questions with batch operations
        """
        logger.info(f"Batch importing {len(questions_data)} questions")
        
        results = {
            'total': len(questions_data),
            'successful': 0,
            'failed': 0,
            'errors': []
        }
        
        # Process in batches
        for i in range(0, len(questions_data), self.batch_size):
            batch = questions_data[i:i + self.batch_size]
            batch_items = []
            
            # Prepare batch items
            for question_data in batch:
                try:
                    # Validate and create question object
                    self._validate_question_data(question_data)
                    
                    question_id = self._generate_question_id()
                    answers = [Answer(**answer) for answer in question_data['answers']]
                    correct_answers = [answer.id for answer in answers if answer.correct]
                    
                    now = datetime.now(timezone.utc).isoformat()
                    
                    question = Question(
                        question_id=question_id,
                        category=question_data['category'],
                        provider=question_data.get('provider', ''),
                        certificate=question_data.get('certificate', ''),
                        language=question_data.get('language', 'en'),
                        question=question_data['question'],
                        answers=answers,
                        correct_answers=correct_answers,
                        explanation=question_data.get('explanation'),
                        question_type=QuestionType(question_data.get('type', 'single_choice')),
                        difficulty=question_data.get('difficulty', 3),
                        status=QuestionStatus.DRAFT,
                        tags=question_data.get('tags', []),
                        created_at=now,
                        updated_at=now,
                        created_by=created_by
                    )
                    
                    question_item = self._question_to_dynamodb_item(question)
                    batch_items.append(question_item)
                    
                except Exception as e:
                    results['failed'] += 1
                    results['errors'].append(f"Question validation failed: {str(e)}")
            
            # Execute batch write
            if batch_items:
                try:
                    self.db.batch_write_items(self.questions_table, batch_items)
                    results['successful'] += len(batch_items)
                    
                except BatchWriteError as e:
                    # Handle partial failures
                    results['successful'] += (len(batch_items) - len(e.unprocessed_items))
                    results['failed'] += len(e.unprocessed_items)
                    results['errors'].append(f"Batch write partial failure: {str(e)}")
                
                except Exception as e:
                    results['failed'] += len(batch_items)
                    results['errors'].append(f"Batch write failed: {str(e)}")
        
        logger.info(f"Batch import completed: {results['successful']} successful, {results['failed']} failed")
        return results
    
    @handle_service_errors
    @performance_monitor.track_operation("calculate_question_difficulty")
    def calculate_question_difficulty(self, question_id: str) -> Optional[float]:
        """
        Calculate question difficulty based on user performance
        """
        logger.debug(f"Calculating difficulty for question: {question_id}")
        
        try:
            # Get performance data for this question
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=self.difficulty_calculation_window_days)
            
            response = self.db.query(
                self.progress_table,
                IndexName='questionId-lastAttemptAt-index',
                KeyConditionExpression=Key('questionId').eq(question_id),
                FilterExpression=Attr('lastAttemptAt').gte(cutoff_date.isoformat())
            )
            
            attempts = response.get('Items', [])
            
            if len(attempts) < self.min_attempts_for_difficulty:
                return None  # Insufficient data
            
            # Calculate success rate
            successful_attempts = sum(1 for attempt in attempts if attempt.get('correctAttempts', 0) > 0)
            success_rate = successful_attempts / len(attempts)
            
            # Convert success rate to difficulty (inverse relationship)
            # High success rate = low difficulty
            difficulty_score = 1.0 - success_rate
            
            # Consider response time for additional difficulty indication
            response_times = [attempt.get('timeSpent', 0) for attempt in attempts if attempt.get('timeSpent', 0) > 0]
            if response_times:
                avg_response_time = statistics.mean(response_times)
                # Long response times suggest higher difficulty
                time_factor = min(avg_response_time / 120, 1.0)  # Normalize to 2 minutes
                difficulty_score = (difficulty_score * 0.8) + (time_factor * 0.2)
            
            # Normalize to 0.0-1.0 range
            final_difficulty = max(0.0, min(1.0, difficulty_score))
            
            logger.debug(f"Calculated difficulty for {question_id}: {final_difficulty:.3f}")
            return final_difficulty
            
        except Exception as e:
            logger.error(f"Failed to calculate question difficulty: {e}")
            return None
    
    @handle_service_errors
    @performance_monitor.track_operation("update_question_metadata")
    def update_question_metadata(self, question_id: str) -> QuestionMetadata:
        """
        Update question metadata based on usage statistics
        """
        logger.debug(f"Updating metadata for question: {question_id}")
        
        try:
            # Get usage statistics
            response = self.db.query(
                self.progress_table,
                IndexName='questionId-lastAttemptAt-index',
                KeyConditionExpression=Key('questionId').eq(question_id)
            )
            
            attempts = response.get('Items', [])
            
            # Calculate statistics
            times_asked = len(attempts)
            times_correct = sum(1 for attempt in attempts if attempt.get('correctAttempts', 0) > 0)
            
            # Calculate average response time
            response_times = [attempt.get('timeSpent', 0) for attempt in attempts if attempt.get('timeSpent', 0) > 0]
            avg_response_time = statistics.mean(response_times) if response_times else 0.0
            
            # Calculate difficulty score
            difficulty_score = self.calculate_question_difficulty(question_id) or 0.5
            
            # Calculate performance trend (compare recent vs. older performance)
            performance_trend = self._calculate_performance_trend(attempts)
            
            # Get flagged count (this would require a separate tracking mechanism)
            flagged_count = 0  # Placeholder
            
            metadata = QuestionMetadata(
                question_id=question_id,
                times_asked=times_asked,
                times_correct=times_correct,
                average_response_time=round(avg_response_time, 2),
                difficulty_score=round(difficulty_score, 3),
                last_updated=datetime.now(timezone.utc).isoformat(),
                flagged_count=flagged_count,
                performance_trend=performance_trend
            )
            
            # Store metadata (could be stored in the question item or separate table)
            # For now, we'll update the question item
            update_expression = "SET #metadata = :metadata"
            expression_names = {"#metadata": "metadata"}
            expression_values = {":metadata": asdict(metadata)}
            
            self.db.update_item(
                self.questions_table,
                key={'questionId': question_id},
                update_expression=update_expression,
                expression_attribute_names=expression_names,
                expression_attribute_values=expression_values
            )
            
            logger.debug(f"Metadata updated for question {question_id}")
            return metadata
            
        except Exception as e:
            logger.error(f"Failed to update question metadata: {e}")
            raise QuizError(f"Failed to update question metadata: {str(e)}", ErrorCategory.DATABASE)
    
    def _validate_question_data(self, question_data: Dict[str, Any]):
        """Validate question data"""
        required_fields = ['category', 'question', 'answers']
        
        for field in required_fields:
            if field not in question_data or not question_data[field]:
                raise ValidationError(f"Missing required field: {field}", field)
        
        if len(question_data['question']) < 10 or len(question_data['question']) > 1000:
            raise ValidationError("Question text must be 10-1000 characters", "question")
        
        if not isinstance(question_data['answers'], list) or len(question_data['answers']) < 2:
            raise ValidationError("Must have at least 2 answers", "answers")
        
        if len(question_data['answers']) > 10:
            raise ValidationError("Cannot have more than 10 answers", "answers")
        
        self._validate_answers(question_data['answers'])
    
    def _validate_answers(self, answers: List[Dict]):
        """Validate answer options"""
        correct_count = 0
        answer_ids = set()
        
        for answer in answers:
            if 'id' not in answer or 'text' not in answer or 'correct' not in answer:
                raise ValidationError("Answer must have id, text, and correct fields", "answers")
            
            if answer['id'] in answer_ids:
                raise ValidationError(f"Duplicate answer ID: {answer['id']}", "answers")
            answer_ids.add(answer['id'])
            
            if len(answer['text']) < 1 or len(answer['text']) > 500:
                raise ValidationError("Answer text must be 1-500 characters", "answers")
            
            if answer['correct']:
                correct_count += 1
        
        if correct_count == 0:
            raise ValidationError("Must have at least one correct answer", "answers")
    
    def _generate_question_id(self) -> str:
        """Generate unique question ID"""
        import uuid
        return f"q-{uuid.uuid4()}"
    
    def _matches_criteria(self, question: Question, criteria: QuestionSearchCriteria) -> bool:
        """Check if question matches search criteria"""
        
        if criteria.language and question.language != criteria.language:
            return False
        
        if criteria.difficulty_range:
            min_diff, max_diff = criteria.difficulty_range
            if question.difficulty < min_diff or question.difficulty > max_diff:
                return False
        
        if criteria.question_type and question.question_type != criteria.question_type:
            return False
        
        if criteria.status and question.status != criteria.status:
            return False
        
        if criteria.tags:
            if not any(tag in question.tags for tag in criteria.tags):
                return False
        
        if criteria.exclude_question_ids:
            if question.question_id in criteria.exclude_question_ids:
                return False
        
        return True
    
    def _get_question_metadata(self, question_id: str) -> Optional[QuestionMetadata]:
        """Get cached question metadata"""
        # This could be cached or stored separately
        # For now, calculate on demand
        try:
            return self.update_question_metadata(question_id)
        except Exception:
            return None
    
    def _calculate_performance_trend(self, attempts: List[Dict]) -> str:
        """Calculate performance trend for a question"""
        if len(attempts) < 10:
            return "insufficient_data"
        
        # Sort by attempt date
        sorted_attempts = sorted(attempts, key=lambda x: x.get('lastAttemptAt', ''))
        
        # Split into recent and older halves
        mid_point = len(sorted_attempts) // 2
        older_half = sorted_attempts[:mid_point]
        recent_half = sorted_attempts[mid_point:]
        
        # Calculate success rates
        older_success = sum(1 for a in older_half if a.get('correctAttempts', 0) > 0) / len(older_half)
        recent_success = sum(1 for a in recent_half if a.get('correctAttempts', 0) > 0) / len(recent_half)
        
        difference = recent_success - older_success
        
        if difference > 0.1:
            return "improving"  # Users are getting better at this question
        elif difference < -0.1:
            return "declining"  # Users are getting worse
        else:
            return "stable"
    
    def _question_to_dynamodb_item(self, question: Question) -> Dict[str, Any]:
        """Convert question to DynamoDB item"""
        # Create composite key for efficient querying
        category_key = f"{question.category}#{question.provider}#{question.certificate}"
        language_difficulty = f"{question.language}#{question.difficulty}"
        
        item = {
            'questionId': question.question_id,
            'category': category_key,
            'provider': question.provider,
            'certificate': question.certificate,
            'language': question.language,
            'language_difficulty': language_difficulty,
            'provider_certificate': f"{question.provider}#{question.certificate}",
            'question': question.question,
            'answers': [asdict(answer) for answer in question.answers],
            'correctAnswers': question.correct_answers,
            'type': question.question_type.value,
            'difficulty': question.difficulty,
            'status': question.status.value,
            'tags': question.tags,
            'createdAt': question.created_at,
            'updatedAt': question.updated_at,
            'createdBy': question.created_by
        }
        
        # Add optional fields
        if question.explanation:
            item['explanation'] = question.explanation
        
        if question.metadata:
            item['metadata'] = asdict(question.metadata)
        
        return item
    
    def _dynamodb_item_to_question(self, item: Dict[str, Any]) -> Question:
        """Convert DynamoDB item to question"""
        answers = [Answer(**answer_data) for answer_data in item['answers']]
        
        # Parse metadata if available
        metadata = None
        if 'metadata' in item:
            metadata = QuestionMetadata(**item['metadata'])
        
        return Question(
            question_id=item['questionId'],
            category=item.get('category', '').split('#')[0],  # Extract from composite key
            provider=item.get('provider', ''),
            certificate=item.get('certificate', ''),
            language=item['language'],
            question=item['question'],
            answers=answers,
            correct_answers=item['correctAnswers'],
            explanation=item.get('explanation'),
            question_type=QuestionType(item['type']),
            difficulty=item['difficulty'],
            status=QuestionStatus(item['status']),
            tags=item.get('tags', []),
            created_at=item['createdAt'],
            updated_at=item['updatedAt'],
            created_by=item['createdBy'],
            metadata=metadata
        )

# Service instance for dependency injection
question_management_service = QuestionManagementService()