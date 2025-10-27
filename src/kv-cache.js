const http = require('http');

class KVCache {
  constructor(discovery) {
    this.discovery = discovery;
    this.cache = new Map();
    this.replicationFactor = 2; // Number of replicas per key
    
    // Listen for peer changes
    this.discovery.onPeerDiscovered((peer, action) => {
      if (action === 'added') {
        console.log(`New peer joined cache cluster: ${peer.name}`);
        this.syncWithPeer(peer);
      } else if (action === 'removed') {
        console.log(`Peer left cache cluster: ${peer.name}`);
        this.redistributeKeys();
      }
    });
  }

  // Hash function to determine which peers should store a key
  hashKey(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Get responsible peers for a key
  getResponsiblePeers(key) {
    const peers = this.discovery.getPeers();
    if (peers.length === 0) return [];
    
    const hash = this.hashKey(key);
    const startIndex = hash % peers.length;
    const responsible = [];
    
    for (let i = 0; i < Math.min(this.replicationFactor, peers.length); i++) {
      const index = (startIndex + i) % peers.length;
      responsible.push(peers[index]);
    }
    
    return responsible;
  }

  // Check if current node is responsible for a key
  isResponsibleForKey(key) {
    const responsible = this.getResponsiblePeers(key);
    const myIP = process.env.POD_IP;
    return responsible.some(peer => peer.ip === myIP) || responsible.length === 0;
  }

  async get(key) {
    // First check local cache
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // If not found locally, check responsible peers
    const responsible = this.getResponsiblePeers(key);
    
    for (const peer of responsible) {
      try {
        const value = await this.getFromPeer(peer, key);
        if (value !== null) {
          // Cache locally for faster access
          this.cache.set(key, value);
          return value;
        }
      } catch (error) {
        console.warn(`Failed to get key from peer ${peer.name}:`, error.message);
      }
    }

    return null;
  }

  async set(key, value) {
    // Always store locally first
    this.cache.set(key, value);

    // Replicate to responsible peers
    const responsible = this.getResponsiblePeers(key);
    const promises = responsible.map(peer => 
      this.setOnPeer(peer, key, value).catch(error => 
        console.warn(`Failed to replicate to peer ${peer.name}:`, error.message)
      )
    );

    // Wait for at least one successful replication
    try {
      await Promise.race(promises);
    } catch (error) {
      console.warn('All replications failed, key stored locally only');
    }

    return true;
  }

  async delete(key) {
    // Delete locally
    this.cache.delete(key);

    // Delete from responsible peers
    const responsible = this.getResponsiblePeers(key);
    const promises = responsible.map(peer => 
      this.deleteFromPeer(peer, key).catch(error => 
        console.warn(`Failed to delete from peer ${peer.name}:`, error.message)
      )
    );

    await Promise.allSettled(promises);
    return true;
  }

  async keys() {
    const allKeys = new Set(this.cache.keys());

    // Collect keys from all peers
    const peers = this.discovery.getPeers();
    const promises = peers.map(async (peer) => {
      try {
        const peerKeys = await this.getKeysFromPeer(peer);
        peerKeys.forEach(key => allKeys.add(key));
      } catch (error) {
        console.warn(`Failed to get keys from peer ${peer.name}:`, error.message);
      }
    });

    await Promise.allSettled(promises);
    return Array.from(allKeys);
  }

  // Peer communication methods
  async getFromPeer(peer, key) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: peer.ip,
        port: peer.port,
        path: `/kv/${encodeURIComponent(key)}`,
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed.value);
            } catch (error) {
              reject(new Error('Invalid JSON response'));
            }
          } else if (res.statusCode === 404) {
            resolve(null);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  async setOnPeer(peer, key, value) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ value });
      
      const options = {
        hostname: peer.ip,
        port: peer.port,
        path: `/kv/${encodeURIComponent(key)}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  async deleteFromPeer(peer, key) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: peer.ip,
        port: peer.port,
        path: `/kv/${encodeURIComponent(key)}`,
        method: 'DELETE',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  async getKeysFromPeer(peer) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: peer.ip,
        port: peer.port,
        path: '/kv',
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed.keys || []);
            } catch (error) {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            resolve([]);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  async syncWithPeer(peer) {
    try {
      const peerKeys = await this.getKeysFromPeer(peer);
      console.log(`Syncing ${peerKeys.length} keys with peer ${peer.name}`);
      
      // Sync keys that we should be responsible for
      for (const key of peerKeys) {
        if (this.isResponsibleForKey(key) && !this.cache.has(key)) {
          try {
            const value = await this.getFromPeer(peer, key);
            if (value !== null) {
              this.cache.set(key, value);
            }
          } catch (error) {
            console.warn(`Failed to sync key ${key}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to sync with peer ${peer.name}:`, error.message);
    }
  }

  async redistributeKeys() {
    // When peers leave, redistribute keys to maintain replication factor
    const keys = Array.from(this.cache.keys());
    
    for (const key of keys) {
      const responsible = this.getResponsiblePeers(key);
      const currentReplicas = responsible.length;
      
      if (currentReplicas < this.replicationFactor) {
        // Need to create more replicas
        const value = this.cache.get(key);
        for (const peer of responsible) {
          try {
            await this.setOnPeer(peer, key, value);
          } catch (error) {
            console.warn(`Failed to redistribute key ${key}:`, error.message);
          }
        }
      }
    }
  }

  getPeers() {
    return this.discovery.getPeers();
  }

  getCacheSize() {
    return this.cache.size;
  }

  getRequestRate() {
    // Simple request rate calculation based on recent activity
    const now = Date.now();
    if (!this.requestTimes) {
      this.requestTimes = [];
    }
    
    // Clean old requests (older than 60 seconds)
    this.requestTimes = this.requestTimes.filter(time => now - time < 60000);
    
    // Return requests per second over last minute
    return this.requestTimes.length / 60;
  }

  // Track request for rate calculation
  trackRequest() {
    if (!this.requestTimes) {
      this.requestTimes = [];
    }
    this.requestTimes.push(Date.now());
  }
}

module.exports = KVCache;