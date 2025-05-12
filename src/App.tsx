import { Routes, Route, Link } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { CartProvider } from './contexts/CartContext';
import { TracingProvider, useTracing } from './contexts/TracingContext';

// Lazy-loaded components
const ProductListPage = lazy(() => import('./pages/ProductListPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const OrderConfirmationPage = lazy(() => import('./pages/OrderConfirmationPage'));

// Navigation component
const NavBar = () => {
  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold">OpenTelemetry E-Commerce</Link>
        <div className="space-x-4">
          <Link to="/" className="hover:text-blue-300">Products</Link>
          <Link to="/cart" className="hover:text-blue-300">Cart</Link>
        </div>
      </div>
    </nav>
  );
};

// Loading component
const Loading = () => {
  return (
    <div className="flex justify-center items-center h-48">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
};

// Inner App component that uses the tracing context
const AppContent = () => {
  const { getSpan, endSpan } = useTracing();
  
  // Define app-level span ID
  const APP_FLOW_SPAN_ID = 'app-flow';

  // Add an effect to end any app-level spans when the component unmounts
  useEffect(() => {
    // Return cleanup function to end spans when App unmounts
    return () => {
      // Check if there's an active app flow span and end it
      if (getSpan(APP_FLOW_SPAN_ID)) {
        console.log('App unmounting - ending app flow span');
        endSpan(APP_FLOW_SPAN_ID);
      }
    };
  }, [endSpan, getSpan]);

  return (
    <>
      <NavBar />
      <main className="container mx-auto p-4">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<ProductListPage />} />
            <Route path="/product/:id" element={<ProductDetailPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/order-confirmation" element={<OrderConfirmationPage />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
};

function App() {
  // The TracingProvider is the outermost provider
  return (
    <TracingProvider>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </TracingProvider>
  );
}

export default App;