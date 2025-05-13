import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Product, fetchProduct } from '../services/api';
import { useCart } from '../contexts/CartContext';
import { useTracing } from '../contexts/TracingContext';
import { SPANS } from '../telemetry/spanConstants';
import { trackUserActivity } from '../telemetry/userActivity';

const ProductDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const {
    startApiSpan,
    startUiSpan,
    endSpan,
    addSpanEvent,
    getSpan,
    recordSpanError } = useTracing();

  // Add reference for activity tracker
  const activityTrackerRef = useRef<ReturnType<typeof trackUserActivity> | null>(null);

  // Load product details when the component mounts
  useEffect(() => {
    const loadProduct = async () => {
      if (!id) {
        setError('Product ID is missing');
        setIsLoading(false);
        return;
      }

      try {
        // Check if we have an ongoing shopping flow span from ProductListPage
        const shoppingFlowExists = getSpan(SPANS.FLOW.SHOPPING_FLOW.ID) !== undefined;
        // Start UI rendering span
        startUiSpan(
          SPANS.UI.PRODUCT_DETAIL.NAME,
          SPANS.FLOW.SHOPPING_FLOW.ID,
          SPANS.UI.PRODUCT_DETAIL.ID,
          {
            'product.id': id,
            'ui.render.start': Date.now()
          }
        );
        setIsLoading(true);

        // If we have a shopping flow, set up activity tracking
        if (shoppingFlowExists) {
          activityTrackerRef.current = trackUserActivity(
            SPANS.FLOW.SHOPPING_FLOW.ID,
            30000,
            () => ({
              'page.name': 'ProductDetailPage',
              'product.id': id,
              'interaction.type': 'product_detail_view'
            })
          );

          activityTrackerRef.current.startTracking();
        }

        // Create a child span for the API call to fetch product details
        const apiSpan = startApiSpan(
          SPANS.API.FETCH_PRODUCT_DETAIL.NAME,
          SPANS.UI.PRODUCT_DETAIL.ID,
          SPANS.API.FETCH_PRODUCT_DETAIL.ID,
          `/products/${id}`,
          'GET'
        );

        // Add event to mark the start of fetching
        addSpanEvent(SPANS.API.FETCH_PRODUCT_DETAIL.ID, SPANS.EVENTS.API_CALL_INITIATED, {
          'product.id': id,
          'timestamp': Date.now()
        });

        // Make the actual API call
        const product = await fetchProduct(parseInt(id, 10), apiSpan ?? undefined);

        // Add event for successful product fetch
        addSpanEvent(SPANS.API.FETCH_PRODUCT_DETAIL.ID, SPANS.EVENTS.API_CALL_COMPLETED, {
          'product.id': id,
          'product.title': product.title,
          'timestamp': Date.now()
        });

        // End the API span
        endSpan(SPANS.API.FETCH_PRODUCT_DETAIL.ID);

        // Update the product state
        setProduct(product);

        addSpanEvent(SPANS.UI.PRODUCT_DETAIL.ID, 'updating the product state is complete', {
          'ui.render.complete': Date.now()
        });


        setIsLoading(false);


        addSpanEvent(SPANS.UI.PRODUCT_DETAIL.ID, 'RenderingComplete', {
          'ui.render.complete': Date.now()
        });


        // If we have the ongoing shopping flow, add an event showing the product detail was viewed

        addSpanEvent(SPANS.FLOW.SHOPPING_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
          'product.id': product.id,
          'product.title': product.title,
          'view.timestamp': Date.now(),
          'interaction.type': 'product_detail_viewed'
        });

        // Record action with activity tracker
        if (activityTrackerRef.current) {
          activityTrackerRef.current.recordAction('ViewProductDetail', {
            'product.id': product.id,
            'product.title': product.title,
            'product.price': product.userId * 9.99
          });
        }


      } catch (err) {
        setError('Failed to load product details. Please try again later.');
        setIsLoading(false);


        recordSpanError(SPANS.API.FETCH_PRODUCT_DETAIL.ID, 'Failed to fetch product detail');
        endSpan(SPANS.API.FETCH_PRODUCT_DETAIL.ID);

      }
    };

    // Execute the load product function
    loadProduct();

    // Clean up when the component unmounts
    return () => {
      // Stop activity tracking
      if (activityTrackerRef.current) {
        console.info('Stopping activity tracking for productDetails on component unmount');
        activityTrackerRef.current.stopTracking();
      }

      // End any open spans when component unmounts
      const spanIdsToEnd = [
        SPANS.API.FETCH_PRODUCT_DETAIL.ID,
        SPANS.UI.PRODUCT_DETAIL.ID,
        SPANS.INTERACTION.ADD_TO_CART.ID,
        SPANS.INTERACTION.UPDATE_QUANTITY.ID
      ];

      // Check each span and end it if it exists
      spanIdsToEnd.forEach(id => {
        if (getSpan(id)) {
          console.log(`Ending span: ${id} on component unmount`);
          addSpanEvent(id, SPANS.EVENTS.USER_INTERACTION, {
            'unmount.timestamp': Date.now(),
            'unmount.reason': 'component_cleanup'
          });
          endSpan(id);
        }
      });

      // Only end the shopping flow span if we're not navigating to another page
      // that continues the flow
      const shoppingFlowSpan = getSpan(SPANS.FLOW.SHOPPING_FLOW.ID);
      if (shoppingFlowSpan) {
        addSpanEvent(SPANS.FLOW.SHOPPING_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
          'product.id': id,
          'unmount.timestamp': Date.now(),
          'interaction.type': 'product_detail_unmounted'
        });

        // We don't end the SHOPPING_FLOW_SPAN_ID here because it might continue
        // in other components - it should be ended when the user completes
        // the shopping flow or explicitly navigates away
      }
    };
  }, [id, startApiSpan, startUiSpan, endSpan, addSpanEvent, getSpan, recordSpanError]);

  // Handle quantity change
  const handleQuantityChange = (newQuantity: number) => {
    const isUispanExists = getSpan(SPANS.UI.PRODUCT_DETAIL.ID) !== undefined;
    startUiSpan(
      SPANS.INTERACTION.UPDATE_QUANTITY.NAME,
      isUispanExists ? SPANS.UI.PRODUCT_DETAIL.ID : SPANS.FLOW.SHOPPING_FLOW.ID,
      SPANS.INTERACTION.UPDATE_QUANTITY.ID,
      {
        'product.id': id,
        'product.quantity': newQuantity,
        'action.timestamp': Date.now()
      }
    );
    // Ensure quantity is at least 1
    const updatedQuantity = Math.max(1, newQuantity);
    setQuantity(updatedQuantity);

    // Add event to the ongoing shopping flow if it exists
    const shoppingFlowExists = getSpan(SPANS.FLOW.SHOPPING_FLOW.ID) !== undefined;
    if (shoppingFlowExists && product) {
      addSpanEvent(SPANS.FLOW.SHOPPING_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
        'product.id': product.id,
        'quantity.old': quantity,
        'quantity.new': updatedQuantity,
        'timestamp': Date.now(),
        'interaction.type': 'quantity_changed'
      });

      // Record action with activity tracker
      if (activityTrackerRef.current) {
        activityTrackerRef.current.recordAction('QuantityChanged', {
          'product.id': product.id,
          'quantity.old': quantity,
          'quantity.new': updatedQuantity
        });
      }

      endSpan(SPANS.INTERACTION.UPDATE_QUANTITY.ID);
    }
  };

  // Handle adding to cart - this will no longer end the shopping flow span
  const handleAddToCart = () => {
    if (!product) return;

    // Record action with activity tracker
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('AddToCartFromDetail', {
        'product.id': product.id,
        'product.title': product.title,
        'quantity': quantity,
        'price_per_unit': product.userId * 9.99,
        'total_price': product.userId * 9.99 * quantity
      });
    }
    const isUispanExists = getSpan(SPANS.UI.PRODUCT_DETAIL.ID) !== undefined;
    startUiSpan(
      SPANS.INTERACTION.ADD_TO_CART.NAME,
      isUispanExists ? SPANS.UI.PRODUCT_DETAIL.ID : SPANS.FLOW.SHOPPING_FLOW.ID,
      SPANS.INTERACTION.ADD_TO_CART.ID,
      {
        'product.id': product.id,
        'product.title': product.title,
        'action.timestamp': Date.now()
      }
    );

    // Pass the parent span ID to link the cart operation as a child span
    addToCart(product, quantity, SPANS.INTERACTION.ADD_TO_CART.ID);

    // Note: We don't end the shopping flow span here - it will continue until
    // the user navigates to the cart page where it should end
    console.log('Continuing shopping flow span after adding to cart from detail');

    // Show user feedback
    alert(`Added ${product.title} to your cart!`);
    addSpanEvent(SPANS.INTERACTION.ADD_TO_CART.ID, SPANS.EVENTS.USER_INTERACTION, {
      'product.id': product.id,
      'product.title': product.title,
      'view.timestamp': Date.now(),
      'interaction.type': 'product_added'
    });
    // Navigate to cart
    navigate('/cart');
    endSpan(SPANS.INTERACTION.ADD_TO_CART.ID);
  };

  // Handle back navigation
  const handleBackNavigation = () => {
    // Record action with activity tracker
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('BackNavigation', {
        'from.product.id': id,
        'navigation.type': 'back_button'
      });
    }

    // Add event to the shopping flow if it exists

    addSpanEvent(SPANS.FLOW.SHOPPING_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
      'from.product.id': id,
      'navigation.timestamp': Date.now(),
      'interaction.type': 'back_to_product_list'
    });


    // Use browser history to go back
    navigate(-1);
  };

  if (isLoading) {
    return <div className="text-center py-10">Loading product details...</div>;
  }

  if (error || !product) {
    return <div className="text-center py-10 text-red-600">{error || 'Product not found'}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={handleBackNavigation}
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gray-100 rounded-lg flex items-center justify-center p-8">
          {/* Placeholder for product image */}
          <div className="text-9xl text-gray-400">📦</div>
        </div>

        <div>
          <h1 className="text-3xl font-bold mb-4">{product.title}</h1>
          <p className="text-gray-600 mb-6">{product.body}</p>

          <div className="mb-6">
            <span className="text-3xl font-bold text-blue-600">${(product.userId * 9.99).toFixed(2)}</span>
            <span className="text-sm text-gray-500 ml-2">Free shipping</span>
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 mb-2">Quantity</label>
            <div className="flex items-center">
              <button
                onClick={() => handleQuantityChange(quantity - 1)}
                className="px-3 py-2 border rounded-l-md bg-gray-50 hover:bg-gray-100"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10))}
                className="w-16 px-3 py-2 border-t border-b text-center"
              />
              <button
                onClick={() => handleQuantityChange(quantity + 1)}
                className="px-3 py-2 border rounded-r-md bg-gray-50 hover:bg-gray-100"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={handleAddToCart}
            className="w-full btn btn-primary py-3 text-lg font-semibold"
          >
            Add to Cart
          </button>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-xl font-semibold mb-3">Product Details</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li>Product ID: {product.id}</li>
              <li>Seller ID: {product.userId}</li>
              <li>Made with premium materials</li>
              <li>30-day money-back guarantee</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;