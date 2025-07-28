jQuery(document).ready(function($) {
    // Tapt Payment Gateway checkout functionality
    
    // Add loading state when payment method is selected
    $('form.checkout').on('change', 'input[name="payment_method"]', function() {
        if ($(this).val() === 'tapt_payment_gateway') {
            $('.woocommerce-checkout-payment').block({
                message: null,
                overlayCSS: {
                    background: '#fff',
                    opacity: 0.6
                }
            });
            
            // Show payment info
            setTimeout(function() {
                $('.woocommerce-checkout-payment').unblock();
            }, 500);
        }
    });

    // Handle form submission for Tapt gateway
    $('form.checkout').on('checkout_place_order_tapt_payment_gateway', function() {
        return true; // Allow form submission - redirect will happen server-side
    });

    // Add visual feedback
    if ($('input[name="payment_method"]:checked').val() === 'tapt_payment_gateway') {
        $('#tapt-payment-data').prepend('<div class="tapt-payment-info"><p><strong>Secure Payment Process:</strong></p><ul><li>✓ NFC tap-to-pay support</li><li>✓ QR code scanning</li><li>✓ Fixed $0.25 transaction fee</li><li>✓ Bank-level security</li></ul></div>');
    }

    // Update payment info when payment method changes
    $('body').on('updated_checkout', function() {
        if ($('input[name="payment_method"]:checked').val() === 'tapt_payment_gateway') {
            if (!$('.tapt-payment-info').length) {
                $('#tapt-payment-data').prepend('<div class="tapt-payment-info"><p><strong>Secure Payment Process:</strong></p><ul><li>✓ NFC tap-to-pay support</li><li>✓ QR code scanning</li><li>✓ Fixed $0.25 transaction fee</li><li>✓ Bank-level security</li></ul></div>');
            }
        } else {
            $('.tapt-payment-info').remove();
        }
    });
});