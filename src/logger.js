const pino = require('pino');

// Global logger registry for dynamic level management
const loggerRegistry = new Map();

// Create structured logger with tenant context
const createLogger = (tenant) => {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => {
        return { level: label };
      }
    },
    base: {
      tenant: tenant,
      service: 'kv-responder',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      namespace: process.env.NAMESPACE || 'default',
      podName: process.env.HOSTNAME || process.env.POD_NAME || 'unknown',
      podIP: process.env.POD_IP || 'unknown'
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err
    }
  });

  // Register logger for dynamic level management
  loggerRegistry.set('main', logger);
  
  return logger;
};

// Create child logger for modules
const createChildLogger = (parentLogger, module) => {
  const childLogger = parentLogger.child({ module });
  loggerRegistry.set(module, childLogger);
  return childLogger;
};

// Get current log levels for all modules
const getLogLevels = () => {
  const levels = {};
  for (const [module, logger] of loggerRegistry) {
    levels[module] = logger.level;
  }
  return levels;
};

// Set log level for a specific module or all modules
const setLogLevel = (level, module = null) => {
  const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  
  if (!validLevels.includes(level)) {
    throw new Error(`Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}`);
  }

  if (module) {
    const logger = loggerRegistry.get(module);
    if (!logger) {
      throw new Error(`Module not found: ${module}. Available modules: ${Array.from(loggerRegistry.keys()).join(', ')}`);
    }
    logger.level = level;
    return { [module]: level };
  } else {
    // Set level for all loggers
    const updated = {};
    for (const [mod, logger] of loggerRegistry) {
      logger.level = level;
      updated[mod] = level;
    }
    return updated;
  }
};

// List all registered modules
const getLoggerModules = () => {
  return Array.from(loggerRegistry.keys());
};

module.exports = { 
  createLogger, 
  createChildLogger, 
  getLogLevels, 
  setLogLevel, 
  getLoggerModules 
};