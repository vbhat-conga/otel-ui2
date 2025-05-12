import React, { createContext, useContext, useState, useCallback } from 'react';
import { CartItem, Product } from '../services/api';
import { useTracing } from './TracingContext';

// Define span IDs for cart operations

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity: number, parentSpanId?: string) => void;
  removeFromCart: (productId: number, parentSpanId?: string) => void;
  clearCart: (parentSpanId?: string) => void;
  totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const { startChildSpan, endSpan, addSpanEvent, getSpan } = useTracing();
  
  // Separate tracing from state updates
  const traceCartOperation = useCallback((
    operationName: string, 
    attributes: Record<string, any>, 
    callback: () => void,
    parentSpanId?: string
  ) => {
    try {
      if (!parentSpanId || !getSpan(parentSpanId)) {
        // Just execute the callback if no parent span exists
        console.log(`No parent span (${parentSpanId}) found for cart operation. Skipping tracing.`);
        callback();
        return;
      }
      
      // Create a child span for the cart operation under the parent span
      console.log(`Creating child span for ${operationName} under parent span ${parentSpanId}`);
      const cartOpSpanId = `${operationName}-${Date.now()}`;
      const cartOpSpan = startChildSpan(operationName || 'CartOperation', parentSpanId, cartOpSpanId, {
        'operation.type': 'cart_state_update',
        'cart.action': attributes.cartAction,
        ...attributes
      });
      
        
        // Execute the state update callback
        callback();
        
        // Add event to the state update span to mark completion
        addSpanEvent(cartOpSpanId, 'StateUpdateComplete', {
          'update.complete_timestamp': Date.now()
        });
        
        // End the cart operation span
        endSpan(cartOpSpanId);
    } catch (err) {
      console.error(`Error in ${operationName} telemetry:`, err);
      // Still perform the state update even if tracing fails
      callback();
    }
  }, [startChildSpan, endSpan, addSpanEvent, getSpan]);
  
  const addToCart = useCallback((product: Product, quantity: number, parentSpanId?: string) => {
    // Create a closure for the state update
    const updateCartState = () => {
      setItems(currentItems => {
        const existingItemIndex = currentItems.findIndex(item => item.id === product.id);
        
        if (existingItemIndex >= 0) {
          // Update quantity if product already in cart
          const updatedItems = [...currentItems];
          const newQuantity = updatedItems[existingItemIndex].quantity + quantity;
          updatedItems[existingItemIndex] = {
            ...updatedItems[existingItemIndex],
            quantity: newQuantity
          };
          
          return updatedItems;
        } else {
          // Add new item to cart
          return [...currentItems, { ...product, quantity }];
        }
      });
    };
    
    // Determine if we're adding a new item or updating quantity
    const existingItemIndex = items.findIndex(item => item.id === product.id);
    const isNewItem = existingItemIndex === -1;
    
    // Prepare tracing attributes
    const tracingAttributes = isNewItem ? 
      {
        'product.id': product.id,
        'product.title': product.title,
        'quantity.added': quantity,
        'cart.update_type': 'add_new_item',
        'cart.previous_items_count': items.length,
        'cart.new_items_count': items.length + 1,
        'cartAction': 'add_item'
      } : 
      {
        'product.id': product.id,
        'product.title': product.title,
        'quantity.added': quantity,
        'cart.update_type': 'increment_quantity',
        'cart.previous_quantity': items[existingItemIndex].quantity,
        'cart.new_quantity': items[existingItemIndex].quantity + quantity,
        'cartAction': 'add_item'
      };
    
    // Trace the operation with parent and child spans
    traceCartOperation('CartAddOperation', tracingAttributes, updateCartState, parentSpanId);
  }, [items, traceCartOperation]);
  
  const removeFromCart = useCallback((productId: number, parentSpanId?: string) => {
    // Create a closure for the state update
    const updateCartState = () => {
      setItems(currentItems => currentItems.filter(item => item.id !== productId));
    };
    
    // Calculate current state metrics for tracing
    const currentItemCount = items.length;
    const filteredItems = items.filter(item => item.id !== productId);
    
    // Prepare tracing attributes
    const tracingAttributes = {
      'product.id': productId,
      'cart.previous_items_count': currentItemCount,
      'cart.new_items_count': filteredItems.length,
      'cart.items_removed': currentItemCount - filteredItems.length,
      'cartAction': 'remove_item'
    };
    
    // Trace the operation with parent and child spans
    traceCartOperation('CartRemoveOperation', tracingAttributes, updateCartState, parentSpanId);
  }, [items, traceCartOperation]);
  
  const clearCart = useCallback((parentSpanId?: string) => {
    // Create a closure for the state update
    const updateCartState = () => {
      setItems([]);
    };
    
    // Calculate current state metrics for tracing
    const currentItemCount = items.length;
    const totalItems = items.reduce((total, item) => total + item.quantity, 0);
    
    // Prepare tracing attributes
    const tracingAttributes = {
      'cart.items_count_before_clear': currentItemCount,
      'cart.total_items_before_clear': totalItems,
      'cart.cleared': true,
      'cartAction': 'clear_cart'
    };
    
    // Trace the operation with parent and child spans
    traceCartOperation('CartClearOperation', tracingAttributes, updateCartState, parentSpanId);
  }, [items, traceCartOperation]);
  
  // Memoize the context value to prevent unnecessary renders
  const contextValue = React.useMemo(() => ({ 
    items, 
    addToCart, 
    removeFromCart, 
    clearCart, 
    totalItems: items.reduce((total, item) => total + item.quantity, 0)
  }), [items, addToCart, removeFromCart, clearCart]);
  
  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};