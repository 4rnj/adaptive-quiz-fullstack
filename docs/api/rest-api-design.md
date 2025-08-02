# REST API Design

## API Overview

Base URL: `https://api.quiz.example.com/v1`

Authentication: AWS Cognito JWT tokens in Authorization header

## Endpoints

### Authentication Endpoints

#### POST /auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "username": "johndoe",
  "preferredLanguage": "EN"
}
```

**Response (201):**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "username": "johndoe",
  "emailVerificationRequired": true
}
```

#### POST /auth/login
Authenticate user and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

### Question Management Endpoints

#### GET /questions/categories
Get available quiz categories with metadata.

**Response (200):**
```json
{
  "categories": [
    {
      "id": "programming",
      "name": "Programming",
      "providers": [
        {
          "id": "python",
          "name": "Python Institute",
          "certificates": [
            {
              "id": "pcap",
              "name": "PCAP - Certified Associate in Python Programming",
              "languages": ["EN", "DE"],
              "questionCount": {
                "EN": 450,
                "DE": 380
              }
            }
          ]
        }
      ]
    }
  ]
}
```

#### GET /questions/search
Search questions with filters.

**Query Parameters:**
- `category`: Category ID
- `provider`: Provider ID
- `certificate`: Certificate ID
- `language`: Language code (EN, DE)
- `difficulty`: Difficulty level (1-5)
- `limit`: Results per page (default: 20)
- `offset`: Pagination offset

**Response (200):**
```json
{
  "questions": [
    {
      "questionId": "q-550e8400-e29b-41d4",
      "category": "programming#python#pcap",
      "question": "What is the output of print(2 ** 3)?",
      "type": "SINGLE_CHOICE",
      "difficulty": 1,
      "language": "EN"
    }
  ],
  "total": 450,
  "limit": 20,
  "offset": 0
}
```

### Session Management Endpoints

#### POST /sessions
Create a new quiz session with multiple sources.

**Request:**
```json
{
  "name": "Mixed Practice Session",
  "sources": [
    {
      "category": "programming",
      "provider": "python",
      "certificate": "pcap",
      "language": "EN",
      "questionCount": 30
    },
    {
      "category": "cloud",
      "provider": "aws",
      "certificate": "cloud-practitioner",
      "language": "DE",
      "questionCount": 30
    }
  ],
  "settings": {
    "randomizeQuestions": true,
    "adaptiveLearning": true,
    "wrongAnswerPercentage": 20
  }
}
```

**Response (201):**
```json
{
  "sessionId": "sess-550e8400-e29b-41d4",
  "totalQuestions": 60,
  "estimatedDuration": 90,
  "status": "READY",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### GET /sessions/{sessionId}
Get session details and current state.

**Response (200):**
```json
{
  "sessionId": "sess-550e8400-e29b-41d4",
  "userId": "550e8400-e29b-41d4-a716",
  "totalQuestions": 60,
  "currentQuestion": 7,
  "answeredQuestions": 6,
  "correctAnswers": 4,
  "wrongAnswersPool": 2,
  "additionalQuestions": 1,
  "progress": {
    "percentage": 10,
    "estimatedTimeRemaining": 80
  },
  "status": "ACTIVE"
}
```

#### POST /sessions/{sessionId}/start
Start or resume a quiz session.

**Response (200):**
```json
{
  "sessionId": "sess-550e8400-e29b-41d4",
  "status": "ACTIVE",
  "nextQuestion": {
    "questionNumber": 1,
    "totalQuestions": 60,
    "additionalQuestions": 0
  }
}
```

### Quiz Interaction Endpoints

#### GET /sessions/{sessionId}/question
Get the current question for the session.

**Response (200):**
```json
{
  "questionNumber": 7,
  "totalQuestions": 60,
  "additionalQuestions": 1,
  "penaltyIndicator": "(+1 Question @ 2 Tries)",
  "question": {
    "questionId": "q-550e8400-e29b-41d4",
    "text": "Which of the following is a valid Python identifier?",
    "type": "SINGLE_CHOICE",
    "answers": [
      {
        "id": "a1",
        "text": "2variable"
      },
      {
        "id": "a2",
        "text": "_private_var"
      },
      {
        "id": "a3",
        "text": "class"
      },
      {
        "id": "a4",
        "text": "my-variable"
      }
    ],
    "isFromWrongPool": false,
    "language": "EN"
  }
}
```

#### POST /sessions/{sessionId}/answer
Submit answer for current question.

**Request:**
```json
{
  "questionId": "q-550e8400-e29b-41d4",
  "selectedAnswers": ["a2"],
  "timeSpent": 45
}
```

**Response (200) - Correct Answer:**
```json
{
  "correct": true,
  "explanation": "Python identifiers can start with underscore or letter.",
  "nextAction": "NEXT_QUESTION",
  "progress": {
    "questionsAnswered": 7,
    "correctAnswers": 5,
    "wrongPoolSize": 2,
    "additionalQuestions": 1
  }
}
```

**Response (200) - Wrong Answer:**
```json
{
  "correct": false,
  "nextAction": "RETRY_SAME_QUESTION",
  "question": {
    "questionId": "q-550e8400-e29b-41d4",
    "text": "Which of the following is a valid Python identifier?",
    "answers": [
      {
        "id": "a3",
        "text": "class"
      },
      {
        "id": "a1",
        "text": "2variable"
      },
      {
        "id": "a4",
        "text": "my-variable"
      },
      {
        "id": "a2",
        "text": "_private_var"
      }
    ],
    "shuffled": true
  },
  "message": "Incorrect. Try again with the shuffled answers."
}
```

### Progress & Analytics Endpoints

#### GET /users/{userId}/progress
Get user's overall progress and statistics.

**Response (200):**
```json
{
  "userId": "550e8400-e29b-41d4-a716",
  "totalQuestionsAttempted": 1250,
  "totalCorrect": 980,
  "accuracy": 78.4,
  "categoriesProgress": [
    {
      "category": "programming",
      "questionsAttempted": 650,
      "accuracy": 82.3,
      "certificates": [
        {
          "certificate": "pcap",
          "progress": 65,
          "estimatedReadiness": 75
        }
      ]
    }
  ],
  "wrongAnswersPoolSize": 45,
  "streaks": {
    "current": 12,
    "best": 34
  }
}
```

#### GET /users/{userId}/wrong-answers
Get user's wrong answer pool with oldest first.

**Query Parameters:**
- `limit`: Results per page (default: 20)
- `offset`: Pagination offset

**Response (200):**
```json
{
  "wrongAnswers": [
    {
      "questionId": "q-550e8400-e29b-41d4",
      "category": "programming#python#pcap",
      "firstWrongAt": "2024-01-10T14:30:00Z",
      "remainingTries": 2,
      "attempts": 3,
      "lastAttemptAt": "2024-01-15T09:15:00Z"
    }
  ],
  "total": 45,
  "oldestUnanswered": "2024-01-10T14:30:00Z"
}
```

### Admin Endpoints

#### POST /admin/questions
Add new questions to the system.

**Request:**
```json
{
  "questions": [
    {
      "category": "programming",
      "provider": "python",
      "certificate": "pcap",
      "question": "What is the result of 10 // 3 in Python?",
      "type": "SINGLE_CHOICE",
      "answers": [
        {"text": "3.33", "correct": false},
        {"text": "3", "correct": true},
        {"text": "4", "correct": false},
        {"text": "3.0", "correct": false}
      ],
      "difficulty": 2,
      "language": "EN",
      "explanation": "The // operator performs integer division."
    }
  ]
}
```

**Response (201):**
```json
{
  "created": 1,
  "questionIds": ["q-new-550e8400"]
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request parameters",
  "details": {
    "email": "Invalid email format"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "FORBIDDEN",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "NOT_FOUND",
  "message": "Resource not found",
  "resource": "session",
  "id": "sess-550e8400-e29b-41d4"
}
```

### 429 Too Many Requests
```json
{
  "error": "RATE_LIMIT",
  "message": "Rate limit exceeded",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred",
  "requestId": "req-550e8400-e29b"
}
```

## Rate Limiting

- Authenticated requests: 1000/hour per user
- Unauthenticated requests: 100/hour per IP
- Question submission: 120/minute per user
- Bulk operations: 10/minute per user

## Versioning

API version is included in the URL path. Deprecated endpoints return:
```
Deprecation: true
Sunset: 2024-12-31T23:59:59Z
```