import { useEffect, useState, useCallback, memo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Product, fetchProducts } from '../services/api';
import { useCart } from '../contexts/CartContext';
import { useTracing } from '../contexts/TracingContext';
import { SPANS } from '../telemetry/spanConstants';
import { trackUserActivity } from '../telemetry/userActivity';

// Memoize the product card to prevent unnecessary re-renders
const ProductCard = memo(({
  product,
  onAddToCart,
  onProductDetails
}: {
  product: Product,
  onAddToCart: (product: Product) => void,
  onProductDetails: (productId: number) => void
}) => {
  return (
    <div className="border rounded-lg overflow-hidden shadow-md">
      <div className="bg-gray-200 h-48 flex items-center justify-center">
        {/* Placeholder for product image */}
        <div className="text-4xl text-gray-400">📦</div>
      </div>
      <div className="p-4">
        <h2 className="text-xl font-semibold mb-2 truncate">{product.title}</h2>
        <p className="text-gray-600 mb-4 h-12 overflow-hidden">{product.description.substring(0, 80)}...</p>
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold">${(product.price * 9.99).toFixed(2)}</span>
          <div className="flex space-x-2">
            <Link
              to={`/product/${product.id}`}
              className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              onClick={() => onProductDetails(product.id)}
            >
              Details
            </Link>
            <button
              onClick={() => onAddToCart(product)}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

const ProductListPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();
  const {
    startSpan,
    endSpan,
    startApiSpan,
    startUiSpan,
    addSpanEvent,
    getSpan,
    recordSpanError } = useTracing();

  // Define span IDs using the createSpanId helper - use useRef to keep them stable across renders

  // Add reference for activity tracker
  const activityTrackerRef = useRef<ReturnType<typeof trackUserActivity> | null>(null);

  // Start a new root span when the component mounts
  useEffect(() => {
    // Start root span for the entire shopping flow
    startSpan(SPANS.FLOW.SHOPPING_FLOW.NAME, SPANS.FLOW.SHOPPING_FLOW.ID, {
      'flow.start_page': 'ProductList',
      'flow.timestamp': Date.now()
    }, true);

    // Set up activity tracking for the product list page - use a callback to always get current products length
    activityTrackerRef.current = trackUserActivity(
      SPANS.FLOW.SHOPPING_FLOW.ID,
      30000,
      () => ({
        'page.name': 'ProductListPage',
        'products.count': products.length, // This will always get the current value
      })
    );

    activityTrackerRef.current.startTracking();

    return () => {
      // Stop activity tracking
      if (activityTrackerRef.current) {
        activityTrackerRef.current.stopTracking();
      }

      // End any open spans when component unmounts
      const spanIdsToCheck = [
        SPANS.API.FETCH_PRODUCTS.ID,
        SPANS.UI.PRODUCT_LIST.ID,
        SPANS.INTERACTION.ADD_TO_CART.ID
      ];

      // Check each span and end it if it exists
      spanIdsToCheck.forEach(id => {
        if (getSpan(id)) {
          console.info(`Ending span ${id} on unmount`);
          addSpanEvent(id, SPANS.EVENTS.USER_INTERACTION, {
            'unmount.timestamp': Date.now(),
            'unmount.reason': 'component_cleanup'
          });
          endSpan(id);
        }
      });
    };
  }, [startSpan, addSpanEvent, endSpan, getSpan]); // Remove products.length from dependencies

  // Load products data
  useEffect(() => {
    const loadProducts = async () => {
      try {

        // Create UI rendering span to track rendering time
        const uiSpan = startUiSpan(
          SPANS.UI.PRODUCT_LIST.NAME,
          SPANS.FLOW.SHOPPING_FLOW.ID,
          SPANS.UI.PRODUCT_LIST.ID,
          {
            'ui.render.start': Date.now()
          }
        );
        setIsLoading(true);

        // Create a child span for the API call
        const apiSpan = startApiSpan(
          SPANS.API.FETCH_PRODUCTS.NAME,
          SPANS.UI.PRODUCT_LIST.ID,
          SPANS.API.FETCH_PRODUCTS.ID,
          '/products',
          'GET'
        );

        addSpanEvent(SPANS.API.FETCH_PRODUCTS.ID, SPANS.EVENTS.API_CALL_INITIATED, {
          'timestamp': Date.now()
        });

        try {
          // Make the actual API call
          const products = await fetchProducts(apiSpan ?? undefined);


          addSpanEvent(SPANS.API.FETCH_PRODUCTS.ID, SPANS.EVENTS.API_CALL_COMPLETED, {
            'products.count': products.length,
            'timestamp': Date.now()
          });

          // End the API span
          endSpan(SPANS.API.FETCH_PRODUCTS.ID);


          // Process the data
          const processedProducts = products.slice(0, 12);
          setProducts(processedProducts);
          setIsLoading(false);
          addSpanEvent(SPANS.UI.PRODUCT_LIST.ID, 'Product state updated', {
            'products.count': processedProducts.length,
            'timestamp': Date.now()
          });

          addSpanEvent(SPANS.UI.PRODUCT_LIST.ID, 'RenderingComplete', {
            'ui.render.complete': Date.now()
          });
          endSpan(SPANS.UI.PRODUCT_LIST.ID);


        } catch (err) {
          // If there's an error during the API call, end the span if it still exists
          if (getSpan(SPANS.API.FETCH_PRODUCTS.ID)) {
            recordSpanError(SPANS.API.FETCH_PRODUCTS.ID, 'Error fetching products');
            endSpan(SPANS.API.FETCH_PRODUCTS.ID);
          }
          throw err; // Re-throw to be caught by the outer catch block
        }

      } catch (err) {
        setError('Failed to fetch products. Please try again later.');
        setIsLoading(false);
      }
    };
    // Execute the load products function
    loadProducts();
  }, [startApiSpan, startUiSpan, endSpan, addSpanEvent, recordSpanError, getSpan]);

  // Handle adding item to cart directly from product list
  const handleAddToCart = useCallback((product: Product) => {
    // Record user action with activity tracker
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('ProductAddedToCart', {
        'product.id': product.id,
        'product.title': product.title,
        'action.source': 'product_list'
      });
    }

    // Add a span event for adding to cart
    startUiSpan(
      SPANS.INTERACTION.ADD_TO_CART.NAME,
      SPANS.FLOW.SHOPPING_FLOW.ID,
      SPANS.INTERACTION.ADD_TO_CART.ID,
      {
        'product.id': product.id,
        'product.title': product.title,
        'action.timestamp': Date.now()
      }
    );
    // Add to cart with parent span ID for proper hierarchy
    addToCart(product, 1, SPANS.INTERACTION.ADD_TO_CART.ID);

    // Show user feedback
    alert(`Added ${product.title} to your cart!`);
    addSpanEvent(SPANS.INTERACTION.ADD_TO_CART.ID, SPANS.EVENTS.USER_INTERACTION, {
      'product.id': product.id,
      'interaction.type': 'add_to_cart_complete'
    });

    // Note: We don't end the shopping flow span here - it will continue until
    // the user navigates to the cart page where it should end
    console.info('Continuing shopping flow span after adding to cart from list');
    endSpan(SPANS.INTERACTION.ADD_TO_CART.ID);

  }, [addToCart, addSpanEvent, endSpan, startUiSpan, getSpan]);

  // Handle navigating to product details
  const handleProductDetails = useCallback((productId: number) => {
    // Record user action with activity tracker
    if (activityTrackerRef.current) {
      activityTrackerRef.current.recordAction('ProductDetailsClicked', {
        'product.id': productId,
        'navigation.source': 'product_list'
      });
    }

    addSpanEvent(SPANS.FLOW.SHOPPING_FLOW.ID, SPANS.EVENTS.USER_INTERACTION, {
      'product.id': productId,
      'action.timestamp': Date.now(),
      'interaction.type': 'product_details_clicked',
      'navigating.to': 'product_details'
    });

    // Note: We don't end the shopping flow span here - it will continue until
    // the user adds to cart from product details page or navigates elsewhere
  }, [addSpanEvent, getSpan]);

  // Render UI
  if (isLoading) {
    return <div className="text-center py-10">Loading products...</div>;
  }

  if (error) {
    return <div className="text-center py-10 text-red-600">{error}</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Products</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToCart={handleAddToCart}
            onProductDetails={handleProductDetails}
          />
        ))}
      </div>
    </div>
  );
};

export default ProductListPage;