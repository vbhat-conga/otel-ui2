# OpenTelemetry E-Commerce Demo

This is a React application with OpenTelemetry integration to demonstrate the usefulness of OpenTelemetry at the browser level for monitoring user interactions, API calls, and overall application performance.

## Features

- **Complete E-Commerce Workflow**: Browse products, view details, add to cart, and checkout
- **OpenTelemetry Integration**: Comprehensive tracing of UI interactions and API calls
- **Business Transaction Tracking**: Three main business transactions are tracked:
  1. Shopping Flow: Product Browsing & Add to Cart
  2. Checkout Flow: Cart Management & Payment Processing
  3. Order Flow: Order Processing & Confirmation
- **Tailwind CSS**: Modern, responsive UI with Tailwind CSS
- **TypeScript**: Full type safety across the application

## Architecture

The application is structured with the following components:

- **API Services**: Simulated e-commerce API calls wrapped with OpenTelemetry instrumentation
- **Business Transactions**: Each user flow is tracked as a business transaction with its own traceID
- **Component Rendering Metrics**: Each component tracks its render time
- **API Call Tracking**: All API calls are tracked with timing information
- **User Activity Monitoring**: Automatic tracking of user interactions and session activity
- **Form Interaction Tracking**: Detailed form completion metrics and validation events

## Observability Architecture

The observability architecture consists of the following components:

```
+--------------------+     +----------------------+     +-------------------+
|                    |     |                      |     |                   |
|  React Application |---->| OpenTelemetry       |---->| Tempo             |
|  (Browser)         |     | Collector           |     | (Trace Storage)   |
|                    |     |                      |     |                   |
+--------------------+     +----------------------+     +-------------------+
                                                             ^
                                                             |
                                                             v
                                                        +-------------------+
                                                        |                   |
                                                        | Grafana           |
                                                        | (Visualization)   |
                                                        |                   |
                                                        +-------------------+
```

- **React Application**: Sends traces via OpenTelemetry JavaScript SDK to the Collector
- **OpenTelemetry Collector**: Receives, processes, and forwards traces to Tempo
- **Tempo**: Stores and indexes traces for fast retrieval
- **Grafana**: Provides visualization and exploration of traces from Tempo

## Running the Application

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

3. Open the application at [http://localhost:3000](http://localhost:3000)

## OpenTelemetry Backend Setup

To visualize the OpenTelemetry traces, we use Grafana Tempo as the distributed tracing backend, along with the OpenTelemetry Collector.

### Using Tempo and Grafana with Docker Compose

We've provided a pre-configured setup using Docker Compose:

```bash
docker-compose up -d
```

This will start:
- OpenTelemetry Collector on ports 4317 (gRPC) and 4318 (HTTP)
- Tempo (distributed tracing backend) on port 3200
- Grafana on port 3001

### Port Configuration

- **OpenTelemetry Collector**:
  - Port 4317: OTLP gRPC receiver
  - Port 4318: OTLP HTTP receiver
  - Port 8888: Prometheus metrics
  - Port 8889: Prometheus exporter metrics

- **Tempo**:
  - Port 3200: Tempo UI
  - Port 4319: OTLP gRPC (mapped from internal 4317)
  - Port 9411: Zipkin compatible endpoint

- **Grafana**:
  - Port 3001: Web UI (mapped from internal 3000)

### Accessing the Monitoring Stack

- **Grafana UI**: [http://localhost:3001](http://localhost:3001)
  - A pre-configured Tempo datasource is already set up
  - You can explore traces by clicking on "Explore" in the left sidebar and selecting the "Tempo" datasource

- **Tempo UI**: [http://localhost:3200](http://localhost:3200)
  - Direct access to the Tempo query interface
  
### Data Flow

1. The React application generates traces using the OpenTelemetry JavaScript SDK
2. Traces are sent to the OpenTelemetry Collector on port 4318 (HTTP)
3. The Collector processes and batches the traces
4. The Collector forwards the traces to Tempo on port 4317
5. Tempo stores the traces
6. Grafana queries Tempo to display the traces

### Viewing Traces

1. Run the application with `npm run dev`
2. Interact with the application to generate traces
3. Open Grafana at [http://localhost:3001](http://localhost:3001)
4. Navigate to "Explore" and select the "Tempo" datasource
5. You can search for traces by:
   - Service name: `e-commerce-ui`
   - Span name
   - Duration
   - Custom attributes like `span.id` or `app.name`

### Verification Steps

To verify that your OpenTelemetry setup is working correctly:

1. Start the Docker Compose stack:
   ```bash
   docker-compose up -d
   ```

2. Check that all services are running:
   ```bash
   docker-compose ps
   ```

3. Test CORS configuration:
   ```bash
   curl -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,traceparent" http://localhost:4318/v1/traces -v
   ```
   
   You should see HTTP 204 No Content with appropriate CORS headers in the response.

4. Run the React application:
   ```bash
   npm run dev
   ```

5. Interact with the application by:
   - Browsing products
   - Adding items to cart
   - Going through the checkout process

6. Open Grafana at http://localhost:3001 and navigate to the Explore tab
   - Select the Tempo data source
   - Use "e-commerce-ui" as the service name
   - Click "Run query"
   - You should see traces from your application

7. Examine the trace details to see the spans from your user interactions

If you encounter any issues, check the troubleshooting section below.

### Troubleshooting

#### Common Issues and Solutions

1. **CORS Issues with OpenTelemetry Collector**
   - **Symptom**: React app fails to send traces with CORS errors in browser console
   - **Solution**: Update the OTEL collector configuration with proper CORS settings:
     ```yaml
     receivers:
       otlp:
         protocols:
           http:
             endpoint: 0.0.0.0:4318
             cors:
               allowed_origins:
                 - http://localhost:3000
                 - http://localhost:3002
               allowed_headers:
                 - "*"
     ```
   - **Verification**: Test with a CORS preflight request:
     ```bash
     curl -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,traceparent" http://localhost:4318/v1/traces -v
     ```
     You should see HTTP 204 with proper CORS headers in the response.

2. **Port Conflicts**
   - **Symptom**: Services fail to start or are unreachable
   - **Solution**: Map services to different external ports, for example:
     ```yaml
     # In docker-compose.yml
     tempo:
       ports:
         - "3200:3200"   # Tempo UI
         - "4319:4317"   # OTLP gRPC (mapped to different external port)
     ```
   - **Verification**: Use `docker-compose ps` to check all port mappings

3. **Connection Issues between Services**
   - **Symptom**: Collector logs show connection errors to Tempo
   - **Solution**: Ensure the collector is configured to use the correct service name and port:
     ```yaml
     exporters:
       otlp:
         endpoint: tempo:4317  # Use internal Docker service name
         tls:
           insecure: true
     ```
   - **Verification**: Check logs with `docker-compose logs otel-collector`

4. **React App Not Sending Traces**
   - **Symptom**: No traces appearing in Tempo
   - **Solution**: Ensure proper exporter configuration in your React app:
     ```typescript
     const exporter = new OTLPTraceExporter({ 
       url: 'http://localhost:4318/v1/traces',
       headers: {
         'Content-Type': 'application/json',
       }
     });
     ```
   - **Verification**: Check browser network tab for requests to `/v1/traces`

#### Diagnostic Commands

Check service status:
```bash
docker-compose ps
```

Test the OTEL Collector endpoint:
```bash
curl -v http://localhost:4318/v1/traces
```

Send a test trace to the collector:
```bash
curl -X POST -H "Content-Type: application/json" -H "Origin: http://localhost:3000" http://localhost:4318/v1/traces -d '{"resourceSpans": []}' -v
```

Check individual service logs:
```bash
docker-compose logs otel-collector
docker-compose logs tempo
docker-compose logs grafana
```

Restart the observability stack:
```bash
docker-compose down
docker-compose up -d
```

## API Tracing with Distributed Context Propagation

This application demonstrates how to implement distributed tracing across frontend and backend services using OpenTelemetry's context propagation. Here's how API calls are traced:

### 1. Creating API Client with Tracing

The API service layer is instrumented to propagate trace context to backend services:

```typescript
// In api.ts - Helper function to generate W3C traceparent header
export const getTraceparentHeader = (span: Span): string => {
  const spanContext = span.spanContext();
  return `00-${spanContext.traceId}-${spanContext.spanId}-01`;
};

// Add traceparent header to outgoing fetch requests
export const createFetchOptions = (span: Span | undefined, options: RequestInit = {}): RequestInit => {
  if (!span) {
    return options;
  }
  
  // Create new headers object, preserving any existing headers
  const headers = new Headers(options.headers);
  headers.set('traceparent', getTraceparentHeader(span));
  
  return {
    ...options,
    headers
  };
};
```

### 2. Creating and Using API Spans in Components

API calls are wrapped in spans to track their performance and link them to business flows:

```typescript
// In ProductListPage.tsx - Creating a child span for API call
const loadProducts = async () => {
  try {
    // First create UI component span
    const uiSpan = startUiSpan(
      SPANS.UI.PRODUCT_LIST.NAME,
      SPANS.FLOW.SHOPPING_FLOW.ID,
      SPANS.UI.PRODUCT_LIST.ID,
      { 'ui.render.start': Date.now() }
    );
    
    // Create child span specifically for API call
    const apiSpan = startApiSpan(
      SPANS.API.FETCH_PRODUCTS.NAME,
      SPANS.UI.PRODUCT_LIST.ID, // Parent is the UI component
      SPANS.API.FETCH_PRODUCTS.ID,
      '/products',
      'GET'
    );
    
    // Make the API call, passing the span for context propagation
    const products = await fetchProducts(apiSpan);
    
    // Record successful completion
    addSpanEvent(SPANS.API.FETCH_PRODUCTS.ID, SPANS.EVENTS.API_CALL_COMPLETED, {
      'products.count': products.length,
      'timestamp': Date.now()
    });
    
    // End the API span
    endSpan(SPANS.API.FETCH_PRODUCTS.ID);
  } catch (err) {
    // Handle and record errors
    if (getSpan(SPANS.API.FETCH_PRODUCTS.ID)) {
      recordSpanError(SPANS.API.FETCH_PRODUCTS.ID, 'Error fetching products');
      endSpan(SPANS.API.FETCH_PRODUCTS.ID);
    }
  }
};
```

## Business Flow Tracing Architecture

This application implements a comprehensive business flow tracing architecture with three main business transactions:

### 1. Shopping Flow

The Shopping Flow begins when a user loads the product list and continues through product details and adding items to the cart. It's implemented with a root span that has its own trace ID:

```typescript
// Start root span for the entire shopping flow
startSpan(SPANS.FLOW.SHOPPING_FLOW.NAME, SPANS.FLOW.SHOPPING_FLOW.ID, {
  'flow.start_page': 'ProductList',
  'flow.timestamp': Date.now()
}, true); // true creates a new trace ID
```

The shopping flow is linked to user activity tracking:

```typescript
// Set up activity tracking for the product list page
activityTrackerRef.current = trackUserActivity(
  SPANS.FLOW.SHOPPING_FLOW.ID, 
  30000, 
  () => ({
    'page.name': 'ProductListPage',
    'products.count': products.length,
  })
);
```

The flow ends when the user navigates to the cart page, where the checkout flow begins:

```typescript
// End shopping flow span after navigation to cart page
endSpan(SPANS.FLOW.SHOPPING_FLOW.ID);

// Start checkout flow
startSpan(SPANS.FLOW.CHECKOUT_FLOW.NAME, SPANS.FLOW.CHECKOUT_FLOW.ID, {
  'page.name': 'CartPage',
  'cart.item_count': items.length,
  'cart.total_value': totalPrice,
  'view.timestamp': Date.now()
}, true);
```

### 2. Checkout Flow

The Checkout Flow spans from the cart page through payment processing. It includes detailed tracking of:

- Cart operations (remove items, update quantities)
- Form field completion with percentage tracking
- Payment processing steps
- Order validation

Form field tracking example:

```typescript
// Update form interaction span with field update
addSpanEvent(SPANS.CHECKOUT.FORM_INTERACTION.ID, SPANS.EVENTS.USER_INTERACTION, {
  'form.field': name,
  'form.field_length': value.length,
  'form.fields_completed': completedFields,
  'form.completion_percentage': Math.round((completedFields / 9) * 100),
  'ui.interaction': 'input_change',
  'interaction.timestamp': Date.now()
});
```

Payment processing with granular steps:

```typescript
// Add payment steps as events with timestamps to prevent gaps
addSpanEvent(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, SPANS.EVENTS.USER_INTERACTION, {
  'payment.step': 'card_verification',
  'payment.timestamp': Date.now(),
  'interaction.type': 'verify_card'
});

// Report progress during this step
recordSpanActivity(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, 'verification_progress', {
  'verification.progress': `${Math.round(elapsed / 2)}%`,
  'verification.elapsed_ms': elapsed
});
```

### 3. Order Flow

The Order Flow begins after successful payment and spans through API order creation and confirmation page display:

```typescript
// Start a new span for the flow.
startSpan(SPANS.FLOW.ORDER_FLOW.NAME, SPANS.FLOW.ORDER_FLOW.ID, {
  'page.name': 'CheckoutPage',
  'cart.item_count': items.length,
  'cart.total_value': totalPrice,
  'payment.result': 'approved',
  'view.timestamp': Date.now()
}, true);
```

Confirmation page tracking:

```typescript
// Start a new span for the confirmation flow
startUiSpan(SPANS.UI.ORDER_CONFIRMATION.NAME,
  SPANS.FLOW.ORDER_FLOW.ID,
  SPANS.UI.ORDER_CONFIRMATION.ID,
  {
    'page.name': 'OrderConfirmationPage',
    'view.timestamp': Date.now()
  });
```

The order flow tracks storage operations, data processing, and ends when the user continues shopping:

```typescript
// Add final metrics before ending the span
addSpanEvent(SPANS.FLOW.ORDER_FLOW.ID, 'PageUnmount', {
  'unmount.timestamp': Date.now(),
  'order.id': orderId || 'unknown',
  'session.complete': true
});

endSpan(SPANS.FLOW.ORDER_FLOW.ID);
```

## Advanced Features

### User Activity Tracking

The application implements sophisticated user activity tracking that:

1. Records detailed user interactions
2. Monitors inactivity periods
3. Sends heartbeat signals to prevent tracing gaps
4. Automatically binds to active business flows
5. Records detailed timing metrics

```typescript
// Track user activity in a page with a specific span
export const trackUserActivity = (
  spanId: string,
  inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT,
  additionalAttributes: () => Record<string, any> = () => ({})
) => {
  let lastActivity = Date.now();
  
  // Event handler for user activity
  const handleUserActivity = () => {
    const now = Date.now();
    const timeSinceLast = now - lastActivity;
    
    // Record detailed timing metrics
    recordSpanActivity(spanId, 'user_interaction', {
      'interaction.time_since_last': timeSinceLast,
      ...additionalAttributes()
    });
    
    lastActivity = now;
  };
  
  // Sends heartbeat signals to prevent tracing gaps
  const startHeartbeat = () => {
    heartbeatTimer = setInterval(() => {
      const span = getSpan(spanId);
      if (span && isTracking) {
        const now = Date.now();
        const timeSinceLast = now - lastActivity;
        
        recordSpanActivity(spanId, 'heartbeat', {
          'heartbeat.time': now,
          'user.idle_for_ms': timeSinceLast,
          'user.is_idle': timeSinceLast > inactivityTimeout
        });
      }
    }, HEARTBEAT_INTERVAL);
  };
  
  return {
    startTracking,
    stopTracking,
    resetTimer: handleUserActivity,
    recordAction
  };
};
```

### Flush Management

To ensure traces are properly sent to the collector, the application implements explicit flush management:

```typescript
export const flushPendingSpans = async (): Promise<void> => {
  try {
    // Import the provider dynamically to avoid circular dependencies
    const { provider } = await import('../telemetry/tracing');
    if (provider) {
      console.info('Manually flushing pending spans before navigation/unmount');
      await provider.forceFlush();
    }
  } catch (error) {
    console.error('Error flushing spans:', error);
  }
};
```

This is especially important before navigation events:

```typescript
// Flush the spans before navigation
await flushPendingSpans();

// Navigation to product list
navigate('/');
```

## OpenTelemetry Trace View Benefits

With this implementation, you can identify:

- Page load time and component rendering metrics
- API call durations and failures
- UI interaction times and user activity patterns
- Business transaction boundaries and flow transitions
- Form completion progress and validation errors
- Detailed user journey with timestamps
- Periods of user inactivity and session duration
- Critical path analysis for performance optimization
- Cart operations and order processing events
- Field-level form interaction metrics

## Technologies Used

- React 18
- TypeScript
- OpenTelemetry SDK
- Grafana Tempo
- Tailwind CSS
- Vite
- React Router

## Mock Data Source

This application uses JSONPlaceholder as a mock data source:
- https://jsonplaceholder.typicode.com

## Creating Custom Dashboards in Grafana

You can create custom dashboards in Grafana to better visualize your application's telemetry data:

1. Open Grafana at http://localhost:3001
2. Click on "Dashboards" in the left sidebar
3. Click "New" and select "New Dashboard"
4. Click "Add visualization"
5. Select the "Tempo" data source
6. Use the query builder to define your query:
   - Select "Search" tab
   - Filter by service name: `e-commerce-ui`
   - Add additional filters as needed (e.g., `span.name`, `app.name`)
   - Set appropriate time range

### Example Dashboard Panels

Here are some useful panels to add to your dashboard:

1. **Business Transaction Overview**
   - Query: `{service.name="e-commerce-ui", app.name="shopping-flow"}`
   - Visualization: Table
   - Shows all shopping flow transactions

2. **Checkout Performance**
   - Query: `{service.name="e-commerce-ui", app.name="checkout-flow"}`
   - Visualization: Line graph of duration
   - Shows checkout performance over time

3. **API Call Latency**
   - Query: `{service.name="e-commerce-ui", span.name=~"API.*"}`
   - Visualization: Bar chart
   - Shows latency of different API calls

4. **User Interaction Events**
   - Query: `{service.name="e-commerce-ui", span.kind="internal", span.name=~"user.*"}`
   - Visualization: Time series
   - Shows user interaction events over time

Save your dashboard and consider setting up automatic refresh to see new data as it comes in.

## Next Steps

Consider these enhancements to further improve your observability setup:

1. Add metrics collection using Prometheus
2. Implement logging with OpenTelemetry and send logs to Loki
3. Create a combined dashboard with traces, metrics, and logs
4. Set up alerts for slow transactions or errors
5. Implement distributed tracing across your microservices architecture

For more information on OpenTelemetry and its capabilities, visit the [OpenTelemetry documentation](https://opentelemetry.io/docs/).

## Configuration Files Overview

This project uses several configuration files for the OpenTelemetry observability stack:

### 1. `otel-collector-config.yaml`

This file configures the OpenTelemetry Collector, which receives traces from the React application and forwards them to Tempo.

Key sections:
```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - http://localhost:3000
            - http://localhost:3002
          allowed_headers:
            - "*"
```

```yaml
exporters:
  debug:
    verbosity: detailed
  otlp:
    endpoint: tempo:4317
    tls:
      insecure: true
```

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp, debug]
```

### 2. `tempo.yaml`

Configures the Tempo distributed tracing backend, which stores and indexes the traces.

### 3. `grafana-datasources.yaml`

Pre-configures Grafana with the Tempo data source, allowing you to immediately query and visualize traces.

### 4. `docker-compose.yml`

Defines the services, port mappings, and container configurations for the entire observability stack.

Important port mappings:
```yaml
otel-collector:
  ports:
    - "4317:4317"   # OTLP gRPC
    - "4318:4318"   # OTLP HTTP
    - "8888:8888"   # Prometheus metrics

tempo:
  ports:
    - "3200:3200"   # Tempo UI
    - "4319:4317"   # OTLP gRPC (mapped to different external port)
    - "9411:9411"   # Zipkin

grafana:
  ports:
    - "3001:3000"   # Grafana UI (on port 3001 to avoid conflict with the React app)
```

### 5. `src/telemetry/tracing.ts`

Configures the OpenTelemetry SDK in the React application:

```typescript
// Configure the exporter to send traces to the collector
const exporter = new OTLPTraceExporter({ 
  url: 'http://localhost:4318/v1/traces',
  headers: {
    'Content-Type': 'application/json',
  }
});

// Configure the trace provider
provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
  scheduledDelayMillis: 500,
  maxExportBatchSize: 100,
  exportTimeoutMillis: 30000,
  maxQueueSize: 2048,
}));
```

## CORS Configuration for OpenTelemetry

One of the most common issues when setting up OpenTelemetry in a browser environment is properly configuring CORS (Cross-Origin Resource Sharing). This is necessary because the browser's JavaScript code needs to send trace data to the OpenTelemetry Collector, which is running on a different origin.

### How We Fixed CORS Issues

1. **Enable CORS in the OpenTelemetry Collector**

   We modified the `otel-collector-config.yaml` file to properly configure CORS:
   
   ```yaml
   receivers:
     otlp:
       protocols:
         http:
           endpoint: 0.0.0.0:4318
           cors:
             allowed_origins:
               - http://localhost:3000
               - http://localhost:3002
             allowed_headers:
               - "*"
   ```

   Key CORS settings:
   - `allowed_origins`: Lists the origins that are allowed to make cross-origin requests to the collector
   - `allowed_headers`: Configures which headers can be used in the actual request

2. **Testing CORS Configuration**

   We verified the CORS configuration using a preflight request:
   
   ```bash
   curl -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,traceparent" http://localhost:4318/v1/traces -v
   ```
   
   A successful response should include:
   ```
   HTTP/1.1 204 No Content
   Access-Control-Allow-Origin: http://localhost:3000
   Access-Control-Allow-Headers: Content-Type,traceparent
   ```

3. **Configure the Trace Exporter in React**

   We updated the trace exporter in the React application to include the proper Content-Type header:
   
   ```typescript
   const exporter = new OTLPTraceExporter({ 
     url: 'http://localhost:4318/v1/traces',
     headers: {
       'Content-Type': 'application/json',
     }
   });
   ```

### Common CORS Error Messages

If you see any of these errors in your browser console, you may have CORS configuration issues:

- `Access to fetch at 'http://localhost:4318/v1/traces' from origin 'http://localhost:3000' has been blocked by CORS policy`
- `No 'Access-Control-Allow-Origin' header is present on the requested resource`
- `Request header field Content-Type is not allowed by Access-Control-Allow-Headers`