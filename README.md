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
- **Comprehensive Monitoring**: Prometheus metrics, structured logging, and Grafana dashboards with tenant context
- **Distributed Tracing**: OpenTelemetry integration for request tracing
- **Production Ready**: Health checks, metrics, security contexts, and resource
  limits

## Quick Start

```bash
# Build and publish container (automated via GitHub Actions)
git tag v1.0.0
git push origin v1.0.0

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
| `/<tenant>/diag`    | GET    | Diagnostic information    |
| `/<tenant>/admin/log-levels` | GET | Get current log levels |
| `/<tenant>/admin/log-levels` | PUT | Change log levels dynamically |

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
# Basic deployment (uses latest tag)
helm install kv-responder-api ./helm --set tenant=api

# Production with specific version
helm install kv-responder-api ./helm \
  --set tenant=api \
  --set image.tag=1.0.0

# Production with auto-scaling
helm install kv-responder-api ./helm -f examples/api-values.yaml

# Development with branch-specific image
helm install kv-responder-dev ./helm \
  --set tenant=dev \
  --set image.tag=develop

# With network isolation
helm install kv-responder-api ./helm -f examples/api-values.yaml --set networkPolicy.enabled=true

# Multiple tenants with different versions
helm install kv-responder-t1 ./helm -f examples/t1-values.yaml --set image.tag=1.0.0
helm install kv-responder-t2 ./helm -f examples/t2-values.yaml --set image.tag=1.1.0

# Debugging Helm
helm install kv-responder-d1 ./helm -f examples/d1-values.yaml --dry-run --debug
helm install kv-responder-d1 ./helm --dry-run --debug --set tenant=d1

# Debugging Template Only
helm template kv-responder-d2 ./helm

# See all values including defaults
helm get values kv-responder-d2 --all
```

## Monitoring & Observability

The KV Responder includes comprehensive monitoring capabilities optimized for Prometheus/Grafana:

### Features

- **Structured Logging**: JSON logs with tenant context for all operations
- **Prometheus Metrics**: HTTP requests, cache operations, peer discovery, and replication metrics
- **Grafana Dashboards**: Pre-built dashboards with tenant-specific views
- **Alerting Rules**: Production-ready alerts for errors, latency, and availability
- **Distributed Tracing**: OpenTelemetry integration for request flow analysis

### Quick Setup

```bash
# Deploy with full monitoring
helm install kv-responder-prod ./helm \
  --values examples/monitoring-values.yaml \
  --set tenant=production
```

### Key Metrics

- `kv_http_requests_total` - Request count by tenant, method, status
- `kv_cache_operations_total` - Cache hits/misses by tenant
- `kv_peers_count` - Active peer discovery by tenant
- `kv_replication_operations_total` - Replication success/failure rates

All metrics include tenant labels for multi-tenant monitoring.

See [docs/MONITORING.md](docs/MONITORING.md) for complete setup guide.

## Container Versioning & CI/CD

### Automated Container Publishing

The project uses GitHub Actions to automatically build and publish containers to GitHub Container Registry (GHCR):

- **Triggers**: Pushes to `main`/`develop`, Git tags, and pull requests
- **Registry**: `ghcr.io/owner/repo-name`
- **Multi-arch**: Builds for `linux/amd64` and `linux/arm64`

### Versioning Strategy

The CI/CD pipeline creates multiple image tags:

| Trigger | Image Tags Created |
|---------|-------------------|
| `git tag v1.0.0` | `1.0.0`, `1.0`, `latest` |
| Push to `main` | `main`, `latest`, `1.0.0` (from package.json) |
| Push to `develop` | `develop`, `develop-abc1234` |
| Feature branch | `feature-xyz`, `feature-xyz-abc1234` |

### Recommended Workflow

#### For Development
```bash
# Push to feature branch - creates feature-specific tags
git checkout -b feature/new-cache
git push origin feature/new-cache

# Deploy development version
helm install kv-test ./helm --set image.tag=feature-new-cache
```

#### For Production Releases
```bash
# 1. Update version in package.json
npm version patch  # or minor/major

# 2. Create and push git tag
git tag v$(node -p "require('./package.json').version")
git push origin main --tags

# 3. Deploy specific version (recommended for production)
helm install kv-prod ./helm --set image.tag=1.0.0
```

#### Quick Release Script
```bash
#!/bin/bash
# release.sh - Automated release workflow
npm version ${1:-patch}
VERSION=$(node -p "require('./package.json').version")
git tag v$VERSION
git push origin main --tags
echo "Released v$VERSION - check GitHub Actions for build status"
```

### Container Configuration Files

- **Dockerfile**: Multi-stage Node.js 22 Alpine build
- **GitHub Actions**: `.github/workflows/build-and-publish.yml`
- **Helm Values**: `helm/values.yaml` (update repository field)

### Image Pull Configuration

Update `helm/values.yaml` with your repository:
```yaml
image:
  repository: ghcr.io/yourusername/your-repo-name
  tag: "1.0.0"  # Use specific versions in production
```

## Configuration

### Environment Variables

- `TENANT` - Deployment tenant (required)
- `PORT` - Service port (default: 3000)
- `DISCOVERY_PORT` - UDP discovery port (default: 9999)
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `JAEGER_ENDPOINT` - Jaeger tracing endpoint (optional)

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
