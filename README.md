# OpenTelemetry E-Commerce Demo

This is a React application with OpenTelemetry integration to demonstrate the usefulness of OpenTelemetry at the browser level for monitoring user interactions, API calls, and overall application performance.

## Features

- **Complete E-Commerce Workflow**: Browse products, view details, add to cart, and checkout
- **OpenTelemetry Integration**: Comprehensive tracing of UI interactions and API calls
- **Business Transaction Tracking**: Two main business transactions are tracked:
  1. Product Browsing & Cart Management
  2. Checkout Process
- **Tailwind CSS**: Modern, responsive UI with Tailwind CSS
- **TypeScript**: Full type safety across the application

## Architecture

The application is structured with the following components:

- **API Services**: Simulated e-commerce API calls wrapped with OpenTelemetry instrumentation
- **Business Transactions**: Each user flow is tracked as a business transaction
- **Component Rendering Metrics**: Each component tracks its render time
- **API Call Tracking**: All API calls are tracked with timing information
- **User Activity Monitoring**: Automatic tracking of user interactions and session activity

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

// Instrumented API call function that includes span context
export const fetchProducts = async (span?: Span): Promise<Product[]> => {
  const url = 'http://localhost:5229/api/products';
  const options = createFetchOptions(span);
  
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
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
    
    // Record API call initiation event
    addSpanEvent(SPANS.API.FETCH_PRODUCTS.ID, SPANS.EVENTS.API_CALL_INITIATED, {
      'timestamp': Date.now()
    });
    
    // Make the API call, passing the span for context propagation
    const products = await fetchProducts(apiSpan);
    
    // Record successful completion
    addSpanEvent(SPANS.API.FETCH_PRODUCTS.ID, SPANS.EVENTS.API_CALL_COMPLETED, {
      'products.count': products.length,
      'timestamp': Date.now()
    });
    
    // End the API span
    endSpan(SPANS.API.FETCH_PRODUCTS.ID);
    
    // Process data and update UI...
  } catch (err) {
    // Handle and record errors
    if (getSpan(SPANS.API.FETCH_PRODUCTS.ID)) {
      recordSpanError(SPANS.API.FETCH_PRODUCTS.ID, 'Error fetching products');
      endSpan(SPANS.API.FETCH_PRODUCTS.ID);
    }
    throw err;
  }
};
```

### 3. Backend Service Integration

For this to work with your backend API:

1. Configure your backend services to extract and parse the `traceparent` header
2. Use the extracted trace and span IDs to create child spans in your backend
3. Ensure spans are properly ended when operations complete

Example backend implementation in a .NET API (not included in this repo):

```csharp
// Extract traceparent header in middleware or controller
string traceparent = Request.Headers["traceparent"];
var traceContext = ParseTraceparent(traceparent);

// Create a span using the extracted parent context
using var span = _tracer.StartActiveSpan(
    "api.GetProducts",
    SpanKind.Server,
    new SpanContext(
        traceContext.TraceId,
        SpanId.CreateRandom(),
        ActivityTraceFlags.Recorded,
        traceContext.TraceState
    )
);

// Add relevant attributes
span.SetAttribute("http.method", "GET");
span.SetAttribute("http.route", "/api/products");

// Continue with your API logic
var products = await _productRepository.GetAllAsync();

// End the span
span.End();
```

### 4. Distributed Trace Visualization

The result in Grafana Tempo will show:
- The complete trace from frontend UI interaction to backend API and back
- Proper parent-child relationships between spans
- Duration of each operation for performance analysis
- Any errors or events that occurred during the flow

## Implementing Business Flow Tracing

This application demonstrates advanced business flow tracing techniques. Here's how our key flows are implemented in detail:

### Understanding the Span Hierarchy

Our tracing implementation follows a three-layer hierarchy:

1. **Flow Spans**: Root spans representing complete business processes (shopping, checkout)
2. **UI/Component Spans**: Children of flow spans that represent UI rendering and component lifecycles
3. **Operation Spans**: Granular spans for specific operations (API calls, user interactions)

### 1. Add to Cart Flow Implementation

The Add to Cart flow begins in `ProductListPage.tsx` and spans across multiple components. It start on product list page and ends when user is moved to cart page.

```typescript
// In ProductListPage.tsx - Initialize the flow span at the start of user journey
useEffect(() => {
  // Create a root span for the shopping flow with its own trace ID
  startSpan(SPANS.FLOW.SHOPPING_FLOW.NAME, SPANS.FLOW.SHOPPING_FLOW.ID, {
    'flow.start_page': 'ProductList',
    'flow.timestamp': Date.now()
  });
  
  // Set up continuous user activity tracking within this flow
  activityTrackerRef.current = trackUserActivity(
    SPANS.FLOW.SHOPPING_FLOW.ID,
    30000, 
    () => ({
      'page.name': 'ProductListPage',
      'products.count': products.length
    })
  );
  
  activityTrackerRef.current.startTracking();
  
  // Clean up spans and tracking on component unmount
  return () => {
    if (activityTrackerRef.current) {
      activityTrackerRef.current.stopTracking();
    }
    
    // Properly end child spans first
    spanIdsToCheck.forEach(id => {
      if (getSpan(id)) {
        addSpanEvent(id, SPANS.EVENTS.USER_INTERACTION, {
          'unmount.timestamp': Date.now(),
          'unmount.reason': 'component_cleanup'
        });
        endSpan(id);
      }
    });
  };
}, []);
```

When a user adds a product to cart, we create operation spans as children:

```typescript
// Creating a UI interaction span as child of the flow span
const handleAddToCart = useCallback((product: Product) => {
  // Record detailed user activity
  if (activityTrackerRef.current) {
    activityTrackerRef.current.recordAction('ProductAddedToCart', {
      'product.id': product.id,
      'product.title': product.title
    });
  }

  // Create a UI interaction span as a child of the shopping flow
  startUiSpan(
    SPANS.INTERACTION.ADD_TO_CART.NAME,
    SPANS.FLOW.SHOPPING_FLOW.ID,  // Parent span ID
    SPANS.INTERACTION.ADD_TO_CART.ID,
    {
      'product.id': product.id,
      'product.title': product.title,
      'action.timestamp': Date.now()
    }
  );
  
  // Add to cart with span ID to link cart operation as a child span
  addToCart(product, 1, SPANS.INTERACTION.ADD_TO_CART.ID);
  
  // Mark completion with an event
  addSpanEvent(SPANS.INTERACTION.ADD_TO_CART.ID, SPANS.EVENTS.USER_INTERACTION, {
    'interaction.type': 'add_to_cart_complete'
  });
  
  // End the operation span but leave the flow span active
  endSpan(SPANS.INTERACTION.ADD_TO_CART.ID);
}, []);
```

The flow span continues until the user navigates to the cart, where we explicitly end it:

```typescript
// In CartPage.tsx - End the shopping flow and start checkout flow
useEffect(() => {
  // Record completion event before ending the flow span
  addSpanEvent(SPANS.FLOW.SHOPPING_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
    'flow.end_page': 'CartPage',
    'flow.end_timestamp': Date.now(),
    'interaction.type': 'arrived_at_cart'
  });
  
  // End shopping flow
  endSpan(SPANS.FLOW.SHOPPING_FLOW.ID);
  
  // Start checkout flow - creating a new trace
  startSpan(SPANS.FLOW.CHECKOUT_FLOW.NAME, SPANS.FLOW.CHECKOUT_FLOW.ID, {
    'page.name': 'CartPage',
    'cart.item_count': items.length,
    'cart.total_amount': totalPrice,
    'view.timestamp': Date.now()
  });
}, []);
```

### 2. Checkout Flow Implementation

The checkout flow spans multiple components and includes form interaction tracking:

```typescript
// In CheckoutPage.tsx - Track form field changes with detailed context
const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = e.target;
  
  // Update form interaction span with field completion metrics
  if (getSpan(SPANS.CHECKOUT.FORM_INTERACTION.ID)) {
    const updatedFormData = { ...formData, [name]: value };
    const completedFields = Object.values(updatedFormData).filter(val => val.length > 0).length;
    
    addSpanEvent(SPANS.CHECKOUT.FORM_INTERACTION.ID, SPANS.EVENTS.USER_INTERACTION, {
      'form.field': name,
      'form.field_length': value.length,
      'form.fields_completed': completedFields,
      'form.completion_percentage': Math.round((completedFields / 9) * 100),
      'ui.interaction': 'input_change',
      'interaction.timestamp': Date.now()
    });
  }
  
  // Record detailed user activity for analysis
  if (activityTrackerRef.current) {
    activityTrackerRef.current.recordAction('FormFieldInput', {
      'field.name': name,
      'field.length': value.length
    });
  }
  
  setFormData(prev => ({ ...prev, [name]: value }));
};
```

Payment processing creates a detailed trace with multiple timestamped events:

```typescript
// Create payment processing span with meaningful attributes
const paymentSpan = startUiSpan(
  SPANS.CHECKOUT.PAYMENT_PROCESSING.NAME,
  SPANS.FLOW.CHECKOUT_FLOW.ID,
  SPANS.CHECKOUT.PAYMENT_PROCESSING.ID,
  {
    'payment.amount': totalPrice,
    'payment.card_type': getCardType(formData.cardNumber),
    'payment.processing_start': Date.now()
  }
);

// Add sequential events with timestamps to track the payment flow
addSpanEvent(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, SPANS.EVENTS.USER_INTERACTION, {
  'payment.step': 'card_verification',
  'payment.timestamp': Date.now(),
  'interaction.type': 'verify_card'
});

// Track detailed progress with activity recording (fills in gaps between events)
recordSpanActivity(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, 'verification_progress', {
  'verification.progress': `${Math.round(elapsed / 2)}%`,
  'verification.elapsed_ms': elapsed
});
```

### 3. Flow Transitions

The application demonstrates proper flow transitions, ending one flow and starting another:

```typescript
// End checkout flow
endSpan(SPANS.FLOW.CHECKOUT_FLOW.ID);

// Stop activity tracking from previous flow
if (activityTrackerRef.current) {
  activityTrackerRef.current.stopTracking();
}

// Start order flow with context carried forward
startSpan(SPANS.FLOW.ORDER_FLOW.NAME, SPANS.FLOW.ORDER_FLOW.ID, {
  'page.name': 'CheckoutPage',
  'cart.item_count': items.length,
  'cart.total_value': totalPrice,
  'payment.result': 'approved',
  'view.timestamp': Date.now()
});

// Begin new activity tracking for the new flow
activityTrackerRef.current = trackUserActivity(
  SPANS.FLOW.ORDER_FLOW.ID,
  30000,
  () => ({
    'page.name': 'CheckoutPage',
    'cart.item_count': items.length,
    'cart.total_value': totalPrice,
  })
);
activityTrackerRef.current.startTracking();
```

## Implementing Your Own Business Flows

To implement business flow tracing in your application:

### 1. Define Span Constants

Create a structured constants file to maintain span names and IDs:

```typescript
// In spanConstants.ts
export const SPANS = {
  // Flow spans define complete business processes
  FLOW: {
    SHOPPING_FLOW: {
      NAME: 'flow.shopping',
      ID: 'shopping-flow-id'
    },
    CHECKOUT_FLOW: {
      NAME: 'flow.checkout',
      ID: 'checkout-flow-id'
    }
  },
  
  // UI component spans
  UI: {
    PRODUCT_LIST: {
      NAME: 'ProductList.render',
      ID: 'product-list-id'
    }
  },
  
  // Operation spans for specific actions
  INTERACTION: {
    ADD_TO_CART: {
      NAME: 'interaction.addToCart',
      ID: 'add-to-cart-id'
    }
  },
  
  // Standard event names
  EVENTS: {
    USER_INTERACTION: 'UserInteraction',
    API_CALL_INITIATED: 'ApiCallInitiated',
    API_CALL_COMPLETED: 'ApiCallCompleted'
  }
};
```

### 2. Create a Tracing Context Provider

Make tracing functionality available throughout your application:

```typescript
// In TracingContext.tsx
const TracingContext = createContext<TracingContextType | undefined>(undefined);

export const TracingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const contextValue = useMemo<TracingContextType>(() => ({
    startSpan,
    startChildSpan,
    endSpan,
    getSpan,
    addSpanEvent,
    recordSpanError,
    startApiSpan,
    startUiSpan,
    recordSpanActivity
  }), []);
  
  return (
    <TracingContext.Provider value={contextValue}>
      {children}
    </TracingContext.Provider>
  );
};

// Hook for components to access tracing
export const useTracing = () => {
  const context = useContext(TracingContext);
  if (context === undefined) {
    throw new Error('useTracing must be used within a TracingProvider');
  }
  return context;
};
```

### 3. Implement User Activity Tracking

Create a robust activity tracker to fill gaps between explicit spans and events:

```typescript
// In userActivity.ts
export const trackUserActivity = (
  spanId: string,
  inactivityTimeout = 30000,
  additionalAttributes: () => Record<string, any> = () => ({})
) => {
  let lastActivity = Date.now();
  let isTracking = false;
  
  const startTracking = () => {
    lastActivity = Date.now();
    isTracking = true;
    
    // Add event listeners for user interactions
    const activityEvents = [
      'click', 'mousemove', 'keypress', 'keydown',
      'scroll', 'touchstart', 'touchmove', 'input'
    ];
    
    activityEvents.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });
    
    // Initialize activity tracking
    recordSpanActivity(spanId, 'tracking_started', {
      'tracking.start_time': lastActivity,
      ...additionalAttributes()
    });
    
    // Start heartbeat intervals
    startHeartbeat();
  };
  
  // Record specific user actions with detailed context
  const recordAction = (action: string, attrs: Record<string, any> = {}) => {
    const span = getSpan(spanId);
    if (span && isTracking) {
      addSpanEvent(spanId, `UserAction.${action}`, {
        'action.timestamp': Date.now(),
        'action.time_since_last': Date.now() - lastActivity,
        ...attrs,
        ...additionalAttributes()
      });
      lastActivity = Date.now();
    }
  };
  
  return {
    startTracking,
    stopTracking,
    resetTimer: handleUserActivity,
    recordAction
  };
};
```

### 4. Advanced Implementation Best Practices

To ensure high-quality business flow tracing:

1. **Maintain Span Registry**: Keep track of spans by ID to ensure proper hierarchy
   ```typescript
   // In tracing.ts
   const spanRegistry = new Map<string, Span>();
   
   export const getSpan = (spanId: string): Span | undefined => {
     return spanRegistry.get(spanId);
   };
   ```

2. **Create Flow-Specific Root Spans**: Make business flows stand out in traces
   ```typescript
   // For flow spans, create a new root context
   if (isFlowSpan) {
     span = tracer.startSpan(name, { root: true });
   }
   ```

3. **Add Meaningful Events**: Document key moments during the flow
   ```typescript
   addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, 'ValidationPassed', {
     'validation.success': true,
     'validation.timestamp': Date.now()
   });
   ```

4. **Handle Component Unmounting**: Clean up spans properly
   ```typescript
   useEffect(() => {
     return () => {
       // End any open spans when component unmounts
       spanIdsToEnd.forEach(id => {
         if (getSpan(id)) {
           console.log(`Ending span: ${id} on unmount`);
           endSpan(id);
         }
       });
     };
   }, []);
   ```

5. **Add Heartbeats**: Prevent gaps in long-running traces
   ```typescript
   const heartbeatTimer = setInterval(() => {
     recordSpanActivity(spanId, 'heartbeat', {
       'heartbeat.time': Date.now(),
       'user.idle_for_ms': Date.now() - lastActivity
     });
   }, 1000);
   ```

## OpenTelemetry Trace View

With OpenTelemetry and Tempo, you can identify:
- Page load time and component rendering metrics
- API call durations and failures
- UI interaction times and user activity patterns
- Business transaction boundaries and flow transitions
- Form completion progress and validation errors
- Detailed user journey with timestamps
- Periods of user inactivity and session duration

## Technologies Used

- React
- TypeScript
- OpenTelemetry
- Grafana Tempo
- Tailwind CSS
- Vite
- React Router

## Public APIs

This application uses the JSONPlaceholder API as a mock data source:
- https://jsonplaceholder.typicode.com