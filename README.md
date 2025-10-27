# KV Responder

A multi-tenant Node.js service that provides distributed in-memory key-value
storage with automatic pod discovery. Each tenant gets isolated cache clusters
that scale independently.

## Features

- **Multi-Tenant Architecture**: Deploy isolated cache clusters per tenant with
  independent scaling
- **Zero-Config Discovery**: Automatic pod discovery via UDP multicast (no
  Kubernetes API permissions)
- **Distributed Cache**: Consistent hashing with configurable replication and
  automatic failover
- **Advanced Auto-Scaling**: Tenant-specific HPA with custom metrics and scaling
  behaviors
- **Network Isolation**: Optional NetworkPolicies for complete tenant separation
- **Production Ready**: Health checks, metrics, security contexts, and resource
  limits

## Quick Start

```bash
# Build the container
docker build -t kv-responder-oci:latest .

# Deploy a tenant
helm install kv-responder-analytics ./helm --set tenant=analytics
```

This creates an isolated cache cluster accessible at `/analytics/` with
automatic scaling and pod discovery.

## Architecture

### Multi-Tenant Design

Each tenant is completely isolated with its own:

- **Kubernetes Resources**: Deployment, Service, HPA, Ingress
- **Network Discovery**: UDP multicast group (239.255.x.x)
- **Cache Cluster**: Independent key-value storage
- **Scaling Policy**: Tenant-specific HPA configuration

```yaml
tenant: "analytics" # Creates /analytics/ endpoint and isolated cluster
```

### Isolation Levels

1. **Application**: Message filtering by tenant
2. **Network**: Unique multicast addresses per tenant
3. **Policy**: Optional NetworkPolicies for complete separation

```yaml
networkPolicy:
  enabled: true # Enable for production isolation
```

### Independent Scaling

Each tenant has its own HPA with workload-optimized behaviors:

- **API Workloads**: Fast scale-up (30s), slow scale-down (10min)
- **Cache Workloads**: Gradual scaling to prevent cache churn
- **Custom**: Define your own scaling patterns

## API Reference

| Endpoint            | Method | Description               |
| ------------------- | ------ | ------------------------- |
| `/<tenant>/kv/:key` | GET    | Get value by key          |
| `/<tenant>/kv/:key` | PUT    | Set key-value pair        |
| `/<tenant>/kv/:key` | DELETE | Delete key                |
| `/<tenant>/kv`      | GET    | List all keys             |
| `/<tenant>/health`  | GET    | Health and cluster status |
| `/<tenant>/peers`   | GET    | Show discovered peers     |
| `/<tenant>/metrics` | GET    | Prometheus metrics        |

```bash
# Example usage
curl -X PUT http://your-service/analytics/kv/mykey \
  -H "Content-Type: application/json" \
  -d '{"value": "hello world"}'

curl http://your-service/analytics/kv/mykey
```

### Technical Details

**Discovery**: UDP multicast with 30s heartbeats, no Kubernetes API access
needed\
**Cache**: Consistent hashing, 2x replication, automatic failover\
**Security**: Non-root execution, read-only filesystem, resource limits

## Deployment Examples

```bash
# Basic deployment
helm install kv-responder-api ./helm --set tenant=api

# Production with auto-scaling
helm install kv-responder-api ./helm -f examples/api-values.yaml

# With network isolation
helm install kv-responder-api ./helm -f examples/api-values.yaml --set networkPolicy.enabled=true

# Multiple tenants
helm install kv-responder-api ./helm -f examples/api-values.yaml
helm install kv-responder-cache ./helm -f examples/cache-values.yaml
```

## Configuration

### Environment Variables

- `TENANT` - Deployment tenant (required)
- `PORT` - Service port (default: 3000)
- `DISCOVERY_PORT` - UDP discovery port (default: 9999)

### Development

```bash
npm install
npm run dev
```

## Troubleshooting

**Discovery Issues**: Check UDP port 9999 connectivity and tenant names match\
**Cache Issues**: Verify HTTP port 3000 connectivity between pods\
**Scaling Issues**: Check HPA metrics and resource limits

---

## Adding New Tenants

**TL;DR**: `helm install kv-responder-mytenant ./helm --set tenant=mytenant`

### Quick Start

```bash
helm install kv-responder-analytics ./helm --set tenant=analytics
```

### Custom Configuration

```bash
# Copy template and customize
cp examples/template-values.yaml examples/analytics-values.yaml
# Edit tenant name and resources
helm install kv-responder-analytics ./helm -f examples/analytics-values.yaml
```

### Auto-Created Resources

- Deployment, Service, HPA (if enabled)
- Ingress route: `/<tenant>/`
- NetworkPolicy (if enabled)
- ServiceMonitor (if enabled)

### Example Files

- `template-values.yaml` - Copy for new tenants
- `api-values.yaml` - High-performance workload
- `cache-values.yaml` - Conservative workload

### Verification

```bash
kubectl get pods -l ingress-group=analytics
curl http://your-ingress/analytics/health
```

## Managing Tenants

```bash
# List all tenants
helm list | grep kv-responder

# Update a tenant
helm upgrade kv-responder-analytics ./helm -f examples/analytics-values.yaml

# Remove a tenant
helm uninstall kv-responder-analytics

# Verify isolation
curl http://your-ingress/analytics/peers  # Should only show analytics peers
```
