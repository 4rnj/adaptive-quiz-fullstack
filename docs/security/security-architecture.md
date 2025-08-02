# Security Architecture & Monitoring

## Security Framework Overview

The Multi-Source Adaptive Quiz System implements a comprehensive security architecture based on AWS Well-Architected Security Pillar principles and zero-trust security model.

## Authentication & Authorization

### AWS Cognito Integration

#### User Pool Configuration
```yaml
Security Features:
- Email-based authentication with verification
- Strong password policy (8+ chars, mixed case, numbers, symbols)
- JWT token-based authentication (short-lived tokens)
- Automatic token refresh mechanism
- Account lockout after failed attempts
```

#### Authorization Levels
```yaml
User Roles:
  Standard User:
    - Create and manage own quiz sessions
    - View personal progress and analytics
    - Access questions based on subscription
    
  Content Creator:
    - Add questions to approved categories
    - Moderate user-generated content
    - Access usage analytics for their content
    
  Administrator:
    - Full system access
    - User management capabilities
    - System configuration and monitoring
    - Bulk question import/export
```

### JWT Token Security

#### Token Structure
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "cognito:groups": ["users"],
  "iat": 1674567890,
  "exp": 1674571490,
  "token_use": "access"
}
```

#### Token Validation
- Automatic signature verification via Cognito
- Token expiration enforcement (1 hour for access tokens)
- Refresh token rotation (30-day validity)
- Revocation support for compromised tokens

## Data Protection

### Encryption Strategy

#### Encryption at Rest
```yaml
DynamoDB Tables:
  - SSE-S3 encryption enabled
  - Customer-managed KMS keys for sensitive data
  - Point-in-time recovery enabled
  - Backup encryption with separate keys

Lambda Functions:
  - Environment variables encrypted with KMS
  - Secrets Manager integration for sensitive configs
  - No hardcoded credentials in code

S3 Buckets:
  - AES-256 server-side encryption
  - Bucket policies enforce encrypted uploads
  - Versioning enabled with MFA delete protection
```

#### Encryption in Transit
```yaml
API Gateway:
  - TLS 1.2+ enforced
  - Custom domain with ACM certificates
  - HSTS headers enabled
  - Certificate pinning recommended

CloudFront:
  - TLS 1.2+ for viewer communication
  - Origin Protocol Policy: HTTPS Only
  - Security headers injection
  - WAF integration for DDoS protection
```

### Data Classification

#### Sensitivity Levels
```yaml
Public Data:
  - Question categories and metadata
  - Public leaderboards (anonymized)
  - System status information

Internal Data:
  - User progress statistics
  - Session configurations
  - Question difficulty metrics
  - Performance analytics

Confidential Data:
  - User personal information
  - Authentication credentials
  - Payment information
  - Detailed learning analytics

Restricted Data:
  - System security logs
  - Encryption keys
  - Administrative access logs
  - Audit trails
```

## Network Security

### VPC Configuration

#### Network Segmentation
```yaml
VPC Structure:
  Public Subnets:
    - NAT Gateways
    - Load Balancers
    - Bastion Hosts (if needed)
    
  Private Subnets:
    - Lambda functions
    - RDS instances
    - Application servers
    
  Database Subnets:
    - DynamoDB VPC endpoints
    - ElastiCache clusters
    - Isolated from direct internet access
```

#### Security Groups
```yaml
Lambda Security Group:
  Inbound:
    - No direct inbound rules (API Gateway only)
  Outbound:
    - HTTPS (443) to AWS services
    - HTTP (80) for dependencies
    - Custom ports for specific integrations

Database Security Group:
  Inbound:
    - DynamoDB HTTPS (443) from Lambda SG
  Outbound:
    - None (managed service)
```

### API Security

#### Rate Limiting
```yaml
API Gateway Throttling:
  Default Limits:
    - 10,000 requests per second
    - 5,000 burst limit
    
  Per-User Limits:
    - Authenticated: 1,000/hour
    - Unauthenticated: 100/hour
    - Question submission: 120/minute
    - Bulk operations: 10/minute
```

#### WAF Rules
```yaml
AWS WAF v2 Rules:
  1. IP Reputation List
     - Block known malicious IPs
     - Automatic updates from threat intel
     
  2. Geographic Restrictions
     - Allow/block specific countries
     - Configurable per deployment
     
  3. Rate-Based Rules
     - Block IPs exceeding rate limits
     - Progressive penalties
     
  4. SQL Injection Protection
     - Pattern matching for SQL injection attempts
     - Automatic blocking and alerting
     
  5. XSS Protection
     - Cross-site scripting prevention
     - Input validation and sanitization
```

## Application Security

### Input Validation

#### API Request Validation
```python
# Example validation schema
from marshmallow import Schema, fields, validate

class SessionConfigSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    sources = fields.List(fields.Nested(SourceSchema), required=True, 
                         validate=validate.Length(min=1, max=10))
    settings = fields.Nested(SessionSettingsSchema)
    
    def validate_sources(self, data):
        # Custom validation for source combinations
        total_questions = sum(s.get('questionCount', 0) for s in data.get('sources', []))
        if total_questions > 200:
            raise ValidationError('Total questions cannot exceed 200')
```

#### SQL Injection Prevention
```python
# Using parameterized queries with DynamoDB
def get_user_progress(user_id: str, question_id: str):
    # Safe - uses parameterized key conditions
    response = table.get_item(
        Key={
            'userId': user_id,
            'questionId': question_id
        }
    )
    return response.get('Item')

# Validation for all user inputs
def sanitize_input(user_input: str) -> str:
    # Remove potentially dangerous characters
    return re.sub(r'[^\w\s\-_.@]', '', user_input)
```

### Secure Coding Practices

#### Error Handling
```python
import logging
from typing import Dict, Any

def secure_error_handler(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ValidationError as e:
            logging.warning(f"Validation error: {e}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'VALIDATION_ERROR',
                    'message': 'Invalid input parameters'
                    # Don't expose internal details
                })
            }
        except Exception as e:
            logging.error(f"Unexpected error: {e}", exc_info=True)
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'INTERNAL_ERROR',
                    'message': 'An unexpected error occurred',
                    'requestId': context.aws_request_id
                })
            }
    return wrapper
```

#### Secrets Management
```python
import boto3
import json
from functools import lru_cache

class SecretsManager:
    def __init__(self):
        self.client = boto3.client('secretsmanager')
    
    @lru_cache(maxsize=10)
    def get_secret(self, secret_name: str) -> Dict[str, Any]:
        try:
            response = self.client.get_secret_value(SecretId=secret_name)
            return json.loads(response['SecretString'])
        except Exception as e:
            logging.error(f"Failed to retrieve secret {secret_name}: {e}")
            raise
    
    def get_database_credentials(self) -> Dict[str, str]:
        return self.get_secret('quiz-app/database/credentials')
```

## Monitoring & Incident Response

### Security Monitoring

#### CloudWatch Alarms
```yaml
Security Alarms:
  Failed Authentication Attempts:
    Metric: AWS/Cognito/SignInAttempts
    Threshold: > 100 failed attempts in 5 minutes
    Action: SNS notification to security team
    
  Unusual API Activity:
    Metric: AWS/ApiGateway/4XXError
    Threshold: > 50 errors in 1 minute
    Action: Auto-scale verification, alert if persistent
    
  DDoS Detection:
    Metric: AWS/ApiGateway/Count
    Threshold: > 10,000 requests/minute from single IP
    Action: Trigger WAF rate limiting
    
  Lambda Errors:
    Metric: AWS/Lambda/Errors
    Threshold: > 10 errors in 5 minutes
    Action: Alert development team
```

#### CloudTrail Configuration
```yaml
CloudTrail Settings:
  Trail Name: quiz-app-security-trail
  S3 Bucket: quiz-app-cloudtrail-logs
  Encryption: KMS encrypted
  Log File Validation: Enabled
  
  Events Captured:
    - All management events
    - S3 data events for sensitive buckets
    - Lambda data events for security functions
    - DynamoDB data events for user tables
    
  Integration:
    - CloudWatch Logs for real-time analysis
    - EventBridge for automated responses
    - AWS Config for compliance monitoring
```

### Security Dashboards

#### Real-Time Security Dashboard
```yaml
Dashboard Widgets:
  Authentication Metrics:
    - Login success/failure rates
    - Geographic distribution of logins
    - Suspicious authentication patterns
    
  API Security:
    - Request volume by endpoint
    - Error rates and types
    - Rate limiting violations
    
  Data Access Patterns:
    - DynamoDB access patterns
    - Unusual query volumes
    - Cross-region access attempts
    
  Infrastructure Health:
    - Lambda execution errors
    - Network security group violations
    - VPC Flow Log anomalies
```

### Incident Response

#### Automated Response Actions
```yaml
Lambda Security Responder:
  Triggers:
    - CloudWatch alarms
    - GuardDuty findings
    - WAF rule violations
    
  Actions:
    - Temporary IP blocking
    - User account suspension
    - Credential rotation
    - Incident ticket creation
    
  Escalation:
    - Email notifications
    - SMS alerts for critical issues
    - Integration with PagerDuty/OpsGenie
```

#### Incident Classification
```yaml
Severity Levels:
  Critical (P1):
    - Data breach confirmed
    - System completely compromised
    - Response time: < 15 minutes
    
  High (P2):
    - Potential data exposure
    - Service degradation
    - Response time: < 1 hour
    
  Medium (P3):
    - Failed login anomalies
    - Performance issues
    - Response time: < 4 hours
    
  Low (P4):
    - Policy violations
    - Minor configuration issues
    - Response time: < 24 hours
```

## Compliance & Auditing

### Compliance Framework

#### GDPR Compliance
```yaml
GDPR Requirements:
  Data Processing:
    - Explicit consent for data collection
    - Clear privacy policy and terms
    - Data minimization principles
    
  User Rights:
    - Right to access personal data
    - Right to rectification
    - Right to erasure ("right to be forgotten")
    - Data portability
    
  Technical Measures:
    - Encryption of personal data
    - Pseudonymization where possible
    - Regular security assessments
    - Data protection by design
```

#### SOC 2 Type II Alignment
```yaml
Security Principles:
  Common Criteria:
    - Policies and procedures documentation
    - Risk assessment processes
    - Logical access controls
    - System monitoring
    
  Trust Services Criteria:
    - Security: Protection against unauthorized access
    - Availability: System availability for operation
    - Processing Integrity: Complete, valid, accurate processing
    - Confidentiality: Protection of confidential information
```

### Audit Trail

#### Comprehensive Logging
```yaml
Log Categories:
  Authentication Events:
    - Login attempts (success/failure)
    - Password changes
    - Token generation/validation
    - Account lockouts
    
  Data Access:
    - Question retrieval
    - Progress updates
    - User profile changes
    - Administrative actions
    
  System Events:
    - Configuration changes
    - Deployment activities
    - Error conditions
    - Performance metrics
```

#### Log Retention
```yaml
Retention Policies:
  Security Logs: 7 years
  Application Logs: 2 years
  Performance Logs: 1 year
  Debug Logs: 30 days
  
  Storage:
    - Hot storage: 90 days (CloudWatch Logs)
    - Warm storage: 1 year (S3 Standard)
    - Cold storage: 6+ years (S3 Glacier)
```

## Security Testing

### Automated Security Testing

#### SAST (Static Application Security Testing)
```yaml
Tools Integration:
  SonarQube:
    - Code quality and security analysis
    - OWASP Top 10 vulnerability scanning
    - Integration with CI/CD pipeline
    
  Bandit:
    - Python-specific security linting
    - Automated security issue detection
    - Custom rule configurations
```

#### DAST (Dynamic Application Security Testing)
```yaml
Tools Integration:
  OWASP ZAP:
    - Automated penetration testing
    - API security scanning
    - Integration with deployment pipeline
    
  AWS Inspector:
    - Lambda function vulnerability assessment
    - Network reachability analysis
    - Runtime security analysis
```

### Penetration Testing

#### Testing Schedule
```yaml
Frequency:
  - Annual comprehensive penetration test
  - Quarterly focused assessments
  - Ad-hoc testing after major releases
  - Continuous automated scanning
  
Scope:
  - Web application security
  - API endpoint testing
  - Authentication mechanisms
  - Infrastructure security
  - Social engineering assessments
```

## Cost Optimization

### Security Cost Management
```yaml
Cost Optimization Strategies:
  CloudTrail:
    - Data events only for critical resources
    - S3 lifecycle policies for log archival
    - Regional trail optimization
    
  GuardDuty:
    - Intelligent threat detection
    - Reduced false positives
    - Event volume optimization
    
  WAF:
    - Rule optimization for cost efficiency
    - Geographic blocking for unused regions
    - Rate limiting to reduce processing costs
```

### Resource Estimation
```yaml
Monthly Security Costs (Dev Environment):
  CloudTrail: $2-5
  GuardDuty: $10-30
  WAF: $5-15
  Secrets Manager: $1-3
  KMS: $1-5
  Total Estimated: $19-58/month
  
Production Scaling Factor: 5-10x
```