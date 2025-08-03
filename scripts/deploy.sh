#!/bin/bash

# Adaptive Quiz Deployment Script
# Usage: ./scripts/deploy.sh <environment> [options]

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
AWS_REGION="eu-central-1"
SKIP_TESTS=false
SKIP_BUILD=false
DRY_RUN=false
VERBOSE=false

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to print usage
print_usage() {
    echo "Usage: $0 <environment> [options]"
    echo ""
    echo "Environments:"
    echo "  dev       Development environment"
    echo "  staging   Staging environment"
    echo "  prod      Production environment"
    echo ""
    echo "Options:"
    echo "  --region <region>     AWS region (default: eu-central-1)"
    echo "  --skip-tests         Skip running tests"
    echo "  --skip-build         Skip building frontend"
    echo "  --dry-run            Show what would be deployed without deploying"
    echo "  --verbose            Enable verbose output"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev"
    echo "  $0 staging --region eu-west-1"
    echo "  $0 prod --skip-tests --verbose"
}

# Function to validate environment
validate_environment() {
    case $ENVIRONMENT in
        dev|staging|prod)
            print_message $GREEN "✓ Environment '$ENVIRONMENT' is valid"
            ;;
        *)
            print_message $RED "✗ Invalid environment '$ENVIRONMENT'"
            print_usage
            exit 1
            ;;
    esac
}

# Function to validate region (EU-only enforcement)
validate_region() {
    # List of allowed EU regions
    local allowed_regions=("eu-central-1" "eu-west-1" "eu-west-2" "eu-west-3" "eu-north-1" "eu-south-1")
    local region_valid=false
    
    for allowed in "${allowed_regions[@]}"; do
        if [ "$AWS_REGION" = "$allowed" ]; then
            region_valid=true
            break
        fi
    done
    
    if [ "$region_valid" = false ]; then
        print_message $RED "✗ Region '$AWS_REGION' is not allowed. Only EU regions are permitted."
        print_message $YELLOW "Allowed regions: ${allowed_regions[*]}"
        exit 1
    else
        print_message $GREEN "✓ Region '$AWS_REGION' is valid (EU region)"
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_message $BLUE "🔍 Checking prerequisites..."
    
    # Check if required tools are installed
    local tools=("node" "npm" "python3" "pip" "aws" "serverless")
    for tool in "${tools[@]}"; do
        if ! command -v $tool &> /dev/null; then
            print_message $RED "✗ $tool is not installed"
            exit 1
        else
            print_message $GREEN "✓ $tool is installed"
        fi
    done
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_message $RED "✗ AWS credentials not configured"
        exit 1
    else
        local account_id=$(aws sts get-caller-identity --query Account --output text)
        print_message $GREEN "✓ AWS credentials configured (Account: $account_id)"
    fi
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    local required_node="18.0.0"
    if [ "$(printf '%s\n' "$required_node" "$node_version" | sort -V | head -n1)" != "$required_node" ]; then
        print_message $RED "✗ Node.js version $node_version is too old (required: >= $required_node)"
        exit 1
    else
        print_message $GREEN "✓ Node.js version $node_version is compatible"
    fi
    
    # Check Python version
    local python_version=$(python3 --version | cut -d' ' -f2)
    local required_python="3.13.0"
    if [ "$(printf '%s\n' "$required_python" "$python_version" | sort -V | head -n1)" != "$required_python" ]; then
        print_message $YELLOW "⚠ Python version $python_version might not be optimal (recommended: >= $required_python)"
    else
        print_message $GREEN "✓ Python version $python_version is compatible"
    fi
}

# Function to install dependencies
install_dependencies() {
    print_message $BLUE "📦 Installing dependencies..."
    
    # Install Node.js dependencies
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_message $YELLOW "Installing Node.js dependencies..."
        npm ci
    else
        print_message $GREEN "✓ Node.js dependencies already installed"
    fi
    
    # Install Python dependencies
    print_message $YELLOW "Installing Python dependencies..."
    pip install -r requirements.txt --quiet
    
    # Install frontend dependencies
    if [ -d "frontend" ]; then
        cd frontend
        if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
            print_message $YELLOW "Installing frontend dependencies..."
            npm ci
        else
            print_message $GREEN "✓ Frontend dependencies already installed"
        fi
        cd ..
    fi
}

# Function to run tests
run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        print_message $YELLOW "⚠ Skipping tests"
        return 0
    fi
    
    print_message $BLUE "🧪 Running tests..."
    
    # Run backend tests
    if [ -d "tests" ]; then
        print_message $YELLOW "Running backend tests..."
        python -m pytest tests/ -v
    fi
    
    # Run frontend tests
    if [ -d "frontend" ]; then
        cd frontend
        print_message $YELLOW "Running frontend tests..."
        npm run test:unit
        npm run lint
        npm run type-check
        cd ..
    fi
    
    print_message $GREEN "✓ All tests passed"
}

# Function to build frontend
build_frontend() {
    if [ "$SKIP_BUILD" = true ]; then
        print_message $YELLOW "⚠ Skipping frontend build"
        return 0
    fi
    
    if [ -d "frontend" ]; then
        print_message $BLUE "🏗️ Building frontend..."
        cd frontend
        
        # Set environment-specific variables
        case $ENVIRONMENT in
            dev)
                export VITE_API_BASE_URL="http://localhost:3000"
                ;;
            staging)
                export VITE_API_BASE_URL="https://api-staging.adaptivequiz.com"
                ;;
            prod)
                export VITE_API_BASE_URL="https://api.adaptivequiz.com"
                ;;
        esac
        
        npm run build
        cd ..
        print_message $GREEN "✓ Frontend built successfully"
    fi
}

# Function to validate configuration
validate_configuration() {
    print_message $BLUE "🔧 Validating configuration..."
    
    # Check if serverless.yml exists
    if [ ! -f "serverless.yml" ]; then
        print_message $RED "✗ serverless.yml not found"
        exit 1
    fi
    
    # Validate serverless configuration
    if [ "$VERBOSE" = true ]; then
        serverless print --stage $ENVIRONMENT --region $AWS_REGION
    else
        serverless print --stage $ENVIRONMENT --region $AWS_REGION > /dev/null
    fi
    
    print_message $GREEN "✓ Configuration is valid"
}

# Function to deploy infrastructure
deploy_infrastructure() {
    print_message $BLUE "🚀 Deploying infrastructure..."
    
    if [ "$DRY_RUN" = true ]; then
        print_message $YELLOW "DRY RUN: Would deploy to $ENVIRONMENT in $AWS_REGION"
        serverless package --stage $ENVIRONMENT --region $AWS_REGION
        print_message $GREEN "✓ Dry run completed successfully"
        return 0
    fi
    
    # Create or update SSM parameters
    print_message $YELLOW "Setting up SSM parameters..."
    aws ssm put-parameter \
        --name "/adaptive-quiz/$ENVIRONMENT/jwt-secret" \
        --value "$(openssl rand -base64 32)" \
        --type "SecureString" \
        --overwrite \
        --region $AWS_REGION || true
    
    # Deploy with Serverless Framework
    local deploy_cmd="serverless deploy --stage $ENVIRONMENT --region $AWS_REGION"
    if [ "$VERBOSE" = true ]; then
        deploy_cmd="$deploy_cmd --verbose"
    fi
    
    print_message $YELLOW "Executing: $deploy_cmd"
    $deploy_cmd
    
    print_message $GREEN "✓ Infrastructure deployed successfully"
}

# Function to deploy frontend
deploy_frontend() {
    if [ ! -d "frontend/dist" ]; then
        print_message $YELLOW "⚠ Frontend build not found, skipping frontend deployment"
        return 0
    fi
    
    print_message $BLUE "🌐 Deploying frontend..."
    
    # Get S3 bucket name from CloudFormation stack
    local bucket_name=$(aws cloudformation describe-stacks \
        --stack-name adaptive-quiz-app-$ENVIRONMENT \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendS3BucketName`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$bucket_name" ] || [ "$bucket_name" = "None" ]; then
        print_message $YELLOW "⚠ Frontend S3 bucket not found, skipping frontend deployment"
        return 0
    fi
    
    print_message $YELLOW "Uploading to S3 bucket: $bucket_name"
    
    # Upload files with appropriate cache headers
    aws s3 sync frontend/dist/ s3://$bucket_name/ \
        --region $AWS_REGION \
        --delete \
        --cache-control "public, max-age=31536000" \
        --exclude "*.html" \
        --exclude "*.json"
    
    aws s3 sync frontend/dist/ s3://$bucket_name/ \
        --region $AWS_REGION \
        --delete \
        --cache-control "public, max-age=0, must-revalidate" \
        --include "*.html" \
        --include "*.json"
    
    # Invalidate CloudFront distribution if it exists
    local distribution_id=$(aws cloudformation describe-stacks \
        --stack-name adaptive-quiz-app-$ENVIRONMENT \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$distribution_id" ] && [ "$distribution_id" != "None" ]; then
        print_message $YELLOW "Invalidating CloudFront distribution: $distribution_id"
        aws cloudfront create-invalidation \
            --distribution-id $distribution_id \
            --paths "/*" \
            --region $AWS_REGION
    fi
    
    print_message $GREEN "✓ Frontend deployed successfully"
}

# Function to run post-deployment tests
run_post_deployment_tests() {
    print_message $BLUE "🔍 Running post-deployment tests..."
    
    # Get API endpoint
    local api_endpoint=$(aws cloudformation describe-stacks \
        --stack-name adaptive-quiz-app-$ENVIRONMENT \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$api_endpoint" ] && [ "$api_endpoint" != "None" ]; then
        print_message $YELLOW "Testing API endpoint: $api_endpoint"
        
        # Wait for deployment to be ready
        sleep 10
        
        # Test health endpoint
        local health_status=$(curl -s -o /dev/null -w "%{http_code}" "$api_endpoint/health" || echo "000")
        if [ "$health_status" = "200" ]; then
            print_message $GREEN "✓ API health check passed"
        else
            print_message $RED "✗ API health check failed (Status: $health_status)"
        fi
    else
        print_message $YELLOW "⚠ API endpoint not found, skipping health check"
    fi
}

# Function to print deployment summary
print_deployment_summary() {
    print_message $BLUE "📋 Deployment Summary"
    echo "================================"
    echo "Environment: $ENVIRONMENT"
    echo "Region: $AWS_REGION"
    echo "Timestamp: $(date)"
    echo ""
    
    # Get stack outputs
    local stack_outputs=$(aws cloudformation describe-stacks \
        --stack-name adaptive-quiz-app-$ENVIRONMENT \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs' \
        --output table 2>/dev/null || echo "Stack outputs not available")
    
    echo "Stack Outputs:"
    echo "$stack_outputs"
    echo ""
    
    print_message $GREEN "🎉 Deployment completed successfully!"
}

# Main function
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --region)
                AWS_REGION="$2"
                shift 2
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                print_usage
                exit 0
                ;;
            -*)
                print_message $RED "Unknown option $1"
                print_usage
                exit 1
                ;;
            *)
                if [ -z "$ENVIRONMENT" ]; then
                    ENVIRONMENT="$1"
                else
                    print_message $RED "Too many arguments"
                    print_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Check if environment is provided
    if [ -z "$ENVIRONMENT" ]; then
        print_message $RED "Environment is required"
        print_usage
        exit 1
    fi
    
    # Print header
    print_message $BLUE "🚀 Adaptive Quiz Deployment"
    print_message $BLUE "Environment: $ENVIRONMENT"
    print_message $BLUE "Region: $AWS_REGION"
    echo ""
    
    # Execute deployment steps
    validate_environment
    validate_region
    check_prerequisites
    install_dependencies
    run_tests
    build_frontend
    validate_configuration
    deploy_infrastructure
    deploy_frontend
    run_post_deployment_tests
    print_deployment_summary
}

# Run main function with all arguments
main "$@"