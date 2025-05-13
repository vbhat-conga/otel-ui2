import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { context, trace, Span } from '@opentelemetry/api';
import { SPANS } from './spanConstants';
// Auto instrumentation imports
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';

// Provider Configuration
const provider = new WebTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'e-commerce-ui',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
});

const exporter = new OTLPTraceExporter({ 
  url: 'http://localhost:4318/v1/traces',
  headers: {}, // You can add custom headers here if needed
  concurrencyLimit: 10, // Increase for better throughput
});

// Use a more aggressive BatchSpanProcessor configuration for business transaction spans
provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
  // Reduce these values for more frequent export
  scheduledDelayMillis: 500,  // Export every 500ms instead of 1000ms
  maxExportBatchSize: 100,    // Keep batch size the same
  exportTimeoutMillis: 30000, // Longer timeout to ensure export completes
  maxQueueSize: 2048,         // Increase queue size to handle more spans
}));

// Also add SimpleSpanProcessor for critical spans to ensure they get exported immediately
// This helps with important spans like checkout flow that need to be reliably captured
const flowSpanExporter = new OTLPTraceExporter({ 
  url: 'http://localhost:4318/v1/traces' 
});
provider.addSpanProcessor(new SimpleSpanProcessor(flowSpanExporter));

// Register the zone context manager before registering auto-instrumentations
provider.register({ contextManager: new ZoneContextManager() });

// Register web auto-instrumentations, focusing on document load
registerInstrumentations({
  instrumentations: [
    getWebAutoInstrumentations({
      // Only enable document load instrumentation to avoid affecting existing tracing
      '@opentelemetry/instrumentation-document-load': {
        enabled: true,
        // We need to update the custom attributes format according to the API requirements
        applyCustomAttributesOnSpan: {
          documentLoad: (span) => {
            span.setAttribute('app.version', '1.0.0');
            span.setAttribute('app.page', window.location.pathname);
          }
        }
      },
      // Configure fetch and XHR instrumentation for API calls
      '@opentelemetry/instrumentation-fetch': { 
        enabled: true,
        // Ensure proper propagation headers
        propagateTraceHeaderCorsUrls: [
          'http://localhost:5229/.*', // Backend API pattern
          '.+' // All URLs (for testing - you can narrow this down)
        ]
      },
      '@opentelemetry/instrumentation-xml-http-request': { 
        enabled: true,
        // Ensure proper propagation headers
        propagateTraceHeaderCorsUrls: [
          'http://localhost:5229/.*', // Backend API pattern
          '.+' // All URLs (for testing - you can narrow this down)
        ]
      },
      '@opentelemetry/instrumentation-user-interaction': { enabled: false },
    }),
  ],
  tracerProvider: provider,
});

export const tracer = trace.getTracer('e-commerce-ui');

// Map to store created spans by ID for retrieval
const spanRegistry = new Map<string, Span>();

// Basic span operations
export const startSpan = (name: string, spanId: string, attributes?: Record<string, any>, isBusinesstransaction:boolean = false): Span => {
  const existingSpan = spanRegistry.get(spanId);
  if (existingSpan) {
    console.warn(`Span with ID ${spanId} already exists. so returning the same.`);
    return existingSpan;
  } 
  let span: Span;
  
  if (isBusinesstransaction) {
    console.info(`Creating flow span: ${name} with ID ${spanId} as root span`);
    // For flow spans, create a new root context by starting a span without an explicit parent
    // This creates a new trace ID instead of linking to any existing trace
    span = tracer.startSpan(name, { root: true });
  }
  else {
    const tracer = trace.getTracer('ui-tracer');
    span = tracer.startSpan(name);
  }
  
  if (attributes) {
    span.setAttributes(attributes);
  }
  
  // Add standard attributes to all spans for better filtering in Grafana
  span.setAttribute('app.name', 'e-commerce-ui');
  span.setAttribute('span.id', spanId);
  
  spanRegistry.set(spanId, span);
  console.info(`Span started: ${name} with ID ${spanId}`);
  return span;
};

export const startChildSpan = (
  name: string, 
  parentSpanId: string, 
  spanId: string, 
  attributes?: Record<string, any>
): Span | null => {
  const parentSpan = spanRegistry.get(parentSpanId);
  if (!parentSpan) {
    console.warn(`Parent span with ID ${parentSpanId} not found in registry. Cannot create child span.`);
    return null;
  }
  
  const ctx = trace.setSpan(context.active(), parentSpan);
  console.info(`Creating child span: ${name} with ID ${spanId} under parent span ID ${parentSpanId}`);
  return context.with(ctx, () => {
    return startSpan(name, spanId, attributes);
  });
};

export const endSpan = (spanId: string): boolean => {
  const span = spanRegistry.get(spanId);
  if (!span) {
    console.warn(`Span with ID ${spanId} not found in registry. Cannot end span.`);
    return false;
  }
  
  // For specific business transaction spans, force flush to ensure export
  const isFlowSpan = spanId === SPANS.FLOW.SHOPPING_FLOW.ID || 
                    spanId === SPANS.FLOW.CHECKOUT_FLOW.ID || 
                    spanId === SPANS.FLOW.ORDER_FLOW.ID;
                    
  // Add final timestamp for better analysis
  span.setAttribute('span.end_time', Date.now());
  
  span.end();
  spanRegistry.delete(spanId);
  console.info(`Span ended: ${spanId}`);
  
  // Force the provider to flush spans for business transactions
  // This ensures they get sent to the collector immediately
  if (isFlowSpan) {
    console.info(`Forcing flush for business transaction span: ${spanId}`);
    provider.forceFlush().catch(err => {
      console.error(`Error flushing spans: ${err}`);
    });
  }
  
  return true;
};

export const getSpan = (spanId: string): Span | undefined => {
  return spanRegistry.get(spanId);
};

// Helper functions for specific span types
export const startApiSpan = (
  name: string, 
  parentSpanId: string | null, 
  spanId: string, 
  endpoint: string, 
  method: string
): Span | null => {
  const attributes = {
    'http.url': endpoint,
    'http.method': method,
    'span.kind': 'client',
  };
  
  if (parentSpanId) {
    return startChildSpan(name, parentSpanId, spanId, attributes);
  } else {
    return startSpan(name, spanId, attributes);
  }
};

export const startUiSpan = (
  name: string, 
  parentSpanId: string | null, 
  spanId: string, 
  attributes?: Record<string, any>
): Span | null => {
  const uiAttributes = {
    'ui.component': name,
    'span.kind': 'internal',
    ...(attributes || {})
  };
  
  if (parentSpanId) {
    return startChildSpan(name, parentSpanId, spanId, uiAttributes);
  } else {
    return startSpan(name, spanId, uiAttributes);
  }
};

// Additional span operations
export const addSpanEvent = (spanId: string, name: string, attributes?: Record<string, any>): boolean => {
  const span = spanRegistry.get(spanId);
  if (!span) {
    console.warn(`Span with ID ${spanId} not found in registry. Cannot add event.`);
    return false;
  }
  
  // Ensure each event has a timestamp for better tracing
  const eventAttributes = {
    'event.timestamp': Date.now(),
    ...(attributes || {})
  };
  
  span.addEvent(name, eventAttributes);
  return true;
};

export const recordSpanError = (spanId: string, error: Error | string): boolean => {
  const span = spanRegistry.get(spanId);
  if (!span) {
    console.warn(`Span with ID ${spanId} not found in registry. Cannot record error.`);
    return false;
  }
  
  span.recordException(error);
  span.setStatus({ code: 2 }); // Error status code
  return true;
};

export const recordSpanActivity = (spanId: string, activity: string, attributes?: Record<string, any>): boolean => {
  return addSpanEvent(spanId, SPANS.EVENTS.USER_INTERACTION, {
    activity,
    timestamp: Date.now(),
    ...(attributes || {})
  });
};

// Debug helpers
export const listActiveSpans = (): Record<string, string> => {
  const spans: Record<string, string> = {};
  spanRegistry.forEach((span, id) => {
    spans[id] = 'Active span';  // Use generic description as Span doesn't expose name
  });
  return spans;
};

// Async operation tracing
export const withSpan = async <T>(spanId: string, asyncFn: () => Promise<T>): Promise<T> => {
  const span = spanRegistry.get(spanId);
  if (!span) {
    console.warn(`Span with ID ${spanId} not found in registry. Cannot create context.`);
    return asyncFn();
  }
  
  // Create a context with our span
  const spanContext = trace.setSpan(context.active(), span);
  
  // Log activity before async operation
  addSpanEvent(spanId, SPANS.EVENTS.ASYNC_OPERATION_STARTED, {
    timestamp: Date.now()
  });
  
  try {
    // Execute the async function with context
    return await context.with(spanContext, async () => {
      try {
        return await asyncFn();
      } catch (error) {
        if (spanRegistry.has(spanId)) {
          recordSpanError(spanId, error instanceof Error ? error : String(error));
        }
        throw error;
      }
    });
  } finally {
    // Verify span still exists after async operation
    if (spanRegistry.has(spanId)) {
      addSpanEvent(spanId, SPANS.EVENTS.ASYNC_OPERATION_COMPLETED, {
        timestamp: Date.now()
      });
    }
  }
};

// Export the provider for potential global access
export { provider };