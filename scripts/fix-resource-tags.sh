#!/bin/bash

# AWS Resource Tagging Fix Script
# This script ensures all project resources have consistent tags

set -e

# Configuration
PROJECT_NAME="adaptive-quiz-app"
ENVIRONMENT="dev"
OWNER="localuser"
CREATED_BY="claude-code"
MANAGED_BY="serverless-framework"
COST_CENTER="development"
REGION="eu-central-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Standard project tags
STANDARD_TAGS="Project=${PROJECT_NAME},Owner=${OWNER},CreatedBy=${CREATED_BY},ManagedBy=${MANAGED_BY},CostCenter=${COST_CENTER},Environment=${ENVIRONMENT},Region=${REGION}"

echo -e "${BLUE}🏷️  AWS Resource Tagging Fix Script${NC}"
echo -e "${BLUE}=====================================${NC}"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Function to check if AWS CLI is configured
check_aws_cli() {
    log "Checking AWS CLI configuration..."
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        error "AWS CLI not configured or invalid credentials"
        exit 1
    fi
    
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local current_region=$(aws configure get region || echo "none")
    
    log "AWS Account: ${account_id}"
    log "Current Region: ${current_region}"
    
    if [[ "${current_region}" != "${REGION}" ]]; then
        warn "Current region (${current_region}) differs from target region (${REGION})"
        echo "Continuing with target region: ${REGION}"
    fi
}

# Function to get all resources with project tags
get_project_resources() {
    log "Finding all project resources..."
    
    aws resourcegroupstaggingapi get-resources \
        --region ${REGION} \
        --resource-type-filters "AWS::CloudFormation::Stack" "AWS::S3::Bucket" "AWS::DynamoDB::Table" "AWS::Lambda::Function" "AWS::ApiGateway::RestApi" "AWS::Cognito::UserPool" \
        --tag-filters "Key=Project,Values=${PROJECT_NAME},flask-quiz" \
        --output json > /tmp/project_resources.json
    
    local resource_count=$(cat /tmp/project_resources.json | jq '.ResourceTagMappingList | length')
    log "Found ${resource_count} project-related resources"
}

# Function to get all untagged or improperly tagged resources
get_problematic_resources() {
    log "Finding problematic resources..."
    
    # Get all resources in the region
    aws resourcegroupstaggingapi get-resources \
        --region ${REGION} \
        --output json > /tmp/all_resources.json
    
    # Find resources without proper project tags
    cat /tmp/all_resources.json | jq '.ResourceTagMappingList[] | select(
        (.Tags | map(.Key) | contains(["Project"]) | not) or
        (.Tags | map(select(.Key == "Project")) | .[0].Value // "" | test("flask-quiz|adaptive-quiz") | not)
    ) | {ARN: .ResourceARN, Service: (.ResourceARN | split(":")[2]), Tags: .Tags}' > /tmp/problematic_resources.json
    
    log "Problematic resources saved to /tmp/problematic_resources.json"
}

# Function to tag EventBridge rules
tag_eventbridge_rule() {
    local rule_arn="$1"
    local rule_name=$(echo $rule_arn | cut -d'/' -f2)
    
    log "Checking EventBridge rule: ${rule_name}"
    
    # Check if this is our project rule
    if [[ "${rule_name}" == *"flask-quiz"* ]] || [[ "${rule_name}" == *"adaptive-quiz"* ]]; then
        log "Tagging EventBridge rule: ${rule_name}"
        aws events tag-resource \
            --resource-arn "${rule_arn}" \
            --tags Key=Project,Value=${PROJECT_NAME} \
                   Key=Owner,Value=${OWNER} \
                   Key=CreatedBy,Value=${CREATED_BY} \
                   Key=ManagedBy,Value=${MANAGED_BY} \
                   Key=CostCenter,Value=${COST_CENTER} \
                   Key=Environment,Value=${ENVIRONMENT} \
                   Key=Region,Value=${REGION} \
            --region ${REGION}
        log "✅ Tagged EventBridge rule: ${rule_name}"
    else
        warn "Skipping non-project EventBridge rule: ${rule_name}"
    fi
}

# Function to clean up non-project resources
cleanup_non_project_resources() {
    log "Analyzing non-project resources for cleanup..."
    
    # Check for the specific problematic resources
    local eventbridge_arn="arn:aws:events:${REGION}:$(aws sts get-caller-identity --query Account --output text):rule/SendNotificationForRootLogin"
    
    # Check if EventBridge rule exists and is not related to our project
    if aws events describe-rule --name "SendNotificationForRootLogin" --region ${REGION} >/dev/null 2>&1; then
        warn "Found non-project EventBridge rule: SendNotificationForRootLogin"
        echo "This appears to be a security monitoring rule, not part of our project."
        echo "Recommendation: Keep this rule but tag it appropriately for your organization."
        
        read -p "Do you want to tag this rule with your organization tags? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            aws events tag-resource \
                --resource-arn "${eventbridge_arn}" \
                --tags Key=Purpose,Value=SecurityMonitoring \
                       Key=Owner,Value=${OWNER} \
                       Key=ManagedBy,Value=manual \
                --region ${REGION}
            log "✅ Tagged security EventBridge rule with organizational tags"
        fi
    fi
    
    # Handle Recycle Bin rules
    local rbin_rules=$(aws rbin list-rules --region ${REGION} --output json | jq -r '.Rules[].Identifier // empty')
    for rule_id in $rbin_rules; do
        warn "Found Recycle Bin rule: ${rule_id}"
        echo "Recycle Bin rules are account-level resources for data protection."
        echo "Recommendation: Tag appropriately for your organization."
    done
}

# Function to remove and redeploy problematic stack
handle_problematic_stack() {
    log "Checking CloudFormation stack status..."
    
    local stack_status=$(aws cloudformation describe-stacks \
        --stack-name flask-quiz-dev \
        --region ${REGION} \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [[ "${stack_status}" == "UPDATE_ROLLBACK_COMPLETE" ]]; then
        warn "Stack flask-quiz-dev is in UPDATE_ROLLBACK_COMPLETE state"
        echo "This indicates a failed deployment that was rolled back."
        echo
        echo "Options:"
        echo "1. Delete the stack and redeploy from scratch"
        echo "2. Try to update the stack to fix the rollback state"
        echo "3. Keep as-is (not recommended)"
        echo
        
        read -p "Choose option (1/2/3): " -n 1 -r
        echo
        
        case $REPLY in
            1)
                log "Deleting problematic stack..."
                aws cloudformation delete-stack \
                    --stack-name flask-quiz-dev \
                    --region ${REGION}
                
                log "Waiting for stack deletion to complete..."
                aws cloudformation wait stack-delete-complete \
                    --stack-name flask-quiz-dev \
                    --region ${REGION}
                
                log "✅ Stack deleted. You can now redeploy with: ./scripts/deploy.sh dev"
                ;;
            2)
                warn "Attempting to continue with existing stack"
                log "You may need to manually fix the stack state"
                ;;
            3)
                warn "Keeping stack as-is. Manual intervention may be required."
                ;;
        esac
    else
        log "Stack status: ${stack_status}"
    fi
}

# Function to validate current project tagging
validate_project_tagging() {
    log "Validating current project resource tagging..."
    
    # Check main project resources
    local resources=(
        "arn:aws:cloudformation:${REGION}:$(aws sts get-caller-identity --query Account --output text):stack/flask-quiz-dev/*"
        "flask-quiz-dev-serverlessdeploymentbucket-*"
        "flask-quiz-dev"
    )
    
    local all_tagged=true
    
    # Get current project resources
    aws resourcegroupstaggingapi get-resources \
        --region ${REGION} \
        --tag-filters "Key=Project,Values=flask-quiz,adaptive-quiz-app" \
        --output json > /tmp/current_project_resources.json
    
    local resource_count=$(cat /tmp/current_project_resources.json | jq '.ResourceTagMappingList | length')
    
    if [[ $resource_count -gt 0 ]]; then
        log "Found ${resource_count} project resources. Checking tag consistency..."
        
        # Check each resource for required tags
        cat /tmp/current_project_resources.json | jq -r '.ResourceTagMappingList[] | @base64' | while IFS= read -r resource; do
            local decoded=$(echo $resource | base64 --decode)
            local arn=$(echo $decoded | jq -r '.ResourceARN')
            local service=$(echo $arn | cut -d':' -f3)
            local tags=$(echo $decoded | jq '.Tags')
            
            local has_project=$(echo $tags | jq 'map(.Key) | contains(["Project"])')
            local has_owner=$(echo $tags | jq 'map(.Key) | contains(["Owner"])')
            local has_environment=$(echo $tags | jq 'map(.Key) | contains(["Environment"])')
            
            if [[ "$has_project" == "true" && "$has_owner" == "true" && "$has_environment" == "true" ]]; then
                log "✅ ${service} resource properly tagged"
            else
                warn "❌ ${service} resource missing required tags"
                echo "   ARN: ${arn}"
                all_tagged=false
            fi
        done
    else
        warn "No project resources found with current tags"
    fi
}

# Function to update serverless configuration for consistent tagging
update_serverless_config() {
    log "Updating serverless configuration for consistent tagging..."
    
    # Check if we need to update the project name in serverless.yml
    if grep -q "service: adaptive-quiz-app" /home/localuser/git/vscode/flaskquiz/flaskquiz3-aws/mucho-aws/serverless.yml; then
        log "✅ Serverless service name is already correct"
    else
        warn "Serverless service name needs to be updated"
        log "Current serverless.yml uses the correct service name pattern"
    fi
    
    # Validate tag configuration in serverless.yml
    if grep -q "Project: adaptive-quiz-app" /home/localuser/git/vscode/flaskquiz/flaskquiz3-aws/mucho-aws/serverless.yml; then
        log "✅ Serverless tags configuration is correct"
    else
        warn "Serverless tags may need updating"
    fi
}

# Main execution
main() {
    log "Starting AWS resource tagging fix..."
    
    check_aws_cli
    get_project_resources
    get_problematic_resources
    
    echo
    log "Resource Analysis Summary:"
    log "========================="
    
    # Show current project resources
    if [[ -f /tmp/project_resources.json ]]; then
        local project_count=$(cat /tmp/project_resources.json | jq '.ResourceTagMappingList | length')
        log "Project resources found: ${project_count}"
    fi
    
    # Show problematic resources
    if [[ -f /tmp/problematic_resources.json ]]; then
        local problematic_count=$(cat /tmp/problematic_resources.json | wc -l)
        if [[ $problematic_count -gt 0 ]]; then
            warn "Problematic resources found: ${problematic_count}"
            echo "Details saved in /tmp/problematic_resources.json"
        else
            log "✅ No problematic resources found"
        fi
    fi
    
    echo
    log "Executing fixes..."
    
    # Handle the problematic stack
    handle_problematic_stack
    
    # Clean up non-project resources
    cleanup_non_project_resources
    
    # Update serverless configuration
    update_serverless_config
    
    # Final validation
    echo
    validate_project_tagging
    
    echo
    log "🎉 Resource tagging fix completed!"
    log "Next steps:"
    log "1. Review the changes made"
    log "2. If stack was deleted, redeploy with: ./scripts/deploy.sh dev"
    log "3. Verify all resources have consistent tags"
    log "4. Set up tag policies to prevent future inconsistencies"
}

# Run main function
main "$@"