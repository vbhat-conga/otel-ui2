// Unified span constants with both NAME and ID properties for each span
export const SPANS = {
    // UI Component spans
    UI: {
        PRODUCT_LIST: {
            NAME: 'ProductList.render',
            ID: 'products-render-ui'
        },
        PRODUCT_DETAIL: {
            NAME: 'ProductDetail.render',
            ID: 'product-detail-render-ui'
        },
        SHOPPING_CART: {
            NAME: 'ShoppingCart.render',
            ID: 'cart-render'
        },
        CHECKOUT: {
            NAME: 'Checkout.render',
            ID: 'checkout-render-ui'
        },
        ORDER_CONFIRMATION: {
            NAME: 'OrderConfirmation.render',
            ID: 'order-confirmation-ui'
        }
    },

    // API-related spans
    API: {
        FETCH_PRODUCTS: {
            NAME: 'api.fetchProducts',
            ID: 'fetch-products-api'
        },
        FETCH_PRODUCT_DETAIL: {
            NAME: 'api.fetchProductDetail',
            ID: 'fetch-product-detail-api'
        },
        PROCESS_PAYMENT: {
            NAME: 'api.processPayment',
            ID: 'process-payment-api'
        },
        ADD_TO_CART: {
            NAME: 'api.addToCart',
            ID: 'add-to-cart-api'
        },
        UPDATE_CART: {
            NAME: 'api.updateCart',
            ID: 'update-cart-api'
        },
        PROCESS_ORDER: {
            NAME: 'api.processOrder',
            ID: 'process-order-api'
        }
    },

    // User interaction spans
    INTERACTION: {
        ADD_TO_CART: {
            NAME: 'interaction.addToCart',
            ID: 'add-to-cart-ui'
        },
        REMOVE_FROM_CART: {
            NAME: 'interaction.removeFromCart',
            ID: 'remove-from-cart-ui'
        },
        CLEAR_CART: {
            NAME: 'interaction.clearCart',
            ID: 'clear-cart-ui'
        },
        UPDATE_QUANTITY: {
            NAME: 'interaction.updateQuantity',
            ID: 'quantity-update-ui'
        },
        PROCEED_TO_CHECKOUT: {
            NAME: 'interaction.proceedToCheckout',
            ID: 'proceed-to-checkout-ui'
        },
        PLACE_ORDER: {
            NAME: 'interaction.placeOrder',
            ID: 'place-order-ui'
        }
    },

    // Flow spans that track larger user journeys
    FLOW: {
        SHOPPING_FLOW: {
            NAME: 'businessTransaction.addToCart',
            ID: 'add-to-cart-flow'
        },
        CHECKOUT_FLOW: {
            NAME: 'businessTransaction.checkout',
            ID: 'checkout-flow'
        },
        ORDER_FLOW: {
            NAME: 'businessTransaction.order',
            ID: 'confirmation-flow'
        }
    },

    // Specific page flows and operations
    CHECKOUT: {
        VALIDATION: {
            NAME: 'checkout.validation',
            ID: 'checkout-validation'
        },
        FORM_INTERACTION: {
            NAME: 'checkout.formInteraction',
            ID: 'checkout-form-interaction'
        },
        PAYMENT_PROCESSING: {
            NAME: 'checkout.paymentProcessing',
            ID: 'checkout-payment-processing'
        }
    },

    ORDER: {
        PROCESSING: {
            NAME: 'order.processing',
            ID: 'order-processing'
        }
    },

    // Event names for spans
    EVENTS: {
        ASYNC_OPERATION_STARTED: 'AsyncOperationStarted',
        ASYNC_OPERATION_COMPLETED: 'AsyncOperationCompleted',
        USER_INTERACTION: 'UserInteraction',
        API_CALL_INITIATED: 'ApiCallInitiated',
        API_CALL_COMPLETED: 'ApiCallCompleted',
        ERROR_OCCURRED: 'ErrorOccurred'
    }
};
