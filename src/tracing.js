const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

function initializeTracing(tenant) {
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'kv-responder',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: process.env.NAMESPACE || 'default',
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || process.env.POD_NAME || 'unknown',
    'tenant': tenant,
    'pod.ip': process.env.POD_IP || 'unknown',
    'environment': process.env.NODE_ENV || 'development'
  });

  const exporters = [];

  // Add Jaeger exporter if endpoint is configured
  if (process.env.JAEGER_ENDPOINT) {
    exporters.push(new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT,
    }));
  }

  const sdk = new NodeSDK({
    resource,
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable file system instrumentation to reduce noise
      },
    })],
    traceExporter: exporters.length > 0 ? exporters[0] : undefined,
  });

  try {
    sdk.start();
    console.log('OpenTelemetry tracing initialized successfully');
  } catch (error) {
    console.error('Error initializing OpenTelemetry tracing:', error);
  }

  return sdk;
}

module.exports = { initializeTracing };