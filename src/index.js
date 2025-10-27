const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const UDPDiscovery = require('./kubernetes-discovery');
const KVCache = require('./kv-cache');

const app = express();
const port = process.env.PORT || 3000;
const tenant = process.env.TENANT || 'default';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize services
const discovery = new UDPDiscovery(tenant);
const kvCache = new KVCache(discovery);

// Health check (liveness probe)
app.get('/health', (req, res) => {
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
      res.json({
        status: 'ready',
        tenant,
        peers: peers.length,
        discovery: 'running',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        tenant,
        discovery: 'not running',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
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
  try {
    const value = await kvCache.get(req.params.key);
    if (value === null) {
      return res.status(404).json({ error: 'Key not found' });
    }
    res.json({ key: req.params.key, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/kv/:key', async (req, res) => {
  kvCache.trackRequest();
  try {
    const { value } = req.body;
    await kvCache.set(req.params.key, value);
    res.json({ key: req.params.key, value, status: 'stored' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/kv/:key', async (req, res) => {
  kvCache.trackRequest();
  try {
    await kvCache.delete(req.params.key);
    res.json({ key: req.params.key, status: 'deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all keys
app.get('/kv', async (req, res) => {
  kvCache.trackRequest();
  try {
    const keys = await kvCache.keys();
    res.json({ keys });
  } catch (error) {
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

// Metrics endpoint for HPA custom metrics
app.get('/metrics', (req, res) => {
  const peers = kvCache.getPeers();
  const cacheSize = kvCache.getCacheSize();
  const uptime = process.uptime();
  
  // Prometheus-style metrics
  const metrics = [
    `# HELP kv_cache_size Number of keys in local cache`,
    `# TYPE kv_cache_size gauge`,
    `kv_cache_size{tenant="${tenant}"} ${cacheSize}`,
    ``,
    `# HELP kv_peers_count Number of discovered peers`,
    `# TYPE kv_peers_count gauge`,
    `kv_peers_count{tenant="${tenant}"} ${peers.length}`,
    ``,
    `# HELP kv_uptime_seconds Service uptime in seconds`,
    `# TYPE kv_uptime_seconds counter`,
    `kv_uptime_seconds{tenant="${tenant}"} ${uptime}`,
    ``,
    `# HELP kv_requests_per_second Estimated requests per second`,
    `# TYPE kv_requests_per_second gauge`,
    `kv_requests_per_second{tenant="${tenant}"} ${kvCache.getRequestRate()}`,
  ].join('\n');
  
  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

// Start server
app.listen(port, () => {
  console.log(`KV Responder running on port ${port}`);
  console.log(`Tenant: ${tenant}`);
  
  // Start pod discovery
  discovery.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  discovery.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  discovery.stop();
  process.exit(0);
});