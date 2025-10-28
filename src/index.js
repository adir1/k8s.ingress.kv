const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const UDPDiscovery = require('./kubernetes-discovery');
const KVCache = require('./kv-cache');
const { createLogger } = require('./logger');
const MetricsCollector = require('./metrics');
const { initializeTracing } = require('./tracing');

const app = express();
const port = process.env.PORT || 3000;
const tenant = process.env.TENANT || 'default';

// Initialize tracing
const tracing = initializeTracing(tenant);

// Initialize logger and metrics
const { createLogger, createChildLogger, getLogLevels, setLogLevel, getLoggerModules } = require('./logger');
const logger = createLogger(tenant);
const metrics = new MetricsCollector(tenant);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Add request logging with tenant context
app.use(pinoHttp({
  logger: httpLogger,
  customLogLevel: function (req, res, err) {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
      return 'error';
    }
    return 'info';
  },
  customSuccessMessage: function (req, res) {
    return `${req.method} ${req.url} completed`;
  },
  customErrorMessage: function (req, res, err) {
    return `${req.method} ${req.url} errored`;
  }
}));

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    metrics.recordHttpRequest(req.method, route, res.statusCode, duration);
  });
  
  next();
});

// Initialize services with child loggers
const discoveryLogger = createChildLogger(logger, 'discovery');
const cacheLogger = createChildLogger(logger, 'cache');
const httpLogger = createChildLogger(logger, 'http');

const discovery = new UDPDiscovery(tenant, discoveryLogger, metrics);
const kvCache = new KVCache(discovery, cacheLogger, metrics);

// Health check (liveness probe)
app.get('/health', (req, res) => {
  req.log.debug('Health check requested');
  res.json({
    status: 'healthy',
    tenant,
    peers: kvCache.getPeers().length,
    timestamp: new Date().toISOString()
  });
});

// Readiness check (readiness probe)
app.get('/ready', (req, res) => {
  try {
    // Check if discovery is running
    const peers = kvCache.getPeers();
    const isDiscoveryRunning = discovery.socket && !discovery.socket.destroyed;

    // Service is ready if discovery is running (peers can be 0 initially)
    if (isDiscoveryRunning) {
      req.log.debug({ peers: peers.length }, 'Readiness check passed');
      res.json({
        status: 'ready',
        tenant,
        peers: peers.length,
        discovery: 'running',
        timestamp: new Date().toISOString()
      });
    } else {
      req.log.warn('Readiness check failed - discovery not running');
      res.status(503).json({
        status: 'not ready',
        tenant,
        discovery: 'not running',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    req.log.error({ err: error }, 'Readiness check failed with error');
    res.status(503).json({
      status: 'not ready',
      tenant,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// KV Cache endpoints
app.get('/kv/:key', async (req, res) => {
  kvCache.trackRequest();
  const key = req.params.key;
  
  try {
    req.log.debug({ key }, 'Getting key from cache');
    const value = await kvCache.get(key);
    if (value === null) {
      req.log.info({ key }, 'Key not found');
      metrics.recordCacheOperation('get', 'miss');
      return res.status(404).json({ error: 'Key not found' });
    }
    req.log.info({ key }, 'Key retrieved successfully');
    metrics.recordCacheOperation('get', 'hit');
    res.json({ key, value });
  } catch (error) {
    req.log.error({ err: error, key }, 'Error getting key from cache');
    metrics.recordCacheOperation('get', 'error');
    res.status(500).json({ error: error.message });
  }
});

app.put('/kv/:key', async (req, res) => {
  kvCache.trackRequest();
  const key = req.params.key;
  
  try {
    const { value } = req.body;
    req.log.debug({ key }, 'Setting key in cache');
    await kvCache.set(key, value);
    req.log.info({ key }, 'Key stored successfully');
    metrics.recordCacheOperation('set', 'success');
    res.json({ key, value, status: 'stored' });
  } catch (error) {
    req.log.error({ err: error, key }, 'Error setting key in cache');
    metrics.recordCacheOperation('set', 'error');
    res.status(500).json({ error: error.message });
  }
});

app.delete('/kv/:key', async (req, res) => {
  kvCache.trackRequest();
  const key = req.params.key;
  
  try {
    req.log.debug({ key }, 'Deleting key from cache');
    await kvCache.delete(key);
    req.log.info({ key }, 'Key deleted successfully');
    metrics.recordCacheOperation('delete', 'success');
    res.json({ key, status: 'deleted' });
  } catch (error) {
    req.log.error({ err: error, key }, 'Error deleting key from cache');
    metrics.recordCacheOperation('delete', 'error');
    res.status(500).json({ error: error.message });
  }
});

// List all keys
app.get('/kv', async (req, res) => {
  kvCache.trackRequest();
  
  try {
    req.log.debug('Listing all keys');
    const keys = await kvCache.keys();
    req.log.info({ count: keys.length }, 'Keys listed successfully');
    metrics.recordCacheOperation('list', 'success');
    res.json({ keys });
  } catch (error) {
    req.log.error({ err: error }, 'Error listing keys');
    metrics.recordCacheOperation('list', 'error');
    res.status(500).json({ error: error.message });
  }
});

// Peers info
app.get('/peers', (req, res) => {
  res.json({
    peers: kvCache.getPeers(),
    count: kvCache.getPeers().length
  });
});

// Diagnostic endpoint - detailed request information
app.get('/diag', (req, res) => {
  const diagnosticInfo = {
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      url: req.url,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      path: req.path,
      protocol: req.protocol,
      hostname: req.hostname,
      ip: req.ip,
      ips: req.ips,
      headers: req.headers,
      query: req.query,
      params: req.params,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      acceptLanguage: req.get('Accept-Language'),
      referer: req.get('Referer'),
      xForwardedFor: req.get('X-Forwarded-For'),
      xRealIp: req.get('X-Real-IP')
    },
    tenant: {
      name: tenant,
      environment: process.env.NODE_ENV || 'development',
      namespace: process.env.NAMESPACE || 'default',
      podName: process.env.HOSTNAME || process.env.POD_NAME || 'unknown',
      serviceName: process.env.SERVICE_NAME || 'kv-responder'
    },
    service: {
      port: port,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage(),
      peers: kvCache.getPeers(),
      peerCount: kvCache.getPeers().length,
      cacheSize: kvCache.getCacheSize(),
      requestRate: kvCache.getRequestRate(),
      discoveryStatus: discovery.socket && !discovery.socket.destroyed ? 'running' : 'stopped'
    }
  };

  res.json(diagnosticInfo);
});

// Log level management endpoints
app.get('/admin/log-levels', (req, res) => {
  try {
    req.log.debug('Log levels requested');
    const levels = getLogLevels();
    const modules = getLoggerModules();
    
    res.json({
      current_levels: levels,
      available_modules: modules,
      available_levels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
      tenant: tenant
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error getting log levels');
    res.status(500).json({ error: error.message });
  }
});

app.put('/admin/log-levels', (req, res) => {
  try {
    const { level, module } = req.body;
    
    if (!level) {
      return res.status(400).json({ 
        error: 'Missing required field: level',
        available_levels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
      });
    }

    req.log.info({ level, module }, 'Changing log level');
    const updated = setLogLevel(level, module);
    
    req.log.info({ updated }, 'Log levels updated successfully');
    res.json({
      message: 'Log levels updated successfully',
      updated: updated,
      tenant: tenant
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error setting log levels');
    res.status(400).json({ error: error.message });
  }
});

// Metrics endpoint for Prometheus scraping
app.get('/metrics', async (req, res) => {
  try {
    // Update current metrics
    const peers = kvCache.getPeers();
    const cacheSize = kvCache.getCacheSize();
    
    metrics.updateCacheSize(cacheSize);
    metrics.updatePeersCount(peers.length);
    
    req.log.debug('Metrics requested');
    res.set('Content-Type', 'text/plain');
    res.send(await metrics.getMetrics());
  } catch (error) {
    req.log.error({ err: error }, 'Error generating metrics');
    res.status(500).send('Error generating metrics');
  }
});

// Start server
app.listen(port, () => {
  logger.info({ port, tenant }, 'KV Responder started successfully');

  // Start pod discovery
  discovery.start();
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info({ signal }, 'Received shutdown signal, shutting down gracefully');
  
  discovery.stop();
  
  // Stop tracing
  if (tracing) {
    tracing.shutdown()
      .then(() => logger.info('Tracing shutdown complete'))
      .catch((error) => logger.error({ err: error }, 'Error shutting down tracing'))
      .finally(() => process.exit(0));
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));