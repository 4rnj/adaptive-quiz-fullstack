# DynamoDB Schema Design

## Table Overview

The system uses 5 primary DynamoDB tables with optimized partition and sort key design for efficient querying.

## 1. Users Table

**Table Name**: `quiz-users`

| Attribute | Type | Key Type | Description |
|-----------|------|----------|-------------|
| userId | String | Partition Key | Cognito User ID |
| email | String | - | User email address |
| username | String | - | Display name |
| createdAt | String | - | ISO 8601 timestamp |
| updatedAt | String | - | ISO 8601 timestamp |
| preferences | Map | - | User preferences (language, theme) |
| stats | Map | - | User statistics |

**GSI 1**: email-index
- Partition Key: email
- Use Case: User lookup by email

## 2. Questions Table

**Table Name**: `quiz-questions`

| Attribute | Type | Key Type | Description |
|-----------|------|----------|-------------|
| questionId | String | Partition Key | Unique question ID |
| category | String | Sort Key | Category#Provider#Certificate |
| question | String | - | Question text |
| answers | List | - | Array of answer objects |
| correctAnswers | List | - | Array of correct answer indices |
| type | String | - | SINGLE_CHOICE or MULTIPLE_CHOICE |
| language | String | - | Question language (EN, DE) |
| difficulty | Number | - | 1-5 difficulty scale |
| provider | String | - | Source provider |
| certificate | String | - | Certificate name |
| metadata | Map | - | Additional metadata |
| createdAt | String | - | ISO 8601 timestamp |

**GSI 1**: category-language-index
- Partition Key: category
- Sort Key: language#difficulty
- Use Case: Filter questions by category and language

**GSI 2**: provider-certificate-index
- Partition Key: provider#certificate
- Sort Key: language#questionId
- Use Case: Get questions for specific certificate

## 3. Sessions Table

**Table Name**: `quiz-sessions`

| Attribute | Type | Key Type | Description |
|-----------|------|----------|-------------|
| sessionId | String | Partition Key | UUID session identifier |
| userId | String | Sort Key | User who created session |
| config | Map | - | Session configuration |
| sources | List | - | Selected quiz sources |
| totalQuestions | Number | - | Total questions in session |
| currentQuestion | Number | - | Current question index |
| answeredQuestions | List | - | List of answered question IDs |
| wrongAnswers | List | - | Questions answered incorrectly |
| startedAt | String | - | Session start timestamp |
| completedAt | String | - | Session completion timestamp |
| status | String | - | ACTIVE, PAUSED, COMPLETED |
| ttl | Number | - | TTL for automatic cleanup |

**GSI 1**: userId-status-index
- Partition Key: userId
- Sort Key: status#startedAt
- Use Case: Get user's active/completed sessions

## 4. Progress Table

**Table Name**: `quiz-progress`

| Attribute | Type | Key Type | Description |
|-----------|------|----------|-------------|
| userId | String | Partition Key | User ID |
| questionId | String | Sort Key | Question ID |
| sessionId | String | - | Session where first encountered |
| attempts | Number | - | Total attempts |
| correctAttempts | Number | - | Correct attempts |
| incorrectAttempts | Number | - | Incorrect attempts |
| firstSeenAt | String | - | First encounter timestamp |
| lastAttemptAt | String | - | Last attempt timestamp |
| masteryLevel | Number | - | 0-2 (needs practice to mastered) |
| wrongAnswerCount | Number | - | Times to answer correctly |
| isInWrongPool | Boolean | - | Currently in wrong answer pool |

**GSI 1**: userId-wrongPool-index
- Partition Key: userId
- Sort Key: isInWrongPool#firstSeenAt
- Use Case: Get oldest wrong answers for user

**GSI 2**: sessionId-index
- Partition Key: sessionId
- Use Case: Get all progress for a session

## 5. WrongAnswers Table

**Table Name**: `quiz-wrong-answers`

| Attribute | Type | Key Type | Description |
|-----------|------|----------|-------------|
| userId | String | Partition Key | User ID |
| timestamp | String | Sort Key | ISO 8601 timestamp |
| questionId | String | - | Question that was wrong |
| sessionId | String | - | Session context |
| remainingTries | Number | - | Tries needed (2 initially) |
| lastAttemptAt | String | - | Last attempt timestamp |
| shuffledAnswers | List | - | Current shuffled answer order |
| attempts | List | - | History of attempts |

**GSI 1**: userId-remainingTries-index
- Partition Key: userId
- Sort Key: remainingTries#timestamp
- Use Case: Prioritize questions by tries needed

## Data Access Patterns

### 1. Session Creation
```
1. Query Questions table by category-language-index
2. Create Session record
3. Initialize Progress records for selected questions
```

### 2. Get Next Question (Adaptive Algorithm)
```
1. Check WrongAnswers table (20% selection from oldest)
   - Query userId-wrongPool-index
   - Sort by timestamp (oldest first)
2. Get remaining questions (80% random selection)
   - Query Session answeredQuestions
   - Filter available questions
3. Return selected question with shuffled answers if from wrong pool
```

### 3. Answer Submission
```
1. Update Progress table
2. If incorrect:
   - Add to WrongAnswers table
   - Set remainingTries = 2
   - Shuffle answers
   - Return same question
3. If correct:
   - Update Session progress
   - If from wrong pool:
     - Decrement remainingTries
     - Remove from pool if remainingTries = 0
```

### 4. Session Restoration
```
1. Query Sessions table by sessionId
2. Query Progress table by sessionId-index
3. Query WrongAnswers by userId
4. Reconstruct session state
```

## TTL Strategy

- Sessions: 30 days after completion
- WrongAnswers: 90 days after mastery
- Progress: No TTL (permanent record)

## Capacity Planning

### Read/Write Capacity Units (RCU/WCU)
- On-Demand mode for all tables
- Auto-scaling based on traffic
- DAX caching for Questions table

### Storage Optimization
- Compress question text > 1KB
- Archive completed sessions to S3
- Aggregate old progress data

## Security Considerations

- Encryption at rest enabled
- Point-in-time recovery enabled
- Fine-grained access control via IAM
- VPC endpoints for private access