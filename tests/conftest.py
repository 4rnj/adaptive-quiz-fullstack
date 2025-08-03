"""
Pytest Configuration and Fixtures
Shared test fixtures and configuration for the adaptive quiz backend test suite
"""

import pytest
import os
from unittest.mock import Mock, patch
from datetime import datetime, timezone, timedelta

# Set test environment variables
os.environ.update({
    'LOG_LEVEL': 'DEBUG',
    'AWS_DEFAULT_REGION': 'us-east-1',
    'USERS_TABLE': 'quiz-adaptive-learning-test-users',
    'QUESTIONS_TABLE': 'quiz-adaptive-learning-test-questions',
    'SESSIONS_TABLE': 'quiz-adaptive-learning-test-sessions',
    'PROGRESS_TABLE': 'quiz-adaptive-learning-test-progress',
    'WRONG_ANSWERS_TABLE': 'quiz-adaptive-learning-test-wrong-answers',
    'ANALYTICS_TABLE': 'quiz-adaptive-learning-test-analytics',
    'USER_POOL_ID': 'us-east-1_test12345',
    'USER_POOL_CLIENT_ID': 'test-client-id-12345',
    'JWT_SECRET': 'test-jwt-secret-key'
})


@pytest.fixture
def mock_lambda_context():
    """Mock AWS Lambda context"""
    context = Mock()
    context.aws_request_id = "test-request-12345"
    context.function_name = "test-function"
    context.function_version = "$LATEST"
    context.invoked_function_arn = "arn:aws:lambda:us-east-1:123456789012:function:test-function"
    context.memory_limit_in_mb = 512
    context.get_remaining_time_in_millis.return_value = 30000
    return context


@pytest.fixture
def mock_user():
    """Mock user data"""
    return {
        'userId': 'test-user-12345',
        'email': 'test@example.com',
        'firstName': 'John',
        'lastName': 'Doe',
        'preferredUsername': 'johndoe',
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'updatedAt': datetime.now(timezone.utc).isoformat(),
        'emailVerified': True,
        'accountStatus': 'ACTIVE',
        'preferences': {
            'theme': 'light',
            'language': 'en',
            'notifications': {
                'email': True,
                'push': False
            }
        },
        'statistics': {
            'totalSessions': 5,
            'totalQuestions': 150,
            'totalCorrectAnswers': 120,
            'averageScore': 80.0,
            'totalTimeSpent': 7200
        }
    }


@pytest.fixture
def mock_session():
    """Mock session data"""
    return {
        'sessionId': 'test-session-12345',
        'userId': 'test-user-12345',
        'name': 'AWS Solutions Architect Practice',
        'status': 'ACTIVE',
        'config': {
            'name': 'AWS Solutions Architect Practice',
            'totalQuestions': 50,
            'estimatedDuration': 3600,
            'settings': {
                'adaptiveLearning': True,
                'immediateRetry': True,
                'wrongAnswerPoolEnabled': True,
                'timeLimit': 3600,
                'randomizeQuestions': True,
                'randomizeAnswers': True,
                'showExplanations': True,
                'allowPause': True
            },
            'sources': [
                {
                    'category': 'aws',
                    'provider': 'official',
                    'certificate': 'solutions-architect-associate',
                    'language': 'en',
                    'questionCount': 50,
                    'difficultyFilter': 'intermediate'
                }
            ]
        },
        'progress': {
            'currentQuestion': 5,
            'answeredQuestions': ['q1', 'q2', 'q3', 'q4', 'q5'],
            'correctAnswers': 4,
            'wrongAnswers': 1,
            'timeSpent': 450,
            'completionPercentage': 10.0
        },
        'questionPool': ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'],
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'updatedAt': datetime.now(timezone.utc).isoformat(),
        'expiresAt': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        'version': 1
    }


@pytest.fixture
def mock_question():
    """Mock question data"""
    return {
        'questionId': 'q12345',
        'category': 'aws',
        'provider': 'official',
        'certificate': 'solutions-architect-associate',
        'question': 'What is AWS Lambda?',
        'type': 'single_choice',
        'language': 'en',
        'difficulty': 'intermediate',
        'answers': [
            {
                'id': 'a1',
                'text': 'A serverless compute service that runs code in response to events',
                'correct': True
            },
            {
                'id': 'a2',
                'text': 'A database service for storing structured data',
                'correct': False
            },
            {
                'id': 'a3',
                'text': 'A content delivery network service',
                'correct': False
            },
            {
                'id': 'a4',
                'text': 'A storage service for files and objects',
                'correct': False
            }
        ],
        'correctAnswers': ['a1'],
        'explanation': 'AWS Lambda is a serverless compute service that lets you run code without provisioning or managing servers.',
        'tags': ['serverless', 'compute', 'event-driven'],
        'estimatedTime': 120,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'updatedAt': datetime.now(timezone.utc).isoformat()
    }


@pytest.fixture
def mock_wrong_answer():
    """Mock wrong answer record"""
    return {
        'userId': 'test-user-12345',
        'timestamp': '2023-12-01T10:00:00Z',
        'questionId': 'q12345',
        'sessionId': 'test-session-12345',
        'remainingTries': 2,
        'lastAttemptAt': '2023-12-01T10:00:00Z',
        'attempts': [
            {
                'timestamp': '2023-12-01T10:00:00Z',
                'selectedAnswers': ['a2'],
                'correct': False,
                'timeSpent': 65
            }
        ],
        'shuffledAnswers': [
            {
                'id': 'a3',
                'text': 'A content delivery network service',
                'correct': False
            },
            {
                'id': 'a1',
                'text': 'A serverless compute service that runs code in response to events',
                'correct': True
            },
            {
                'id': 'a4',
                'text': 'A storage service for files and objects',
                'correct': False
            },
            {
                'id': 'a2',
                'text': 'A database service for storing structured data',
                'correct': False
            }
        ]
    }


@pytest.fixture
def mock_progress_record():
    """Mock progress tracking record"""
    return {
        'userId': 'test-user-12345',
        'questionId': 'q12345',
        'sessionId': 'test-session-12345',
        'attempts': 2,
        'correctAttempts': 1,
        'incorrectAttempts': 1,
        'firstSeenAt': '2023-12-01T09:45:00Z',
        'lastAttemptAt': '2023-12-01T10:15:00Z',
        'masteryLevel': 1,
        'timeSpent': 95,
        'averageResponseTime': 47.5,
        'difficultyRating': 'intermediate'
    }


@pytest.fixture
def mock_analytics_record():
    """Mock analytics record"""
    return {
        'analyticsId': 'test-user-12345#test-session-12345',
        'userId': 'test-user-12345',
        'sessionId': 'test-session-12345',
        'sessionName': 'AWS Solutions Architect Practice',
        'completedAt': '2023-12-01T11:30:00Z',
        'metrics': {
            'totalQuestions': 50,
            'answeredQuestions': 50,
            'correctAnswers': 42,
            'wrongAnswers': 8,
            'accuracy': 84.0,
            'completionRate': 100.0,
            'timeSpent': 2450,
            'averageTimePerQuestion': 49.0,
            'performanceRating': 'good',
            'categories': ['aws'],
            'sessionDuration': 2450,
            'efficiencyScore': 86.5
        },
        'processedAt': '2023-12-01T11:35:00Z',
        'ttl': int((datetime.now(timezone.utc) + timedelta(days=365)).timestamp())
    }


@pytest.fixture
def mock_jwt_token():
    """Mock JWT token for authentication testing"""
    return {
        'token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzNDUiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MzE2MjY4MDAsImV4cCI6MTYzMTYzMDQwMH0.test-signature',
        'payload': {
            'sub': 'test-user-12345',
            'email': 'test@example.com',
            'firstName': 'John',
            'lastName': 'Doe',
            'iat': 1631626800,
            'exp': 1631630400
        }
    }


@pytest.fixture
def mock_cognito_responses():
    """Mock Cognito service responses"""
    return {
        'create_user': {
            'User': {
                'Username': 'test-user-12345',
                'Attributes': [
                    {'Name': 'email', 'Value': 'test@example.com'},
                    {'Name': 'email_verified', 'Value': 'true'}
                ],
                'UserCreateDate': datetime.now(timezone.utc),
                'UserLastModifiedDate': datetime.now(timezone.utc),
                'Enabled': True,
                'UserStatus': 'CONFIRMED'
            }
        },
        'authenticate': {
            'AuthenticationResult': {
                'AccessToken': 'mock-access-token-12345',
                'IdToken': 'mock-id-token-12345',
                'RefreshToken': 'mock-refresh-token-12345',
                'ExpiresIn': 3600,
                'TokenType': 'Bearer'
            }
        },
        'refresh_token': {
            'AuthenticationResult': {
                'AccessToken': 'new-mock-access-token-12345',
                'IdToken': 'new-mock-id-token-12345',
                'ExpiresIn': 3600,
                'TokenType': 'Bearer'
            }
        }
    }


@pytest.fixture
def mock_dynamodb_responses():
    """Mock DynamoDB service responses"""
    return {
        'get_item': {
            'Item': {
                'userId': 'test-user-12345',
                'email': 'test@example.com',
                'firstName': 'John',
                'lastName': 'Doe'
            }
        },
        'put_item': {
            'ResponseMetadata': {
                'HTTPStatusCode': 200,
                'RequestId': 'test-request-id-12345'
            }
        },
        'update_item': {
            'Attributes': {
                'userId': 'test-user-12345',
                'updatedAt': datetime.now(timezone.utc).isoformat()
            },
            'ResponseMetadata': {
                'HTTPStatusCode': 200,
                'RequestId': 'test-request-id-12345'
            }
        },
        'query': {
            'Items': [],
            'Count': 0,
            'ScannedCount': 0,
            'ResponseMetadata': {
                'HTTPStatusCode': 200,
                'RequestId': 'test-request-id-12345'
            }
        },
        'batch_get_item': {
            'Responses': {
                'test-table': []
            },
            'UnprocessedKeys': {},
            'ResponseMetadata': {
                'HTTPStatusCode': 200,
                'RequestId': 'test-request-id-12345'
            }
        },
        'batch_write_item': {
            'UnprocessedItems': {},
            'ResponseMetadata': {
                'HTTPStatusCode': 200,
                'RequestId': 'test-request-id-12345'
            }
        }
    }


@pytest.fixture(autouse=True)
def mock_environment():
    """Automatically mock environment setup for all tests"""
    with patch.dict(os.environ, {
        'LOG_LEVEL': 'DEBUG',
        'AWS_DEFAULT_REGION': 'us-east-1',
        'USERS_TABLE': 'quiz-adaptive-learning-test-users',
        'QUESTIONS_TABLE': 'quiz-adaptive-learning-test-questions',
        'SESSIONS_TABLE': 'quiz-adaptive-learning-test-sessions',
        'PROGRESS_TABLE': 'quiz-adaptive-learning-test-progress',
        'WRONG_ANSWERS_TABLE': 'quiz-adaptive-learning-test-wrong-answers',
        'ANALYTICS_TABLE': 'quiz-adaptive-learning-test-analytics',
        'USER_POOL_ID': 'us-east-1_test12345',
        'USER_POOL_CLIENT_ID': 'test-client-id-12345',
        'JWT_SECRET': 'test-jwt-secret-key'
    }):
        yield


@pytest.fixture
def mock_lambda_event():
    """Mock Lambda event structure"""
    def _create_event(method='GET', path='/', body=None, headers=None, query_params=None, path_params=None):
        return {
            'httpMethod': method,
            'path': path,
            'pathParameters': path_params or {},
            'queryStringParameters': query_params,
            'headers': headers or {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer mock-jwt-token'
            },
            'body': body,
            'isBase64Encoded': False,
            'requestContext': {
                'requestId': 'test-request-12345',
                'stage': 'test',
                'httpMethod': method,
                'path': path,
                'accountId': '123456789012',
                'resourceId': 'test-resource',
                'apiId': 'test-api-id'
            }
        }
    return _create_event


# Test database fixtures for integration testing
@pytest.fixture
def test_db_items():
    """Test database items for integration tests"""
    return {
        'users': [
            {
                'userId': 'test-user-1',
                'email': 'user1@test.com',
                'firstName': 'User',
                'lastName': 'One'
            },
            {
                'userId': 'test-user-2',
                'email': 'user2@test.com',
                'firstName': 'User',
                'lastName': 'Two'
            }
        ],
        'questions': [
            {
                'questionId': 'q1',
                'category': 'aws',
                'question': 'What is EC2?',
                'type': 'single_choice',
                'correctAnswers': ['a1']
            },
            {
                'questionId': 'q2',
                'category': 'aws',
                'question': 'What is S3?',
                'type': 'single_choice',
                'correctAnswers': ['a1']
            }
        ],
        'sessions': [
            {
                'sessionId': 'session-1',
                'userId': 'test-user-1',
                'status': 'ACTIVE',
                'totalQuestions': 10,
                'currentQuestion': 3
            }
        ]
    }


# Performance testing fixtures
@pytest.fixture
def performance_timer():
    """Performance timing fixture for benchmarking tests"""
    import time
    
    class Timer:
        def __init__(self):
            self.start_time = None
            self.end_time = None
        
        def start(self):
            self.start_time = time.time()
        
        def stop(self):
            self.end_time = time.time()
        
        @property
        def elapsed_ms(self):
            if self.start_time and self.end_time:
                return (self.end_time - self.start_time) * 1000
            return None
    
    return Timer()


# Error simulation fixtures
@pytest.fixture
def mock_errors():
    """Mock error conditions for testing error handling"""
    from botocore.exceptions import ClientError
    
    return {
        'throttling': ClientError(
            {'Error': {'Code': 'ThrottlingException', 'Message': 'Rate exceeded'}},
            'TestOperation'
        ),
        'validation': ClientError(
            {'Error': {'Code': 'ValidationException', 'Message': 'Invalid input'}},
            'TestOperation'
        ),
        'not_found': ClientError(
            {'Error': {'Code': 'ResourceNotFoundException', 'Message': 'Not found'}},
            'TestOperation'
        ),
        'conditional_check_failed': ClientError(
            {'Error': {'Code': 'ConditionalCheckFailedException', 'Message': 'Condition failed'}},
            'TestOperation'
        )
    }


# Cleanup fixture
@pytest.fixture(autouse=True)
def cleanup_singletons():
    """Clean up singleton instances after each test"""
    yield
    
    # Reset DynamoDB client singleton
    from src.utils.dynamodb_client import OptimizedDynamoDBClient
    OptimizedDynamoDBClient._instance = None
    OptimizedDynamoDBClient._initialized = False