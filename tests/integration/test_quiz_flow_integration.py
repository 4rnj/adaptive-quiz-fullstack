"""
Integration tests for complete quiz flow
Tests the end-to-end adaptive learning flow with real-like data
"""

import pytest
import json
import time
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from src.services.adaptive_learning_service import AdaptiveLearningService, NextAction
from src.services.session_state_service import SessionStateService, SessionConfig, SessionSource, SessionStatus
from src.handlers.quiz_handler import get_current_question, submit_answer
from src.handlers.session_handler import create_session, start_session

class TestQuizFlowIntegration:
    """Integration tests for complete quiz flow"""
    
    @pytest.fixture
    def mock_dynamodb_responses(self):
        """Mock DynamoDB responses for integration testing"""
        
        # Mock questions data
        questions_data = {
            'q1': {
                'questionId': 'q1',
                'category': 'programming#python#pcap',
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
            },
            'q2': {
                'questionId': 'q2',
                'category': 'programming#python#pcap',
                'question': 'Which keyword is used to define a function in Python?',
                'type': 'SINGLE_CHOICE',
                'language': 'EN',
                'answers': [
                    {'id': 'a1', 'text': 'function'},
                    {'id': 'a2', 'text': 'def'},
                    {'id': 'a3', 'text': 'define'},
                    {'id': 'a4', 'text': 'func'}
                ],
                'correctAnswers': ['a2']
            },
            'q3': {
                'questionId': 'q3',
                'category': 'programming#python#pcap',
                'question': 'Which of the following are mutable data types? (Select all)',
                'type': 'MULTIPLE_CHOICE',
                'language': 'EN',
                'answers': [
                    {'id': 'a1', 'text': 'list'},
                    {'id': 'a2', 'text': 'tuple'},
                    {'id': 'a3', 'text': 'dict'},
                    {'id': 'a4', 'text': 'string'}
                ],
                'correctAnswers': ['a1', 'a3']
            }
        }
        
        return {
            'questions': questions_data,
            'sessions': {},
            'progress': {},
            'wrong_answers': {}
        }
    
    @pytest.fixture
    def session_config(self):
        """Sample session configuration"""
        return SessionConfig(
            name="Python PCAP Practice",
            sources=[
                SessionSource(
                    category="programming",
                    provider="python",
                    certificate="pcap",
                    language="EN",
                    question_count=3
                )
            ],
            settings={
                'randomizeQuestions': True,
                'adaptiveLearning': True,
                'wrongAnswerPercentage': 20
            },
            total_questions=3,
            estimated_duration=360  # 6 minutes
        )
    
    @pytest.fixture
    def mock_cognito_event(self):
        """Mock API Gateway event with Cognito authentication"""
        return {
            'requestContext': {
                'authorizer': {
                    'claims': {
                        'sub': 'test-user-123',
                        'email': 'test@example.com'
                    }
                }
            },
            'headers': {
                'Authorization': 'Bearer mock-jwt-token'
            }
        }
    
    @pytest.fixture
    def mock_lambda_context(self):
        """Mock Lambda context"""
        context = Mock()
        context.aws_request_id = 'test-request-123'
        context.function_name = 'test-function'
        return context
    
    def test_complete_quiz_flow_all_correct(self, mock_dynamodb_responses, session_config, 
                                          mock_cognito_event, mock_lambda_context):
        """Test complete quiz flow where user answers all questions correctly on first try"""
        
        with patch('src.utils.dynamodb_client.dynamodb_client') as mock_db:
            # Setup mock responses
            self._setup_mock_db_responses(mock_db, mock_dynamodb_responses)
            
            # Create session
            create_event = {
                **mock_cognito_event,
                'body': json.dumps({
                    'name': session_config.name,
                    'sources': [
                        {
                            'category': source.category,
                            'provider': source.provider,
                            'certificate': source.certificate,
                            'language': source.language,
                            'questionCount': source.question_count
                        } for source in session_config.sources
                    ],
                    'settings': session_config.settings
                })
            }
            
            session_response = create_session(create_event, mock_lambda_context)
            assert session_response['statusCode'] == 201
            
            session_data = json.loads(session_response['body'])
            session_id = session_data['sessionId']
            
            # Start session
            start_event = {
                **mock_cognito_event,
                'pathParameters': {'sessionId': session_id}
            }
            
            start_response = start_session(start_event, mock_lambda_context)
            assert start_response['statusCode'] == 200
            
            # Answer all questions correctly
            for i, (question_id, question_data) in enumerate(mock_dynamodb_responses['questions'].items()):
                # Get question
                question_event = {
                    **mock_cognito_event,
                    'pathParameters': {'sessionId': session_id}
                }
                
                question_response = get_current_question(question_event, mock_lambda_context)
                assert question_response['statusCode'] == 200
                
                question_resp_data = json.loads(question_response['body'])
                
                if 'sessionComplete' in question_resp_data:
                    break
                
                # Submit correct answer
                answer_event = {
                    **mock_cognito_event,
                    'pathParameters': {'sessionId': session_id},
                    'body': json.dumps({
                        'questionId': question_data['questionId'],
                        'selectedAnswers': question_data['correctAnswers'],
                        'timeSpent': 60
                    })
                }
                
                answer_response = submit_answer(answer_event, mock_lambda_context)
                assert answer_response['statusCode'] == 200
                
                answer_resp_data = json.loads(answer_response['body'])
                assert answer_resp_data['correct'] is True
                assert answer_resp_data['nextAction'] == 'NEXT_QUESTION'
                
                # Verify no penalty indicators for correct answers
                assert 'penaltyIndicator' not in answer_resp_data
    
    def test_quiz_flow_with_wrong_answers_and_retries(self, mock_dynamodb_responses, 
                                                    session_config, mock_cognito_event, 
                                                    mock_lambda_context):
        """Test quiz flow with wrong answers requiring immediate retries"""
        
        with patch('src.utils.dynamodb_client.dynamodb_client') as mock_db:
            # Setup mock responses
            self._setup_mock_db_responses(mock_db, mock_dynamodb_responses)
            
            # Simulate session creation and start (simplified)
            session_id = 'test-session-123'
            
            # Test question 1: Get wrong, then correct on retry
            question_id = 'q1'
            question_data = mock_dynamodb_responses['questions'][question_id]
            
            # Submit wrong answer first
            wrong_answer_event = {
                **mock_cognito_event,
                'pathParameters': {'sessionId': session_id},
                'body': json.dumps({
                    'questionId': question_id,
                    'selectedAnswers': ['a1'],  # Wrong answer
                    'timeSpent': 45
                })
            }
            
            with patch('src.services.adaptive_learning_service.adaptive_learning_service') as mock_service:
                # Mock wrong answer response
                mock_service.process_answer.return_value = Mock(
                    correct=False,
                    next_action=NextAction.RETRY_SAME_QUESTION,
                    progress=Mock(
                        current_question=1,
                        total_questions=3,
                        additional_questions=1,
                        correct_answers=0,
                        wrong_pool_size=1,
                        penalty_text="(+1 Question @ 2 Tries)",
                        completion_percentage=0.0
                    ),
                    question=Mock(
                        question_id=question_id,
                        text=question_data['question'],
                        answers=[  # Shuffled answers
                            {'id': 'a3', 'text': '9'},
                            {'id': 'a1', 'text': '6'},
                            {'id': 'a4', 'text': '16'},
                            {'id': 'a2', 'text': '8'}
                        ],
                        question_type='SINGLE_CHOICE',
                        language='EN',
                        shuffled=True
                    ),
                    message="Incorrect. Try again with the shuffled answers."
                )
                
                wrong_response = submit_answer(wrong_answer_event, mock_lambda_context)
                assert wrong_response['statusCode'] == 200
                
                wrong_resp_data = json.loads(wrong_response['body'])
                assert wrong_resp_data['correct'] is False
                assert wrong_resp_data['nextAction'] == 'RETRY_SAME_QUESTION'
                assert wrong_resp_data['penaltyIndicator'] == "(+1 Question @ 2 Tries)"
                assert 'question' in wrong_resp_data
                assert wrong_resp_data['question']['shuffled'] is True
            
            # Submit correct answer on retry
            correct_answer_event = {
                **mock_cognito_event,
                'pathParameters': {'sessionId': session_id},
                'body': json.dumps({
                    'questionId': question_id,
                    'selectedAnswers': ['a2'],  # Correct answer
                    'timeSpent': 30
                })
            }
            
            with patch('src.services.adaptive_learning_service.adaptive_learning_service') as mock_service:
                # Mock correct answer after wrong response
                mock_service.process_answer.return_value = Mock(
                    correct=True,
                    next_action=NextAction.NEXT_QUESTION,
                    progress=Mock(
                        current_question=2,
                        total_questions=3,
                        additional_questions=1,
                        correct_answers=1,
                        wrong_pool_size=1,
                        penalty_text="(+1 Question @ 1 Try)",
                        completion_percentage=33.3
                    ),
                    explanation="The ** operator performs exponentiation in Python."
                )
                
                correct_response = submit_answer(correct_answer_event, mock_lambda_context)
                assert correct_response['statusCode'] == 200
                
                correct_resp_data = json.loads(correct_response['body'])
                assert correct_resp_data['correct'] is True
                assert correct_resp_data['nextAction'] == 'NEXT_QUESTION'
                assert correct_resp_data['penaltyIndicator'] == "(+1 Question @ 1 Try)"
    
    def test_quiz_flow_with_wrong_pool_question_selection(self, mock_dynamodb_responses,
                                                        mock_cognito_event, mock_lambda_context):
        """Test quiz flow with questions selected from wrong answer pool"""
        
        session_id = 'test-session-123'
        user_id = 'test-user-123'
        
        with patch('src.services.adaptive_learning_service.adaptive_learning_service') as mock_service:
            # Mock getting question from wrong pool (20% chance triggered)
            mock_service.get_next_question.return_value = Mock(
                question_id='q1',
                text='What is the output of print(2 ** 3)?',
                answers=[  # Pre-shuffled from wrong pool
                    {'id': 'a4', 'text': '16'},
                    {'id': 'a2', 'text': '8'},
                    {'id': 'a1', 'text': '6'},
                    {'id': 'a3', 'text': '9'}
                ],
                question_type='SINGLE_CHOICE',
                language='EN',
                is_from_wrong_pool=True,
                remaining_tries=1,
                shuffled=True
            )
            
            question_event = {
                **mock_cognito_event,
                'pathParameters': {'sessionId': session_id}
            }
            
            question_response = get_current_question(question_event, mock_lambda_context)
            assert question_response['statusCode'] == 200
            
            question_data = json.loads(question_response['body'])
            assert question_data['question']['isFromWrongPool'] is True
            assert question_data['question']['remainingTries'] == 1
            assert question_data['question']['shuffled'] is True
            assert question_data['penaltyIndicator'] is not None
    
    def test_multiple_choice_question_handling(self, mock_dynamodb_responses,
                                             mock_cognito_event, mock_lambda_context):
        """Test handling of multiple choice questions"""
        
        session_id = 'test-session-123'
        question_data = mock_dynamodb_responses['questions']['q3']  # Multiple choice
        
        with patch('src.services.adaptive_learning_service.adaptive_learning_service') as mock_service:
            # Test partial correct answer (should be wrong)
            mock_service.process_answer.return_value = Mock(
                correct=False,
                next_action=NextAction.RETRY_SAME_QUESTION,
                progress=Mock(
                    current_question=1,
                    total_questions=3,
                    additional_questions=1,
                    correct_answers=0,
                    wrong_pool_size=1,
                    completion_percentage=0.0
                ),
                question=Mock(
                    question_id='q3',
                    text=question_data['question'],
                    answers=question_data['answers'],  # Shuffled
                    question_type='MULTIPLE_CHOICE',
                    language='EN',
                    shuffled=True
                ),
                message="Incorrect. Try again with the shuffled answers."
            )
            
            # Submit only one of the correct answers
            partial_answer_event = {
                **mock_cognito_event,
                'pathParameters': {'sessionId': session_id},
                'body': json.dumps({
                    'questionId': 'q3',
                    'selectedAnswers': ['a1'],  # Missing 'a3'
                    'timeSpent': 90
                })
            }
            
            response = submit_answer(partial_answer_event, mock_lambda_context)
            assert response['statusCode'] == 200
            
            resp_data = json.loads(response['body'])
            assert resp_data['correct'] is False
            assert resp_data['nextAction'] == 'RETRY_SAME_QUESTION'
    
    def test_session_completion_handling(self, mock_cognito_event, mock_lambda_context):
        """Test session completion when all questions are answered"""
        
        session_id = 'test-session-123'
        
        with patch('src.services.adaptive_learning_service.adaptive_learning_service') as mock_service:
            # Mock session completion
            mock_service.get_next_question.return_value = None
            
            with patch('src.services.session_state_service.session_state_service') as mock_session_service:
                mock_session_service.complete_session.return_value = Mock()
                
                question_event = {
                    **mock_cognito_event,
                    'pathParameters': {'sessionId': session_id}
                }
                
                response = get_current_question(question_event, mock_lambda_context)
                assert response['statusCode'] == 200
                
                resp_data = json.loads(response['body'])
                assert resp_data['sessionComplete'] is True
                assert 'progress' in resp_data
                assert resp_data['progress']['completionPercentage'] == 100.0
    
    def test_error_handling_invalid_session(self, mock_cognito_event, mock_lambda_context):
        """Test error handling for invalid session"""
        
        with patch('src.services.session_state_service.session_state_service') as mock_service:
            mock_service.get_session.return_value = None
            
            question_event = {
                **mock_cognito_event,
                'pathParameters': {'sessionId': 'invalid-session-id'}
            }
            
            response = get_current_question(question_event, mock_lambda_context)
            assert response['statusCode'] == 404
            
            resp_data = json.loads(response['body'])
            assert resp_data['error'] == 'SESSION_NOT_FOUND'
    
    def test_error_handling_invalid_question_id(self, mock_cognito_event, mock_lambda_context):
        """Test error handling for invalid question ID"""
        
        session_id = 'test-session-123'
        
        with patch('src.services.adaptive_learning_service.adaptive_learning_service') as mock_service:
            from src.utils.error_handler import AdaptiveLearningError
            mock_service.process_answer.side_effect = AdaptiveLearningError("Question invalid-question not found")
            
            answer_event = {
                **mock_cognito_event,
                'pathParameters': {'sessionId': session_id},
                'body': json.dumps({
                    'questionId': 'invalid-question',
                    'selectedAnswers': ['a1'],
                    'timeSpent': 60
                })
            }
            
            response = submit_answer(answer_event, mock_lambda_context)
            assert response['statusCode'] == 422
            
            resp_data = json.loads(response['body'])
            assert resp_data['error'] == 'ADAPTIVE_LEARNING_ERROR'
    
    def _setup_mock_db_responses(self, mock_db, mock_data):
        """Setup mock DynamoDB responses"""
        
        def mock_get_item(table_name, key):
            if 'questions' in table_name:
                question_id = key.get('questionId')
                return mock_data['questions'].get(question_id)
            elif 'sessions' in table_name:
                session_id = key.get('sessionId')
                return mock_data['sessions'].get(session_id)
            return None
        
        def mock_query(table_name, key_condition, **kwargs):
            # Simplified mock for query operations
            return {'Items': []}
        
        def mock_put_item(table_name, item):
            if 'sessions' in table_name:
                mock_data['sessions'][item['sessionId']] = item
            return True
        
        mock_db.get_item.side_effect = mock_get_item
        mock_db.query.side_effect = mock_query
        mock_db.put_item.side_effect = mock_put_item
        mock_db.update_item.return_value = True
        mock_db.conditional_update.return_value = True

if __name__ == '__main__':
    pytest.main([__file__])