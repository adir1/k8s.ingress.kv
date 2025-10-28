const client = require('prom-client');

class MetricsCollector {
  constructor(tenant) {
    this.tenant = tenant;
    this.register = new client.Registry();
    
    // Add default metrics
    client.collectDefaultMetrics({
      register: this.register,
      prefix: 'kv_',
      labels: { tenant: this.tenant }
    });

    // Custom metrics
    this.httpRequestsTotal = new client.Counter({
      name: 'kv_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['tenant', 'method', 'route', 'status_code'],
      registers: [this.register]
    });

    this.httpRequestDuration = new client.Histogram({
      name: 'kv_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['tenant', 'method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.register]
    });

    this.cacheOperationsTotal = new client.Counter({
      name: 'kv_cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['tenant', 'operation', 'result'],
      registers: [this.register]
    });

    this.cacheSize = new client.Gauge({
      name: 'kv_cache_size',
      help: 'Number of keys in local cache',
      labelNames: ['tenant'],
      registers: [this.register]
    });

    this.peersCount = new client.Gauge({
      name: 'kv_peers_count',
      help: 'Number of discovered peers',
      labelNames: ['tenant'],
      registers: [this.register]
    });

    this.discoveryMessages = new client.Counter({
      name: 'kv_discovery_messages_total',
      help: 'Total number of discovery messages',
      labelNames: ['tenant', 'type', 'direction'],
      registers: [this.register]
    });

    this.replicationOperations = new client.Counter({
      name: 'kv_replication_operations_total',
      help: 'Total number of replication operations',
      labelNames: ['tenant', 'operation', 'result'],
      registers: [this.register]
    });

    this.uptime = new client.Gauge({
      name: 'kv_uptime_seconds',
      help: 'Service uptime in seconds',
      labelNames: ['tenant'],
      registers: [this.register]
    });

    // Update uptime periodically
    setInterval(() => {
      this.uptime.set({ tenant: this.tenant }, process.uptime());
    }, 10000);
  }

  recordHttpRequest(method, route, statusCode, duration) {
    const labels = {
      tenant: this.tenant,
      method,
      route,
      status_code: statusCode
    };
    
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, duration);
  }

  recordCacheOperation(operation, result) {
    this.cacheOperationsTotal.inc({
      tenant: this.tenant,
      operation,
      result
    });
  }

  updateCacheSize(size) {
    this.cacheSize.set({ tenant: this.tenant }, size);
  }

  updatePeersCount(count) {
    this.peersCount.set({ tenant: this.tenant }, count);
  }

  recordDiscoveryMessage(type, direction) {
    this.discoveryMessages.inc({
      tenant: this.tenant,
      type,
      direction
    });
  }

  recordReplicationOperation(operation, result) {
    this.replicationOperations.inc({
      tenant: this.tenant,
      operation,
      result
    });
  }

  getMetrics() {
    return this.register.metrics();
  }

  getRegister() {
    return this.register;
  }
}

module.exports = MetricsCollector;