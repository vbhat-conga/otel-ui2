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

This command starts:
- **OpenTelemetry Collector**: Receives and processes telemetry data
- **Tempo**: Stores and indexes distributed traces
- **Grafana**: Web interface for visualizing traces

Access the Grafana UI at [http://localhost:3001](http://localhost:3001)

The Tempo data source is pre-configured in Grafana, so you can immediately start exploring traces.

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