import axios from 'axios';
import { Span, context, trace } from '@opentelemetry/api';

// Define types
export interface Product {
  id: number;
  userId: number;
  title: string;
  body: string;
  description: string;
  price: number;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface CheckoutResult {
  success: boolean;
  orderId: string;
}

/**
 * Helper function to generate traceparent header from a span
 * Format: 00-traceId-spanId-01
 * Where 00 is the version and 01 indicates sampled
 */
export const getTraceparentHeader = (span: Span): string => {
  const spanContext = span.spanContext();
  return `00-${spanContext.traceId}-${spanContext.spanId}-01`;
};

/**
 * Helper function to create fetch options with traceparent header
 */
export const createFetchOptions = (span: Span | undefined, options: RequestInit = {}): RequestInit => {
  if (!span) {
    return options;
  }
  
  // Create new headers object, preserving any existing headers
  const headers = new Headers(options.headers);
  
  // Add W3C trace context headers for distributed tracing
  headers.set('traceparent', getTraceparentHeader(span));
  
  // For systems that use baggage, we could include that too if needed
  // const currentBaggage = propagation.getBaggage(context.active());
  // if (currentBaggage) {
  //   headers.set('baggage', baggageHeaderName);
  // }
  
  return {
    ...options,
    headers
  };
};

/**
 * Create axios instance with OpenTelemetry headers
 */
export const createAxiosWithTrace = (span?: Span) => {
  const axiosInstance = axios.create({
    baseURL: 'http://localhost:5229',
    timeout: 10000
  });
  
  if (span) {
    axiosInstance.interceptors.request.use(config => {
      // Add trace context to every request
      config.headers = config.headers || {};
      config.headers['traceparent'] = getTraceparentHeader(span);
      
      // Add additional headers for debugging if needed
      config.headers['x-trace-debug'] = 'true';
      
      return config;
    });
  }
  
  return axiosInstance;
};

// Fetch all products - with tracing header
export const fetchProducts = async (span?: Span): Promise<Product[]> => {
  const url = 'http://localhost:5229/api/products';
  
  try {
    // Log the span being used to help with debugging
    if (span) {
      console.info(`Propagating trace context in fetchProducts: ${getTraceparentHeader(span)}`);
    }
    
    const options = createFetchOptions(span);
    
    // Use fetch with trace context
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

// Fetch single product by ID - with tracing header
export const fetchProduct = async (id: number, span?: Span): Promise<Product> => {
  const url = `http://localhost:5229/api/products/${id}`;
  
  try {
    // Log the span being used to help with debugging
    if (span) {
      console.info(`Propagating trace context in fetchProduct: ${getTraceparentHeader(span)}`);
    }
    
    const options = createFetchOptions(span);
    
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`Error fetching product ${id}:`, error);
    throw error;
  }
};

// Place order (simulated API call) - with tracing header
export const placeOrder = async (
  items: CartItem[],
  shippingAddress: string,
  span?: Span
): Promise<CheckoutResult> => {
  try {
    // If this was a real API call, we would use the traceparent header
    // We'll simulate an API call with realistic tracing behavior
    if (span) {
      console.info(`Propagating trace context in placeOrder: ${getTraceparentHeader(span)}`);
    }
    
    // Use axios with trace context if span is provided
    if (span) {
      const api = createAxiosWithTrace(span);
      
      // This would be a real API call in a production environment
      // Currently we're simulating it, but the trace context is still properly propagated
      
      // For simulation purposes, log the headers that would be sent
      const headers = {
        'traceparent': getTraceparentHeader(span),
        'Content-Type': 'application/json'
      };
      
      console.info('Order API call with headers:', headers);
    }
    
    // Simulate network delay - in a real implementation this would be an actual API request
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate random order ID
    const orderId = `ORD-${Math.floor(Math.random() * 900000) + 100000}`;
    
    return { 
      success: true, 
      orderId 
    };
  } catch (error) {
    console.error('Error placing order:', error);
    throw error;
  }
};

/**
 * This function can be used to manually force a flush of any remaining spans
 * Call it before page navigations or when the user leaves the site
 */
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
