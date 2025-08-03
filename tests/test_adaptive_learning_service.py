"""
Test Suite for Adaptive Learning Service
Comprehensive tests for the 20/80 algorithm, immediate re-asking, and wrong answer pool management
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from src.services.adaptive_learning_service import (
    AdaptiveLearningService, NextAction, QuestionResponse, AnswerResult, ProgressIndicator
)
from src.utils.error_handler import AdaptiveLearningError


class TestAdaptiveLearningService:
    
    def setup_method(self):
        """Setup for each test method"""
        self.service = AdaptiveLearningService()
        self.mock_session = {
            'sessionId': 'test-session-123',
            'userId': 'test-user-456',
            'questionPool': ['q1', 'q2', 'q3', 'q4', 'q5'],
            'answeredQuestions': ['q1', 'q2'],
            'currentQuestion': 2,
            'totalQuestions': 5,
            'correctAnswers': 1,
            'wrongAnswers': 1,
            'status': 'ACTIVE'
        }
        
        self.mock_question = {
            'questionId': 'q3',
            'question': 'What is AWS Lambda?',
            'answers': [
                {'id': 'a1', 'text': 'Serverless compute', 'correct': True},
                {'id': 'a2', 'text': 'Database service', 'correct': False},
                {'id': 'a3', 'text': 'Storage service', 'correct': False},
                {'id': 'a4', 'text': 'Network service', 'correct': False}
            ],
            'type': 'single_choice',
            'language': 'en',
            'correctAnswers': ['a1'],
            'explanation': 'AWS Lambda is a serverless compute service.'
        }
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_get_next_question_regular_pool(self, mock_db):
        """Test getting next question from regular pool (80% case)"""
        
        # Mock session lookup
        mock_db.get_item.return_value = self.mock_session
        
        # Mock question lookup
        mock_db.query.return_value = {'Items': [self.mock_question]}
        
        # Mock random to avoid wrong pool selection
        with patch('random.random', return_value=0.5):  # 50% > 20%, so regular pool
            with patch('random.choice', return_value='q3'):
                result = self.service.get_next_question('test-session-123', 'test-user-456')
        
        assert result is not None
        assert isinstance(result, QuestionResponse)
        assert result.question_id == 'q3'
        assert result.text == 'What is AWS Lambda?'
        assert len(result.answers) == 4
        assert result.is_from_wrong_pool is False
        assert result.shuffled is False
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_get_next_question_wrong_pool(self, mock_db):
        """Test getting next question from wrong pool (20% case)"""
        
        # Mock session lookup
        mock_db.get_item.return_value = self.mock_session
        
        # Mock wrong answer lookup
        mock_wrong_answer = {
            'userId': 'test-user-456',
            'timestamp': '2023-01-01T10:00:00Z',
            'questionId': 'q1',
            'remainingTries': 2,
            'shuffledAnswers': [
                {'id': 'a2', 'text': 'Database service', 'correct': False},
                {'id': 'a1', 'text': 'Serverless compute', 'correct': True},
                {'id': 'a3', 'text': 'Storage service', 'correct': False},
                {'id': 'a4', 'text': 'Network service', 'correct': False}
            ]
        }
        mock_db.get_wrong_answers_sorted.return_value = [mock_wrong_answer]
        
        # Mock question lookup for wrong pool question
        mock_db.query.return_value = {'Items': [self.mock_question]}
        
        # Mock random to force wrong pool selection
        with patch('random.random', return_value=0.1):  # 10% < 20%, so wrong pool
            result = self.service.get_next_question('test-session-123', 'test-user-456')
        
        assert result is not None
        assert result.is_from_wrong_pool is True
        assert result.remaining_tries == 2
        assert result.shuffled is True
        assert len(result.answers) == 4
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_process_correct_answer_regular_question(self, mock_db):
        """Test processing correct answer for regular question"""
        
        # Mock question lookup
        mock_db.query.return_value = {'Items': [self.mock_question]}
        
        # Mock no existing wrong answer
        mock_db.get_item.return_value = None
        
        # Mock progress tracking updates
        mock_db.put_item.return_value = {}
        mock_db.update_item.return_value = {}
        
        # Mock session and progress calculation
        with patch.object(self.service, '_get_session', return_value=self.mock_session):
            with patch.object(self.service, '_calculate_progress') as mock_calc_progress:
                mock_calc_progress.return_value = ProgressIndicator(
                    current_question=3,
                    total_questions=5,
                    additional_questions=0,
                    correct_answers=2,
                    wrong_pool_size=0,
                    completion_percentage=60.0
                )
                
                result = self.service.process_answer(
                    'test-session-123', 'test-user-456', 'q3', ['a1'], 45
                )
        
        assert result.correct is True
        assert result.next_action == NextAction.NEXT_QUESTION
        assert result.progress.correct_answers == 2
        assert result.explanation == 'AWS Lambda is a serverless compute service.'
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_process_wrong_answer_immediate_retry(self, mock_db):
        """Test processing wrong answer with immediate re-asking"""
        
        # Mock question lookup
        mock_db.query.return_value = {'Items': [self.mock_question]}
        
        # Mock no existing wrong answer
        mock_db.get_item.return_value = None
        
        # Mock database operations
        mock_db.put_item.return_value = {}
        mock_db.update_item.return_value = {}
        
        # Mock session and progress calculation
        with patch.object(self.service, '_get_session', return_value=self.mock_session):
            with patch.object(self.service, '_calculate_progress') as mock_calc_progress:
                mock_calc_progress.return_value = ProgressIndicator(
                    current_question=2,
                    total_questions=5,
                    additional_questions=2,
                    correct_answers=1,
                    wrong_pool_size=1,
                    penalty_text="(+1 Question @ 2 Tries)",
                    completion_percentage=40.0
                )
                
                # Mock answer shuffling
                with patch.object(self.service, '_shuffle_answers') as mock_shuffle:
                    mock_shuffle.return_value = [
                        {'id': 'a3', 'text': 'Storage service', 'correct': False},
                        {'id': 'a1', 'text': 'Serverless compute', 'correct': True},
                        {'id': 'a2', 'text': 'Database service', 'correct': False},
                        {'id': 'a4', 'text': 'Network service', 'correct': False}
                    ]
                    
                    result = self.service.process_answer(
                        'test-session-123', 'test-user-456', 'q3', ['a2'], 65
                    )
        
        assert result.correct is False
        assert result.next_action == NextAction.RETRY_SAME_QUESTION
        assert result.question is not None
        assert result.question.shuffled is True
        assert result.message == "Incorrect. Try again with the shuffled answers."
        assert result.progress.penalty_text == "(+1 Question @ 2 Tries)"
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_process_correct_answer_from_wrong_pool(self, mock_db):
        """Test processing correct answer for question from wrong pool"""
        
        # Mock question lookup
        mock_db.query.return_value = {'Items': [self.mock_question]}
        
        # Mock existing wrong answer with remaining tries
        mock_wrong_answer = {
            'userId': 'test-user-456',
            'timestamp': '2023-01-01T10:00:00Z',
            'questionId': 'q3',
            'remainingTries': 2
        }
        mock_db.get_item.return_value = mock_wrong_answer
        
        # Mock database operations
        mock_db.update_item.return_value = {}
        
        # Mock session and progress calculation
        with patch.object(self.service, '_get_session', return_value=self.mock_session):
            with patch.object(self.service, '_calculate_progress') as mock_calc_progress:
                mock_calc_progress.return_value = ProgressIndicator(
                    current_question=3,
                    total_questions=5,
                    additional_questions=1,
                    correct_answers=2,
                    wrong_pool_size=1,
                    penalty_text="(+1 Question @ 1 Try)",
                    completion_percentage=60.0
                )
                
                result = self.service.process_answer(
                    'test-session-123', 'test-user-456', 'q3', ['a1'], 50
                )
        
        assert result.correct is True
        assert result.next_action == NextAction.NEXT_QUESTION
        assert result.progress.penalty_text == "(+1 Question @ 1 Try)"
        
        # Verify that remaining tries was decremented
        mock_db.update_item.assert_called()
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_process_correct_answer_mastery_achieved(self, mock_db):
        """Test processing correct answer that achieves mastery (removes from wrong pool)"""
        
        # Mock question lookup
        mock_db.query.return_value = {'Items': [self.mock_question]}
        
        # Mock existing wrong answer with 1 remaining try
        mock_wrong_answer = {
            'userId': 'test-user-456',
            'timestamp': '2023-01-01T10:00:00Z',
            'questionId': 'q3',
            'remainingTries': 1
        }
        mock_db.get_item.return_value = mock_wrong_answer
        
        # Mock database operations
        mock_table = Mock()
        mock_db.get_table.return_value = mock_table
        
        # Mock session and progress calculation
        with patch.object(self.service, '_get_session', return_value=self.mock_session):
            with patch.object(self.service, '_calculate_progress') as mock_calc_progress:
                mock_calc_progress.return_value = ProgressIndicator(
                    current_question=3,
                    total_questions=5,
                    additional_questions=0,
                    correct_answers=2,
                    wrong_pool_size=0,
                    penalty_text=None,
                    completion_percentage=60.0
                )
                
                result = self.service.process_answer(
                    'test-session-123', 'test-user-456', 'q3', ['a1'], 40
                )
        
        assert result.correct is True
        assert result.next_action == NextAction.NEXT_QUESTION
        assert result.progress.penalty_text is None
        
        # Verify that item was deleted from wrong pool
        mock_table.delete_item.assert_called_once()
    
    def test_validate_answer_single_choice_correct(self):
        """Test answer validation for single choice question - correct"""
        
        question = {
            'correctAnswers': ['a1'],
            'type': 'single_choice'
        }
        
        result = self.service._validate_answer(question, ['a1'])
        assert result is True
    
    def test_validate_answer_single_choice_incorrect(self):
        """Test answer validation for single choice question - incorrect"""
        
        question = {
            'correctAnswers': ['a1'],
            'type': 'single_choice'
        }
        
        result = self.service._validate_answer(question, ['a2'])
        assert result is False
    
    def test_validate_answer_multiple_choice_correct(self):
        """Test answer validation for multiple choice question - correct"""
        
        question = {
            'correctAnswers': ['a1', 'a3'],
            'type': 'multiple_choice'
        }
        
        result = self.service._validate_answer(question, ['a1', 'a3'])
        assert result is True
        
        # Order shouldn't matter
        result = self.service._validate_answer(question, ['a3', 'a1'])
        assert result is True
    
    def test_validate_answer_multiple_choice_partial(self):
        """Test answer validation for multiple choice question - partially correct"""
        
        question = {
            'correctAnswers': ['a1', 'a3'],
            'type': 'multiple_choice'
        }
        
        # Partial answers should be incorrect
        result = self.service._validate_answer(question, ['a1'])
        assert result is False
        
        # Extra answers should be incorrect
        result = self.service._validate_answer(question, ['a1', 'a3', 'a2'])
        assert result is False
    
    def test_shuffle_answers(self):
        """Test answer shuffling preserves content but changes order"""
        
        original_answers = [
            {'id': 'a1', 'text': 'Answer 1'},
            {'id': 'a2', 'text': 'Answer 2'},
            {'id': 'a3', 'text': 'Answer 3'},
            {'id': 'a4', 'text': 'Answer 4'}
        ]
        
        # Test multiple times to account for randomness
        shuffled_results = []
        for _ in range(10):
            shuffled = self.service._shuffle_answers(original_answers)
            shuffled_results.append([answer['id'] for answer in shuffled])
        
        # Check that all answers are preserved
        for shuffled in shuffled_results:
            assert len(shuffled) == 4
            assert set(shuffled) == {'a1', 'a2', 'a3', 'a4'}
        
        # Check that at least one shuffle changed the order
        original_order = ['a1', 'a2', 'a3', 'a4']
        assert any(result != original_order for result in shuffled_results)
    
    def test_should_select_from_wrong_pool_probability(self):
        """Test that wrong pool selection follows 20% probability"""
        
        # Test many iterations to verify probability
        wrong_pool_selections = 0
        iterations = 1000
        
        for _ in range(iterations):
            if self.service._should_select_from_wrong_pool():
                wrong_pool_selections += 1
        
        # Should be approximately 20% (allow 5% deviation)
        percentage = wrong_pool_selections / iterations * 100
        assert 15 <= percentage <= 25
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_session_complete_no_more_questions(self, mock_db):
        """Test handling when session is complete"""
        
        # Mock completed session
        completed_session = {
            **self.mock_session,
            'answeredQuestions': ['q1', 'q2', 'q3', 'q4', 'q5'],
            'currentQuestion': 5,
            'totalQuestions': 5
        }
        
        mock_db.get_item.return_value = completed_session
        
        result = self.service.get_next_question('test-session-123', 'test-user-456')
        
        assert result is None
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_error_handling_session_not_found(self, mock_db):
        """Test error handling when session is not found"""
        
        mock_db.get_item.return_value = None
        
        with pytest.raises(AdaptiveLearningError, match="Session test-session-123 not found"):
            self.service.get_next_question('test-session-123', 'test-user-456')
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_error_handling_question_not_found(self, mock_db):
        """Test error handling when question is not found"""
        
        # Mock session lookup
        mock_db.get_item.return_value = self.mock_session
        
        # Mock empty question lookup
        mock_db.query.return_value = {'Items': []}
        
        with pytest.raises(AdaptiveLearningError, match="Question .* not found"):
            self.service.process_answer('test-session-123', 'test-user-456', 'nonexistent', ['a1'], 30)
    
    def test_calculate_progress_basic(self):
        """Test progress calculation with basic metrics"""
        
        mock_session = {
            'currentQuestion': 3,
            'totalQuestions': 10,
            'correctAnswers': 2
        }
        
        # Mock wrong pool query
        with patch.object(self.service.db, 'query') as mock_query:
            mock_query.return_value = {'Items': []}
            
            with patch.object(self.service, '_get_session', return_value=mock_session):
                progress = self.service._calculate_progress('session-123', 'user-456')
        
        assert progress.current_question == 3
        assert progress.total_questions == 10
        assert progress.correct_answers == 2
        assert progress.wrong_pool_size == 0
        assert progress.additional_questions == 0
        assert progress.completion_percentage == 30.0
    
    def test_calculate_progress_with_wrong_pool(self):
        """Test progress calculation including wrong pool penalties"""
        
        mock_session = {
            'currentQuestion': 5,
            'totalQuestions': 10,
            'correctAnswers': 4
        }
        
        # Mock wrong pool with 2 questions needing 3 additional tries total
        mock_wrong_answers = [
            {'remainingTries': 2},
            {'remainingTries': 1}
        ]
        
        with patch.object(self.service.db, 'query') as mock_query:
            mock_query.return_value = {'Items': mock_wrong_answers}
            
            with patch.object(self.service, '_get_session', return_value=mock_session):
                progress = self.service._calculate_progress('session-123', 'user-456', "(+1 Question @ 2 Tries)")
        
        assert progress.current_question == 5
        assert progress.total_questions == 10
        assert progress.correct_answers == 4
        assert progress.wrong_pool_size == 2
        assert progress.additional_questions == 3
        assert progress.penalty_text == "(+1 Question @ 2 Tries)"
        assert progress.completion_percentage == 50.0


class TestAdvancedAdaptiveLearning:
    """Tests for the enhanced adaptive learning algorithms"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.service = AdaptiveLearningService()
        
        # Mock performance data
        self.mock_performance = {
            'success_rate': 0.7,
            'average_time': 35.0,
            'difficulty_level': 0.6,
            'knowledge_state': 0.65,
            'confidence_score': 0.75,
            'total_attempts': 8
        }
        
        # Mock recent attempts for performance calculation
        self.mock_recent_attempts = [
            {'correctAttempts': 1, 'timeSpent': 30, 'lastAttemptAt': '2023-01-01T10:00:00Z'},
            {'correctAttempts': 0, 'timeSpent': 45, 'lastAttemptAt': '2023-01-01T10:01:00Z'},
            {'correctAttempts': 1, 'timeSpent': 25, 'lastAttemptAt': '2023-01-01T10:02:00Z'},
            {'correctAttempts': 1, 'timeSpent': 40, 'lastAttemptAt': '2023-01-01T10:03:00Z'},
            {'correctAttempts': 0, 'timeSpent': 50, 'lastAttemptAt': '2023-01-01T10:04:00Z'}
        ]
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_calculate_user_performance_with_data(self, mock_db):
        """Test user performance calculation with sufficient data"""
        
        # Mock recent attempts query
        mock_db.query.return_value = {'Items': self.mock_recent_attempts}
        
        # Mock difficulty level lookup
        mock_db.get_item.return_value = {'difficultyLevel': Decimal('0.6')}
        
        result = self.service._calculate_user_performance('test-user', 'test-session')
        
        assert result['success_rate'] == 0.6  # 3 correct out of 5
        assert result['average_time'] == 38.0  # (30+45+25+40+50)/5
        assert result['difficulty_level'] == 0.6
        assert 'knowledge_state' in result
        assert 'confidence_score' in result
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_calculate_user_performance_no_data(self, mock_db):
        """Test user performance calculation with no historical data"""
        
        # Mock empty recent attempts query
        mock_db.query.return_value = {'Items': []}
        
        result = self.service._calculate_user_performance('new-user', 'test-session')
        
        assert result['success_rate'] == 0.5
        assert result['average_time'] == 30.0
        assert result['difficulty_level'] == 0.5
        assert result['knowledge_state'] == 0.5
        assert result['confidence_score'] == 0.5
    
    def test_calculate_target_difficulty_increase(self):
        """Test difficulty adjustment when user is performing too well"""
        
        high_performance = {**self.mock_performance, 'success_rate': 0.9, 'difficulty_level': 0.5}
        
        target = self.service._calculate_target_difficulty(high_performance)
        
        # Should increase difficulty
        assert target > 0.5
        assert target <= self.service.max_difficulty
    
    def test_calculate_target_difficulty_decrease(self):
        """Test difficulty adjustment when user is struggling"""
        
        low_performance = {**self.mock_performance, 'success_rate': 0.4, 'difficulty_level': 0.7}
        
        target = self.service._calculate_target_difficulty(low_performance)
        
        # Should decrease difficulty
        assert target < 0.7
        assert target >= self.service.min_difficulty
    
    def test_calculate_target_difficulty_maintain(self):
        """Test difficulty maintenance when user is in target range"""
        
        target_performance = {**self.mock_performance, 'success_rate': 0.75, 'difficulty_level': 0.6}
        
        target = self.service._calculate_target_difficulty(target_performance)
        
        # Should maintain current difficulty
        assert target == 0.6
    
    def test_apply_spaced_repetition_algorithm(self):
        """Test spaced repetition algorithm for optimal question selection"""
        
        # Create mock wrong answers with different ages
        wrong_answers = [
            {
                'lastAttemptAt': (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
                'attempts': [{'timestamp': '2023-01-01T08:00:00Z'}],
                'questionId': 'q1'
            },
            {
                'lastAttemptAt': (datetime.now(timezone.utc) - timedelta(hours=8)).isoformat(),
                'attempts': [{'timestamp': '2023-01-01T02:00:00Z'}],
                'questionId': 'q2'
            },
            {
                'lastAttemptAt': (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat(),
                'attempts': [{'timestamp': '2022-12-31T09:00:00Z'}],
                'questionId': 'q3'
            }
        ]
        
        # Test with good performance (should prioritize harder spaced questions)
        good_performance = {'success_rate': 0.8}
        result = self.service._apply_spaced_repetition(wrong_answers, good_performance)
        
        assert result is not None
        assert result['questionId'] in ['q1', 'q2', 'q3']
        
        # Test with struggling performance (should prioritize easier recent questions)
        poor_performance = {'success_rate': 0.3}
        result = self.service._apply_spaced_repetition(wrong_answers, poor_performance)
        
        assert result is not None
    
    def test_select_adaptive_question_difficulty_matching(self):
        """Test adaptive question selection based on difficulty matching"""
        
        questions = [
            {'questionId': 'easy_q', 'difficulty': 0.2, 'category': 'basics'},
            {'questionId': 'medium_q', 'difficulty': 0.5, 'category': 'intermediate'},
            {'questionId': 'hard_q', 'difficulty': 0.8, 'category': 'advanced'}
        ]
        
        # Test selection for low-performing user (should get easier questions)
        low_performance = {'difficulty_level': 0.3, 'success_rate': 0.4}
        
        with patch.object(self.service, '_calculate_target_difficulty', return_value=0.3):
            with patch('random.uniform', return_value=1.0):  # No randomness
                result = self.service._select_adaptive_question(questions, low_performance, 'user-123')
        
        assert result == 'easy_q'
        
        # Test selection for high-performing user (should get harder questions)
        high_performance = {'difficulty_level': 0.7, 'success_rate': 0.9}
        
        with patch.object(self.service, '_calculate_target_difficulty', return_value=0.8):
            with patch('random.uniform', return_value=1.0):  # No randomness
                result = self.service._select_adaptive_question(questions, high_performance, 'user-123')
        
        assert result == 'hard_q'
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_update_user_difficulty_increase(self, mock_db):
        """Test increasing user difficulty level"""
        
        # Mock current difficulty
        mock_db.get_item.return_value = {'difficultyLevel': Decimal('0.5')}
        mock_db.put_item.return_value = {}
        
        self.service._update_user_difficulty('test-user', 'test-session', decrease=False)
        
        # Verify put_item was called with increased difficulty
        mock_db.put_item.assert_called()
        call_args = mock_db.put_item.call_args[1]
        
        # Should increase by difficulty_adjustment_factor (0.15)
        expected_difficulty = 0.5 + self.service.difficulty_adjustment_factor
        assert float(call_args['item']['difficultyLevel']) == expected_difficulty
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_update_user_difficulty_decrease(self, mock_db):
        """Test decreasing user difficulty level"""
        
        # Mock current difficulty
        mock_db.get_item.return_value = {'difficultyLevel': Decimal('0.7')}
        mock_db.put_item.return_value = {}
        
        self.service._update_user_difficulty('test-user', 'test-session', decrease=True)
        
        # Verify put_item was called with decreased difficulty
        mock_db.put_item.assert_called()
        call_args = mock_db.put_item.call_args[1]
        
        # Should decrease by difficulty_adjustment_factor * 0.5
        expected_difficulty = 0.7 - (self.service.difficulty_adjustment_factor * 0.5)
        assert float(call_args['item']['difficultyLevel']) == expected_difficulty
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_calculate_question_difficulty_from_attempts(self, mock_db):
        """Test question difficulty calculation from historical attempts"""
        
        # Mock historical attempts with 60% success rate
        mock_attempts = [
            {'correctAttempts': 1},  # correct
            {'correctAttempts': 0},  # incorrect
            {'correctAttempts': 1},  # correct
            {'correctAttempts': 1},  # correct
            {'correctAttempts': 0},  # incorrect
        ]
        
        mock_db.query.return_value = {'Items': mock_attempts}
        
        difficulty = self.service._calculate_question_difficulty('test-question')
        
        # 60% success rate should result in 40% difficulty (1.0 - 0.6)
        assert difficulty == 0.4
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_calculate_question_difficulty_insufficient_data(self, mock_db):
        """Test question difficulty calculation with insufficient data"""
        
        # Mock insufficient attempts (< 5)
        mock_attempts = [
            {'correctAttempts': 1},
            {'correctAttempts': 0}
        ]
        
        mock_db.query.return_value = {'Items': mock_attempts}
        
        difficulty = self.service._calculate_question_difficulty('test-question')
        
        # Should return default medium difficulty
        assert difficulty == 0.5
    
    def test_calculate_knowledge_state_high_performance(self):
        """Test knowledge state calculation for high-performing user"""
        
        high_performance_attempts = [
            {'correctAttempts': 1},
            {'correctAttempts': 1},
            {'correctAttempts': 1},
            {'correctAttempts': 1},
            {'correctAttempts': 0}  # Only one wrong
        ]
        
        knowledge_state = self.service._calculate_knowledge_state('user-123', high_performance_attempts)
        
        # Should result in high knowledge state (>0.7)
        assert knowledge_state > 0.7
        assert knowledge_state <= 1.0
    
    def test_calculate_knowledge_state_low_performance(self):
        """Test knowledge state calculation for low-performing user"""
        
        low_performance_attempts = [
            {'correctAttempts': 0},
            {'correctAttempts': 0},
            {'correctAttempts': 0},
            {'correctAttempts': 1},  # Only one correct
            {'correctAttempts': 0}
        ]
        
        knowledge_state = self.service._calculate_knowledge_state('user-123', low_performance_attempts)
        
        # Should result in low knowledge state (<0.4)
        assert knowledge_state < 0.4
        assert knowledge_state >= 0.0
    
    def test_calculate_confidence_score_consistent_performance(self):
        """Test confidence score calculation for consistent performance"""
        
        consistent_attempts = [
            {'correctAttempts': 1, 'timeSpent': 30},
            {'correctAttempts': 1, 'timeSpent': 32},
            {'correctAttempts': 1, 'timeSpent': 28},
            {'correctAttempts': 1, 'timeSpent': 31},
            {'correctAttempts': 1, 'timeSpent': 29}
        ]
        
        confidence = self.service._calculate_confidence_score(consistent_attempts)
        
        # Should result in high confidence (>0.7)
        assert confidence > 0.7
        assert confidence <= 1.0
    
    def test_calculate_confidence_score_inconsistent_performance(self):
        """Test confidence score calculation for inconsistent performance"""
        
        inconsistent_attempts = [
            {'correctAttempts': 1, 'timeSpent': 15},
            {'correctAttempts': 0, 'timeSpent': 90},
            {'correctAttempts': 1, 'timeSpent': 25},
            {'correctAttempts': 0, 'timeSpent': 120},
            {'correctAttempts': 1, 'timeSpent': 10}
        ]
        
        confidence = self.service._calculate_confidence_score(inconsistent_attempts)
        
        # Should result in lower confidence
        assert confidence < 0.6
        assert confidence >= 0.0
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_get_optimal_wrong_answer_with_spaced_repetition(self, mock_db):
        """Test optimal wrong answer selection using spaced repetition"""
        
        # Mock wrong answers query
        mock_wrong_answers = [
            {
                'lastAttemptAt': (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat(),
                'attempts': [{'timestamp': '2022-12-31T09:00:00Z'}],
                'questionId': 'old_question'
            },
            {
                'lastAttemptAt': (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
                'attempts': [{'timestamp': '2023-01-01T08:00:00Z'}],
                'questionId': 'recent_question'
            }
        ]
        
        mock_db.get_wrong_answers_sorted.return_value = mock_wrong_answers
        
        result = self.service._get_optimal_wrong_answer('test-user', self.mock_performance)
        
        assert result is not None
        assert result['questionId'] in ['old_question', 'recent_question']
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_get_questions_with_difficulty_metadata(self, mock_db):
        """Test getting questions with difficulty metadata"""
        
        question_ids = ['q1', 'q2', 'q3']
        
        # Mock question lookups
        def mock_get_question(qid):
            return {
                'questionId': qid,
                'difficulty': 0.5 if qid == 'q1' else None,  # q1 has difficulty, others don't
                'category': 'test',
                'avgResponseTime': 30
            }
        
        with patch.object(self.service, '_get_question', side_effect=mock_get_question):
            with patch.object(self.service, '_calculate_question_difficulty', return_value=0.6):
                result = self.service._get_questions_with_difficulty(question_ids)
        
        assert len(result) == 3
        assert result[0]['questionId'] == 'q1'
        assert result[0]['difficulty'] == 0.5  # Should use stored difficulty
        assert result[1]['difficulty'] == 0.6  # Should use calculated difficulty
        assert result[2]['difficulty'] == 0.6  # Should use calculated difficulty
    
    @patch('src.services.adaptive_learning_service.dynamodb_client')
    def test_full_adaptive_workflow(self, mock_db):
        """Test complete adaptive learning workflow"""
        
        # Mock session
        mock_session = {
            'questionPool': ['q1', 'q2', 'q3'],
            'answeredQuestions': ['q1'],
            'currentQuestion': 1,
            'totalQuestions': 3
        }
        
        # Mock user performance calculation
        mock_db.query.return_value = {'Items': self.mock_recent_attempts}
        mock_db.get_item.return_value = {'difficultyLevel': Decimal('0.6')}
        
        # Mock question with difficulty
        mock_question = {
            'questionId': 'q2',
            'question': 'Test question',
            'answers': [{'id': 'a1', 'text': 'Answer 1'}],
            'type': 'single_choice',
            'language': 'en',
            'difficulty': 0.7
        }
        
        # Mock question selection process
        with patch.object(self.service, '_get_session', return_value=mock_session):
            with patch.object(self.service, '_get_question', return_value=mock_question):
                with patch.object(self.service, '_select_adaptive_question', return_value='q2'):
                    with patch('random.random', return_value=0.5):  # Regular pool selection
                        
                        result = self.service.get_next_question('test-session', 'test-user')
        
        assert result is not None
        assert result.question_id == 'q2'
        assert result.is_from_wrong_pool is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])