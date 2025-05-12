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
  headers.set('traceparent', getTraceparentHeader(span));
  
  return {
    ...options,
    headers
  };
};

// Fetch all products - with tracing header
export const fetchProducts = async (span?: Span): Promise<Product[]> => {
  const url = 'http://localhost:5229/api/products';
  const options = createFetchOptions(span);
  
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
};

// Fetch single product by ID - with tracing header
export const fetchProduct = async (id: number, span?: Span): Promise<Product> => {
  const url = `http://localhost:5229/api/products/${id}`;
  const options = createFetchOptions(span);
  
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
};

// Place order (simulated API call) - with tracing header
export const placeOrder = async (
  items: CartItem[],
  shippingAddress: string,
  span?: Span
): Promise<CheckoutResult> => {
  // If this was a real API call, we would use the traceparent header
  // For simulation purposes, we'll just log the traceparent if a span is provided
  if (span) {
    console.log('Order traceparent:', getTraceparentHeader(span));
  }
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Generate random order ID
  const orderId = `ORD-${Math.floor(Math.random() * 900000) + 100000}`;
  
  return { 
    success: true, 
    orderId 
  };
};
