import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { placeOrder } from '../services/api';
import { useTracing } from '../contexts/TracingContext';
import { SPANS } from '../telemetry/spanConstants';
import { trackUserActivity } from '../telemetry/userActivity';

const CheckoutPage = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { items, clearCart } = useCart();
  const {
    startSpan,
    startUiSpan,
    startApiSpan,
    endSpan,
    addSpanEvent,
    getSpan,
    recordSpanActivity
  } = useTracing();

  // Track user activity
  const activityTrackerRef = useRef<ReturnType<typeof trackUserActivity> | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    address: '',
    city: '',
    zipCode: '',
    country: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
  });

  // Setup user activity tracker for this page
  useEffect(() => {
    // Create a component ID to prevent duplicate spans
    const componentId = `checkout-page-${Date.now()}`;

    // Start a new span for the checkout flow with componentId in attributes
    startSpan(SPANS.FLOW.CHECKOUT_FLOW.NAME, SPANS.FLOW.CHECKOUT_FLOW.ID, {
      'page.name': 'CheckoutPage',
      'cart.item_count': items.length,
      'cart.total_value': items.reduce((sum, item) => sum + item.userId * 9.99 * item.quantity, 0),
      'view.timestamp': Date.now(),
      //'componentId': componentId // Pass as an attribute instead of parameter
    });

    // Set up activity tracking for the checkout flow
    activityTrackerRef.current = trackUserActivity(
      SPANS.FLOW.CHECKOUT_FLOW.ID,
      30000,
      () => ({
        'page.name': 'CheckoutPage',
        'cart.item_count': items.length,
        'cart.total_value': items.reduce((sum, item) => sum + item.userId * 9.99 * item.quantity, 0),
      })
    );

    activityTrackerRef.current.startTracking();
    // Add validation data to span
    addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, 'CartValidation', {
      'cart.items': items.length,
      'cart.is_empty': items.length === 0
    });

    // Handle empty cart
    if (items.length === 0) {
      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, 'ValidationFailed', {
        'validation.result': 'empty_cart',
        'navigation.required': true,
        'navigation.reason': 'empty_cart',
        'navigation.destination': '/',
        'interaction.type': 'redirect_empty_cart'
      });

      // End checkout flow span
      endSpan(SPANS.FLOW.CHECKOUT_FLOW.ID);

      // Navigate to home page if cart is empty
      navigate('/');
    } else {
      // Cart is valid - add detailed info to help trace
      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, 'ValidationPassed', {
        'validation.result': 'valid_cart',
        'cart.item_count': items.length,
        'cart.details': items.map(item => ({
          id: item.id,
          title: item.title.substring(0, 20),
          quantity: item.quantity
        }))
      });
    }

    // Start form interaction span
    startUiSpan(
      SPANS.CHECKOUT.FORM_INTERACTION.NAME,
      SPANS.FLOW.CHECKOUT_FLOW.ID,
      SPANS.CHECKOUT.FORM_INTERACTION.ID,
      {
        'interaction.type': 'form_input',
        'form.fields_completed': 0,
        'form.total_fields': 9,
        'interaction.start_time': Date.now()
      }
    );

    // Clean up when component unmounts
    return () => {
      if (activityTrackerRef.current) {
        console.info('Stopping activity tracking for CheckoutPage on unmount');
        activityTrackerRef.current.stopTracking();
      }
      if (getSpan(SPANS.CHECKOUT.FORM_INTERACTION.ID)) {
        console.info('Ending form interaction span on unmount');
        endSpan(SPANS.CHECKOUT.FORM_INTERACTION.ID);
      }

      if (getSpan(SPANS.FLOW.CHECKOUT_FLOW.ID)) {
        console.info('Ending checkout flow span on unmount');
        endSpan(SPANS.FLOW.CHECKOUT_FLOW.ID);
      }
    };
  }, [items, navigate, startSpan, startUiSpan, endSpan, addSpanEvent, getSpan, recordSpanActivity]);

  // Calculate total price
  const totalPrice = items.reduce(
    (sum, item) => sum + item.userId * 9.99 * item.quantity,
    0
  );

  // Handle form field changes with tracking
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Track form field updates
    if (getSpan(SPANS.CHECKOUT.FORM_INTERACTION.ID)) {
      // Update form data first to count completed fields accurately
      const updatedFormData = { ...formData, [name]: value };
      const completedFields = Object.values(updatedFormData).filter(val => val.length > 0).length;

      // Update form interaction span with field update
      addSpanEvent(SPANS.CHECKOUT.FORM_INTERACTION.ID, SPANS.EVENTS.USER_INTERACTION, {
        'form.field': name,
        'form.field_length': value.length,
        'form.fields_completed': completedFields,
        'form.completion_percentage': Math.round((completedFields / 9) * 100),
        'ui.interaction': 'input_change',
        'interaction.timestamp': Date.now()
      });
    }

    // Record detailed user activity
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('FormFieldInput', {
        'field.name': name,
        'field.length': value.length
      });
    }

    // Also add to main checkout flow for context
    if (getSpan(SPANS.FLOW.CHECKOUT_FLOW.ID)) {
      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
        'form.field': name,
        'form.field_length': value.length,
        'ui.interaction': 'input_change'
      });
    }

    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    try {
      setIsProcessing(true);
      setError(null);

      // Form validation - bridging the gap between form and payment processing
      recordSpanActivity(SPANS.FLOW.CHECKOUT_FLOW.ID, 'starting_form_validation', {
        'validation.timestamp': Date.now(),
        'form.field_count': Object.keys(formData).length
      });

      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
        'order.processing_stage': 'validation',
        'validation.timestamp': Date.now(),
        'interaction.type': 'validate_checkout_form'
      });

      // Simple validation
      const requiredFields = ['fullName', 'email', 'address', 'city', 'zipCode', 'country', 'cardNumber', 'cardExpiry', 'cardCvv'];
      const emptyFields = requiredFields.filter(field => !formData[field as keyof typeof formData]);

      if (emptyFields.length > 0) {
        addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, 'ValidationFailed', {
          'validation.success': false,
          'validation.error': `Missing fields: ${emptyFields.join(', ')}`
        });

        setError(`Please fill in all required fields: ${emptyFields.join(', ')}`);
        setIsProcessing(false);
        // Restart form interaction span since we need to continue editing
            // End the form interaction span as submission begins
            if (getSpan(SPANS.CHECKOUT.FORM_INTERACTION.ID)) {
              addSpanEvent(SPANS.CHECKOUT.FORM_INTERACTION.ID, 'FormInteraction', {
                'interaction.type': 'form_input',
                'form.fields_completed': Object.values(formData).filter(val => val.length > 0).length,
                'form.total_fields': 9,
                'form.validation_failed': true,
                'interaction.start_time': Date.now()
              });
            }
        return;
      }

      endSpan(SPANS.CHECKOUT.FORM_INTERACTION.ID);
      // Form is valid
      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, 'ValidationPassed', {
        'validation.success': true,
        'validation.timestamp': Date.now()
      });


      // Start payment processing span - this helps bridge the gap
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

      // Add payment steps as events with timestamps to prevent gaps
      if (paymentSpan) {
        // Card validation phase
        addSpanEvent(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, SPANS.EVENTS.USER_INTERACTION, {
          'payment.step': 'card_verification',
          'payment.timestamp': Date.now(),
          'interaction.type': 'verify_card'
        });

        // Simulate a short delay for card verification (with activity tracking during the delay)
        const verificationStart = Date.now();
        await new Promise(resolve => {
          const checkProgress = () => {
            const elapsed = Date.now() - verificationStart;
            if (elapsed < 200) {
              // Report progress during this step
              recordSpanActivity(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, 'verification_progress', {
                'verification.progress': `${Math.round(elapsed / 2)}%`,
                'verification.elapsed_ms': elapsed
              });
              requestAnimationFrame(checkProgress);
            } else {
              resolve(true);
            }
          };
          requestAnimationFrame(checkProgress);
        });

        // Payment processing phase
        addSpanEvent(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, SPANS.EVENTS.USER_INTERACTION, {
          'verification.complete': true,
          'payment.step': 'processing',
          'payment.timestamp': Date.now(),
          'interaction.type': 'process_payment'
        });

        // Wait a bit more before calling the API (with progress tracking)
        const processingStart = Date.now();
        await new Promise(resolve => {
          const checkProgress = () => {
            const elapsed = Date.now() - processingStart;
            if (elapsed < 300) {
              // Report progress during this step
              recordSpanActivity(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, 'payment_progress', {
                'payment.progress': `${Math.round(elapsed / 3)}%`,
                'payment.elapsed_ms': elapsed
              });
              requestAnimationFrame(checkProgress);
            } else {
              resolve(true);
            }
          };
          requestAnimationFrame(checkProgress);
        });
      }

      // Process order with API call - bridge from payment to API
      recordSpanActivity(SPANS.FLOW.CHECKOUT_FLOW.ID, 'payment_to_api_transition', {
        'transition.timestamp': Date.now()
      });

      addSpanEvent(SPANS.FLOW.CHECKOUT_FLOW.ID, SPANS.EVENTS.API_CALL_INITIATED, {
        'order.processing_stage': 'api_call',
        'api.start_timestamp': Date.now()
      });

        addSpanEvent(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID, 'PaymentApproved', {
          'payment.result': 'approved',
          'payment.completion_time': Date.now()
        });
      endSpan(SPANS.CHECKOUT.PAYMENT_PROCESSING.ID);
      endSpan(SPANS.FLOW.CHECKOUT_FLOW.ID);
      // Stop activity tracking
      if (activityTrackerRef.current) {
        activityTrackerRef.current.stopTracking();
      }
      // Start a new span for the flow.
      startSpan(SPANS.FLOW.ORDER_FLOW.NAME, SPANS.FLOW.ORDER_FLOW.ID, {
        'page.name': 'CheckoutPage',
        'cart.item_count': items.length,
        'cart.total_value': totalPrice,
        'payment.result': 'approved',
        'view.timestamp': Date.now()
      });
      activityTrackerRef.current = trackUserActivity(
        SPANS.FLOW.ORDER_FLOW.ID,
        30000,
        () => ({
          'page.name': 'CheckoutPage',
          'cart.item_count': items.length,
          'cart.total_value': items.reduce((sum, item) => sum + item.userId * 9.99 * item.quantity, 0),
        })
      );
      activityTrackerRef.current?.startTracking();
      // Create API span for order placement
      const apiSpan = startApiSpan(
        SPANS.API.PROCESS_ORDER.NAME,
        SPANS.FLOW.ORDER_FLOW.ID,
        SPANS.API.PROCESS_ORDER.ID,
        '/api/orders',
        'POST'
      );

      if (apiSpan) {
        // Add API context
        addSpanEvent(SPANS.API.PROCESS_ORDER.ID, SPANS.EVENTS.API_CALL_INITIATED, {
          'order.items_count': items.length,
          'order.total_amount': totalPrice,
          'request.timestamp': Date.now()
        });

        // Track API progress to avoid gaps
        const apiCallStart = Date.now();
        const trackApiProgress = setInterval(() => {
          recordSpanActivity(SPANS.API.PROCESS_ORDER.ID, 'api_in_progress', {
            'api.elapsed_ms': Date.now() - apiCallStart
          });
        }, 200);

        // Make the actual API call
        const result = await placeOrder(items, formData.address);

        // Stop progress tracking
        clearInterval(trackApiProgress);

        // Add API response data
        addSpanEvent(SPANS.API.PROCESS_ORDER.ID, SPANS.EVENTS.API_CALL_COMPLETED, {
          'order.id': result.orderId,
          'order.success': result.success,
          'response.timestamp': Date.now()
        });

        // End API span
        endSpan(SPANS.API.PROCESS_ORDER.ID);

        // Update checkout flow with order result
        addSpanEvent(SPANS.FLOW.ORDER_FLOW.ID, 'OrderPlaced', {
          'order.id': result.orderId,
          'order.status': 'success',
          'order.processing_stage': 'storage_update'
        });

        // Store order information for confirmation page
        sessionStorage.setItem('orderId', result.orderId);
        sessionStorage.setItem('orderTotal', totalPrice.toFixed(2));

        // Update span with cart cleanup event
        addSpanEvent(SPANS.FLOW.ORDER_FLOW.ID, 'CartCleanup', {
          'order.processing_stage': 'cart_cleanup',
          'cart.cleared': true
        });

        // Clear cart after successful order - pass the checkout flow span ID
        clearCart(SPANS.FLOW.ORDER_FLOW.ID);

        // Add navigation event
        addSpanEvent(SPANS.FLOW.ORDER_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
          'order.processing_stage': 'navigation',
          'order.id': result.orderId,
          'order.total': totalPrice,
          'navigation.destination': '/order-confirmation',
          'interaction.type': 'navigate_to_confirmation'
        });
        // Navigate to order confirmation page
        navigate('/order-confirmation');
      }
    } catch (err) {
      // Handle error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      addSpanEvent(SPANS.FLOW.ORDER_FLOW.ID, SPANS.EVENTS.ERROR_OCCURRED, {
        'error.message': errorMessage,
        'error.timestamp': Date.now()
      });

      setError('Failed to process your order. Please try again.');
      setIsProcessing(false);

      // Restart form interaction span for retrying
      startUiSpan(
        SPANS.CHECKOUT.FORM_INTERACTION.NAME,
        SPANS.FLOW.CHECKOUT_FLOW.ID,
        SPANS.CHECKOUT.FORM_INTERACTION.ID,
        {
          'interaction.type': 'form_retry',
          'form.fields_completed': Object.values(formData).filter(val => val.length > 0).length,
          'form.total_fields': 9,
          'interaction.start_time': Date.now()
        }
      );
    }
  };

  // Simple credit card type detection
  const getCardType = (cardNumber: string): string => {
    const firstDigit = cardNumber.charAt(0);
    if (cardNumber.startsWith('4')) return 'visa';
    if (cardNumber.startsWith('5')) return 'mastercard';
    if (cardNumber.startsWith('3')) return 'amex';
    if (cardNumber.startsWith('6')) return 'discover';
    return 'unknown';
  };

  if (items.length === 0) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
              </div>

              <h2 className="text-xl font-semibold mb-4">Shipping Address</h2>
              <div className="mb-4">
                <label className="block text-gray-700 mb-1">Street Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full border rounded-md px-3 py-2"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">ZIP Code</label>
                  <input
                    type="text"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleInputChange}
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
              </div>

              <h2 className="text-xl font-semibold mb-4">Payment Information</h2>
              <div className="mb-4">
                <label className="block text-gray-700 mb-1">Card Number</label>
                <input
                  type="text"
                  name="cardNumber"
                  value={formData.cardNumber}
                  onChange={handleInputChange}
                  placeholder="1234 5678 9012 3456"
                  className="w-full border rounded-md px-3 py-2"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="text"
                    name="cardExpiry"
                    value={formData.cardExpiry}
                    onChange={handleInputChange}
                    placeholder="MM/YY"
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">CVV</label>
                  <input
                    type="text"
                    name="cardCvv"
                    value={formData.cardCvv}
                    onChange={handleInputChange}
                    placeholder="123"
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full btn btn-primary py-3 text-lg font-semibold"
                  onClick={() => {
                    // Record action when user clicks the button
                    if (activityTrackerRef.current) {
                      activityTrackerRef.current.recordAction('SubmitPaymentButton');
                    }
                  }}
                >
                  {isProcessing ? 'Processing...' : `Pay $${totalPrice.toFixed(2)}`}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6 sticky top-6">
            <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
            <div className="mb-4">
              {items.map(item => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b">
                  <div>
                    <div className="font-medium">{item.title.substring(0, 20)}...</div>
                    <div className="text-gray-500 text-sm">Qty: {item.quantity}</div>
                  </div>
                  <span>${(item.userId * 9.99 * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span>Subtotal</span>
              <span>${totalPrice.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span>Shipping</span>
              <span>Free</span>
            </div>

            <div className="flex justify-between items-center py-3 font-bold text-lg">
              <span>Total</span>
              <span>${totalPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;