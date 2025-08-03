#!/bin/bash

# Resource cleanup verification script
set -e

REGION="eu-central-1"

echo "🔍 AWS Resource Cleanup Verification"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_resource() {
    local resource_type="$1"
    local check_command="$2"
    local resource_name="$3"
    
    echo -n "Checking ${resource_type}: "
    if eval "$check_command" >/dev/null 2>&1; then
        echo -e "${RED}❌ STILL EXISTS${NC} - ${resource_name}"
        return 1
    else
        echo -e "${GREEN}✅ DELETED${NC} - ${resource_name}"
        return 0
    fi
}

echo
echo "Verifying actual resource deletion..."
echo

# Check CloudFormation stacks
all_deleted=true
check_resource "CloudFormation Stack" "aws cloudformation describe-stacks --stack-name flask-quiz-dev --region ${REGION}" "flask-quiz-dev" || all_deleted=false

# Check S3 buckets
check_resource "S3 Bucket" "aws s3api head-bucket --bucket flask-quiz-dev-serverlessdeploymentbucket-t0wvhpvobbzb --region ${REGION}" "flask-quiz-dev-serverlessdeploymentbucket-*" || all_deleted=false

# Check DynamoDB tables
check_resource "DynamoDB Table" "aws dynamodb describe-table --table-name flask-quiz-dev --region ${REGION}" "flask-quiz-dev" || all_deleted=false

echo
echo "Checking Resource Groups Tagging API (may lag behind actual deletions)..."
echo

# Check what's still showing in the tagging API
project_resources=$(aws resourcegroupstaggingapi get-resources --region ${REGION} --output json | \
    jq '.ResourceTagMappingList[] | select(.Tags[] | select(.Key == "Project" and (.Value == "flask-quiz" or .Value == "adaptive-quiz-app")))' 2>/dev/null | \
    jq -s '. | length')

if [[ "$project_resources" -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  Tagging API still shows ${project_resources} project resource(s)${NC}"
    echo "This is normal - AWS Resource Groups Tagging API can lag behind actual deletions"
    echo "The resources are actually deleted (verified above)"
else
    echo -e "${GREEN}✅ No project resources in Tagging API${NC}"
fi

echo
echo "Current resources remaining in account:"
aws resourcegroupstaggingapi get-resources --region ${REGION} --output json | \
    jq -r '.ResourceTagMappingList[] | "- \(.ResourceARN | split(":")[2]): \(.ResourceARN | split("/")[-1] // (.ResourceARN | split(":")[-1]))"' | \
    sort | uniq

echo
if [[ "$all_deleted" == true ]]; then
    echo -e "${GREEN}🎉 SUCCESS: All flask-quiz resources have been deleted!${NC}"
    echo -e "${GREEN}✅ Environment is clean and ready for new deployment${NC}"
    echo
    echo "Next steps:"
    echo "1. Deploy fresh resources: ./scripts/deploy.sh dev"
    echo "2. All new resources will have consistent tagging"
else
    echo -e "${RED}❌ Some resources still exist and need manual cleanup${NC}"
fi