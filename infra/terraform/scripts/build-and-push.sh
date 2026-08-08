#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/build-and-push.sh <ecr_repository_url> <image_tag>
# Get <ecr_repository_url> from: terraform output -raw ecr_repository_url

REPO_URL="${1:?Usage: build-and-push.sh <ecr_repository_url> <image_tag>}"
TAG="${2:?Usage: build-and-push.sh <ecr_repository_url> <image_tag>}"
REGION="${AWS_REGION:-us-east-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO_URL%%/*}"

docker build -f docker/api.Dockerfile --target prod -t "${REPO_URL}:${TAG}" .
docker push "${REPO_URL}:${TAG}"

echo "Pushed ${REPO_URL}:${TAG}"
echo "Next: terraform apply -var-file=environments/learnerlab.tfvars -var=\"image_tag=${TAG}\""
