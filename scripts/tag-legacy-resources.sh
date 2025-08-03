#!/bin/bash

# Tag legacy untagged resources
set -e

echo "🏷️  Tagging Legacy AWS Resources"
echo "================================="

# Standard organizational tags
OWNER="localuser"
MANAGED_BY="manual"
COST_CENTER="infrastructure"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"
}

# Function to tag IAM policy
tag_iam_policy() {
    local policy_arn="$1"
    local policy_name=$(echo "$policy_arn" | cut -d'/' -f2)
    
    log "Tagging IAM policy: $policy_name"
    
    # Determine purpose based on policy name
    local purpose="legacy"
    local component="iam"
    
    if [[ "$policy_name" == *"CodeStar"* ]]; then
        purpose="development"
        component="codestar"
    elif [[ "$policy_name" == *"S3"* ]]; then
        component="storage-access"
    fi
    
    aws iam tag-policy \
        --policy-arn "$policy_arn" \
        --tags Key=Owner,Value="$OWNER" \
               Key=ManagedBy,Value="$MANAGED_BY" \
               Key=CostCenter,Value="$COST_CENTER" \
               Key=Purpose,Value="$purpose" \
               Key=Component,Value="$component" \
               Key=ResourceType,Value="iam-policy" 2>/dev/null || warn "Failed to tag $policy_name"
    
    log "✅ Tagged IAM policy: $policy_name"
}

# Function to tag CloudWatch alarm
tag_cloudwatch_alarm() {
    local alarm_arn="$1"
    local alarm_name=$(echo "$alarm_arn" | cut -d':' -f6)
    local region=$(echo "$alarm_arn" | cut -d':' -f4)
    
    log "Tagging CloudWatch alarm: $alarm_name"
    
    aws cloudwatch tag-resource \
        --resource-arn "$alarm_arn" \
        --tags Key=Owner,Value="$OWNER" \
               Key=ManagedBy,Value="$MANAGED_BY" \
               Key=CostCenter,Value="$COST_CENTER" \
               Key=Purpose,Value="billing-monitoring" \
               Key=Component,Value="monitoring" \
               Key=ResourceType,Value="cloudwatch-alarm" \
        --region "$region" 2>/dev/null || warn "Failed to tag $alarm_name"
    
    log "✅ Tagged CloudWatch alarm: $alarm_name"
}

# Function to handle payments instrument (cannot be tagged)
handle_payment_instrument() {
    local payment_arn="$1"
    warn "Payment instruments cannot be tagged: $payment_arn"
    warn "This is an AWS billing/payment resource - tagging not supported"
}

# Main function
main() {
    log "Starting to tag legacy untagged resources..."
    
    # Get all untagged resources in us-east-1
    local untagged_resources=$(aws resourcegroupstaggingapi get-resources --region us-east-1 --output json | \
        jq -r '.ResourceTagMappingList[] | select(.Tags | length == 0) | .ResourceARN')
    
    local tagged_count=0
    local skipped_count=0
    
    while IFS= read -r arn; do
        [[ -z "$arn" ]] && continue
        
        local service=$(echo "$arn" | cut -d':' -f3)
        
        case "$service" in
            "iam")
                tag_iam_policy "$arn"
                ((tagged_count++))
                ;;
            "cloudwatch")
                tag_cloudwatch_alarm "$arn"
                ((tagged_count++))
                ;;
            "payments")
                handle_payment_instrument "$arn"
                ((skipped_count++))
                ;;
            *)
                warn "Unknown service type: $service for $arn"
                ((skipped_count++))
                ;;
        esac
        
        sleep 1  # Rate limiting
        
    done <<< "$untagged_resources"
    
    echo
    log "Tagging completed!"
    log "Resources tagged: $tagged_count"
    log "Resources skipped: $skipped_count"
    
    # Verify results
    echo
    log "Verification - remaining untagged resources:"
    local remaining=$(aws resourcegroupstaggingapi get-resources --region us-east-1 --output json | \
        jq '.ResourceTagMappingList[] | select(.Tags | length == 0)' | jq -s '. | length')
    
    if [[ "$remaining" -eq 0 ]]; then
        log "🎉 SUCCESS: All taggable resources in us-east-1 are now tagged!"
    else
        warn "$remaining untagged resources remain (likely payment instruments)"
    fi
}

# Check AWS CLI configuration
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "❌ AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

# Run main function
main "$@"