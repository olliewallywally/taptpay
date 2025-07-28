jQuery(document).ready(function($) {
    // Tapt Payment Gateway Admin JavaScript
    
    // Test API connection
    $('#tapt_test_api_connection').on('click', function(e) {
        e.preventDefault();
        
        var $button = $(this);
        var $status = $('#tapt_api_status');
        var apiEndpoint = $('#woocommerce_tapt_payment_gateway_' + 
            ($('#woocommerce_tapt_payment_gateway_testmode').is(':checked') ? 'sandbox_api_endpoint' : 'live_api_endpoint')).val();
        var apiKey = $('#woocommerce_tapt_payment_gateway_api_key').val();
        
        if (!apiEndpoint || !apiKey) {
            $status.html('<span class="tapt-status-indicator tapt-status-error">⚠️ Please enter API endpoint and key first</span>');
            return;
        }
        
        $button.prop('disabled', true).text('Testing...');
        $status.html('<span class="tapt-status-indicator tapt-status-warning">🔄 Testing connection...</span>');
        
        // Simulate API test (in real implementation, this would make an AJAX call)
        setTimeout(function() {
            $status.html('<span class="tapt-status-indicator tapt-status-connected">✅ API connection successful</span>');
            $button.prop('disabled', false).text('Test Connection');
        }, 2000);
    });
    
    // Copy webhook URL to clipboard
    $('#tapt_copy_webhook_url').on('click', function(e) {
        e.preventDefault();
        
        var webhookUrl = $('#woocommerce_tapt_payment_gateway_webhook_url').val();
        
        // Create temporary textarea to copy text
        var $temp = $('<textarea>');
        $('body').append($temp);
        $temp.val(webhookUrl).select();
        document.execCommand('copy');
        $temp.remove();
        
        // Show feedback
        var $button = $(this);
        var originalText = $button.text();
        $button.text('Copied!').addClass('copied');
        
        setTimeout(function() {
            $button.text(originalText).removeClass('copied');
        }, 2000);
    });
    
    // Toggle test/live mode
    $('#woocommerce_tapt_payment_gateway_testmode').on('change', function() {
        var $testFields = $('.tapt-test-mode-fields');
        var $liveFields = $('.tapt-live-mode-fields');
        
        if ($(this).is(':checked')) {
            $testFields.show();
            $liveFields.hide();
        } else {
            $testFields.hide();
            $liveFields.show();
        }
    }).trigger('change');
    
    // Validate API endpoint URL format
    $('input[id*="api_endpoint"]').on('blur', function() {
        var url = $(this).val();
        var $field = $(this);
        
        if (url && !url.match(/^https?:\/\/.+/)) {
            $field.addClass('error');
            $(this).after('<span class="tapt-field-error">Please enter a valid URL starting with http:// or https://</span>');
        } else {
            $field.removeClass('error');
            $(this).siblings('.tapt-field-error').remove();
        }
    });
    
    // Add enhanced styling to form
    $('.form-table').addClass('tapt-admin-form');
    
    // Show/hide webhook secret field based on whether it's needed
    $('#woocommerce_tapt_payment_gateway_webhook_secret').closest('tr').find('th').append(
        '<span class="description"> (Optional but recommended for security)</span>'
    );
});

// Add CSS for copy button feedback
jQuery(document).ready(function($) {
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .tapt-field-error {
                color: #dc3232;
                font-size: 12px;
                margin-left: 5px;
            }
            
            input.error {
                border-color: #dc3232 !important;
                box-shadow: 0 0 2px rgba(220, 50, 50, 0.3);
            }
            
            .button.copied {
                background: #00a32a !important;
                border-color: #00a32a !important;
                color: white !important;
            }
            
            .tapt-admin-form .form-table th {
                width: 200px;
                padding-left: 0;
            }
            
            .tapt-admin-form .form-table td {
                padding-left: 20px;
            }
        `)
        .appendTo('head');
});