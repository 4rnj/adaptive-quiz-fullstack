"""
Test Suite for Lambda Handlers
Comprehensive tests for authentication, session, quiz, and analytics handlers
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone

from src.handlers import auth, session, quiz, analytics
from src.utils.error_handler import ValidationError, AuthenticationError, SessionError
from src.services.session_state_service import SessionStatus


class TestAuthHandlers:
    
    def setup_method(self):
        """Setup for each test method"""
        self.mock_context = Mock()
        self.mock_context.aws_request_id = "test-request-123"
    
    @patch('src.handlers.auth.cognito_client')
    @patch('src.handlers.auth.dynamodb_client')
    def test_register_success(self, mock_db, mock_cognito):
        """Test successful user registration"""
        
        # Mock request
        event = {
            'body': json.dumps({
                'email': 'test@example.com',
                'password': 'SecurePass123!',
                'firstName': 'John',
                'lastName': 'Doe',
                'preferredUsername': 'johndoe'
            })
        }
        
        # Mock Cognito responses
        mock_cognito.admin_create_user.return_value = {
            'User': {'Username': 'user-sub-123'}
        }
        mock_cognito.admin_set_user_password.return_value = {}
        
        # Mock user existence check
        mock_cognito.admin_get_user.side_effect = Exception("UserNotFoundException")
        
        # Mock DynamoDB operations
        mock_db.put_item.return_value = {}
        
        # Mock JWT generation
        with patch('src.handlers.auth.generate_jwt_token', return_value='mock-jwt-token'):
            response = auth.register(event, self.mock_context)
        
        # Verify response
        assert response['statusCode'] == 201
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert 'user' in response_body['data']
        assert 'token' in response_body['data']
        assert response_body['data']['user']['email'] == 'test@example.com'
    
    @patch('src.handlers.auth.cognito_client')
    def test_register_user_exists(self, mock_cognito):
        """Test registration with existing user"""
        
        event = {
            'body': json.dumps({
                'email': 'existing@example.com',
                'password': 'SecurePass123!',
                'firstName': 'Jane',
                'lastName': 'Doe'
            })
        }
        
        # Mock existing user
        mock_cognito.admin_get_user.return_value = {'User': 'exists'}
        
        response = auth.register(event, self.mock_context)
        
        assert response['statusCode'] == 400
        response_body = json.loads(response['body'])
        assert response_body['success'] is False
        assert 'already exists' in response_body['error']['message']
    
    def test_register_invalid_email(self):
        """Test registration with invalid email"""
        
        event = {
            'body': json.dumps({
                'email': 'invalid-email',
                'password': 'SecurePass123!',
                'firstName': 'John',
                'lastName': 'Doe'
            })
        }
        
        response = auth.register(event, self.mock_context)
        
        assert response['statusCode'] == 400
        response_body = json.loads(response['body'])
        assert 'Invalid email format' in response_body['error']['message']
    
    def test_register_weak_password(self):
        """Test registration with weak password"""
        
        event = {
            'body': json.dumps({
                'email': 'test@example.com',
                'password': 'weak',
                'firstName': 'John',
                'lastName': 'Doe'
            })
        }
        
        response = auth.register(event, self.mock_context)
        
        assert response['statusCode'] == 400
        response_body = json.loads(response['body'])
        assert 'Password must be at least 8 characters' in response_body['error']['message']
    
    @patch('src.handlers.auth.cognito_client')
    @patch('src.handlers.auth.dynamodb_client')
    def test_login_success(self, mock_db, mock_cognito):
        """Test successful login"""
        
        event = {
            'body': json.dumps({
                'email': 'test@example.com',
                'password': 'SecurePass123!'
            })
        }
        
        # Mock Cognito authentication
        mock_cognito.admin_initiate_auth.return_value = {
            'AuthenticationResult': {
                'IdToken': 'mock-id-token',
                'AccessToken': 'mock-access-token',
                'RefreshToken': 'mock-refresh-token'
            }
        }
        
        # Mock JWT validation
        with patch('src.handlers.auth.validate_jwt_token', return_value={'sub': 'user-123'}):
            # Mock user profile lookup
            mock_db.get_item.return_value = {
                'userId': 'user-123',
                'email': 'test@example.com',
                'firstName': 'John',
                'lastName': 'Doe'
            }
            mock_db.update_item.return_value = {}
            
            response = auth.login(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert 'user' in response_body['data']
        assert 'tokens' in response_body['data']
    
    @patch('src.handlers.auth.cognito_client')
    def test_login_invalid_credentials(self, mock_cognito):
        """Test login with invalid credentials"""
        
        event = {
            'body': json.dumps({
                'email': 'test@example.com',
                'password': 'wrong-password'
            })
        }
        
        from botocore.exceptions import ClientError
        mock_cognito.admin_initiate_auth.side_effect = ClientError(
            {'Error': {'Code': 'NotAuthorizedException'}}, 'AdminInitiateAuth'
        )
        
        response = auth.login(event, self.mock_context)
        
        assert response['statusCode'] == 401
        response_body = json.loads(response['body'])
        assert 'Invalid email or password' in response_body['error']['message']


class TestSessionHandlers:
    
    def setup_method(self):
        """Setup for each test method"""
        self.mock_context = Mock()
        self.mock_context.aws_request_id = "test-request-123"
        
        self.mock_session_state = Mock()
        self.mock_session_state.session_id = 'session-123'
        self.mock_session_state.user_id = 'user-456'
        self.mock_session_state.status = SessionStatus.ACTIVE
        self.mock_session_state.config.name = 'Test Session'
        self.mock_session_state.config.total_questions = 50
        self.mock_session_state.config.estimated_duration = 3600
        self.mock_session_state.config.settings = {'adaptiveLearning': True}
        self.mock_session_state.config.sources = []
        self.mock_session_state.progress.current_question = 5
        self.mock_session_state.progress.answered_questions = ['q1', 'q2', 'q3', 'q4', 'q5']
        self.mock_session_state.progress.correct_answers = 4
        self.mock_session_state.progress.wrong_answers = 1
        self.mock_session_state.progress.completion_percentage = 10.0
        self.mock_session_state.progress.time_spent = 300
        self.mock_session_state.created_at = datetime.now(timezone.utc).isoformat()
        self.mock_session_state.updated_at = datetime.now(timezone.utc).isoformat()
        self.mock_session_state.expires_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    
    @patch('src.handlers.session.session_state_service')
    @patch('src.handlers.session.extract_user_from_token')
    def test_create_session_success(self, mock_extract_user, mock_service):
        """Test successful session creation"""
        
        event = {
            'body': json.dumps({
                'name': 'AWS Practice Test',
                'sources': [{
                    'category': 'aws',
                    'provider': 'official',
                    'certificate': 'solutions-architect-associate',
                    'language': 'en',
                    'questionCount': 50,
                    'difficultyFilter': 'intermediate'
                }],
                'settings': {
                    'adaptiveLearning': True,
                    'timeLimit': 3600
                }
            })
        }
        
        mock_extract_user.return_value = 'user-456'
        mock_service.create_session.return_value = self.mock_session_state
        
        response = session.create_session_handler(event, self.mock_context)
        
        assert response['statusCode'] == 201
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['sessionId'] == 'session-123'
        assert response_body['data']['name'] == 'Test Session'
    
    @patch('src.handlers.session.extract_user_from_token')
    def test_create_session_missing_name(self, mock_extract_user):
        """Test session creation with missing name"""
        
        event = {
            'body': json.dumps({
                'sources': [{
                    'category': 'aws',
                    'provider': 'official',
                    'certificate': 'solutions-architect-associate',
                    'language': 'en',
                    'questionCount': 50
                }]
            })
        }
        
        mock_extract_user.return_value = 'user-456'
        
        response = session.create_session_handler(event, self.mock_context)
        
        assert response['statusCode'] == 400
        response_body = json.loads(response['body'])
        assert 'Session name is required' in response_body['error']['message']
    
    @patch('src.handlers.session.session_state_service')
    @patch('src.handlers.session.extract_user_from_token')
    def test_get_session_success(self, mock_extract_user, mock_service):
        """Test successful session retrieval"""
        
        event = {
            'pathParameters': {'sessionId': 'session-123'}
        }
        
        mock_extract_user.return_value = 'user-456'
        mock_service.get_session.return_value = self.mock_session_state
        
        with patch('src.handlers.session._get_wrong_pool_statistics', return_value={'total_count': 2, 'additional_questions': 3}):
            response = session.get_session_handler(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['sessionId'] == 'session-123'
        assert response_body['data']['wrongAnswersPool'] == 2
        assert response_body['data']['additionalQuestions'] == 3
    
    @patch('src.handlers.session.session_state_service')
    @patch('src.handlers.session.extract_user_from_token')
    def test_get_session_not_found(self, mock_extract_user, mock_service):
        """Test session retrieval when session doesn't exist"""
        
        event = {
            'pathParameters': {'sessionId': 'nonexistent-session'}
        }
        
        mock_extract_user.return_value = 'user-456'
        mock_service.get_session.return_value = None
        
        response = session.get_session_handler(event, self.mock_context)
        
        assert response['statusCode'] == 404
        response_body = json.loads(response['body'])
        assert 'not found' in response_body['error']['message']


class TestQuizHandlers:
    
    def setup_method(self):
        """Setup for each test method"""
        self.mock_context = Mock()
        self.mock_context.aws_request_id = "test-request-123"
        
        self.mock_question_response = Mock()
        self.mock_question_response.question_id = 'q123'
        self.mock_question_response.text = 'What is AWS Lambda?'
        self.mock_question_response.answers = [
            {'id': 'a1', 'text': 'Serverless compute', 'correct': True},
            {'id': 'a2', 'text': 'Database service', 'correct': False}
        ]
        self.mock_question_response.question_type = 'single_choice'
        self.mock_question_response.language = 'en'
        self.mock_question_response.is_from_wrong_pool = False
        self.mock_question_response.remaining_tries = None
        self.mock_question_response.shuffled = False
    
    @patch('src.handlers.quiz.adaptive_learning_service')
    @patch('src.handlers.quiz.session_state_service')
    @patch('src.handlers.quiz.extract_user_from_token')
    def test_next_question_success(self, mock_extract_user, mock_session_service, mock_learning_service):
        """Test successful next question retrieval"""
        
        event = {
            'pathParameters': {'sessionId': 'session-123'}
        }
        
        mock_extract_user.return_value = 'user-456'
        
        # Mock session state
        mock_session_state = Mock()
        mock_session_state.session_id = 'session-123'
        mock_session_state.status = SessionStatus.ACTIVE
        mock_session_state.config.name = 'Test Session'
        mock_session_state.config.total_questions = 50
        mock_session_state.config.settings = {'adaptiveLearning': True}
        mock_session_state.progress.current_question = 5
        mock_session_state.progress.answered_questions = ['q1', 'q2']
        mock_session_state.progress.correct_answers = 2
        mock_session_state.progress.wrong_answers = 0
        mock_session_state.progress.completion_percentage = 10.0
        mock_session_state.progress.time_spent = 300
        
        mock_session_service.get_session.return_value = mock_session_state
        mock_learning_service.get_next_question.return_value = self.mock_question_response
        
        with patch('src.handlers.quiz._get_wrong_pool_statistics', return_value={'total_count': 0, 'additional_questions': 0}):
            response = quiz.next_question_handler(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['question']['questionId'] == 'q123'
        assert response_body['data']['progress']['currentQuestion'] == 6  # current + 1
    
    @patch('src.handlers.quiz.adaptive_learning_service')
    @patch('src.handlers.quiz.session_state_service')
    @patch('src.handlers.quiz.extract_user_from_token')
    def test_next_question_session_complete(self, mock_extract_user, mock_session_service, mock_learning_service):
        """Test next question when session is complete"""
        
        event = {
            'pathParameters': {'sessionId': 'session-123'}
        }
        
        mock_extract_user.return_value = 'user-456'
        
        # Mock completed session state
        mock_session_state = Mock()
        mock_session_state.session_id = 'session-123'
        mock_session_state.status = SessionStatus.ACTIVE
        mock_session_state.config.total_questions = 50
        mock_session_state.progress.current_question = 50
        mock_session_state.progress.correct_answers = 45
        mock_session_state.progress.time_spent = 3600
        
        mock_session_service.get_session.return_value = mock_session_state
        mock_session_service.update_session.return_value = mock_session_state
        mock_learning_service.get_next_question.return_value = None  # No more questions
        
        response = quiz.next_question_handler(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['sessionComplete'] is True
        assert 'progress' in response_body['data']
    
    @patch('src.handlers.quiz.adaptive_learning_service')
    @patch('src.handlers.quiz.session_state_service')
    @patch('src.handlers.quiz.extract_user_from_token')
    def test_submit_answer_correct(self, mock_extract_user, mock_session_service, mock_learning_service):
        """Test submitting a correct answer"""
        
        event = {
            'pathParameters': {'sessionId': 'session-123'},
            'body': json.dumps({
                'questionId': 'q123',
                'selectedAnswers': ['a1'],
                'timeSpent': 45
            })
        }
        
        mock_extract_user.return_value = 'user-456'
        
        # Mock session state
        mock_session_state = Mock()
        mock_session_state.session_id = 'session-123'
        mock_session_state.status = SessionStatus.ACTIVE
        
        mock_session_service.get_session.return_value = mock_session_state
        mock_session_service.update_session_time.return_value = None
        
        # Mock answer result
        from src.services.adaptive_learning_service import NextAction, ProgressIndicator, AnswerResult
        
        mock_progress = ProgressIndicator(
            current_question=6,
            total_questions=50,
            additional_questions=0,
            correct_answers=3,
            wrong_pool_size=0,
            completion_percentage=12.0
        )
        
        mock_answer_result = AnswerResult(
            correct=True,
            next_action=NextAction.NEXT_QUESTION,
            progress=mock_progress,
            explanation="AWS Lambda is a serverless compute service."
        )
        
        mock_learning_service.process_answer.return_value = mock_answer_result
        
        response = quiz.submit_answer_handler(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['correct'] is True
        assert response_body['data']['nextAction'] == 'NEXT_QUESTION'
        assert 'explanation' in response_body['data']
    
    @patch('src.handlers.quiz.adaptive_learning_service')
    @patch('src.handlers.quiz.session_state_service')
    @patch('src.handlers.quiz.extract_user_from_token')
    def test_submit_answer_incorrect_retry(self, mock_extract_user, mock_session_service, mock_learning_service):
        """Test submitting an incorrect answer with immediate retry"""
        
        event = {
            'pathParameters': {'sessionId': 'session-123'},
            'body': json.dumps({
                'questionId': 'q123',
                'selectedAnswers': ['a2'],
                'timeSpent': 65
            })
        }
        
        mock_extract_user.return_value = 'user-456'
        
        # Mock session state
        mock_session_state = Mock()
        mock_session_state.session_id = 'session-123'
        mock_session_state.status = SessionStatus.ACTIVE
        
        mock_session_service.get_session.return_value = mock_session_state
        mock_session_service.update_session_time.return_value = None
        
        # Mock answer result with retry
        from src.services.adaptive_learning_service import NextAction, ProgressIndicator, AnswerResult, QuestionResponse
        
        mock_progress = ProgressIndicator(
            current_question=5,
            total_questions=50,
            additional_questions=2,
            correct_answers=2,
            wrong_pool_size=1,
            penalty_text="(+1 Question @ 2 Tries)",
            completion_percentage=10.0
        )
        
        mock_retry_question = Mock()
        mock_retry_question.question_id = 'q123'
        mock_retry_question.text = 'What is AWS Lambda?'
        mock_retry_question.answers = [
            {'id': 'a3', 'text': 'Storage service', 'correct': False},
            {'id': 'a1', 'text': 'Serverless compute', 'correct': True},
            {'id': 'a2', 'text': 'Database service', 'correct': False}
        ]
        mock_retry_question.question_type = 'single_choice'
        mock_retry_question.language = 'en'
        mock_retry_question.shuffled = True
        
        mock_answer_result = AnswerResult(
            correct=False,
            next_action=NextAction.RETRY_SAME_QUESTION,
            progress=mock_progress,
            question=mock_retry_question,
            message="Incorrect. Try again with the shuffled answers."
        )
        
        mock_learning_service.process_answer.return_value = mock_answer_result
        
        response = quiz.submit_answer_handler(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['correct'] is False
        assert response_body['data']['nextAction'] == 'RETRY_SAME_QUESTION'
        assert 'retryQuestion' in response_body['data']
        assert response_body['data']['retryQuestion']['shuffled'] is True
    
    def test_submit_answer_invalid_input(self):
        """Test submitting answer with invalid input"""
        
        event = {
            'pathParameters': {'sessionId': 'session-123'},
            'body': json.dumps({
                'questionId': '',  # Empty question ID
                'selectedAnswers': ['a1'],
                'timeSpent': 45
            })
        }
        
        with patch('src.handlers.quiz.extract_user_from_token', return_value='user-456'):
            response = quiz.submit_answer_handler(event, self.mock_context)
        
        assert response['statusCode'] == 400
        response_body = json.loads(response['body'])
        assert 'Question ID is required' in response_body['error']['message']


class TestAnalyticsHandlers:
    
    def setup_method(self):
        """Setup for each test method"""
        self.mock_context = Mock()
        self.mock_context.aws_request_id = "test-request-123"
    
    @patch('src.handlers.analytics.session_state_service')
    @patch('src.handlers.analytics.extract_user_from_token')
    def test_session_analytics_success(self, mock_extract_user, mock_session_service):
        """Test successful session analytics retrieval"""
        
        event = {
            'pathParameters': {'sessionId': 'session-123'}
        }
        
        mock_extract_user.return_value = 'user-456'
        
        # Mock session state
        mock_session_state = Mock()
        mock_session_state.session_id = 'session-123'
        mock_session_state.config.name = 'Test Session'
        mock_session_state.status = SessionStatus.COMPLETED
        mock_session_state.config.total_questions = 50
        mock_session_state.progress.answered_questions = ['q1', 'q2', 'q3']
        mock_session_state.progress.correct_answers = 2
        mock_session_state.progress.wrong_answers = 1
        mock_session_state.progress.time_spent = 300
        mock_session_state.config.estimated_duration = 3600
        
        mock_session_service.get_session.return_value = mock_session_state
        
        with patch('src.handlers.analytics._get_question_performance', return_value=[]):
            with patch('src.handlers.analytics._get_learning_insights', return_value={}):
                with patch('src.handlers.analytics._get_wrong_answer_analysis', return_value={}):
                    with patch('src.handlers.analytics._get_time_analytics', return_value={}):
                        response = analytics.session_analytics_handler(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['sessionId'] == 'session-123'
        assert 'metrics' in response_body['data']
        assert 'questionPerformance' in response_body['data']
    
    @patch('src.handlers.analytics.extract_user_from_token')
    def test_user_analytics_success(self, mock_extract_user):
        """Test successful user analytics retrieval"""
        
        event = {
            'pathParameters': {'userId': 'user-456'},
            'queryStringParameters': {
                'timeframe': '30d',
                'includeDetails': 'true'
            }
        }
        
        mock_extract_user.return_value = 'user-456'
        
        # Mock all analytics functions
        with patch('src.handlers.analytics._get_user_profile', return_value={'firstName': 'John', 'lastName': 'Doe'}):
            with patch('src.handlers.analytics._calculate_user_overall_metrics', return_value={}):
                with patch('src.handlers.analytics._get_user_learning_progression', return_value=[]):
                    with patch('src.handlers.analytics._get_category_performance', return_value=[]):
                        with patch('src.handlers.analytics._get_strengths_weaknesses_analysis', return_value={}):
                            with patch('src.handlers.analytics._get_recent_activity', return_value=[]):
                                with patch('src.handlers.analytics._get_session_history', return_value=[]):
                                    response = analytics.user_analytics_handler(event, self.mock_context)
        
        assert response['statusCode'] == 200
        response_body = json.loads(response['body'])
        assert response_body['success'] is True
        assert response_body['data']['userId'] == 'user-456'
        assert response_body['data']['timeframe'] == '30d'
        assert 'detailedAnalytics' in response_body['data']  # includeDetails=true
    
    @patch('src.handlers.analytics.extract_user_from_token')
    def test_user_analytics_access_denied(self, mock_extract_user):
        """Test user analytics access denied for different user"""
        
        event = {
            'pathParameters': {'userId': 'other-user-789'}
        }
        
        mock_extract_user.return_value = 'user-456'  # Different user
        
        response = analytics.user_analytics_handler(event, self.mock_context)
        
        assert response['statusCode'] == 403
        response_body = json.loads(response['body'])
        assert 'Access denied' in response_body['error']['message']


if __name__ == "__main__":
    pytest.main([__file__, "-v"])