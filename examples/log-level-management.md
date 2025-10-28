# Dynamic Log Level Management

The KV Responder supports dynamic log level changes without service restart through REST API endpoints.

## Log Modules

The application uses separate loggers for different modules:

- **main**: Main application logger
- **http**: HTTP request/response logging
- **discovery**: UDP peer discovery logging
- **cache**: Cache operations and replication logging

## API Endpoints

### Get Current Log Levels

```bash
GET /admin/log-levels
```

**Response:**
```json
{
  "current_levels": {
    "main": "info",
    "http": "info", 
    "discovery": "info",
    "cache": "info"
  },
  "available_modules": ["main", "http", "discovery", "cache"],
  "available_levels": ["trace", "debug", "info", "warn", "error", "fatal"],
  "tenant": "production"
}
```

### Change Log Levels

```bash
PUT /admin/log-levels
Content-Type: application/json

{
  "level": "debug",
  "module": "cache"  // Optional: omit to change all modules
}
```

**Response:**
```json
{
  "message": "Log levels updated successfully",
  "updated": {
    "cache": "debug"
  },
  "tenant": "production"
}
```

## Usage Examples

### 1. Enable Debug Logging for Cache Operations

```bash
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug", "module": "cache"}'
```

This will show detailed cache operations:
```json
{
  "level": "debug",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "Getting key from cache",
  "tenant": "production",
  "module": "cache",
  "key": "user:123"
}
```

### 2. Enable Debug Logging for Discovery

```bash
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug", "module": "discovery"}'
```

This will show peer discovery details:
```json
{
  "level": "debug",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "Received invalid discovery message",
  "tenant": "production",
  "module": "discovery",
  "remoteAddress": "10.244.1.5"
}
```

### 3. Set All Modules to Debug

```bash
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug"}'
```

### 4. Reduce HTTP Logging to Warn Only

```bash
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "warn", "module": "http"}'
```

### 5. Check Current Levels

```bash
curl http://localhost:3000/admin/log-levels | jq .
```

## Log Levels Explained

| Level | Description | Use Case |
|-------|-------------|----------|
| `trace` | Most verbose, includes all details | Deep debugging |
| `debug` | Detailed debugging information | Development, troubleshooting |
| `info` | General operational messages | Production default |
| `warn` | Warning conditions | Production monitoring |
| `error` | Error conditions only | Minimal logging |
| `fatal` | Fatal errors only | Emergency situations |

## Production Recommendations

### Default Levels
```bash
# Set production-appropriate levels
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "module": "main"}'

curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "warn", "module": "http"}'

curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "module": "discovery"}'

curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "module": "cache"}'
```

### Troubleshooting Scenarios

#### Cache Issues
```bash
# Enable detailed cache logging
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug", "module": "cache"}'

# Test cache operations and check logs
kubectl logs -l app.kubernetes.io/name=kv-responder --tail=100 | grep '"module":"cache"'

# Reset to normal level
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "module": "cache"}'
```

#### Discovery Issues
```bash
# Enable detailed discovery logging
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug", "module": "discovery"}'

# Check peer discovery
curl http://localhost:3000/peers

# Reset to normal level
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "module": "discovery"}'
```

#### Performance Issues
```bash
# Reduce HTTP logging to minimize overhead
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "error", "module": "http"}'
```

## Kubernetes Integration

### Via Port Forward
```bash
kubectl port-forward svc/kv-responder-production 3000:80
curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug", "module": "cache"}'
```

### Via Ingress
```bash
curl -X PUT https://kv-api.example.com/production/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug", "module": "cache"}'
```

### Via kubectl exec
```bash
kubectl exec -it deployment/kv-responder-production -- \
  curl -X PUT http://localhost:3000/admin/log-levels \
  -H "Content-Type: application/json" \
  -d '{"level": "debug", "module": "cache"}'
```

## Monitoring Log Level Changes

Log level changes are logged at info level:

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "Changing log level",
  "tenant": "production",
  "module": "http",
  "level": "debug"
}
```

```json
{
  "level": "info", 
  "time": "2024-01-15T10:30:01.000Z",
  "msg": "Log levels updated successfully",
  "tenant": "production",
  "updated": {
    "cache": "debug"
  }
}
```

## Security Considerations

- The `/admin/log-levels` endpoints are not authenticated
- Consider adding authentication/authorization for production
- Log level changes are logged for audit purposes
- Changes are temporary and reset on pod restart

## Automation Examples

### Bash Script for Common Operations
```bash
#!/bin/bash
SERVICE_URL="http://localhost:3000"

# Function to set log level
set_log_level() {
  local level=$1
  local module=$2
  
  if [ -n "$module" ]; then
    curl -s -X PUT "$SERVICE_URL/admin/log-levels" \
      -H "Content-Type: application/json" \
      -d "{\"level\": \"$level\", \"module\": \"$module\"}"
  else
    curl -s -X PUT "$SERVICE_URL/admin/log-levels" \
      -H "Content-Type: application/json" \
      -d "{\"level\": \"$level\"}"
  fi
}

# Function to get current levels
get_log_levels() {
  curl -s "$SERVICE_URL/admin/log-levels" | jq .
}

# Usage examples
# set_log_level debug cache
# set_log_level info
# get_log_levels
```

This dynamic log level management allows you to troubleshoot issues in production without service restarts!