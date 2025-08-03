#!/bin/bash

# Force cleanup script for failed stack deletion
set -e

REGION="eu-central-1"
STACK_NAME="flask-quiz-dev"

echo "🧹 Force cleanup of flask-quiz-dev resources"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"
}

# Function to empty and delete S3 bucket
cleanup_s3_bucket() {
    local bucket_name="$1"
    log "Cleaning up S3 bucket: ${bucket_name}"
    
    # Check if bucket exists
    if aws s3api head-bucket --bucket "${bucket_name}" --region "${REGION}" 2>/dev/null; then
        log "Bucket exists, proceeding with cleanup..."
        
        # Delete all objects and versions
        log "Deleting all objects..."
        aws s3 rm "s3://${bucket_name}" --recursive --region "${REGION}" 2>/dev/null || true
        
        # Delete all object versions (if versioning enabled)
        log "Deleting all object versions..."
        aws s3api list-object-versions --bucket "${bucket_name}" --region "${REGION}" --output json 2>/dev/null | \
        jq -r '.Versions[]?, .DeleteMarkers[]? | "\(.Key) \(.VersionId)"' | \
        while read key version; do
            if [[ -n "$key" && -n "$version" ]]; then
                aws s3api delete-object --bucket "${bucket_name}" --key "$key" --version-id "$version" --region "${REGION}" 2>/dev/null || true
            fi
        done
        
        # Delete the bucket
        log "Deleting bucket..."
        aws s3api delete-bucket --bucket "${bucket_name}" --region "${REGION}" 2>/dev/null || true
        
        log "✅ S3 bucket cleanup completed"
    else
        log "S3 bucket not found or already deleted"
    fi
}

# Function to delete DynamoDB table
cleanup_dynamodb_table() {
    local table_name="$1"
    log "Cleaning up DynamoDB table: ${table_name}"
    
    # Check if table exists
    if aws dynamodb describe-table --table-name "${table_name}" --region "${REGION}" 2>/dev/null; then
        log "Table exists, deleting..."
        aws dynamodb delete-table --table-name "${table_name}" --region "${REGION}"
        
        log "Waiting for table deletion..."
        aws dynamodb wait table-not-exists --table-name "${table_name}" --region "${REGION}"
        
        log "✅ DynamoDB table deleted"
    else
        log "DynamoDB table not found or already deleted"
    fi
}

# Function to force delete CloudFormation stack
force_delete_stack() {
    log "Attempting to delete CloudFormation stack..."
    
    # Check current stack status
    local stack_status=$(aws cloudformation list-stacks --region "${REGION}" --output json | \
        jq -r ".StackSummaries[] | select(.StackName == \"${STACK_NAME}\" and .StackStatus != \"DELETE_COMPLETE\") | .StackStatus" | head -1)
    
    if [[ -n "$stack_status" ]]; then
        log "Current stack status: ${stack_status}"
        
        if [[ "$stack_status" == "DELETE_FAILED" ]]; then
            warn "Stack is in DELETE_FAILED state. Attempting to continue deletion..."
            aws cloudformation continue-update-rollback --stack-name "${STACK_NAME}" --region "${REGION}" 2>/dev/null || true
            sleep 5
        fi
        
        # Try to delete the stack
        log "Deleting CloudFormation stack..."
        aws cloudformation delete-stack --stack-name "${STACK_NAME}" --region "${REGION}"
        
        # Wait for deletion with timeout
        log "Waiting for stack deletion (this may take a few minutes)..."
        timeout 300 aws cloudformation wait stack-delete-complete --stack-name "${STACK_NAME}" --region "${REGION}" 2>/dev/null || {
            warn "Stack deletion wait timed out or failed"
        }
        
        # Check final status
        local final_status=$(aws cloudformation list-stacks --region "${REGION}" --output json | \
            jq -r ".StackSummaries[] | select(.StackName == \"${STACK_NAME}\") | .StackStatus" | head -1)
        
        if [[ "$final_status" == "DELETE_COMPLETE" ]]; then
            log "✅ Stack deleted successfully"
        else
            warn "Stack deletion may have failed. Final status: ${final_status}"
        fi
    else
        log "✅ Stack not found or already deleted"
    fi
}

# Main cleanup process
main() {
    log "Starting force cleanup process..."
    
    # Get the S3 bucket name from the current resources
    local bucket_name=$(aws resourcegroupstaggingapi get-resources --region "${REGION}" --output json | \
        jq -r '.ResourceTagMappingList[] | select(.ResourceARN | contains("s3")) | select(.Tags[] | select(.Key == "Project" and (.Value == "flask-quiz" or .Value == "adaptive-quiz-app"))) | .ResourceARN' | \
        sed 's/.*::://')
    
    # Get the DynamoDB table name
    local table_name=$(aws resourcegroupstaggingapi get-resources --region "${REGION}" --output json | \
        jq -r '.ResourceTagMappingList[] | select(.ResourceARN | contains("dynamodb")) | select(.Tags[] | select(.Key == "Project" and (.Value == "flask-quiz" or .Value == "adaptive-quiz-app"))) | .ResourceARN' | \
        sed 's/.*table\///')
    
    echo
    log "Found resources to clean up:"
    [[ -n "$bucket_name" ]] && log "- S3 Bucket: ${bucket_name}"
    [[ -n "$table_name" ]] && log "- DynamoDB Table: ${table_name}"
    log "- CloudFormation Stack: ${STACK_NAME}"
    
    echo
    read -p "⚠️  This will permanently delete these resources. Continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo
        log "Proceeding with cleanup..."
        
        # Clean up S3 bucket first (often prevents stack deletion)
        if [[ -n "$bucket_name" ]]; then
            cleanup_s3_bucket "$bucket_name"
        fi
        
        # Clean up DynamoDB table
        if [[ -n "$table_name" ]]; then
            cleanup_dynamodb_table "$table_name"
        fi
        
        # Delete the CloudFormation stack
        force_delete_stack
        
        echo
        log "🎉 Cleanup completed!"
        log "You can now run a fresh deployment with: ./scripts/deploy.sh dev"
        
    else
        log "Cleanup cancelled by user"
        exit 1
    fi
}

# Verify AWS CLI is configured
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    error "AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

# Run main function
main "$@"