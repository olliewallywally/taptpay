<?php
/**
 * Uninstall Tapt Payment Gateway
 *
 * @package TaptPaymentGateway
 */

// If uninstall not called from WordPress, exit
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Remove plugin options
delete_option('woocommerce_tapt_payment_gateway_settings');

// Remove any transients
delete_transient('tapt_payment_gateway_api_test');

// Clean up any order meta (optional - you may want to keep transaction records)
// This is commented out to preserve transaction history
/*
global $wpdb;

$wpdb->query("
    DELETE FROM {$wpdb->postmeta} 
    WHERE meta_key IN (
        '_tapt_transaction_id',
        '_tapt_payment_url',
        '_tapt_refund_id'
    )
");
*/

// Clear any cached data
wp_cache_flush();