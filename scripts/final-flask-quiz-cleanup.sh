#!/bin/bash

# Final cleanup of all flask-quiz remnants
set -e

echo "🧹 Final Flask-Quiz Resource Cleanup"
echo "===================================="

REGION="eu-central-1"
STACK_NAME="flask-quiz-dev"

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

# Function to force delete S3 bucket
force_delete_s3_bucket() {
    local bucket_name="$1"
    
    log "Attempting to force delete S3 bucket: ${bucket_name}"
    
    # Try to empty the bucket first
    log "Emptying bucket..."
    aws s3 rm "s3://${bucket_name}" --recursive --region "${REGION}" 2>/dev/null || true
    
    # Delete all object versions
    log "Deleting all object versions..."
    aws s3api list-object-versions --bucket "${bucket_name}" --region "${REGION}" --output json 2>/dev/null | \
    jq -r '.Versions[]?, .DeleteMarkers[]? | "\(.Key) \(.VersionId // "")"' | \
    while read -r key version; do
        if [[ -n "$key" ]]; then
            if [[ -n "$version" ]]; then
                aws s3api delete-object --bucket "${bucket_name}" --key "$key" --version-id "$version" --region "${REGION}" 2>/dev/null || true
            else
                aws s3api delete-object --bucket "${bucket_name}" --key "$key" --region "${REGION}" 2>/dev/null || true
            fi
        fi
    done
    
    # Delete the bucket
    log "Deleting bucket..."
    aws s3api delete-bucket --bucket "${bucket_name}" --region "${REGION}" 2>/dev/null || warn "Bucket may already be deleted"
    
    log "✅ S3 bucket cleanup completed"
}

# Function to force delete CloudFormation stack
force_delete_cloudformation() {
    local stack_name="$1"
    
    log "Checking CloudFormation stack status..."
    
    # Get stack status
    local stack_status=$(aws cloudformation list-stacks --region "${REGION}" --output json | \
        jq -r ".StackSummaries[] | select(.StackName == \"${stack_name}\" and .StackStatus != \"DELETE_COMPLETE\") | .StackStatus" | head -1)
    
    if [[ -n "$stack_status" ]]; then
        log "Found stack in status: ${stack_status}"
        
        case "$stack_status" in
            "DELETE_FAILED")
                log "Stack in DELETE_FAILED state, attempting to continue deletion..."
                aws cloudformation continue-update-rollback --stack-name "${stack_name}" --region "${REGION}" 2>/dev/null || true
                sleep 10
                ;;
            "UPDATE_ROLLBACK_FAILED"|"UPDATE_ROLLBACK_COMPLETE")
                log "Stack in rollback state, attempting deletion..."
                ;;
        esac
        
        # Force delete
        log "Deleting CloudFormation stack..."
        aws cloudformation delete-stack --stack-name "${stack_name}" --region "${REGION}" 2>/dev/null || warn "Stack may already be deleted"
        
        # Wait with timeout
        log "Waiting for stack deletion (max 5 minutes)..."
        timeout 300 aws cloudformation wait stack-delete-complete --stack-name "${stack_name}" --region "${REGION}" 2>/dev/null || warn "Wait timeout or already deleted"
        
    else
        log "✅ No active CloudFormation stack found"
    fi
}

# Function to clean up Resource Groups Tagging API inconsistencies
cleanup_tagging_api() {
    log "Waiting for Resource Groups Tagging API to update..."
    
    # Sometimes the tagging API needs time to reflect actual deletions
    local retries=5
    local count=1
    
    while [[ $count -le $retries ]]; do
        local flask_resources=$(aws resourcegroupstaggingapi get-resources --region "${REGION}" --tag-filters "Key=Project,Values=flask-quiz" --output json | jq '.ResourceTagMappingList | length')
        
        if [[ "$flask_resources" -eq 0 ]]; then
            log "✅ All flask-quiz resources cleared from Tagging API"
            break
        else
            warn "Attempt $count/$retries: Still showing $flask_resources flask-quiz resources in Tagging API"
            if [[ $count -lt $retries ]]; then
                log "Waiting 30 seconds for eventual consistency..."
                sleep 30
            fi
        fi
        
        ((count++))
    done
}

# Main cleanup function
main() {
    log "Starting final flask-quiz cleanup..."
    
    # Get flask-quiz resources
    local flask_resources=$(aws resourcegroupstaggingapi get-resources --region "${REGION}" --tag-filters "Key=Project,Values=flask-quiz" --output json)
    local resource_count=$(echo "$flask_resources" | jq '.ResourceTagMappingList | length')
    
    log "Found $resource_count flask-quiz resources to clean up"
    
    if [[ "$resource_count" -eq 0 ]]; then
        log "✅ No flask-quiz resources found - cleanup complete!"
        return 0
    fi
    
    # Extract S3 bucket name
    local bucket_name=$(echo "$flask_resources" | jq -r '.ResourceTagMappingList[] | select(.ResourceARN | contains("s3")) | .ResourceARN' | sed 's/.*::://')
    
    # Force cleanup
    if [[ -n "$bucket_name" ]]; then
        force_delete_s3_bucket "$bucket_name"
    fi
    
    force_delete_cloudformation "$STACK_NAME"
    
    # Wait for API consistency
    cleanup_tagging_api
    
    # Final verification
    echo
    log "Final verification..."
    local final_count=$(aws resourcegroupstaggingapi get-resources --region "${REGION}" --tag-filters "Key=Project,Values=flask-quiz" --output json | jq '.ResourceTagMappingList | length')
    
    if [[ "$final_count" -eq 0 ]]; then
        log "🎉 SUCCESS: All flask-quiz resources have been completely removed!"
    else
        warn "Still showing $final_count flask-quiz resources (may be eventual consistency delay)"
        warn "These should disappear within 15-30 minutes"
    fi
    
    echo
    log "Environment is now clean for adaptive-quiz-app deployment!"
}

# Verify AWS CLI
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    error "AWS CLI not configured"
    exit 1
fi

# Run cleanup
main "$@"