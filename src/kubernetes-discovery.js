const dgram = require('dgram');
const os = require('os');

class UDPDiscovery {
    constructor(tenant) {
        this.tenant = tenant;
        this.podName = process.env.HOSTNAME || os.hostname();
        this.podIP = process.env.POD_IP || this.getLocalIP();
        this.discoveryPort = parseInt(process.env.DISCOVERY_PORT || '9999');
        this.servicePort = parseInt(process.env.PORT || '3000');

        // UDP socket for discovery
        this.socket = dgram.createSocket('udp4');
        this.peers = new Map();
        this.discoveryCallbacks = [];
        this.discoveryInterval = null;
        this.heartbeatInterval = null;
        this.cleanupInterval = null;

        // Discovery message format
        this.createDiscoveryMessage = () => ({
            type: 'discovery',
            tenant: this.tenant,
            podName: this.podName,
            podIP: this.podIP,
            servicePort: this.servicePort,
            timestamp: Date.now()
        });

        // Bind socket event handlers
        this.setupSocket();
    }

    getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    setupSocket() {
        this.socket.on('error', (err) => {
            console.error('UDP Discovery socket error:', err.message);
        });

        this.socket.on('message', (msg, rinfo) => {
            try {
                const message = JSON.parse(msg.toString());
                this.handleDiscoveryMessage(message, rinfo);
            } catch (error) {
                // Ignore invalid messages
            }
        });

        this.socket.on('listening', () => {
            const address = this.socket.address();
            console.log(`UDP Discovery listening on ${address.address}:${address.port}`);

            // Enable broadcast
            this.socket.setBroadcast(true);
            
            // Join tenant-specific multicast group for better isolation
            const multicastAddress = this.getTenantMulticastAddress();
            try {
                this.socket.addMembership(multicastAddress);
                console.log(`Joined multicast group: ${multicastAddress} for tenant: ${this.tenant}`);
            } catch (error) {
                console.warn('Failed to join multicast group:', error.message);
            }
        });
    }

    handleDiscoveryMessage(message, rinfo) {
        // Only process messages for our tenant and ignore our own messages
        if (message.type !== 'discovery' ||
            message.tenant !== this.tenant ||
            message.podName === this.podName) {
            return;
        }

        const peerKey = message.podName;
        const isNewPeer = !this.peers.has(peerKey);

        const peer = {
            name: message.podName,
            ip: message.podIP,
            port: message.servicePort,
            lastSeen: new Date(),
            discoveryIP: rinfo.address // IP from which we received the message
        };

        if (isNewPeer) {
            console.log(`Discovered new peer: ${peer.name} (${peer.ip}:${peer.port})`);
            this.peers.set(peerKey, peer);
            this.notifyPeerDiscovered(peer, 'added');
        } else {
            // Update last seen time
            this.peers.get(peerKey).lastSeen = new Date();
        }
    }

    onPeerDiscovered(callback) {
        this.discoveryCallbacks.push(callback);
    }

    async start() {
        console.log(`Starting UDP discovery for tenant: ${this.tenant}`);
        console.log(`Pod: ${this.podName} (${this.podIP}:${this.servicePort})`);

        try {
            // Bind to discovery port
            await new Promise((resolve, reject) => {
                this.socket.bind(this.discoveryPort, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Start broadcasting our presence every 30 seconds
            this.startHeartbeat();

            // Start cleanup of stale peers every 60 seconds
            this.startCleanup();

            // Send initial discovery broadcast
            this.broadcastDiscovery();

        } catch (error) {
            console.error('Failed to start UDP discovery:', error.message);
        }
    }

    startHeartbeat() {
        // Broadcast every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            this.broadcastDiscovery();
        }, 30000);
    }

    startCleanup() {
        // Clean up stale peers every 60 seconds
        this.cleanupInterval = setInterval(() => {
            this.cleanupStalePeers();
        }, 60000);
    }

    broadcastDiscovery() {
        const message = JSON.stringify(this.createDiscoveryMessage());
        
        // Use tenant-specific multicast address for better isolation
        const multicastAddress = this.getTenantMulticastAddress();
        
        // Send to tenant-specific multicast address
        this.socket.send(message, this.discoveryPort, multicastAddress, (err) => {
            if (err) {
                console.warn('Failed to send discovery multicast:', err.message);
            }
        });

        // Fallback to broadcast for compatibility
        const broadcastAddress = this.getBroadcastAddress();
        this.socket.send(message, this.discoveryPort, broadcastAddress, (err) => {
            if (err) {
                console.warn('Failed to send discovery broadcast:', err.message);
            }
        });
    }

    getTenantMulticastAddress() {
        // Generate a tenant-specific multicast address in the 239.255.x.x range
        // This provides better isolation than broadcast
        const hash = this.hashString(this.tenant);
        const octet3 = (hash >>> 8) & 0xFF;
        const octet4 = hash & 0xFF;
        return `239.255.${octet3}.${octet4}`;
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    getBroadcastAddress() {
        const interfaces = os.networkInterfaces();

        // Try to find the broadcast address for our network interface
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal && iface.address === this.podIP) {
                    // Calculate broadcast address
                    const ip = iface.address.split('.').map(Number);
                    const netmask = iface.netmask.split('.').map(Number);
                    const broadcast = ip.map((octet, i) => octet | (255 - netmask[i]));
                    return broadcast.join('.');
                }
            }
        }

        // Fallback to general broadcast
        return '255.255.255.255';
    }

    cleanupStalePeers() {
        const now = new Date();
        const staleThreshold = 90000; // 90 seconds

        for (const [name, peer] of this.peers) {
            if (now - peer.lastSeen > staleThreshold) {
                console.log(`Removing stale peer: ${name}`);
                this.peers.delete(name);
                this.notifyPeerDiscovered(peer, 'removed');
            }
        }
    }

    notifyPeerDiscovered(peer, action) {
        this.discoveryCallbacks.forEach(callback => {
            try {
                callback(peer, action);
            } catch (error) {
                console.error('Error in discovery callback:', error.message);
            }
        });
    }

    getPeers() {
        return Array.from(this.peers.values());
    }

    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        if (this.socket) {
            this.socket.close();
        }

        console.log('UDP discovery stopped');
    }
}

module.exports = UDPDiscovery;