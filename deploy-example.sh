#!/bin/bash

# Example deployment script for KV Discovery Service
# Usage: ./deploy-example.sh <tenant> [namespace] [image_tag]

TENANT=${1:-"default"}
NAMESPACE=${2:-"default"}
IMAGE_TAG=${3:-"latest"}

if [ "$TENANT" = "default" ]; then
    echo "Please specify a tenant for deployment"
    echo "Usage: $0 <tenant> [namespace] [image_tag]"
    echo "Example: $0 blessme production latest"
    exit 1
fi

echo "Deploying independent KV Responder instance with tenant: $TENANT"

# Build Docker image (only if not exists)
if ! docker images | grep -q "kv-responder-oci.*$IMAGE_TAG"; then
    echo "Building Docker image..."
    docker build -t kv-responder-oci:$IMAGE_TAG .
fi

# Deploy with Helm - each tenant gets its own release
echo "Deploying with Helm..."
helm upgrade --install kv-responder-$TENANT ./helm \
  --namespace $NAMESPACE \
  --create-namespace \
  --set tenant=$TENANT \
  --set image.tag=$IMAGE_TAG \
  --set replicaCount=3 \
  --wait

echo "Deployment complete!"
echo "Service will be available at: /$TENANT/"
echo "Check status with: kubectl get pods -l ingress-group=$TENANT -n $NAMESPACE"
echo "Check HPA with: kubectl get hpa -l app.kubernetes.io/tenant=$TENANT -n $NAMESPACE"