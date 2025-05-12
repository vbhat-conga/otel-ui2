import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTracing } from '../contexts/TracingContext';
import { SPANS } from '../telemetry/spanConstants';
import { trackUserActivity } from '../telemetry/userActivity';

const OrderConfirmationPage = () => {
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<string | null>(null);
  const {
    startSpan,
    startUiSpan,
    endSpan,
    addSpanEvent,
    getSpan,
    recordSpanActivity
  } = useTracing();

  // Track activity on this page
  const activityTrackerRef = useRef<ReturnType<typeof trackUserActivity> | null>(null);

  // Start a confirmation flow span when the component mounts
  useEffect(() => {

    // Start a new span for the confirmation flow
    startUiSpan(SPANS.UI.ORDER_CONFIRMATION.NAME,
      SPANS.FLOW.ORDER_FLOW.ID,
      SPANS.UI.ORDER_CONFIRMATION.ID,
      {
        'page.name': 'OrderConfirmationPage',
        'view.timestamp': Date.now()
      });

      // Set up activity tracking for this page
      activityTrackerRef.current = trackUserActivity(
        SPANS.FLOW.ORDER_FLOW.ID,
        30000,
        () => ({
          'page.name': 'OrderConfirmationPage',
          'order.id': orderId || 'unknown',
        })
      );

      activityTrackerRef.current.startTracking();
    

    // Create a UI span for order processing - only if not already active

    // Record activity for better tracing
    recordSpanActivity(SPANS.UI.ORDER_CONFIRMATION.ID, 'starting_session_storage_lookup', {
      'storage.operation': 'begin_retrieval',
      'retrieval.timestamp': Date.now()
    });

    // Get order details from sessionStorage
    const storedOrderId = sessionStorage.getItem('orderId');
    const storedOrderTotal = sessionStorage.getItem('orderTotal');

    addSpanEvent(SPANS.UI.ORDER_CONFIRMATION.ID, 'OrderDataRetrieval', {
      'order.id_retrieved': storedOrderId !== null,
      'order.total_retrieved': storedOrderTotal !== null,
      'storage.operation': 'get_items'
    });

    if (storedOrderId && storedOrderTotal) {
      // Process the data
      const formattedTotal = parseFloat(storedOrderTotal).toFixed(2);

      // Update UI state
      setOrderId(storedOrderId);
      setOrderTotal(formattedTotal);

      addSpanEvent(SPANS.UI.ORDER_CONFIRMATION.ID, 'OrderDataProcessed', {
        'order.id': storedOrderId,
        'order.formatted_total': formattedTotal,
        'processing.status': 'success'
      });

    } else {
      // Handle missing data error
      addSpanEvent(SPANS.UI.ORDER_CONFIRMATION.ID, 'OrderDataError', {
        'error.type': 'missing_order_data',
        'processing.status': 'failed'
      });

      // End the processing span
      endSpan(SPANS.UI.ORDER_CONFIRMATION.ID);

      // Add navigation event to confirmation flow span
      addSpanEvent(SPANS.FLOW.ORDER_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
        'navigation.reason': 'missing_order_data',
        'navigation.destination': '/',
        'interaction.type': 'redirect_missing_data'
      });
      endSpan(SPANS.FLOW.ORDER_FLOW.ID);
      // Stop activity tracking if we're navigating away
      if (activityTrackerRef.current) {
        activityTrackerRef.current.stopTracking();
      }

      // Navigate to home page if order data is missing
      navigate('/');
    }

    // Clean up when component unmounts
    return () => {
      // Stop activity tracking
      if (activityTrackerRef.current) {
        activityTrackerRef.current.stopTracking();
      }

      // End any active spans
      if (getSpan(SPANS.UI.ORDER_CONFIRMATION.ID)) {
        console.info(`Ending span: ${SPANS.UI.ORDER_CONFIRMATION.ID} on unmount`);
        endSpan(SPANS.UI.ORDER_CONFIRMATION.ID);
      }

      if (getSpan(SPANS.FLOW.ORDER_FLOW.ID)) {
        // Add final metrics before ending the span
        console.info(`Ending flow span: ${SPANS.FLOW.ORDER_FLOW.ID} on unmount`);
        addSpanEvent(SPANS.FLOW.ORDER_FLOW.ID, 'PageUnmount', {
          'unmount.timestamp': Date.now(),
          'order.id': orderId || 'unknown',
          'session.complete': true
        });

        endSpan(SPANS.FLOW.ORDER_FLOW.ID);
      }
    };
  }, [orderId]);

  // Handle continuing shopping after order completion
  const handleContinueShopping = () => {
    // Clean up order data from session storage
    sessionStorage.removeItem('orderId');
    sessionStorage.removeItem('orderTotal');
    // Navigate to home page
    navigate('/');
  };

  if (!orderId || !orderTotal) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="flex justify-center mb-6">
        <div className="bg-green-100 rounded-full p-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-4">Order Confirmed!</h1>
      <p className="text-xl mb-8">
        Thank you for your purchase. Your order has been received.
      </p>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="mb-4">
          <span className="text-gray-600">Order ID:</span>
          <div className="text-xl font-semibold">{orderId}</div>
        </div>

        <div className="mb-4">
          <span className="text-gray-600">Total Amount:</span>
          <div className="text-2xl font-bold text-blue-700">${orderTotal}</div>
        </div>

        <div className="border-t pt-4 mt-4">
          <p className="text-gray-600 mb-2">
            A confirmation email has been sent to your email address.
          </p>
          <p className="text-gray-600">
            You can track your order status in the order history section.
          </p>
        </div>
      </div>

      <button
        onClick={handleContinueShopping}
        className="btn btn-primary px-8 py-3"
      >
        Continue Shopping
      </button>
    </div>
  );
};

export default OrderConfirmationPage;