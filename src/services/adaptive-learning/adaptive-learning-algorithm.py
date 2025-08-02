"""
Adaptive Learning Algorithm Implementation
Real-time wrong answer tracking with immediate re-asking and answer shuffling
"""

import random
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

class AdaptiveLearningService:
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb')
        self.questions_table = self.dynamodb.Table('quiz-questions')
        self.sessions_table = self.dynamodb.Table('quiz-sessions')
        self.progress_table = self.dynamodb.Table('quiz-progress')
        self.wrong_answers_table = self.dynamodb.Table('quiz-wrong-answers')
        
    def get_next_question(self, session_id: str, user_id: str) -> Dict:
        """
        Get the next question based on adaptive learning algorithm.
        20% from oldest wrong answers, 80% from remaining pool.
        """
        # Get session details
        session = self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
            
        # Check if we need to return a previously wrong question
        if self._should_return_wrong_answer():
            wrong_question = self._get_oldest_wrong_answer(user_id, session_id)
            if wrong_question:
                return self._prepare_wrong_answer_question(wrong_question, user_id)
        
        # Get next regular question
        return self._get_next_regular_question(session, user_id)
    
    def process_answer(self, session_id: str, user_id: str, question_id: str, 
                      selected_answers: List[str], time_spent: int) -> Dict:
        """
        Process user's answer and update tracking accordingly.
        If wrong, immediately return same question with shuffled answers.
        """
        # Get question details
        question = self._get_question(question_id)
        correct_answer_ids = question['correctAnswers']
        
        # Check if answer is correct
        is_correct = set(selected_answers) == set(correct_answer_ids)
        
        # Update progress tracking
        self._update_progress(user_id, question_id, session_id, is_correct, time_spent)
        
        if is_correct:
            return self._handle_correct_answer(session_id, user_id, question_id)
        else:
            return self._handle_wrong_answer(session_id, user_id, question_id, question)
    
    def _should_return_wrong_answer(self) -> bool:
        """Determine if next question should be from wrong answer pool (20% chance)"""
        return random.random() < 0.2
    
    def _get_oldest_wrong_answer(self, user_id: str, session_id: str) -> Optional[Dict]:
        """Get the oldest unanswered wrong answer for the user"""
        response = self.wrong_answers_table.query(
            IndexName='userId-remainingTries-index',
            KeyConditionExpression=Key('userId').eq(user_id),
            FilterExpression=Attr('remainingTries').gt(0),
            ScanIndexForward=True,  # Sort by timestamp ascending (oldest first)
            Limit=1
        )
        
        items = response.get('Items', [])
        return items[0] if items else None
    
    def _prepare_wrong_answer_question(self, wrong_answer: Dict, user_id: str) -> Dict:
        """Prepare a wrong answer question with shuffled answers"""
        question = self._get_question(wrong_answer['questionId'])
        
        # Use stored shuffled answer order or create new one
        if 'shuffledAnswers' in wrong_answer:
            shuffled_answers = wrong_answer['shuffledAnswers']
        else:
            shuffled_answers = self._shuffle_answers(question['answers'])
            # Update wrong answer record with shuffled order
            self.wrong_answers_table.update_item(
                Key={
                    'userId': user_id,
                    'timestamp': wrong_answer['timestamp']
                },
                UpdateExpression='SET shuffledAnswers = :shuffled',
                ExpressionAttributeValues={
                    ':shuffled': shuffled_answers
                }
            )
        
        return {
            'questionId': question['questionId'],
            'text': question['question'],
            'type': question['type'],
            'answers': shuffled_answers,
            'isFromWrongPool': True,
            'remainingTries': wrong_answer['remainingTries'],
            'language': question['language']
        }
    
    def _get_next_regular_question(self, session: Dict, user_id: str) -> Dict:
        """Get next question from regular pool"""
        answered_questions = set(session.get('answeredQuestions', []))
        all_questions = session['questionPool']
        
        # Filter out answered questions
        available_questions = [q for q in all_questions if q not in answered_questions]
        
        if not available_questions:
            return None  # Session complete
        
        # Random selection from available questions
        question_id = random.choice(available_questions)
        question = self._get_question(question_id)
        
        return {
            'questionId': question['questionId'],
            'text': question['question'],
            'type': question['type'],
            'answers': question['answers'],
            'isFromWrongPool': False,
            'language': question['language']
        }
    
    def _handle_correct_answer(self, session_id: str, user_id: str, question_id: str) -> Dict:
        """Handle correct answer submission"""
        # Check if this was from wrong answer pool
        wrong_answer = self._get_wrong_answer_record(user_id, question_id)
        
        if wrong_answer:
            # Decrement remaining tries
            new_remaining = wrong_answer['remainingTries'] - 1
            
            if new_remaining > 0:
                # Update remaining tries
                self.wrong_answers_table.update_item(
                    Key={
                        'userId': user_id,
                        'timestamp': wrong_answer['timestamp']
                    },
                    UpdateExpression='SET remainingTries = :remaining, lastAttemptAt = :now',
                    ExpressionAttributeValues={
                        ':remaining': new_remaining,
                        ':now': datetime.now(timezone.utc).isoformat()
                    }
                )
                penalty_indicator = f"(+1 Question @ {new_remaining} Try{'s' if new_remaining > 1 else ''})"
            else:
                # Remove from wrong pool - mastered!
                self.wrong_answers_table.delete_item(
                    Key={
                        'userId': user_id,
                        'timestamp': wrong_answer['timestamp']
                    }
                )
                penalty_indicator = None
        else:
            penalty_indicator = None
        
        # Update session progress
        self._update_session_progress(session_id, question_id, True)
        
        # Get updated progress stats
        progress = self._get_session_progress(session_id, user_id)
        
        return {
            'correct': True,
            'nextAction': 'NEXT_QUESTION',
            'progress': progress,
            'penaltyIndicator': penalty_indicator
        }
    
    def _handle_wrong_answer(self, session_id: str, user_id: str, 
                           question_id: str, question: Dict) -> Dict:
        """Handle wrong answer - return same question with shuffled answers"""
        
        # Check if already in wrong pool
        wrong_answer = self._get_wrong_answer_record(user_id, question_id)
        
        if wrong_answer:
            # Reset to 2 tries needed
            self.wrong_answers_table.update_item(
                Key={
                    'userId': user_id,
                    'timestamp': wrong_answer['timestamp']
                },
                UpdateExpression='SET remainingTries = :tries, lastAttemptAt = :now',
                ExpressionAttributeValues={
                    ':tries': 2,
                    ':now': datetime.now(timezone.utc).isoformat()
                }
            )
        else:
            # Add to wrong pool
            timestamp = datetime.now(timezone.utc).isoformat()
            self.wrong_answers_table.put_item(
                Item={
                    'userId': user_id,
                    'timestamp': timestamp,
                    'questionId': question_id,
                    'sessionId': session_id,
                    'remainingTries': 2,
                    'lastAttemptAt': timestamp,
                    'attempts': [
                        {
                            'timestamp': timestamp,
                            'correct': False
                        }
                    ]
                }
            )
        
        # Shuffle answers for retry
        shuffled_answers = self._shuffle_answers(question['answers'])
        
        return {
            'correct': False,
            'nextAction': 'RETRY_SAME_QUESTION',
            'question': {
                'questionId': question_id,
                'text': question['question'],
                'type': question['type'],
                'answers': shuffled_answers,
                'shuffled': True,
                'language': question['language']
            },
            'message': 'Incorrect. Try again with the shuffled answers.',
            'penaltyIndicator': '(+1 Question @ 2 Tries)'
        }
    
    def _shuffle_answers(self, answers: List[Dict]) -> List[Dict]:
        """Shuffle answer order while maintaining answer IDs"""
        shuffled = answers.copy()
        random.shuffle(shuffled)
        return shuffled
    
    def _get_session_progress(self, session_id: str, user_id: str) -> Dict:
        """Get current session progress including wrong pool stats"""
        session = self._get_session(session_id)
        
        # Count wrong pool questions
        wrong_pool_response = self.wrong_answers_table.query(
            KeyConditionExpression=Key('userId').eq(user_id),
            FilterExpression=Attr('remainingTries').gt(0)
        )
        wrong_pool_size = len(wrong_pool_response.get('Items', []))
        
        # Calculate additional questions (sum of remaining tries)
        additional_questions = sum(
            item['remainingTries'] 
            for item in wrong_pool_response.get('Items', [])
        )
        
        answered_count = len(session.get('answeredQuestions', []))
        total_questions = session['totalQuestions']
        
        # Get correct answer count from progress table
        progress_response = self.progress_table.query(
            IndexName='sessionId-index',
            KeyConditionExpression=Key('sessionId').eq(session_id),
            FilterExpression=Attr('correctAttempts').gt(0)
        )
        correct_answers = len(progress_response.get('Items', []))
        
        return {
            'questionsAnswered': answered_count,
            'totalQuestions': total_questions,
            'correctAnswers': correct_answers,
            'wrongPoolSize': wrong_pool_size,
            'additionalQuestions': additional_questions,
            'percentage': round((answered_count / total_questions) * 100, 1)
        }
    
    def _update_progress(self, user_id: str, question_id: str, session_id: str, 
                        is_correct: bool, time_spent: int):
        """Update user progress tracking"""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Check if progress record exists
        existing = self.progress_table.get_item(
            Key={
                'userId': user_id,
                'questionId': question_id
            }
        )
        
        if existing.get('Item'):
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
                
            self.progress_table.update_item(
                Key={
                    'userId': user_id,
                    'questionId': question_id
                },
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values
            )
        else:
            # Create new record
            self.progress_table.put_item(
                Item={
                    'userId': user_id,
                    'questionId': question_id,
                    'sessionId': session_id,
                    'attempts': 1,
                    'correctAttempts': 1 if is_correct else 0,
                    'incorrectAttempts': 0 if is_correct else 1,
                    'firstSeenAt': timestamp,
                    'lastAttemptAt': timestamp,
                    'masteryLevel': 1 if is_correct else 0,
                    'isInWrongPool': not is_correct
                }
            )
    
    def _get_session(self, session_id: str) -> Optional[Dict]:
        """Get session details from DynamoDB"""
        response = self.sessions_table.get_item(
            Key={'sessionId': session_id}
        )
        return response.get('Item')
    
    def _get_question(self, question_id: str) -> Optional[Dict]:
        """Get question details from DynamoDB"""
        response = self.questions_table.get_item(
            Key={'questionId': question_id}
        )
        return response.get('Item')
    
    def _get_wrong_answer_record(self, user_id: str, question_id: str) -> Optional[Dict]:
        """Get wrong answer record for a specific question"""
        response = self.wrong_answers_table.query(
            KeyConditionExpression=Key('userId').eq(user_id),
            FilterExpression=Attr('questionId').eq(question_id) & Attr('remainingTries').gt(0),
            Limit=1
        )
        items = response.get('Items', [])
        return items[0] if items else None
    
    def _update_session_progress(self, session_id: str, question_id: str, is_correct: bool):
        """Update session with answered question"""
        self.sessions_table.update_item(
            Key={'sessionId': session_id},
            UpdateExpression='ADD answeredQuestions :question SET currentQuestion = currentQuestion + :one',
            ExpressionAttributeValues={
                ':question': {question_id},
                ':one': 1
            }
        )