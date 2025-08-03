#!/bin/bash

# Comprehensive AWS Resource Discovery and Tagging Audit
set -e

echo "🔍 Comprehensive AWS Resource Audit"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

info() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')] INFO: $1${NC}"
}

# Function to check resources in a specific region
check_region() {
    local region="$1"
    local total_resources=$(aws resourcegroupstaggingapi get-resources --region "$region" --output json 2>/dev/null | jq '.ResourceTagMappingList | length' 2>/dev/null || echo "0")
    local untagged_resources=$(aws resourcegroupstaggingapi get-resources --region "$region" --output json 2>/dev/null | jq '.ResourceTagMappingList[] | select(.Tags | length == 0)' 2>/dev/null | jq -s '. | length' || echo "0")
    
    if [[ "$total_resources" -gt 0 ]]; then
        echo "$region: $total_resources total, $untagged_resources untagged"
        
        if [[ "$untagged_resources" -gt 0 ]]; then
            echo "  Untagged resources in $region:"
            aws resourcegroupstaggingapi get-resources --region "$region" --output json 2>/dev/null | \
                jq -r '.ResourceTagMappingList[] | select(.Tags | length == 0) | "    - \(.ResourceARN | split(":")[2]): \(.ResourceARN)"' 2>/dev/null | head -5
            
            if [[ "$untagged_resources" -gt 5 ]]; then
                echo "    ... and $((untagged_resources - 5)) more"
            fi
        fi
        echo
    fi
}

# Function to get comprehensive resource count across all services
get_comprehensive_count() {
    log "Getting comprehensive resource count across all accessible regions..."
    
    # Get all available regions
    local regions=$(aws ec2 describe-regions --output text --query 'Regions[].RegionName' 2>/dev/null | head -10)
    
    local total_all_regions=0
    local total_untagged=0
    
    echo "Region Analysis:"
    echo "==============="
    
    for region in $regions; do
        local region_count=$(aws resourcegroupstaggingapi get-resources --region "$region" --output json 2>/dev/null | jq '.ResourceTagMappingList | length' 2>/dev/null || echo "0")
        local region_untagged=$(aws resourcegroupstaggingapi get-resources --region "$region" --output json 2>/dev/null | jq '.ResourceTagMappingList[] | select(.Tags | length == 0)' 2>/dev/null | jq -s '. | length' 2>/dev/null || echo "0")
        
        if [[ "$region_count" -gt 0 ]]; then
            echo "$region: $region_count total ($region_untagged untagged)"
            total_all_regions=$((total_all_regions + region_count))
            total_untagged=$((total_untagged + region_untagged))
        fi
    done
    
    echo
    echo "SUMMARY:"
    echo "Total resources found: $total_all_regions"
    echo "Total untagged: $total_untagged"
    
    if [[ "$total_untagged" -ne 378 ]]; then
        warn "Your reported 378 untagged resources doesn't match our count of $total_untagged"
        warn "The 378 count might be from a different tool (AWS Config, Cost Explorer, etc.)"
    fi
}

# Function to analyze specific service resources that might not show up in Resource Groups Tagging API
check_additional_services() {
    log "Checking additional services that might not appear in Resource Groups Tagging API..."
    
    echo "IAM Resources:"
    echo "============="
    
    # IAM Users
    local iam_users=$(aws iam list-users --output json | jq '.Users | length')
    echo "IAM Users: $iam_users"
    
    # IAM Roles  
    local iam_roles=$(aws iam list-roles --output json | jq '.Roles | length')
    echo "IAM Roles: $iam_roles"
    
    # IAM Policies
    local iam_policies=$(aws iam list-policies --scope Local --output json | jq '.Policies | length')
    echo "IAM Policies (Customer Managed): $iam_policies"
    
    echo
    echo "CloudWatch Resources:"
    echo "===================="
    
    # CloudWatch Alarms
    for region in us-east-1 eu-central-1 us-west-2; do
        local cw_alarms=$(aws cloudwatch describe-alarms --region "$region" --output json 2>/dev/null | jq '.MetricAlarms | length' 2>/dev/null || echo "0")
        if [[ "$cw_alarms" -gt 0 ]]; then
            echo "CloudWatch Alarms in $region: $cw_alarms"
        fi
    done
    
    echo
    echo "EC2 Resources:"
    echo "============="
    
    # Check for EC2 instances, volumes, etc.
    for region in us-east-1 eu-central-1 us-west-2; do
        local ec2_instances=$(aws ec2 describe-instances --region "$region" --output json 2>/dev/null | jq '.Reservations[].Instances | length' 2>/dev/null || echo "0")
        local ebs_volumes=$(aws ec2 describe-volumes --region "$region" --output json 2>/dev/null | jq '.Volumes | length' 2>/dev/null || echo "0")
        
        if [[ "$ec2_instances" -gt 0 ]] || [[ "$ebs_volumes" -gt 0 ]]; then
            echo "$region - EC2 Instances: $ec2_instances, EBS Volumes: $ebs_volumes"
        fi
    done
}

# Function to identify the likely source of 378 count
identify_source() {
    log "Attempting to identify source of 378 untagged resources..."
    
    echo "Possible sources of the 378 count:"
    echo "1. AWS Config - Compliance dashboard"
    echo "2. AWS Cost Explorer - Resource analysis"
    echo "3. AWS Systems Manager - Resource Groups"
    echo "4. Third-party tools (Terraform, CloudFormation)"
    echo "5. AWS Tag Editor in AWS Console"
    echo
    
    info "To get the exact same count, please check:"
    info "1. AWS Console > Resource Groups & Tag Editor > Tag Editor"
    info "2. AWS Console > Config > Compliance"
    info "3. AWS Console > Cost Management > Cost Explorer"
    info "4. If using Terraform/CDK: terraform plan or cdk diff"
}

# Function to create bulk tagging strategy
create_bulk_tagging_strategy() {
    log "Creating bulk tagging strategy for common untagged resources..."
    
    cat > /tmp/bulk_tagging_strategy.json << 'EOF'
{
  "globalTags": {
    "Environment": "production",
    "Owner": "localuser",
    "ManagedBy": "manual",
    "CostCenter": "infrastructure"
  },
  "serviceSpecificTags": {
    "iam": {
      "Component": "security",
      "ResourceType": "iam-resource"
    },
    "cloudwatch": {
      "Component": "monitoring",
      "ResourceType": "alarm"
    },
    "ec2": {
      "Component": "compute",
      "ResourceType": "instance"
    },
    "s3": {
      "Component": "storage",
      "ResourceType": "bucket"
    }
  },
  "exclusions": [
    "aws-service-role",
    "AWSServiceRole",
    "service-linked-role"
  ]
}
EOF

    log "Bulk tagging strategy saved to /tmp/bulk_tagging_strategy.json"
}

# Main execution
main() {
    log "Starting comprehensive AWS resource audit..."
    
    # Check AWS CLI configuration
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        error "AWS CLI not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    log "Auditing AWS Account: $account_id"
    
    echo
    get_comprehensive_count
    
    echo
    check_additional_services
    
    echo
    identify_source
    
    echo
    create_bulk_tagging_strategy
    
    echo
    log "Audit completed! Check the output above to understand your resource distribution."
    
    warn "If you're seeing 378 untagged resources in AWS Console:"
    warn "1. Use AWS Tag Editor to bulk tag resources"
    warn "2. Consider AWS Config Rules for tag compliance"
    warn "3. Implement tag policies via AWS Organizations"
}

# Run main function
main "$@"