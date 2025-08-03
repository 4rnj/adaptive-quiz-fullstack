"""
Integration Tests for DynamoDB Services
Tests the complete service layer with real DynamoDB operations
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from src.services.user_management_service import (
    UserManagementService, UserProfile, UserPreferences, UserStatus
)
from src.services.session_state_service import (
    SessionStateService, SessionState, SessionConfig, SessionSource, SessionStatus
)
from src.services.question_management_service import (
    QuestionManagementService, Question, QuestionType, QuestionStatus, Answer
)
from src.services.analytics_service import AnalyticsService, LearningMetrics
from src.utils.dynamodb_client import dynamodb_client, DynamoDBError, BatchWriteError


class TestUserManagementServiceIntegration:
    """Integration tests for user management service"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.service = UserManagementService()
        
        # Mock user data
        self.test_user_data = {
            'cognito_sub': 'test-cognito-sub-123',
            'email': 'test@example.com',
            'username': 'testuser',
            'full_name': 'Test User'
        }
    
    @patch('src.services.user_management_service.dynamodb_client')
    def test_create_user_profile_success(self, mock_db):
        """Test successful user profile creation"""
        
        # Mock database operations
        mock_db.put_item.return_value = True
        
        # Create user profile
        profile = self.service.create_user_profile(
            cognito_sub=self.test_user_data['cognito_sub'],
            email=self.test_user_data['email'],
            username=self.test_user_data['username'],
            full_name=self.test_user_data['full_name']
        )
        
        # Assertions
        assert profile is not None
        assert profile.email == self.test_user_data['email'].lower()
        assert profile.username == self.test_user_data['username']
        assert profile.status == UserStatus.PENDING_VERIFICATION
        assert profile.subscription_tier == 'free'
        assert profile.version == 0
        
        # Verify database call
        mock_db.put_item.assert_called_once()
        call_args = mock_db.put_item.call_args[1]
        assert call_args['table_name'] == self.service.users_table
        assert 'item' in call_args
    
    @patch('src.services.user_management_service.dynamodb_client')
    def test_get_user_profile_found(self, mock_db):
        """Test retrieving existing user profile"""
        
        # Mock database response
        mock_user_item = {
            'userId': 'user-123',
            'cognitoSub': 'cognito-sub-123',
            'email': 'test@example.com',
            'username': 'testuser',
            'status': 'ACTIVE',
            'preferences': {
                'language': 'en',
                'timezone': 'UTC',
                'difficulty_preference': 'adaptive',
                'session_duration_preference': 1800,
                'email_notifications': True,
                'study_reminders': True,
                'analytics_sharing': True,
                'accessibility_options': {
                    'high_contrast': False,
                    'large_text': False,
                    'screen_reader': False,
                    'keyboard_navigation': False
                }
            },
            'createdAt': '2023-01-01T00:00:00Z',
            'loginCount': 5,
            'emailVerified': True,
            'subscriptionTier': 'free',
            'totalQuestionsAnswered': 100,
            'averageAccuracy': Decimal('85.5'),
            'learningStreakDays': 7,
            'version': 2
        }
        
        mock_db.get_item.return_value = mock_user_item
        
        # Get user profile
        profile = self.service.get_user_profile('user-123')
        
        # Assertions
        assert profile is not None
        assert profile.user_id == 'user-123'
        assert profile.email == 'test@example.com'
        assert profile.status == UserStatus.ACTIVE
        assert profile.login_count == 5
        assert profile.average_accuracy == 85.5
        assert profile.version == 2
    
    @patch('src.services.user_management_service.dynamodb_client')
    def test_update_user_preferences_success(self, mock_db):
        """Test successful user preferences update"""
        
        # Mock current user
        mock_user_item = {
            'userId': 'user-123',
            'cognitoSub': 'cognito-sub-123',
            'email': 'test@example.com',
            'username': 'testuser',
            'status': 'ACTIVE',
            'preferences': {
                'language': 'en',
                'difficulty_preference': 'adaptive'
            },
            'createdAt': '2023-01-01T00:00:00Z',
            'version': 1
        }
        
        mock_db.get_item.return_value = mock_user_item
        mock_db.conditional_update.return_value = True
        
        # Update preferences
        preferences_update = {
            'language': 'es',
            'difficulty_preference': 'hard',
            'email_notifications': False
        }
        
        result = self.service.update_user_preferences('user-123', preferences_update)
        
        # Assertions
        assert result is True
        
        # Verify database calls
        mock_db.get_item.assert_called_once()
        mock_db.conditional_update.assert_called_once()
    
    @patch('src.services.user_management_service.dynamodb_client')
    def test_calculate_user_statistics(self, mock_db):
        """Test user statistics calculation"""
        
        # Mock progress data
        mock_progress_data = [
            {'correctAttempts': 1, 'timeSpent': 30},
            {'correctAttempts': 0, 'timeSpent': 45},
            {'correctAttempts': 1, 'timeSpent': 25},
            {'correctAttempts': 1, 'timeSpent': 35},
            {'correctAttempts': 0, 'timeSpent': 50}
        ]
        
        # Mock session data
        mock_session_data = [
            {
                'sessionId': 'sess-1',
                'createdAt': '2023-01-01T00:00:00Z',
                'progress': {'timeSpent': 1800}
            },
            {
                'sessionId': 'sess-2',
                'createdAt': '2023-01-02T00:00:00Z',
                'progress': {'timeSpent': 1200}
            }
        ]
        
        # Setup mocks
        mock_db.query.side_effect = [
            {'Items': mock_progress_data},  # Progress data call
            {'Items': mock_session_data}    # Session data call
        ]
        mock_db.conditional_update.return_value = True
        
        # Calculate statistics
        stats = self.service.update_user_statistics('user-123')
        
        # Assertions
        assert stats is not None
        assert stats.user_id == 'user-123'
        assert stats.total_sessions == 2
        assert stats.total_questions_answered == 5
        assert stats.total_correct_answers == 3
        assert stats.average_accuracy == 60.0
        assert stats.total_time_spent == 3000  # 1800 + 1200


class TestSessionStateServiceIntegration:
    """Integration tests for session state service"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.service = SessionStateService()
        
        # Mock session configuration
        self.test_config = SessionConfig(
            name="Test Session",
            sources=[
                SessionSource(
                    category="aws",
                    provider="amazon",
                    certificate="solutions-architect",
                    language="en",
                    question_count=10
                )
            ],
            settings={"wrongAnswerPoolEnabled": True},
            total_questions=10,
            estimated_duration=1800
        )
    
    @patch('src.services.session_state_service.dynamodb_client')
    def test_create_session_success(self, mock_db):
        """Test successful session creation"""
        
        # Mock question pool building
        mock_questions = [
            {'questionId': f'q-{i}', 'category': 'aws', 'language': 'en'}
            for i in range(1, 21)  # 20 questions available
        ]
        
        mock_db.query.return_value = {'Items': mock_questions}
        mock_db.put_item.return_value = True
        
        # Create session
        session = self.service.create_session('user-123', self.test_config)
        
        # Assertions
        assert session is not None
        assert session.user_id == 'user-123'
        assert session.config.name == "Test Session"
        assert session.status == SessionStatus.CREATED
        assert len(session.question_pool) == 10  # Limited to requested count
        assert session.progress.current_question == 0
        assert session.version == 0
        
        # Verify database calls
        mock_db.query.assert_called_once()  # Question pool building
        mock_db.put_item.assert_called_once()  # Session creation
    
    @patch('src.services.session_state_service.dynamodb_client')
    def test_update_session_progress_atomic(self, mock_db):
        """Test atomic session progress update"""
        
        # Mock current session
        mock_session_item = {
            'sessionId': 'sess-123',
            'userId': 'user-123',
            'status': 'ACTIVE',
            'version': 1,
            'config': {
                'name': 'Test Session',
                'sources': [{'category': 'aws', 'provider': 'amazon', 'certificate': 'sa', 'language': 'en', 'question_count': 10}],
                'settings': {},
                'total_questions': 10,
                'estimated_duration': 1800
            },
            'progress': {
                'current_question': 0,
                'answered_questions': [],
                'correct_answers': 0,
                'wrong_answers': 0,
                'time_spent': 0,
                'completion_percentage': 0.0
            },
            'questionPool': ['q1', 'q2', 'q3'],
            'createdAt': '2023-01-01T00:00:00Z',
            'updatedAt': '2023-01-01T00:00:00Z',
            'expiresAt': '2023-01-01T01:00:00Z'
        }
        
        mock_db.get_item.return_value = mock_session_item
        mock_db.conditional_update.return_value = True
        
        # Update progress
        progress_update = {
            'current_question': 1,
            'answered_questions': ['q1'],
            'correct_answers': 1,
            'time_spent': 45
        }
        
        result = self.service.update_session_progress_atomic(
            'sess-123', 'user-123', progress_update
        )
        
        # Assertions
        assert result is True
        
        # Verify database calls
        mock_db.get_item.assert_called_once()
        mock_db.conditional_update.assert_called_once()
        
        # Verify update expression contains version check
        call_args = mock_db.conditional_update.call_args[1]
        assert 'condition_expression' in call_args
    
    @patch('src.services.session_state_service.dynamodb_client')
    def test_start_session_success(self, mock_db):
        """Test starting a session"""
        
        # Mock session retrieval
        mock_session_item = {
            'sessionId': 'sess-123',
            'userId': 'user-123',
            'status': 'CREATED',
            'version': 0,
            'config': {
                'name': 'Test Session',
                'sources': [{'category': 'aws', 'provider': 'amazon', 'certificate': 'sa', 'language': 'en', 'question_count': 10}],
                'settings': {},
                'total_questions': 10,
                'estimated_duration': 1800
            },
            'progress': {
                'current_question': 0,
                'answered_questions': [],
                'correct_answers': 0,
                'wrong_answers': 0,
                'time_spent': 0,
                'completion_percentage': 0.0
            },
            'questionPool': ['q1', 'q2', 'q3'],
            'createdAt': '2023-01-01T00:00:00Z',
            'updatedAt': '2023-01-01T00:00:00Z',
            'expiresAt': '2023-01-01T01:00:00Z'
        }
        
        mock_db.get_item.return_value = mock_session_item
        mock_db.conditional_update.return_value = True
        
        # Start session
        session = self.service.start_session('sess-123', 'user-123')
        
        # Assertions
        assert session is not None
        assert session.status == SessionStatus.ACTIVE
        
        # Verify status update was called
        mock_db.conditional_update.assert_called_once()


class TestQuestionManagementServiceIntegration:
    """Integration tests for question management service"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.service = QuestionManagementService()
        
        # Mock question data
        self.test_question_data = {
            'category': 'aws',
            'provider': 'amazon',
            'certificate': 'solutions-architect',
            'language': 'en',
            'question': 'What is AWS Lambda?',
            'answers': [
                {'id': 'a1', 'text': 'Serverless compute', 'correct': True},
                {'id': 'a2', 'text': 'Database service', 'correct': False},
                {'id': 'a3', 'text': 'Storage service', 'correct': False}
            ],
            'explanation': 'AWS Lambda is a serverless compute service.',
            'type': 'single_choice',
            'difficulty': 3,
            'tags': ['compute', 'serverless']
        }
    
    @patch('src.services.question_management_service.dynamodb_client')
    def test_create_question_success(self, mock_db):
        """Test successful question creation"""
        
        mock_db.put_item.return_value = True
        
        # Create question
        question = self.service.create_question(self.test_question_data, 'admin-user')
        
        # Assertions
        assert question is not None
        assert question.category == 'aws'
        assert question.question == 'What is AWS Lambda?'
        assert len(question.answers) == 3
        assert len(question.correct_answers) == 1
        assert question.correct_answers[0] == 'a1'
        assert question.question_type == QuestionType.SINGLE_CHOICE
        assert question.status == QuestionStatus.DRAFT
        assert question.created_by == 'admin-user'
        
        # Verify database call
        mock_db.put_item.assert_called_once()
    
    @patch('src.services.question_management_service.dynamodb_client')
    def test_batch_import_questions_success(self, mock_db):
        """Test batch question import"""
        
        # Mock successful batch write
        mock_db.batch_write_items.return_value = {
            'successful': 3,
            'failed': 0,
            'unprocessed_items': []
        }
        
        # Prepare batch data
        questions_data = [
            {**self.test_question_data, 'question': f'Question {i}'}
            for i in range(1, 4)
        ]
        
        # Import questions
        results = self.service.batch_import_questions(questions_data, 'admin-user')
        
        # Assertions
        assert results['total'] == 3
        assert results['successful'] == 3
        assert results['failed'] == 0
        assert len(results['errors']) == 0
        
        # Verify batch write was called
        mock_db.batch_write_items.assert_called_once()
    
    @patch('src.services.question_management_service.dynamodb_client')
    def test_calculate_question_difficulty(self, mock_db):
        """Test question difficulty calculation"""
        
        # Mock performance data - 60% success rate
        mock_attempts = [
            {'correctAttempts': 1, 'timeSpent': 30},  # correct
            {'correctAttempts': 0, 'timeSpent': 45},  # incorrect
            {'correctAttempts': 1, 'timeSpent': 25},  # correct
            {'correctAttempts': 1, 'timeSpent': 35},  # correct
            {'correctAttempts': 0, 'timeSpent': 50},  # incorrect
            {'correctAttempts': 1, 'timeSpent': 40},  # correct
            {'correctAttempts': 0, 'timeSpent': 60},  # incorrect
            {'correctAttempts': 1, 'timeSpent': 30},  # correct
            {'correctAttempts': 1, 'timeSpent': 35},  # correct
            {'correctAttempts': 0, 'timeSpent': 55}   # incorrect
        ]
        
        mock_db.query.return_value = {'Items': mock_attempts}
        
        # Calculate difficulty
        difficulty = self.service.calculate_question_difficulty('q-123')
        
        # Assertions
        assert difficulty is not None
        assert 0.0 <= difficulty <= 1.0
        # 60% success rate should result in ~40% difficulty
        assert 0.3 <= difficulty <= 0.5
    
    @patch('src.services.question_management_service.dynamodb_client')
    def test_search_questions_with_criteria(self, mock_db):
        """Test question search with complex criteria"""
        
        # Mock search results
        mock_questions = [
            {
                'questionId': 'q-1',
                'category': 'aws#amazon#solutions-architect',
                'provider': 'amazon',
                'certificate': 'solutions-architect',
                'language': 'en',
                'question': 'AWS Question 1',
                'answers': [{'id': 'a1', 'text': 'Answer 1', 'correct': True}],
                'correctAnswers': ['a1'],
                'type': 'single_choice',
                'difficulty': 3,
                'status': 'ACTIVE',
                'tags': ['compute'],
                'createdAt': '2023-01-01T00:00:00Z',
                'updatedAt': '2023-01-01T00:00:00Z',
                'createdBy': 'admin'
            }
        ]
        
        mock_db.query.return_value = {'Items': mock_questions}
        
        # Search with criteria
        from src.services.question_management_service import QuestionSearchCriteria
        
        criteria = QuestionSearchCriteria(
            category='aws',
            provider='amazon',
            certificate='solutions-architect',
            language='en',
            difficulty_range=(2, 4),
            question_type=QuestionType.SINGLE_CHOICE,
            status=QuestionStatus.ACTIVE
        )
        
        questions = self.service.search_questions(criteria, limit=10)
        
        # Assertions
        assert len(questions) == 1
        assert questions[0].question_id == 'q-1'
        assert questions[0].category == 'aws'
        assert questions[0].question_type == QuestionType.SINGLE_CHOICE


class TestAnalyticsServiceIntegration:
    """Integration tests for analytics service"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.service = AnalyticsService()
    
    @patch('src.services.analytics_service.dynamodb_client')
    def test_process_user_analytics_with_data(self, mock_db):
        """Test processing user analytics with sufficient data"""
        
        # Mock progress data
        mock_progress_data = [
            {
                'userId': 'user-123',
                'questionId': 'q-1',
                'correctAttempts': 1,
                'timeSpent': 30,
                'lastAttemptAt': '2023-01-01T10:00:00Z',
                'category': 'aws'
            },
            {
                'userId': 'user-123',
                'questionId': 'q-2',
                'correctAttempts': 0,
                'timeSpent': 45,
                'lastAttemptAt': '2023-01-01T10:01:00Z',
                'category': 'aws'
            },
            {
                'userId': 'user-123',
                'questionId': 'q-3',
                'correctAttempts': 1,
                'timeSpent': 25,
                'lastAttemptAt': '2023-01-01T10:02:00Z',
                'category': 'gcp'
            }
        ] * 5  # 15 total attempts for sufficient data
        
        mock_db.query.return_value = {'Items': mock_progress_data}
        mock_db.put_item.return_value = True
        
        # Process analytics
        metrics = self.service.process_user_analytics('user-123')
        
        # Assertions
        assert metrics is not None
        assert metrics.user_id == 'user-123'
        assert metrics.total_questions_attempted == 15
        assert metrics.total_correct == 10  # 2/3 correct * 5 iterations
        assert metrics.accuracy_percentage == 66.67
        assert metrics.average_time_per_question == 33.33  # (30+45+25)/3
        assert len(metrics.weak_areas) >= 0
        assert len(metrics.strong_areas) >= 0
        
        # Verify analytics storage
        mock_db.put_item.assert_called_once()
    
    @patch('src.services.analytics_service.dynamodb_client')
    def test_generate_learning_recommendations(self, mock_db):
        """Test learning recommendations generation"""
        
        # Mock user with performance issues
        mock_progress_data = [
            {
                'correctAttempts': 0,  # Low accuracy user
                'timeSpent': 150,      # Slow user
                'lastAttemptAt': '2023-01-01T10:00:00Z',
                'category': 'aws'
            }
        ] * 12  # Sufficient data
        
        # Mock wrong pool data
        mock_wrong_answers = [
            {'remainingTries': 2},
            {'remainingTries': 1}
        ] * 6  # 12 wrong answers
        
        mock_db.query.side_effect = [
            {'Items': mock_progress_data},  # User progress
            {'Items': mock_wrong_answers}   # Wrong answers
        ]
        mock_db.put_item.return_value = True
        
        # Generate recommendations
        recommendations = self.service.generate_learning_recommendations('user-123')
        
        # Assertions
        assert len(recommendations) > 0
        
        # Should have accuracy improvement recommendation
        accuracy_rec = next((r for r in recommendations if r['type'] == 'improve_accuracy'), None)
        assert accuracy_rec is not None
        assert accuracy_rec['priority'] == 'high'
        
        # Should have speed improvement recommendation
        speed_rec = next((r for r in recommendations if r['type'] == 'improve_speed'), None)
        assert speed_rec is not None
        assert speed_rec['priority'] == 'medium'
        
        # Should have wrong answer review recommendation
        review_rec = next((r for r in recommendations if r['type'] == 'review_wrong_answers'), None)
        assert review_rec is not None
        assert review_rec['priority'] == 'high'


class TestServiceInteraction:
    """Test interactions between different services"""
    
    def setup_method(self):
        """Setup for interaction tests"""
        self.user_service = UserManagementService()
        self.session_service = SessionStateService()
        self.question_service = QuestionManagementService()
        self.analytics_service = AnalyticsService()
    
    @patch('src.services.user_management_service.dynamodb_client')
    @patch('src.services.session_state_service.dynamodb_client')
    @patch('src.services.analytics_service.dynamodb_client')
    def test_complete_user_session_workflow(self, mock_analytics_db, mock_session_db, mock_user_db):
        """Test complete workflow from user creation to session completion"""
        
        # Mock user creation
        mock_user_db.put_item.return_value = True
        
        # Mock session creation
        mock_questions = [{'questionId': f'q-{i}', 'category': 'aws'} for i in range(1, 11)]
        mock_session_db.query.return_value = {'Items': mock_questions}
        mock_session_db.put_item.return_value = True
        mock_session_db.get_item.return_value = {
            'sessionId': 'sess-123',
            'userId': 'user-123',
            'status': 'CREATED',
            'version': 0,
            'config': {
                'name': 'Test Session',
                'sources': [{'category': 'aws', 'provider': 'amazon', 'certificate': 'sa', 'language': 'en', 'question_count': 10}],
                'settings': {},
                'total_questions': 10,
                'estimated_duration': 1800
            },
            'progress': {
                'current_question': 0,
                'answered_questions': [],
                'correct_answers': 0,
                'wrong_answers': 0,
                'time_spent': 0,
                'completion_percentage': 0.0
            },
            'questionPool': [f'q-{i}' for i in range(1, 11)],
            'createdAt': '2023-01-01T00:00:00Z',
            'updatedAt': '2023-01-01T00:00:00Z',
            'expiresAt': '2023-01-01T01:00:00Z'
        }
        
        # Mock analytics processing
        mock_analytics_db.query.return_value = {'Items': []}
        mock_analytics_db.put_item.return_value = True
        
        # 1. Create user
        user_profile = self.user_service.create_user_profile(
            cognito_sub='test-sub',
            email='test@example.com',
            username='testuser'
        )
        
        # 2. Create session
        from src.services.session_state_service import SessionConfig, SessionSource
        
        config = SessionConfig(
            name="Integration Test Session",
            sources=[
                SessionSource(
                    category="aws",
                    provider="amazon", 
                    certificate="solutions-architect",
                    language="en",
                    question_count=10
                )
            ],
            settings={"wrongAnswerPoolEnabled": True},
            total_questions=10,
            estimated_duration=1800
        )
        
        session = self.session_service.create_session(user_profile.user_id, config)
        
        # 3. Process analytics (simulating session completion)
        metrics = self.analytics_service.process_user_analytics(user_profile.user_id)
        
        # Assertions
        assert user_profile.user_id is not None
        assert session.session_id is not None
        assert session.user_id == user_profile.user_id
        assert metrics.user_id == user_profile.user_id
        
        # Verify all services were called
        mock_user_db.put_item.assert_called()
        mock_session_db.put_item.assert_called()
        mock_analytics_db.put_item.assert_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])