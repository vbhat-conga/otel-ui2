import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useTracing } from '../contexts/TracingContext';
import { trackUserActivity } from '../telemetry/userActivity';
import { SPANS } from '../telemetry/spanConstants';
import { flushPendingSpans } from '../services/api';

const CartPage = () => {
  const { items = [], removeFromCart, clearCart, totalItems = 0 } = useCart();
  const navigate = useNavigate();
  const {
    startSpan,
    startUiSpan,
    endSpan,
    addSpanEvent,
    getSpan  } = useTracing();


  const activityTrackerRef = useRef<ReturnType<typeof trackUserActivity> | null>(null);

  // Safely calculate total price
  const totalPrice = items.reduce(
    (sum, item) => sum + item.userId * 9.99 * item.quantity,
    0
  );

  // Start a span for the cart page when it mounts
  useEffect(() => {
    // Check if the shopping flow span from ProductListPage exists and end it
      addSpanEvent(SPANS.FLOW.SHOPPING_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
        'flow.end_page': 'CartPage',
        'flow.end_timestamp': Date.now(),
        'interaction.type': 'arrived_at_cart'
      });
      // End the shopping flow span when user navigates to cart
      console.log('Ending shopping flow span after navigation to cart page');
      endSpan(SPANS.FLOW.SHOPPING_FLOW.ID);
    
      // Explicitly flush any pending spans after ending a flow span
      flushPendingSpans().catch(err => console.error('Error flushing spans:', err));
    
      startSpan(SPANS.FLOW.CHECKOUT_FLOW.NAME, SPANS.FLOW.CHECKOUT_FLOW.ID, {
        'page.name': 'CartPage',
        'cart.item_count': items.length,
        'cart.total_quantity': items.reduce((sum, item) => sum + item.quantity, 0),
        'cart.total_amount': totalPrice,
        'cart.is_empty': items.length === 0,
        'view.timestamp': Date.now()
      }, true);
      // Add additional context if span already exists
      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, 'EffectRendered', {
        'effect.timestamp': Date.now()
      });
    
      startUiSpan(
        SPANS.UI.SHOPPING_CART.NAME,
        SPANS.FLOW.CHECKOUT_FLOW.ID,
        SPANS.UI.SHOPPING_CART.ID,
        {
          'render.type': 'layout',
          'render.timestamp': Date.now()
        }
      );
      addSpanEvent(SPANS.UI.SHOPPING_CART.ID, 'EffectRendered', {
        'effect.timestamp': Date.now()
      });
    
    // Set up activity tracking for the cart page
    activityTrackerRef.current = trackUserActivity(
      SPANS.FLOW.CHECKOUT_FLOW.ID,
      30000,
      () => ({
        'page.name': 'CartPage',
        'cart.item_count': items.length,
        'cart.total_amount': totalPrice,
        'cart.is_empty': items.length === 0
      })
    );

    activityTrackerRef.current.startTracking();

    // Clean up when component unmounts
    return () => {
      // Stop activity tracking
      if (activityTrackerRef.current) {
        console.log('Stopping activity tracking of cart page on unmount');
        activityTrackerRef.current.stopTracking();
        activityTrackerRef.current.recordAction('CartSessionEnd', {
          'cart.final_state': items.length > 0 ? 'items_in_cart' : 'empty',
          'cart.item_count': items.length,
          'cart.total_value': totalPrice
        });
      }

      // End any open spans when component unmounts
      const spanIds = [
        SPANS.UI.SHOPPING_CART.ID
      ];

      // Check each span and end it if it exists
      spanIds.forEach(id => {
        if (getSpan(id)) {
          console.info(`Ending span: ${id} on unmount`);
          addSpanEvent(id, SPANS.EVENTS.USER_INTERACTION, {
            'unmount.timestamp': Date.now(),
            'unmount.reason': 'component_cleanup',
            'cart.items_at_unmount': items.length
          });
          endSpan(id);
        }
      });
    };
  }, [items, startSpan, startUiSpan, endSpan, getSpan, addSpanEvent, totalPrice]);

  // Handle removing an item from the cart
  const handleRemoveFromCart = (productId: number) => {
    // Record action with activity tracker
    if (activityTrackerRef.current) {
      const itemToRemove = items.find(item => item.id === productId);
      activityTrackerRef.current.recordAction('RemoveFromCart', {
        'product.id': productId,
        'product.title': itemToRemove?.title || 'Unknown Product',
        'product.quantity': itemToRemove?.quantity || 0,
        'cart.before_count': items.length,
        'cart.after_count': items.length - 1
      });
    }

    // Create a span for the cart operation
    startUiSpan(
      SPANS.INTERACTION.REMOVE_FROM_CART.NAME,
      SPANS.FLOW.CHECKOUT_FLOW.ID,
      SPANS.INTERACTION.REMOVE_FROM_CART.ID,
      {
        'product.id': productId,
        'cart.operation': 'remove_item',
        'cart.pre_update.item_count': items.length,
        'operation.timestamp': Date.now()
      }
    );

    // Remove item from cart - pass the parent span ID
    removeFromCart(productId, SPANS.INTERACTION.REMOVE_FROM_CART.ID);

    // End the operation span
    endSpan(SPANS.INTERACTION.REMOVE_FROM_CART.ID);
  };

  // Handle clearing the cart
  const handleClearCart = () => {
    // Record action with activity tracker
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('ClearCart', {
        'cart.initial_item_count': items.length,
        'cart.initial_value': totalPrice
      });
    }

    // Create a span for the cart operation
    startUiSpan(
      SPANS.INTERACTION.CLEAR_CART.NAME,
      SPANS.FLOW.CHECKOUT_FLOW.ID,
      SPANS.INTERACTION.CLEAR_CART.ID,
      {
        'cart.initial_item_count': items.length,
        'cart.operation': 'clear_cart',
        'operation.timestamp': Date.now()
      }
    );

    // Clear cart - pass the parent span ID
    clearCart(SPANS.INTERACTION.CLEAR_CART.ID);

    // End the operation span
    endSpan(SPANS.INTERACTION.CLEAR_CART.ID);
  };

  // Handle continuing shopping (navigation back to product list)
  const handleContinueShopping = async () => {
    // Record action with activity tracker
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('ContinueShopping', {
        'navigation.destination': '/',
        'cart.item_count': items.length,
        'cart.abandoned': items.length > 0
      });
    }

    // Add an event for navigation
    if (getSpan(SPANS.FLOW.CHECKOUT_FLOW.ID)) {
      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
        'navigation.destination': '/',
        'navigation.type': 'continue_shopping',
        'cart.item_count': items.length,
        'interaction.type': 'navigate_to_products',
        'navigation.timestamp': Date.now()
      });
    }

    // End the checkout flow span
    endSpan(SPANS.FLOW.CHECKOUT_FLOW.ID);
    
    // Flush the spans before navigation
    await flushPendingSpans();

    // Navigation to product list
    navigate('/');
  };

  // Handle proceeding to checkout
  const handleCheckout = async () => {
    // Record action with activity tracker
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('ProceedToCheckout', {
        'navigation.destination': '/checkout',
        'cart.item_count': items.length,
        'cart.total_amount': totalPrice,
        'checkout.intent': 'purchase'
      });
    }

    // Add an event for navigation
    if (getSpan(SPANS.FLOW.CHECKOUT_FLOW.ID)) {
      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
        'navigation.destination': '/checkout',
        'navigation.type': 'proceed_to_checkout',
        'cart.item_count': items.length,
        'cart.total_amount': totalPrice,
        'interaction.type': 'navigate_to_checkout',
        'navigation.timestamp': Date.now()
      });
    }

    // We DON'T end the checkout flow span here because it continues 
    // through the checkout process - instead we pass it along
    
    // Still flush any pending spans before navigation
    await flushPendingSpans();

    // Navigate to checkout
    navigate('/checkout');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Your Cart</h1>

      {items.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl text-gray-300 mb-4">🛒</div>
          <h2 className="text-2xl font-medium text-gray-600 mb-4">Your cart is empty</h2>
          <button
            onClick={handleContinueShopping}
            className="btn btn-primary"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <>
          <div className="mb-6 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="py-3 px-4 text-left">Product</th>
                  <th className="py-3 px-4 text-center">Quantity</th>
                  <th className="py-3 px-4 text-right">Price</th>
                  <th className="py-3 px-4 text-right">Subtotal</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b">
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        <div className="bg-gray-100 rounded w-12 h-12 flex items-center justify-center mr-4 text-xl">
                          📦
                        </div>
                        <div className="font-medium">{item.title}</div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">{item.quantity}</td>
                    <td className="py-4 px-4 text-right">${(item.userId * 9.99).toFixed(2)}</td>
                    <td className="py-4 px-4 text-right font-medium">
                      ${(item.userId * 9.99 * item.quantity).toFixed(2)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handleRemoveFromCart(item.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
            <button
              onClick={handleClearCart}
              className="btn btn-secondary mb-4 md:mb-0"
            >
              Clear Cart
            </button>

            <div className="text-right">
              <div className="text-lg mb-1">
                <span className="font-medium">Items:</span> {totalItems}
              </div>
              <div className="text-2xl font-bold text-blue-700">
                <span>Total:</span> ${totalPrice.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <button
              onClick={handleContinueShopping}
              className="btn btn-secondary"
            >
              Continue Shopping
            </button>

            <button
              onClick={handleCheckout}
              className="btn btn-primary"
            >
              Proceed to Checkout
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CartPage;