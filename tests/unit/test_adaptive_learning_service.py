"""
Unit tests for Adaptive Learning Service
Tests immediate re-asking logic, answer shuffling, and wrong answer pool management
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone
from decimal import Decimal

from src.services.adaptive_learning_service import (
    AdaptiveLearningService, NextAction, QuestionResponse, AnswerResult, ProgressIndicator
)
from src.utils.error_handler import AdaptiveLearningError, ValidationError

class TestAdaptiveLearningService:
    
    @pytest.fixture
    def service(self):
        """Create service instance with mocked dependencies"""
        with patch('src.services.adaptive_learning_service.dynamodb_client') as mock_db:
            service = AdaptiveLearningService()
            service.db = mock_db
            return service
    
    @pytest.fixture
    def mock_session(self):
        """Mock session data"""
        return {
            'sessionId': 'test-session-id',
            'userId': 'test-user-id',
            'questionPool': ['q1', 'q2', 'q3', 'q4', 'q5'],
            'answeredQuestions': ['q1', 'q2'],
            'currentQuestion': 2,
            'totalQuestions': 5,
            'correctAnswers': 1,
            'status': 'ACTIVE',
            'version': 1
        }
    
    @pytest.fixture
    def mock_question(self):
        """Mock question data"""
        return {
            'questionId': 'q3',
            'question': 'What is the output of print(2 ** 3)?',
            'type': 'SINGLE_CHOICE',
            'language': 'EN',
            'answers': [
                {'id': 'a1', 'text': '6'},
                {'id': 'a2', 'text': '8'},
                {'id': 'a3', 'text': '9'},
                {'id': 'a4', 'text': '16'}
            ],
            'correctAnswers': ['a2'],
            'explanation': 'The ** operator performs exponentiation in Python.'
        }
    
    def test_get_next_question_regular_flow(self, service, mock_session, mock_question):
        """Test getting next question from regular pool"""
        # Mock dependencies
        service._get_session = Mock(return_value=mock_session)
        service._is_session_complete = Mock(return_value=False)
        service._should_select_from_wrong_pool = Mock(return_value=False)
        service._get_next_regular_question = Mock(return_value=QuestionResponse(
            question_id='q3',
            text=mock_question['question'],
            answers=mock_question['answers'],
            question_type='SINGLE_CHOICE',
            language='EN',
            is_from_wrong_pool=False
        ))
        
        result = service.get_next_question('test-session-id', 'test-user-id')
        
        assert result is not None
        assert result.question_id == 'q3'
        assert result.is_from_wrong_pool is False
        assert len(result.answers) == 4
        service._get_session.assert_called_once_with('test-session-id', 'test-user-id')
    
    def test_get_next_question_from_wrong_pool(self, service, mock_session):
        """Test getting question from wrong answer pool"""
        # Mock wrong answer data
        mock_wrong_answer = {
            'userId': 'test-user-id',
            'questionId': 'q1',
            'remainingTries': 2,
            'timestamp': '2024-01-01T10:00:00Z',
            'shuffledAnswers': [
                {'id': 'a2', 'text': 'Answer 2'},
                {'id': 'a1', 'text': 'Answer 1'},
                {'id': 'a4', 'text': 'Answer 4'},
                {'id': 'a3', 'text': 'Answer 3'}
            ]
        }
        
        service._get_session = Mock(return_value=mock_session)
        service._is_session_complete = Mock(return_value=False)
        service._should_select_from_wrong_pool = Mock(return_value=True)
        service._get_oldest_wrong_answer = Mock(return_value=mock_wrong_answer)
        service._prepare_wrong_pool_question = Mock(return_value=QuestionResponse(
            question_id='q1',
            text='Test question',
            answers=mock_wrong_answer['shuffledAnswers'],
            question_type='SINGLE_CHOICE',
            language='EN',
            is_from_wrong_pool=True,
            remaining_tries=2,
            shuffled=True
        ))
        
        result = service.get_next_question('test-session-id', 'test-user-id')
        
        assert result is not None
        assert result.question_id == 'q1'
        assert result.is_from_wrong_pool is True
        assert result.remaining_tries == 2
        assert result.shuffled is True
    
    def test_process_correct_answer_first_attempt(self, service, mock_question):
        """Test processing correct answer on first attempt"""
        service._get_question = Mock(return_value=mock_question)
        service._validate_answer = Mock(return_value=True)
        service._update_progress_tracking = Mock()
        service._get_wrong_answer_record = Mock(return_value=None)
        service._update_session_progress = Mock()
        service._calculate_progress = Mock(return_value=ProgressIndicator(
            current_question=3,
            total_questions=5,
            additional_questions=0,
            correct_answers=2,
            wrong_pool_size=0,
            completion_percentage=60.0
        ))
        
        result = service.process_answer(
            'test-session-id', 'test-user-id', 'q3', ['a2'], 45
        )
        
        assert result.correct is True
        assert result.next_action == NextAction.NEXT_QUESTION
        assert result.progress.correct_answers == 2
        service._update_progress_tracking.assert_called_once()
        service._update_session_progress.assert_called_once()
    
    def test_process_wrong_answer_immediate_retry(self, service, mock_question):
        """Test processing wrong answer with immediate retry"""
        # Mock shuffled answers
        shuffled_answers = [
            {'id': 'a3', 'text': '9'},
            {'id': 'a1', 'text': '6'},
            {'id': 'a4', 'text': '16'},
            {'id': 'a2', 'text': '8'}
        ]
        
        service._get_question = Mock(return_value=mock_question)
        service._validate_answer = Mock(return_value=False)
        service._update_progress_tracking = Mock()
        service._get_wrong_answer_record = Mock(return_value=None)
        service._add_to_wrong_pool = Mock()
        service._shuffle_answers = Mock(return_value=shuffled_answers)
        service._calculate_progress = Mock(return_value=ProgressIndicator(
            current_question=2,
            total_questions=5,
            additional_questions=1,
            correct_answers=1,
            wrong_pool_size=1,
            penalty_text="(+1 Question @ 2 Tries)",
            completion_percentage=40.0
        ))
        
        result = service.process_answer(
            'test-session-id', 'test-user-id', 'q3', ['a1'], 60
        )
        
        assert result.correct is False
        assert result.next_action == NextAction.RETRY_SAME_QUESTION
        assert result.question is not None
        assert result.question.shuffled is True
        assert result.message == "Incorrect. Try again with the shuffled answers."
        service._add_to_wrong_pool.assert_called_once()
        service._shuffle_answers.assert_called_once()
    
    def test_process_correct_answer_from_wrong_pool(self, service, mock_question):
        """Test processing correct answer for question from wrong pool"""
        mock_wrong_answer = {
            'userId': 'test-user-id',
            'questionId': 'q3',
            'remainingTries': 2,
            'timestamp': '2024-01-01T10:00:00Z'
        }
        
        service._get_question = Mock(return_value=mock_question)
        service._validate_answer = Mock(return_value=True)
        service._update_progress_tracking = Mock()
        service._get_wrong_answer_record = Mock(return_value=mock_wrong_answer)
        service._update_wrong_answer_tries = Mock()
        service._update_session_progress = Mock()
        service._calculate_progress = Mock(return_value=ProgressIndicator(
            current_question=3,
            total_questions=5,
            additional_questions=1,
            correct_answers=2,
            wrong_pool_size=1,
            penalty_text="(+1 Question @ 1 Try)",
            completion_percentage=60.0
        ))
        
        result = service.process_answer(
            'test-session-id', 'test-user-id', 'q3', ['a2'], 50
        )
        
        assert result.correct is True
        assert result.next_action == NextAction.NEXT_QUESTION
        service._update_wrong_answer_tries.assert_called_once_with(
            'test-user-id', '2024-01-01T10:00:00Z', 1
        )
    
    def test_process_wrong_answer_from_wrong_pool_reset(self, service, mock_question):
        """Test processing wrong answer for question already in wrong pool (reset)"""
        mock_wrong_answer = {
            'userId': 'test-user-id',
            'questionId': 'q3',
            'remainingTries': 1,
            'timestamp': '2024-01-01T10:00:00Z'
        }
        
        service._get_question = Mock(return_value=mock_question)
        service._validate_answer = Mock(return_value=False)
        service._update_progress_tracking = Mock()
        service._get_wrong_answer_record = Mock(return_value=mock_wrong_answer)
        service._reset_wrong_answer_tries = Mock()
        service._shuffle_answers = Mock(return_value=mock_question['answers'])
        service._calculate_progress = Mock(return_value=ProgressIndicator(
            current_question=2,
            total_questions=5,
            additional_questions=1,
            correct_answers=1,
            wrong_pool_size=1,
            penalty_text="(+1 Question @ 2 Tries)",
            completion_percentage=40.0
        ))
        
        result = service.process_answer(
            'test-session-id', 'test-user-id', 'q3', ['a1'], 75
        )
        
        assert result.correct is False
        assert result.next_action == NextAction.RETRY_SAME_QUESTION
        service._reset_wrong_answer_tries.assert_called_once_with(
            'test-user-id', '2024-01-01T10:00:00Z'
        )
    
    def test_shuffle_answers_preserves_structure(self, service):
        """Test that answer shuffling preserves answer structure"""
        original_answers = [
            {'id': 'a1', 'text': 'Answer 1'},
            {'id': 'a2', 'text': 'Answer 2'},
            {'id': 'a3', 'text': 'Answer 3'},
            {'id': 'a4', 'text': 'Answer 4'}
        ]
        
        shuffled = service._shuffle_answers(original_answers)
        
        # Check that all answers are present
        assert len(shuffled) == len(original_answers)
        
        # Check that all original answer IDs are present
        original_ids = {ans['id'] for ans in original_answers}
        shuffled_ids = {ans['id'] for ans in shuffled}
        assert original_ids == shuffled_ids
        
        # Check that structure is preserved
        for answer in shuffled:
            assert 'id' in answer
            assert 'text' in answer
    
    def test_validate_answer_single_choice_correct(self, service):
        """Test answer validation for single choice question - correct"""
        question = {
            'type': 'SINGLE_CHOICE',
            'correctAnswers': ['a2']
        }
        
        result = service._validate_answer(question, ['a2'])
        assert result is True
    
    def test_validate_answer_single_choice_incorrect(self, service):
        """Test answer validation for single choice question - incorrect"""
        question = {
            'type': 'SINGLE_CHOICE',
            'correctAnswers': ['a2']
        }
        
        result = service._validate_answer(question, ['a1'])
        assert result is False
    
    def test_validate_answer_multiple_choice_correct(self, service):
        """Test answer validation for multiple choice question - correct"""
        question = {
            'type': 'MULTIPLE_CHOICE',
            'correctAnswers': ['a1', 'a3']
        }
        
        result = service._validate_answer(question, ['a1', 'a3'])
        assert result is True
        
        # Order shouldn't matter
        result = service._validate_answer(question, ['a3', 'a1'])
        assert result is True
    
    def test_validate_answer_multiple_choice_incorrect(self, service):
        """Test answer validation for multiple choice question - incorrect"""
        question = {
            'type': 'MULTIPLE_CHOICE',
            'correctAnswers': ['a1', 'a3']
        }
        
        # Missing an answer
        result = service._validate_answer(question, ['a1'])
        assert result is False
        
        # Extra answer
        result = service._validate_answer(question, ['a1', 'a2', 'a3'])
        assert result is False
        
        # Wrong answers
        result = service._validate_answer(question, ['a2', 'a4'])
        assert result is False
    
    def test_should_select_from_wrong_pool_percentage(self, service):
        """Test that wrong pool selection respects 20% probability"""
        # Mock random to always return values that should trigger wrong pool selection
        with patch('src.services.adaptive_learning_service.random.random') as mock_random:
            mock_random.return_value = 0.1  # Below 0.2 threshold
            assert service._should_select_from_wrong_pool() is True
            
            mock_random.return_value = 0.3  # Above 0.2 threshold
            assert service._should_select_from_wrong_pool() is False
    
    def test_session_not_found_error(self, service):
        """Test error handling when session is not found"""
        service._get_session = Mock(return_value=None)
        
        with pytest.raises(AdaptiveLearningError) as exc_info:
            service.get_next_question('nonexistent-session', 'test-user-id')
        
        assert "Session nonexistent-session not found" in str(exc_info.value)
    
    def test_question_not_found_error(self, service):
        """Test error handling when question is not found"""
        service._get_question = Mock(return_value=None)
        
        with pytest.raises(AdaptiveLearningError) as exc_info:
            service.process_answer(
                'test-session-id', 'test-user-id', 'nonexistent-question', ['a1'], 60
            )
        
        assert "Question nonexistent-question not found" in str(exc_info.value)
    
    def test_session_complete_detection(self, service):
        """Test detection of completed session"""
        completed_session = {
            'sessionId': 'test-session-id',
            'userId': 'test-user-id',
            'questionPool': ['q1', 'q2', 'q3'],
            'currentQuestion': 3,  # All questions answered
            'totalQuestions': 3,
            'status': 'ACTIVE'
        }
        
        assert service._is_session_complete(completed_session) is True
        
        incomplete_session = {
            'sessionId': 'test-session-id',
            'userId': 'test-user-id',
            'questionPool': ['q1', 'q2', 'q3'],
            'currentQuestion': 1,  # Still has questions
            'totalQuestions': 3,
            'status': 'ACTIVE'
        }
        
        assert service._is_session_complete(incomplete_session) is False

class TestProgressIndicator:
    
    def test_progress_indicator_creation(self):
        """Test ProgressIndicator creation and attributes"""
        progress = ProgressIndicator(
            current_question=5,
            total_questions=10,
            additional_questions=2,
            correct_answers=3,
            wrong_pool_size=2,
            penalty_text="(+2 Questions @ 1 Try)",
            completion_percentage=50.0
        )
        
        assert progress.current_question == 5
        assert progress.total_questions == 10
        assert progress.additional_questions == 2
        assert progress.correct_answers == 3
        assert progress.wrong_pool_size == 2
        assert progress.penalty_text == "(+2 Questions @ 1 Try)"
        assert progress.completion_percentage == 50.0

class TestQuestionResponse:
    
    def test_question_response_creation(self):
        """Test QuestionResponse creation and attributes"""
        answers = [
            {'id': 'a1', 'text': 'Answer 1'},
            {'id': 'a2', 'text': 'Answer 2'}
        ]
        
        response = QuestionResponse(
            question_id='q123',
            text='Test question?',
            answers=answers,
            question_type='SINGLE_CHOICE',
            language='EN',
            is_from_wrong_pool=True,
            remaining_tries=1,
            shuffled=True
        )
        
        assert response.question_id == 'q123'
        assert response.text == 'Test question?'
        assert response.answers == answers
        assert response.question_type == 'SINGLE_CHOICE'
        assert response.language == 'EN'
        assert response.is_from_wrong_pool is True
        assert response.remaining_tries == 1
        assert response.shuffled is True

if __name__ == '__main__':
    pytest.main([__file__])