#!/bin/bash

# Deploy multiple independent KV Discovery Service instances
# Each gets its own deployment, service, HPA, and ingress path

NAMESPACE=${1:-"default"}
IMAGE_TAG=${2:-"latest"}

echo "Deploying multiple independent KV Responder instances..."

# Build image once
echo "Building Docker image..."
docker build -t kv-responder-oci:$IMAGE_TAG .

# Deploy different service instances
TENANTS=("api" "cache")

for TENANT in "${TENANTS[@]}"; do
    echo ""
    echo "Deploying $TENANT instance..."
    
    helm upgrade --install kv-responder-$TENANT ./helm \
        --namespace $NAMESPACE \
        --create-namespace \
        --set tenant=$TENANT \
        --set image.tag=$IMAGE_TAG \
        -f examples/$TENANT-values.yaml \
        --wait
    
    echo "$TENANT instance deployed successfully!"
done

echo ""
echo "All deployments complete!"
echo ""
echo "Services available at:"
echo "  /api/     - High-performance API cache"
echo "  /cache/   - General purpose cache"
echo ""
echo "Check all instances:"
echo "  kubectl get pods -l app.kubernetes.io/name=kv-responder -n $NAMESPACE"
echo "  kubectl get hpa -l app.kubernetes.io/name=kv-responder -n $NAMESPACE"
echo "  kubectl get ingress -n $NAMESPACE"