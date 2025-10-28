# KV Responder Deployment Options

This guide shows different deployment configurations based on your available monitoring infrastructure.

## 🚀 Quick Start - No External Services Required

The KV Responder works perfectly without any external monitoring services:

```bash
# Basic deployment - works on any Kubernetes cluster
helm install kv-responder ./helm --set tenant=production
```

**What you get:**
- ✅ Full KV cache functionality
- ✅ Structured JSON logs (via `kubectl logs`)
- ✅ Prometheus metrics endpoint
- ✅ Health checks and diagnostics
- ✅ Dynamic log level management

## 📊 Deployment Scenarios

### 1. Minimal Cluster (No Monitoring Stack)

**Use case:** Basic Kubernetes cluster, no Prometheus/Grafana

```bash
helm install kv-responder ./helm \
  --values examples/minimal-values.yaml \
  --set tenant=production
```

**Features:**
- Structured logs to stdout/stderr
- Metrics endpoint available (but not scraped)
- No tracing overhead
- Minimal resource usage

**Monitoring:**
```bash
# View logs
kubectl logs -l app.kubernetes.io/name=kv-responder --tail=100

# Check metrics manually
kubectl port-forward svc/kv-responder-production 3000:80
curl http://localhost:3000/metrics

# Health checks
curl http://localhost:3000/health
```

### 2. Prometheus Only

**Use case:** Cluster with Prometheus but no Grafana/Jaeger

```bash
helm install kv-responder ./helm \
  --values examples/prometheus-only-values.yaml \
  --set tenant=production
```

**Features:**
- Automatic metrics scraping
- ServiceMonitor or annotation-based discovery
- Production alerting ready (when you add AlertManager)
- No tracing overhead

### 3. Full Monitoring Stack

**Use case:** Complete observability with Prometheus, Grafana, Jaeger

```bash
helm install kv-responder ./helm \
  --values examples/monitoring-values.yaml \
  --set tenant=production
```

**Features:**
- Prometheus metrics with ServiceMonitor
- Grafana dashboard auto-deployment
- Distributed tracing to Jaeger
- Production alerting rules
- Log aggregation ready

## 🔧 Progressive Enhancement

Start minimal and add services as your cluster grows:

### Step 1: Basic Deployment
```bash
helm install kv-responder ./helm --set tenant=prod
```

### Step 2: Add Prometheus
```bash
helm upgrade kv-responder ./helm --set tenant=prod \
  --set metrics.serviceMonitor.enabled=true \
  --set metrics.serviceMonitor.labels.release=prometheus
```

### Step 3: Add Grafana
```bash
helm upgrade kv-responder ./helm --set tenant=prod \
  --set metrics.serviceMonitor.enabled=true \
  --set metrics.grafanaDashboard.enabled=true
```

### Step 4: Add Jaeger
```bash
helm upgrade kv-responder ./helm --set tenant=prod \
  --set metrics.serviceMonitor.enabled=true \
  --set metrics.grafanaDashboard.enabled=true \
  --set tracing.jaeger.enabled=true \
  --set tracing.jaeger.endpoint=http://jaeger-collector:14268/api/traces
```

## 🛡️ Error Handling

The service gracefully handles missing external services:

### Missing Jaeger
```
OpenTelemetry tracing initialized successfully
# No traces exported, but no errors
```

### Missing Prometheus
```
# Metrics endpoint still works
curl http://localhost:3000/metrics
# Returns metrics in Prometheus format
```

### Missing Log Aggregation
```
# Logs still go to stdout/stderr
kubectl logs deployment/kv-responder-prod
# Works normally
```

## 📋 Configuration Matrix

| Feature | Minimal | Prometheus Only | Full Stack |
|---------|---------|-----------------|------------|
| **Core Functionality** | ✅ | ✅ | ✅ |
| **Structured Logs** | ✅ (stdout) | ✅ (stdout) | ✅ (aggregated) |
| **Metrics Endpoint** | ✅ | ✅ | ✅ |
| **Metrics Scraping** | ❌ | ✅ | ✅ |
| **Dashboards** | ❌ | ❌ | ✅ |
| **Alerting** | ❌ | ⚠️ (ready) | ✅ |
| **Distributed Tracing** | ❌ | ❌ | ✅ |
| **Log Aggregation** | ❌ | ❌ | ✅ |

## 🔍 Troubleshooting

### Service Won't Start
```bash
# Check pod status
kubectl get pods -l app.kubernetes.io/name=kv-responder

# Check logs for errors
kubectl logs deployment/kv-responder-production

# Check configuration
helm get values kv-responder-production
```

### Metrics Not Working
```bash
# Test metrics endpoint directly
kubectl port-forward svc/kv-responder-production 3000:80
curl http://localhost:3000/metrics

# Check ServiceMonitor (if using)
kubectl get servicemonitor kv-responder-production -o yaml
```

### Tracing Issues
```bash
# Check if Jaeger endpoint is reachable
kubectl exec deployment/kv-responder-production -- \
  curl -f http://jaeger-collector:14268/api/traces

# Disable tracing if problematic
helm upgrade kv-responder ./helm --set tracing.enabled=false
```

## 🎯 Recommendations by Cluster Type

### Development/Testing
```yaml
# Use minimal configuration
metrics:
  enabled: true
  serviceMonitor:
    enabled: false
tracing:
  enabled: false
logging:
  level: "debug"
```

### Staging
```yaml
# Add Prometheus monitoring
metrics:
  enabled: true
  serviceMonitor:
    enabled: true
tracing:
  enabled: false
logging:
  level: "info"
```

### Production
```yaml
# Full monitoring stack
metrics:
  enabled: true
  serviceMonitor:
    enabled: true
  grafanaDashboard:
    enabled: true
  prometheusRules:
    enabled: true
tracing:
  enabled: true
  jaeger:
    enabled: true
logging:
  level: "info"
```

## 📚 Next Steps

1. **Start Simple**: Deploy with minimal configuration
2. **Add Monitoring**: Enable Prometheus when available
3. **Add Visualization**: Enable Grafana dashboards
4. **Add Tracing**: Enable Jaeger for complex debugging
5. **Add Log Aggregation**: Configure Elasticsearch/Loki for centralized logs

The service is designed to work perfectly at any level of monitoring sophistication!