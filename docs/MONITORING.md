# KV Responder Monitoring Guide

This guide explains how to set up comprehensive monitoring and observability for
the KV Responder service with Prometheus, Grafana, and log aggregation.

## Overview

The KV Responder service provides extensive observability features:

- **Structured Logging**: JSON-formatted logs with tenant context
- **Prometheus Metrics**: Comprehensive metrics for monitoring and alerting
- **OpenTelemetry Tracing**: Distributed tracing support
- **Grafana Dashboards**: Pre-built dashboards for visualization
- **Alerting Rules**: Production-ready Prometheus alerts

## Quick Start

### 1. Enable Monitoring

Deploy with monitoring enabled:

```bash
helm install kv-responder ./helm \
  --values examples/monitoring-values.yaml \
  --set tenant=production
```

### 2. Verify Metrics

Check that metrics are being exposed:

```bash
kubectl port-forward svc/kv-responder-production 3000:80
curl http://localhost:3000/metrics
```

### 3. Import Grafana Dashboard

The Grafana dashboard is automatically created as a ConfigMap when
`metrics.grafanaDashboard.enabled=true`.

## Metrics Reference

### HTTP Metrics

| Metric                             | Type      | Description           | Labels                                     |
| ---------------------------------- | --------- | --------------------- | ------------------------------------------ |
| `kv_http_requests_total`           | Counter   | Total HTTP requests   | `tenant`, `method`, `route`, `status_code` |
| `kv_http_request_duration_seconds` | Histogram | HTTP request duration | `tenant`, `method`, `route`, `status_code` |

### Cache Metrics

| Metric                      | Type    | Description             | Labels                          |
| --------------------------- | ------- | ----------------------- | ------------------------------- |
| `kv_cache_operations_total` | Counter | Cache operations        | `tenant`, `operation`, `result` |
| `kv_cache_size`             | Gauge   | Number of keys in cache | `tenant`                        |

### Discovery Metrics

| Metric                        | Type    | Description                | Labels                        |
| ----------------------------- | ------- | -------------------------- | ----------------------------- |
| `kv_peers_count`              | Gauge   | Number of discovered peers | `tenant`                      |
| `kv_discovery_messages_total` | Counter | Discovery messages         | `tenant`, `type`, `direction` |

### Replication Metrics

| Metric                            | Type    | Description            | Labels                          |
| --------------------------------- | ------- | ---------------------- | ------------------------------- |
| `kv_replication_operations_total` | Counter | Replication operations | `tenant`, `operation`, `result` |

### System Metrics

| Metric              | Type    | Description             | Labels   |
| ------------------- | ------- | ----------------------- | -------- |
| `kv_uptime_seconds` | Gauge   | Service uptime          | `tenant` |
| `kv_process_*`      | Various | Node.js process metrics | `tenant` |

## Structured Logging

### Log Format

All logs are structured JSON with tenant context:

```json
{
    "level": "info",
    "time": "2024-01-15T10:30:00.000Z",
    "msg": "Key retrieved successfully",
    "tenant": "production",
    "service": "kv-responder",
    "version": "1.0.0",
    "environment": "production",
    "namespace": "default",
    "podName": "kv-responder-production-abc123",
    "podIP": "10.244.1.5",
    "key": "user:123"
}
```

### Log Levels

- `debug`: Detailed debugging information
- `info`: General operational messages
- `warn`: Warning conditions
- `error`: Error conditions

### Request Logging

HTTP requests are automatically logged with:

```json
{
    "level": "info",
    "time": "2024-01-15T10:30:00.000Z",
    "msg": "GET /kv/user:123 completed",
    "tenant": "production",
    "req": {
        "method": "GET",
        "url": "/kv/user:123",
        "remoteAddress": "10.244.1.10",
        "userAgent": "curl/7.68.0"
    },
    "res": {
        "statusCode": 200,
        "responseTime": 15.5
    }
}
```

## Alerting Rules

### Critical Alerts

- **KVResponderPodDown**: Pod is not responding
- **KVResponderHighErrorRate**: Error rate > 10%

### Warning Alerts

- **KVResponderHighLatency**: 95th percentile > 1s
- **KVResponderNoPeers**: No peers discovered for 5 minutes
- **KVResponderReplicationFailures**: Replication errors detected

### Info Alerts

- **KVResponderHighCacheMissRate**: Cache miss rate > 80%

## Grafana Dashboard

The included dashboard provides:

1. **HTTP Request Rate**: Real-time request throughput
2. **Request Duration**: Latency percentiles
3. **Cache Operations**: Cache hit/miss rates
4. **Peer Discovery**: Active peer count
5. **Cache Size**: Keys per pod
6. **Replication Status**: Replication success/failure rates
7. **Resource Usage**: Memory and CPU utilization

## Log Aggregation

### Elasticsearch Integration

Use the provided Fluent Bit configuration for log aggregation:

```bash
kubectl apply -f examples/log-aggregation-config.yaml
```

### Log Queries

Common Elasticsearch queries:

```json
# All logs for a tenant
{
  "query": {
    "term": {
      "tenant": "production"
    }
  }
}

# Error logs in the last hour
{
  "query": {
    "bool": {
      "must": [
        {"term": {"tenant": "production"}},
        {"term": {"level": "error"}},
        {"range": {"@timestamp": {"gte": "now-1h"}}}
      ]
    }
  }
}

# Cache operations
{
  "query": {
    "bool": {
      "must": [
        {"term": {"tenant": "production"}},
        {"exists": {"field": "key"}}
      ]
    }
  }
}
```

## Distributed Tracing

### Jaeger Integration

Enable tracing in your values:

```yaml
tracing:
    enabled: true
    jaeger:
        enabled: true
        endpoint: "http://jaeger-collector:14268/api/traces"
```

### Trace Context

All operations include tenant information in trace metadata:

- Service name: `kv-responder`
- Tenant: From environment variable
- Pod information: Name, IP, namespace
- Operation context: HTTP method, route, cache operations

## Production Recommendations

### 1. Resource Allocation

```yaml
resources:
    limits:
        cpu: 1000m
        memory: 1Gi
    requests:
        cpu: 500m
        memory: 512Mi
```

### 2. Monitoring Stack

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **Elasticsearch**: Log aggregation and search
- **Jaeger**: Distributed tracing

### 3. Alert Manager Configuration

Configure AlertManager to route alerts by tenant:

```yaml
route:
    group_by: ["tenant", "alertname"]
    routes:
        - match:
              tenant: production
          receiver: production-team
        - match:
              tenant: staging
          receiver: staging-team
```

### 4. Log Retention

Configure appropriate retention policies:

- **Metrics**: 30 days (adjust based on storage)
- **Logs**: 7 days for debug, 30 days for info/warn/error
- **Traces**: 3 days (high volume)

### 5. Security Considerations

- Use RBAC for Prometheus ServiceMonitor access
- Secure log aggregation endpoints
- Implement network policies for monitoring traffic
- Use TLS for all monitoring communications

## Troubleshooting

### Common Issues

1. **Metrics not appearing**: Check ServiceMonitor labels match Prometheus
   configuration
2. **High cardinality**: Review metric labels, especially dynamic values
3. **Log parsing errors**: Verify JSON format and Fluent Bit parser
   configuration
4. **Missing traces**: Check Jaeger endpoint connectivity and sampling rates

### Debug Commands

```bash
# Check metrics endpoint
kubectl exec -it deployment/kv-responder-production -- curl localhost:3000/metrics

# View recent logs
kubectl logs -l app.kubernetes.io/name=kv-responder --tail=100

# Check ServiceMonitor
kubectl get servicemonitor kv-responder-production -o yaml

# Verify Prometheus targets
kubectl port-forward svc/prometheus 9090:9090
# Visit http://localhost:9090/targets
```

## Performance Impact

The monitoring setup has minimal performance impact:

- **Metrics collection**: ~1-2ms per request
- **Structured logging**: ~0.5ms per log entry
- **Tracing**: ~1-3ms per traced operation (when enabled)
- **Memory overhead**: ~10-20MB for monitoring libraries

Monitor the `kv_process_*` metrics to track resource usage impact.
