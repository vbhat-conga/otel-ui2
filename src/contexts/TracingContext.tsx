import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { Span } from '@opentelemetry/api';
import { 
  startSpan,
  startChildSpan,
  endSpan,
  getSpan,
  addSpanEvent,
  recordSpanError,
  startApiSpan,
  startUiSpan,
  recordSpanActivity,
  listActiveSpans
} from '../telemetry/tracing';

// Define the TracingContext interface
interface TracingContextType {
  // Basic span operations
  startSpan: (name: string, spanId: string, attributes?: Record<string, any>) => Span;
  startChildSpan: (name: string, parentSpanId: string, spanId: string, attributes?: Record<string, any>) => Span | null;
  endSpan: (spanId: string) => boolean;
  getSpan: (spanId: string) => Span | undefined;
  
  // Helper functions for specific span types
  startApiSpan: (name: string, parentSpanId: string | null, spanId: string, endpoint: string, method: string) => Span | null;
  startUiSpan: (name: string, parentSpanId: string | null, spanId: string, attributes?: Record<string, any>) => Span | null;
  
  // Additional span operations
  addSpanEvent: (spanId: string, name: string, attributes?: Record<string, any>) => boolean;
  recordSpanError: (spanId: string, error: Error | string) => boolean;
  recordSpanActivity: (spanId: string, activity: string, attributes?: Record<string, any>) => boolean;
  
  // Debug helpers
  listActiveSpans: () => Record<string, string>;
}

// Create the context with undefined initial value
const TracingContext = createContext<TracingContextType | undefined>(undefined);

// TracingProvider component
export const TracingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo<TracingContextType>(() => ({
    startSpan,
    startChildSpan,
    endSpan,
    getSpan,
    addSpanEvent,
    recordSpanError,
    startApiSpan,
    startUiSpan,
    recordSpanActivity,
    listActiveSpans
  }), []);
  
  return (
    <TracingContext.Provider value={contextValue}>
      {children}
    </TracingContext.Provider>
  );
};

// Hook to use the TracingContext
export const useTracing = () => {
  const context = useContext(TracingContext);
  if (context === undefined) {
    throw new Error('useTracing must be used within a TracingProvider');
  }
  return context;
};