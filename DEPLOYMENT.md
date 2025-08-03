# Adaptive Quiz Application - Deployment Guide

This guide covers the complete deployment process for the Adaptive Quiz application using Serverless Framework V4 with AWS.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Configuration](#configuration)
- [Deployment Process](#deployment-process)
- [Environment Management](#environment-management)
- [Monitoring & Observability](#monitoring--observability)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

## 🛠️ Prerequisites

### Required Software
- **Node.js**: ≥18.0.0
- **Python**: ≥3.13.0
- **AWS CLI**: ≥2.0
- **Serverless Framework**: ≥4.0
- **Docker**: Latest (for building Lambda layers)

### AWS Account Setup
1. **AWS Account** with appropriate permissions
2. **IAM User** with programmatic access
3. **Route 53 Hosted Zone** (for custom domains)
4. **ACM Certificate** (for HTTPS)

### Required IAM Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "apigateway:*",
        "dynamodb:*",
        "cognito-idp:*",
        "cognito-identity:*",
        "iam:*",
        "s3:*",
        "cloudfront:*",
        "route53:*",
        "acm:*",
        "logs:*",
        "cloudwatch:*",
        "xray:*",
        "ssm:*",
        "secretsmanager:*",
        "wafv2:*",
        "guardduty:*",
        "config:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🌍 Environment Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/adaptive-quiz-app.git
cd adaptive-quiz-app
```

### 2. Install Dependencies
```bash
# Backend dependencies
npm install
pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Configure AWS Credentials
```bash
# Option 1: AWS CLI
aws configure

# Option 2: Environment Variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=eu-central-1

# Option 3: IAM Roles (recommended for EC2/Lambda)
```

### 4. Install Serverless Framework
```bash
npm install -g serverless@4
```

## ⚙️ Configuration

### Environment-Specific Configuration Files

The application uses environment-specific configuration files located in the `config/` directory:

- `config/dev.yml` - Development environment
- `config/staging.yml` - Staging environment  
- `config/prod.yml` - Production environment

### Key Configuration Areas

#### 1. Domain Configuration
```yaml
domain:
  enabled: true
  name: api.adaptivequiz.com
  certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/example"
  hostedZoneId: "Z123456789"
```

#### 2. Security Settings
```yaml
security:
  enforceHttps: true
  enableWaf: true
  enableXray: true
```

#### 3. Performance Tuning
```yaml
lambda:
  memory: 1024
  timeout: 300
  reservedConcurrency: 200
```

### Required SSM Parameters

Before deployment, ensure these SSM parameters are set:

```bash
# JWT Secret
aws ssm put-parameter \
  --name "/adaptive-quiz/prod/jwt-secret" \
  --value "your-secure-jwt-secret" \
  --type "SecureString"

# Database credentials (if external DB)
aws ssm put-parameter \
  --name "/adaptive-quiz/prod/db-password" \
  --value "your-secure-password" \
  --type "SecureString"
```

## 🚀 Deployment Process

### Quick Deployment
```bash
# Deploy to development
./scripts/deploy.sh dev

# Deploy to staging  
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh prod
```

### Manual Deployment Steps

#### 1. Backend Deployment
```bash
# Install dependencies
npm ci
pip install -r requirements.txt

# Run tests
npm run test
python -m pytest

# Deploy infrastructure
serverless deploy --stage prod --region us-east-1
```

#### 2. Frontend Deployment
```bash
cd frontend

# Build for production
npm run build

# Deploy to S3
aws s3 sync dist/ s3://adaptive-quiz-app-prod-frontend/ --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1234567890123 \
  --paths "/*"
```

#### 3. Post-Deployment Verification
```bash
# Check API health
curl https://api.adaptivequiz.com/health

# Run smoke tests
python -m pytest tests/smoke/

# Verify frontend
curl https://adaptivequiz.com
```

### Deployment Options

#### Standard Deployment
```bash
./scripts/deploy.sh prod
```

#### Skip Tests (CI/CD Only)
```bash
./scripts/deploy.sh prod --skip-tests
```

#### Dry Run (Preview Changes)
```bash
./scripts/deploy.sh prod --dry-run
```

#### Verbose Output
```bash
./scripts/deploy.sh prod --verbose
```

## 🌐 Environment Management

### Development Environment
- **Purpose**: Local development and testing
- **Characteristics**: 
  - Minimal resources
  - Debug logging enabled
  - Test routes available
  - Mock external services

### Staging Environment  
- **Purpose**: Pre-production testing
- **Characteristics**:
  - Production-like setup
  - Real external services
  - Performance monitoring
  - Load testing enabled

### Production Environment
- **Purpose**: Live application
- **Characteristics**:
  - High availability
  - Auto-scaling
  - Comprehensive monitoring
  - Security hardening

### Environment Promotion
```bash
# Promote staging to production
git checkout main
git merge develop
git push origin main
# Automatic deployment via GitHub Actions
```

## 📊 Monitoring & Observability

### CloudWatch Dashboards
Access monitoring dashboards:
- Development: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=adaptive-quiz-app-dev-dashboard
- Production: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=adaptive-quiz-app-prod-dashboard

### Key Metrics to Monitor
- **API Gateway**: Request count, error rate, latency
- **Lambda**: Duration, errors, throttles, memory usage
- **DynamoDB**: Read/write capacity, throttles, errors
- **CloudFront**: Cache hit ratio, origin response time

### Alerting
Alerts are configured for:
- API error rate > 1%
- Lambda errors > 5 per 5 minutes
- DynamoDB throttles > 0
- High latency (P99 > 5 seconds)

### Log Management
```bash
# View Lambda logs
serverless logs -f functionName --stage prod

# Search logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/adaptive-quiz-app-prod-sessionCreate \
  --filter-pattern "ERROR"
```

## 🔒 Security

### Security Features Implemented
- **WAF**: Web Application Firewall with rate limiting
- **Cognito**: User authentication and authorization
- **VPC**: Lambda functions in private subnets (production)
- **Encryption**: At-rest and in-transit encryption
- **CloudTrail**: API audit logging
- **GuardDuty**: Threat detection (production)

### Security Best Practices
1. **Least Privilege**: IAM roles with minimal required permissions
2. **Secrets Management**: Use AWS Secrets Manager/SSM Parameter Store
3. **HTTPS Everywhere**: Enforce HTTPS for all endpoints
4. **Input Validation**: Validate all user inputs
5. **Regular Updates**: Keep dependencies updated

### Security Monitoring
```bash
# Check for security alerts
aws guardduty get-findings \
  --detector-id your-detector-id \
  --finding-criteria '{"Criterion":{"severity":{"Gte":7}}}'

# Review WAF blocked requests
aws wafv2 get-sampled-requests \
  --web-acl-arn your-web-acl-arn \
  --rule-metric-name RateLimitRule \
  --scope REGIONAL \
  --time-window StartTime=1234567890,EndTime=1234567890 \
  --max-items 100
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Deployment Failures
```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name adaptive-quiz-app-prod

# Check Serverless logs
serverless deploy --stage prod --verbose
```

#### 2. Lambda Cold Starts
- **Solution**: Enable function warming for critical functions
- **Configuration**: Set `warmup.enabled: true` in config

#### 3. DynamoDB Throttling
- **Symptoms**: `ProvisionedThroughputExceededException`
- **Solution**: Enable auto-scaling or use on-demand billing

#### 4. API Gateway Timeout
- **Symptoms**: 504 Gateway Timeout
- **Solution**: Optimize Lambda function performance or increase timeout

#### 5. CORS Issues
- **Symptoms**: Browser CORS errors
- **Solution**: Verify CORS configuration in `config/*.yml`

### Debug Commands
```bash
# Test Lambda function locally
serverless invoke local -f functionName

# Check function configuration
aws lambda get-function --function-name adaptive-quiz-app-prod-sessionCreate

# Test API endpoints
curl -X POST https://api.adaptivequiz.com/sessions \
  -H "Content-Type: application/json" \
  -d '{"sources": ["aws"], "settings": {"adaptiveLearning": true}}'
```

### Log Analysis
```bash
# Search for errors across all functions
aws logs start-query \
  --log-group-name /aws/lambda/adaptive-quiz-app-prod \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/'
```

## 🔄 Rollback Procedures

### Automatic Rollback (GitHub Actions)
GitHub Actions automatically rolls back on deployment failure.

### Manual Rollback

#### 1. Infrastructure Rollback
```bash
# Find previous successful deployment
aws cloudformation describe-stack-events \
  --stack-name adaptive-quiz-app-prod \
  --query 'StackEvents[?ResourceStatus==`UPDATE_COMPLETE`]'

# Rollback to previous version
git checkout previous-working-commit
./scripts/deploy.sh prod
```

#### 2. Frontend Rollback
```bash
# List S3 object versions
aws s3api list-object-versions --bucket adaptive-quiz-app-prod-frontend

# Restore previous version
aws s3api copy-object \
  --copy-source adaptive-quiz-app-prod-frontend/index.html?versionId=previous-version-id \
  --bucket adaptive-quiz-app-prod-frontend \
  --key index.html

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1234567890123 \
  --paths "/*"
```

#### 3. Database Rollback
```bash
# List DynamoDB backups
aws dynamodb list-backups \
  --table-name adaptive-quiz-app-prod-sessions

# Restore from backup (creates new table)
aws dynamodb restore-table-from-backup \
  --target-table-name adaptive-quiz-app-prod-sessions-restored \
  --backup-arn arn:aws:dynamodb:us-east-1:123456789012:table/adaptive-quiz-app-prod-sessions/backup/01234567890123-abc123de
```

### Emergency Procedures
```bash
# Disable API Gateway
aws apigateway update-stage \
  --rest-api-id abcdef123 \
  --stage-name prod \
  --patch-ops op=replace,path=/throttle/rateLimit,value=0

# Scale down Lambda concurrency
aws lambda put-provisioned-concurrency-config \
  --function-name adaptive-quiz-app-prod-sessionCreate \
  --qualifier $LATEST \
  --provisioned-concurrency-units 0
```

## 📞 Support & Contact

- **Development Team**: dev@adaptivequiz.com
- **Operations**: ops@adaptivequiz.com
- **Security Issues**: security@adaptivequiz.com
- **Documentation**: https://docs.adaptivequiz.com

## 📚 Additional Resources

- [AWS Serverless Application Lens](https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/)
- [Serverless Framework Documentation](https://www.serverless.com/framework/docs/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)